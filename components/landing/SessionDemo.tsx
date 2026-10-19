"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import useMeasure from "react-use-measure";
import { useInView } from "motion/react";
import { House, PanelLeft, Plus, SlidersHorizontal, Square } from "lucide-react";
import Whiteboard, { type WhiteboardHandle } from "@/components/Whiteboard";
import { ChalkMark } from "@/components/app/ChalkMark";
import { SessionChip } from "@/components/session/SessionChip";
import { VoiceDock, type DockActivity } from "@/components/session/VoiceDock";
import { TutorPresence } from "@/components/session/TutorPresence";
import type { TranscriptEntry } from "@/lib/live-types";
import type { UploadedFile } from "@/lib/file-processor";
import { dispatchWhiteboardTool } from "@/lib/whiteboard-tool-dispatch";
import { loadBoardFonts } from "@/lib/board-fonts";
import { LESSON, LESSON_LOOP_MS, LESSON_SEED, LESSON_STUDENT, LESSON_TITLE, resolveRefs, type BoardCall } from "./lesson";
import { StudentTile, useSpoken, type StudentLottie } from "./StudentTile";
import { useReduce } from "./useScript";

// The session screen itself, not a picture of it. The rail, the title chip,
// the voice dock, the pet and the transcript are the app's own components; the
// board is the real tldraw whiteboard replaying a lesson through the tutor's
// tool calls. Phones get a real screenshot of the same board instead.
//
// It is a conversation, not a chat (Sept 28 2026): the student talks from
// their tile at the top right and the tutor from the pet on the dock, each
// line arriving word by word as it is said. The board opens already drawn
// (`LESSON_SEED`, with no writing), and the loop fades back to that board, so
// the frame is never empty.

const START_SECONDS = 227;
// Until the live board has drawn its opening (about a second and a half on a
// cold load), every screen shows that opening board,
// photographed at the stage's own size by scripts/landing-shots.mjs ("live"
// frame), so it lines up with the live board and simply fades away.
const OPENING = { src: "/landing/hero-opening.png", width: 2104, height: 1280 };
// A phone shows the laptop's demo, shrunk to fit (Oct 14 2026, Mateo: "the
// same as on desktop, just shrunk down"). It is drawn at the size it has in a
// 1440px window (the frame 1094 x 640, the chrome at 1052/1200 of its size,
// the stage 1052 wide: the opening photo's own width) and scaled to the phone.
// The board alone is not scaled with CSS: tldraw measures its box on screen
// and culls whatever falls outside it, so it draws at its real size and lays
// the lesson out for the laptop stage, framed the way that stage frames it
// (TldrawCore's layoutSize).
const VIRTUAL = { w: 1094, h: 640 };
const VIRTUAL_CHROME = 1052 / 1200;
const VIRTUAL_RAIL = 48 * VIRTUAL_CHROME;
const VIRTUAL_STAGE = { w: VIRTUAL.w - VIRTUAL_RAIL, h: VIRTUAL.h };

function formatClock(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// The collapsed sidebar, as the live screen shows it. It wears the app's own
// `.sb-btn` / `.sb-item` / `.sb-toggle` classes from globals.css, so it stays
// in step with the real sidebar, hover included. Decoration here: the buttons
// go nowhere on the landing page, so the cursor stays an arrow.
const RAIL_ITEM = "flex size-8 items-center justify-center rounded-md";
const DECOR = { cursor: "default" } as const;

function Rail({ scale, always = false }: { scale: number; always?: boolean }) {
  return (
    <div aria-hidden className={`w-12 shrink-0 flex-col bg-sidebar ${always ? "flex" : "hidden sm:flex"}`} style={{ zoom: scale }}>
      <div className="relative h-[92px] shrink-0">
        <span className="absolute top-2.5 left-0 flex h-9 w-12 items-center justify-center">
          <ChalkMark size={29} />
        </span>
        <span className={`sb-item sb-toggle ${RAIL_ITEM} absolute top-[52px] left-2`} style={DECOR}>
          <PanelLeft className="size-[18px]" strokeWidth={2.1} />
        </span>
      </div>
      <div className="px-2 pt-1">
        <span className={`sb-btn ${RAIL_ITEM}`} style={DECOR}>
          <Plus className="size-4" strokeWidth={2.75} />
        </span>
      </div>
      <div className="mt-auto flex flex-col gap-1.5 px-2 pb-3">
        <span className={`sb-item ${RAIL_ITEM}`} style={DECOR}>
          <House className="size-4" strokeWidth={2.5} />
        </span>
        <span className={`sb-item ${RAIL_ITEM}`} style={DECOR}>
          <SlidersHorizontal className="size-4" strokeWidth={2.5} />
        </span>
        <span className={`${RAIL_ITEM} mt-1 bg-sidebar-foreground text-[11.5px] font-bold text-sidebar`}>AL</span>
      </div>
    </div>
  );
}

function useIsWide() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(min-width: 768px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false,
  );
}

// The student: a cartoon boy with glasses, talking while they speak. From
// "Maya avatar" / "Talking a Maya avatar" by macro Loano on LottieFiles
// (https://lottiefiles.com/animations/maya-avatar-G5Di8YOICP and
// …/talking-a-maya-avatar-Kbb1XTzQAv), Lottie Simple License: free for
// commercial use, no credit required, and changed copies stay under the same
// licence. Changed for Chalk: the long side hair removed (a boy), the mouth
// 35% larger so talking reads at this size, the pictures inside redrawn at a
// third of their size (1.75 MB to about 55 KB each).
const STUDENT: StudentLottie = {
  idle: "/landing/student/boy-listening.json",
  talk: "/landing/student/boy-talking.json",
  zoom: 1.32,
  y: 7,
};

export function SessionDemo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { margin: "160px" });
  const everInView = useInView(rootRef, { margin: "160px", once: true });
  const reduce = useReduce();
  const wide = useIsWide();
  const [stageRef, stage] = useMeasure();
  const [phoneRef, phone] = useMeasure();

  const boardRef = useRef<WhiteboardHandle>(null);
  const [boardReady, setBoardReady] = useState(false);
  const [boardBusy, setBoardBusy] = useState(false);

  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [activity, setActivity] = useState<DockActivity>("listening");
  // The line each of them is saying; `key` makes the same words twice two lines.
  const [studentLine, setStudentLine] = useState({ text: "", key: 0 });
  const [tutorLine, setTutorLine] = useState({ text: "", key: 0 });
  const [celebrateKey, setCelebrateKey] = useState(0);
  // The board fades out and back in between loops instead of going blank.
  const [boardVisible, setBoardVisible] = useState(true);
  const [seeded, setSeeded] = useState(false);
  const [elapsed, setElapsed] = useState(START_SECONDS);
  const [muted, setMuted] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [cycle, setCycle] = useState(0);

  // The board loads once the demo has been near the viewport, and only on
  // screens wide enough to read it. It arrives through a dynamic import, so
  // wait for the handle.
  const wantsBoard = everInView;
  useEffect(() => {
    if (!wantsBoard || boardReady) return;
    const timer = setInterval(() => {
      if (boardRef.current) {
        setBoardReady(true);
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [wantsBoard, boardReady]);

  // Session clock.
  useEffect(() => {
    if (!inView) return;
    const clock = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(clock);
  }, [inView]);

  // The ids of this loop's drawings, in the order they were drawn ("@n").
  const drawnRef = useRef<string[]>([]);
  const draw = useCallback((call: BoardCall) => {
    const board = boardRef.current;
    if (!board) return;
    const resolved = resolveRefs(call, (n) => drawnRef.current[n - 1]);
    const result = dispatchWhiteboardTool(resolved.name, resolved.args, { whiteboard: board });
    const id = result.success ? /\(item (b\d+)\)/.exec(result.message ?? "")?.[1] : undefined;
    if (id && !drawnRef.current.includes(id)) drawnRef.current.push(id);
  }, []);

  // The opening board: the question and both bars, drawn at once.
  const seed = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    board.setInstant?.(true);
    board.clearWhiteboard();
    drawnRef.current = [];
    for (const call of LESSON_SEED) draw(call);
    // Placement and the reveal decision happen as each call ends; give the
    // last one a moment before the pen writes again.
    setTimeout(() => board.setInstant?.(false), 60);
  }, [draw]);

  // Fonts first (at most 1.5 s): drawn before they load, the heading is set
  // in a thin fallback and snaps to the board's bold a moment later.
  useEffect(() => {
    if (!boardReady || seeded) return;
    let live = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    void loadBoardFonts().then(() => {
      if (!live) return;
      seed();
      t = setTimeout(() => live && setSeeded(true), 120);
    });
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [boardReady, seeded, seed]);

  // The lesson, on a loop. Runs once the board is seeded (or right away where
  // the poster stands in for it) and pauses while the demo is off screen.
  const running = inView && (seeded || !wantsBoard);
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let first = true;
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(() => !cancelled && fn(), ms));
    const play = () => {
      setCycle((c) => c + 1);
      for (const [i, beat] of LESSON.entries()) {
        later(() => {
          if (beat.student) {
            setStudentLine((l) => ({ text: beat.student!, key: l.key + 1 }));
            setTranscript((t) => [...t, { id: `s${i}-${Date.now()}`, role: "student", text: beat.student! }]);
          }
          if (beat.say) {
            setTutorLine((l) => ({ text: beat.say!, key: l.key + 1 }));
            setTranscript((t) => [...t, { id: `t${i}-${Date.now()}`, role: "tutor", text: beat.say! }]);
          }
          if (beat.activity) setActivity(beat.activity);
          if (beat.celebrate) setCelebrateKey((k) => k + 1);
          if (beat.board) for (const call of beat.board) draw(call);
        }, beat.at);
      }
      later(restart, LESSON_LOOP_MS);
    };
    // The finished board fades, the opening board comes back under it, and it
    // fades in again: the frame is never white.
    const restart = () => {
      timers.forEach(clearTimeout);
      timers = [];
      setBoardVisible(false);
      later(() => {
        setTranscript([]);
        setStudentLine((l) => ({ text: "", key: l.key + 1 }));
        setTutorLine((l) => ({ text: "", key: l.key + 1 }));
        setActivity("listening");
        seed();
        later(() => {
          setBoardVisible(true);
          later(play, 500);
        }, 180);
      }, 420);
    };
    later(() => {
      if (first) {
        first = false;
        play();
      }
    }, 500);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [running, seed, draw]);

  const student = useSpoken(studentLine.text, studentLine.key);
  const tutor = useSpoken(tutorLine.text, tutorLine.key);

  // Typing to the tutor: the line lands in the transcript, and the demo says
  // what it is. Only a real session answers.
  const handleSend = useCallback((text: string) => {
    const id = String(Date.now());
    setTranscript((t) => [...t, { id: `u${id}`, role: "student", text }]);
    setActivity("thinking");
    setTimeout(() => {
      const reply = "This preview replays a lesson, so I can't hear you yet. Start a free session and I'll answer for real.";
      setTranscript((t) => [...t, { id: `r${id}`, role: "tutor", text: reply }]);
      setTutorLine((l) => ({ text: reply, key: l.key + 1 }));
      setActivity("speaking");
      setTimeout(() => setActivity("listening"), 5200);
    }, 900);
  }, []);

  // "Writing" follows the board's own reveal queue when there is a board;
  // the poster keeps the scripted state.
  const scripted: DockActivity = tutor.speaking ? "speaking" : activity;
  const shownActivity: DockActivity = boardBusy ? "writing" : scripted === "writing" && boardReady ? "listening" : scripted;
  // "Your turn": the tutor asked, finished, and the student has not started.
  const yourTurn = !tutor.speaking && !student.speaking && tutorLine.text.trim().endsWith("?") && activity === "listening";

  // The frame stands in for a whole screen, so the chrome (rail, chips, dock,
  // the pet and the student) shrinks toward the proportion it has on one: a
  // 1200px-wide screen scaled to the frame. At 1480 (the old figure) the two
  // speakers' words came out 11px, too small to read at a glance, and the
  // conversation is the point. The board keeps its own zoom.
  const scale = wide && stage.width ? Math.min(1, Math.max(0.7, stage.width / 1200)) : 1;

  // Everything over the board: the title chip, End, the student, the dock and
  // the pet. The same on a phone, shrunk with the rest.
  const chrome = (frameHeight: number | undefined) => (
    <>
      <SessionChip liveState="active" title={LESSON_TITLE} elapsed={formatClock(elapsed)} qaLabel={null} />
      <span
        aria-hidden
        className="absolute top-4 right-4 z-30 inline-flex h-8 items-center gap-1.5 rounded-full border border-(--lp-line-strong) bg-white px-3.5 text-[13px] font-medium text-(--danger)"
      >
        <Square className="size-3 fill-current" />
        End session
      </span>

      <StudentTile
        name={LESSON_STUDENT}
        said={student.said}
        speaking={student.speaking}
        reduce={reduce === true}
        lottie={STUDENT}
        className="absolute top-[72px] right-6 z-30"
      />

      <VoiceDock
        activity={shownActivity}
        isMuted={muted}
        onMute={() => setMuted((m) => !m)}
        analyser={null}
        onSendText={handleSend}
        transcript={transcript}
        transcriptOpen={transcriptOpen}
        onToggleTranscript={() => setTranscriptOpen((v) => !v)}
        files={files}
        onAddFiles={(added) => setFiles((f) => [...f, ...added])}
        onRemoveFile={(id) => setFiles((f) => f.filter((x) => x.id !== id))}
        frameHeight={frameHeight}
        presence={
          <TutorPresence
            activity={shownActivity}
            caption={tutor.said}
            analyser={null}
            yourTurn={yourTurn}
            celebrateKey={celebrateKey}
            placement="column"
            hidden={transcriptOpen}
            studentSpeaking={student.speaking}
          />
        }
      />
    </>
  );

  // The opening board, rendered on the server, until the live board has drawn
  // the same thing (then it fades).
  const opening = (
    <Image
      src={OPENING.src}
      alt=""
      aria-hidden
      width={OPENING.width}
      height={OPENING.height}
      priority
      sizes="1052px"
      className="pointer-events-none absolute top-0 left-0 w-full transition-opacity duration-[400ms] ease-out"
      style={{ opacity: seeded ? 0 : 1 }}
    />
  );

  // A phone: the laptop demo, shrunk to the frame's width (see VIRTUAL). The
  // board draws at its real size under the shrunk chrome, in the stage's
  // place; the chrome is a picture of the screen here, so it takes no taps.
  if (!wide) {
    const k = phone.width ? phone.width / VIRTUAL.w : 0;
    return (
      <div
        ref={(el) => {
          rootRef.current = el;
          phoneRef(el);
        }}
        className="relative w-full overflow-hidden bg-white"
        style={{ aspectRatio: `${VIRTUAL.w} / ${VIRTUAL.h}` }}
        data-cycle={cycle}
      >
        {k > 0 && (
          <>
            <div className="absolute top-0" style={{ left: VIRTUAL_RAIL * k, width: VIRTUAL_STAGE.w * k, height: VIRTUAL_STAGE.h * k }}>
              {opening}
              {wantsBoard && (
                <div
                  className="pointer-events-none absolute inset-0 transition-opacity duration-[400ms] ease-out"
                  style={{ opacity: boardVisible && seeded ? 1 : 0 }}
                  aria-hidden
                >
                  <Whiteboard ref={boardRef} onWriting={setBoardBusy} autoFocus={false} layoutSize={VIRTUAL_STAGE} />
                </div>
              )}
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 flex origin-top-left"
              style={{ width: VIRTUAL.w, height: VIRTUAL.h, transform: `scale(${k})` }}
            >
              <Rail scale={VIRTUAL_CHROME} always />
              <div className="relative min-w-0 flex-1">
                <div className="absolute inset-0" style={{ zoom: VIRTUAL_CHROME }}>
                  {chrome(VIRTUAL.h / VIRTUAL_CHROME)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex h-[520px] sm:h-[600px] lg:h-[640px]" data-cycle={cycle}>
      <Rail scale={scale} />
      <main ref={stageRef} className="relative min-w-0 flex-1 overflow-hidden bg-white">
        {opening}
        {wantsBoard && (
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-[400ms] ease-out"
            style={{ opacity: boardVisible && seeded ? 1 : 0 }}
            aria-hidden
          >
            <Whiteboard ref={boardRef} onWriting={setBoardBusy} autoFocus={false} />
          </div>
        )}
        <div className="absolute inset-0" style={{ zoom: scale }}>
          {chrome(stage.height ? stage.height / scale : undefined)}
        </div>
      </main>
    </div>
  );
}
