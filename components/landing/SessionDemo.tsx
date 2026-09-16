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
import { CaptionBar } from "@/components/session/CaptionBar";
import type { TranscriptEntry } from "@/lib/live-types";
import type { UploadedFile } from "@/lib/file-processor";
import { dispatchWhiteboardTool } from "@/lib/whiteboard-tool-dispatch";
import { LESSON, LESSON_LOOP_MS, LESSON_TITLE } from "./lesson";
import { useReduce } from "./useScript";

// The session screen itself, not a picture of it. The rail, the title chip,
// the voice dock, the captions and the transcript are the app's own
// components; the board is the real tldraw whiteboard replaying a lesson
// through the tutor's tool calls. Phones and the first paint get a real
// screenshot of the same board instead.

const START_SECONDS = 227;
const POSTER = { src: "/landing/session-board.png", width: 2136, height: 1280 };

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

function Rail({ scale }: { scale: number }) {
  return (
    <div aria-hidden className="hidden w-12 shrink-0 flex-col bg-sidebar sm:flex" style={{ zoom: scale }}>
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

export function SessionDemo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { margin: "160px" });
  const everInView = useInView(rootRef, { margin: "160px", once: true });
  const reduce = useReduce();
  const wide = useIsWide();
  const [stageRef, stage] = useMeasure();

  const boardRef = useRef<WhiteboardHandle>(null);
  const [boardReady, setBoardReady] = useState(false);
  const [boardBusy, setBoardBusy] = useState(false);

  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [caption, setCaption] = useState("");
  const [activity, setActivity] = useState<DockActivity>("listening");
  const [elapsed, setElapsed] = useState(START_SECONDS);
  const [muted, setMuted] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [cycle, setCycle] = useState(0);

  // The board loads once the demo has been near the viewport, and only on
  // screens wide enough to read it. It arrives through a dynamic import, so
  // wait for the handle.
  const wantsBoard = everInView && wide;
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

  // The lesson, on a loop. Runs once the board is up (or right away where
  // the poster stands in for it) and pauses while the demo is off screen.
  const running = inView && (boardReady || !wantsBoard);
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      if (cancelled) return;
      setTranscript([]);
      setCaption("");
      setActivity("listening");
      setCycle((c) => c + 1);
      timers.forEach(clearTimeout);
      timers = LESSON.map((beat, i) =>
        setTimeout(() => {
          if (cancelled) return;
          if (beat.student) setTranscript((t) => [...t, { id: `s${i}`, role: "student", text: beat.student! }]);
          if (beat.say) {
            const line = beat.say;
            setTranscript((t) => [...t, { id: `t${i}`, role: "tutor", text: line }]);
            setCaption(line);
            const hold = Math.max(2200, line.split(/\s+/).length * 330);
            timers.push(
              setTimeout(() => {
                if (!cancelled) setCaption((c) => (c === line ? "" : c));
              }, hold),
            );
          }
          if (beat.activity) setActivity(beat.activity);
          if (beat.board && boardRef.current) {
            for (const call of beat.board) dispatchWhiteboardTool(call.name, call.args, { whiteboard: boardRef.current });
          }
        }, beat.at),
      );
      timers.push(setTimeout(run, LESSON_LOOP_MS));
    };
    const kickoff = setTimeout(run, 400);
    return () => {
      cancelled = true;
      clearTimeout(kickoff);
      timers.forEach(clearTimeout);
    };
  }, [running]);

  // Typing to the tutor: the line lands in the transcript, and the demo says
  // what it is. Only a real session answers.
  const handleSend = useCallback((text: string) => {
    const id = String(Date.now());
    setTranscript((t) => [...t, { id: `u${id}`, role: "student", text }]);
    setActivity("thinking");
    setTimeout(() => {
      const reply = "This preview replays a lesson, so I can't hear you yet. Start a free session and I'll answer for real.";
      setTranscript((t) => [...t, { id: `r${id}`, role: "tutor", text: reply }]);
      setCaption(reply);
      setActivity("speaking");
      setTimeout(() => {
        setCaption((c) => (c === reply ? "" : c));
        setActivity("listening");
      }, 5200);
    }, 900);
  }, []);

  // "Writing" follows the board's own reveal queue when there is a board;
  // the poster keeps the scripted state.
  const shownActivity: DockActivity = boardBusy ? "writing" : activity === "writing" && boardReady ? "listening" : activity;

  // The frame stands in for a whole screen, so the chrome (rail, chips, dock,
  // captions) shrinks to the proportion it has on one: a 1480px-wide screen
  // scaled to the frame. The board keeps its own zoom.
  const scale = wide && stage.width ? Math.min(1, Math.max(0.66, stage.width / 1480)) : 1;

  return (
    <div ref={rootRef} className="flex h-[520px] sm:h-[600px] lg:h-[640px]" data-cycle={cycle}>
      <Rail scale={scale} />
      <main ref={stageRef} className="relative min-w-0 flex-1 overflow-hidden bg-white">
        {wantsBoard ? (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <Whiteboard ref={boardRef} onWriting={setBoardBusy} autoFocus={false} />
          </div>
        ) : (
          <Image
            src={POSTER.src}
            alt={`The whiteboard during a lesson on ${LESSON_TITLE}: each step written out, the wrong try crossed out, the answer circled.`}
            width={POSTER.width}
            height={POSTER.height}
            priority
            sizes="(min-width: 1180px) 1068px, 100vw"
            className="absolute inset-0 h-full w-full object-cover object-left-top"
          />
        )}

        <div className="absolute inset-0" style={{ zoom: scale }}>
        <SessionChip liveState="active" title={LESSON_TITLE} elapsed={formatClock(elapsed)} qaLabel={null} />
        <span
          aria-hidden
          className="absolute top-4 right-4 z-30 hidden h-8 items-center gap-1.5 rounded-full border border-(--lp-line-strong) bg-white px-3.5 text-[13px] font-medium text-(--danger) sm:inline-flex"
        >
          <Square className="size-3 fill-current" />
          End session
        </span>

        {wide && !reduce && <CaptionBar text={caption} />}

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
          frameHeight={stage.height ? stage.height / scale : undefined}
        />
        </div>
      </main>
    </div>
  );
}
