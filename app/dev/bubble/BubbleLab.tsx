"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceDock } from "@/components/session/VoiceDock";
import { TutorPresence } from "@/components/session/TutorPresence";
import type { DockActivity } from "@/components/session/VoiceDock";
import { useIsWide } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

// The pet's bubble where it really sits: on the real voice dock over a white
// board, at the real breakpoints. Nothing talks to a model.

// One real Gemini Live turn (Sept 23 2026) and when each caption update
// arrived: [ms after the first word, characters revealed]. These are the
// captions lib/gemini-tutor.ts shows for that turn's recorded audio and
// transcript arrival at 1x (revealByFraction every 80 ms, meter phase 20 ms).
// At 3760 ms the caption drops "to" for 80 ms: a burst of audio arrived ahead
// of its transcript. The bubble must not start the turn over for it.
const TURN =
  'Think of it like trying to add apples and oranges; you need them to be the same type to combine them correctly. A common denominator makes sure the "slices" of the pie are the same size, so you\'re not adding one big piece to one small piece. Once they have the same denominator, you can just add the top numbers, which tells you how many total pieces you have. Does that make a little more sense?';
const REVEAL: [number, number][] = [
  [80, 5], [320, 8], [480, 11], [640, 16], [880, 23], [1360, 26], [1440, 30], [1760, 37], [2240, 41], [2400, 50],
  [2880, 54], [3120, 59], [3440, 64], [3680, 67], [3760, 64], [3840, 67], [3920, 70], [4080, 74], [4320, 79],
  [4560, 84], [4800, 87], [4960, 95], [5360, 100], [5600, 111], [6160, 113], [6320, 120], [6640, 132], [7360, 138],
  [7680, 143], [7920, 147], [8160, 156], [8640, 159], [8800, 163], [9040, 167], [9280, 171], [9520, 175], [9680, 180],
  [10000, 186], [10320, 189], [10480, 196], [10880, 200], [11040, 207], [11440, 211], [11680, 215], [11920, 221],
  [12240, 224], [12400, 228], [12640, 234], [12960, 241], [13360, 246], [13600, 251], [13920, 256], [14160, 260],
  [14400, 265], [14640, 278], [15360, 282], [15600, 286], [15840, 291], [16080, 295], [16320, 299], [16560, 303],
  [16720, 312], [17280, 318], [17600, 324], [17920, 328], [18160, 332], [18320, 337], [18640, 343], [18960, 350],
  [19360, 354], [19520, 360], [19920, 365], [20160, 370], [20400, 375], [20720, 377], [20800, 384], [21200, 389],
  [21440, 396],
];

type Control = "play" | "interrupt" | "thinking" | "writing" | "talking" | "turn" | "quiet" | "reset";
const CONTROLS: { id: Control; label: string }[] = [
  { id: "play", label: "Play a real turn" },
  { id: "interrupt", label: "Interrupt" },
  { id: "thinking", label: "Thinking" },
  { id: "writing", label: "Writing" },
  { id: "talking", label: "Student talking" },
  { id: "turn", label: "Your turn" },
  { id: "quiet", label: "Take your time." },
  { id: "reset", label: "Reset" },
];

type Lab = {
  setCaption: (text: string) => void;
  /** The dock's activity, as the session page computes it: "listening" whenever nobody is talking. */
  setActivity: (a: DockActivity) => void;
  setStudentSpeaking: (on: boolean) => void;
  setQuiet: (line: string | null) => void;
  setYourTurn: (on: boolean) => void;
  /** Plays the real turn; resolves when its last word is out. */
  play: (upTo?: number) => Promise<void>;
  /** Stops the turn where it is, as the student cutting in would. */
  interrupt: () => void;
  reset: () => void;
};

declare global {
  interface Window {
    __bubble?: Lab;
  }
}

export default function BubbleLab() {
  const wide = useIsWide();
  const [activity, setActivity] = useState<DockActivity>("listening");
  const [studentSpeaking, setStudentSpeaking] = useState(false);
  const [caption, setCaption] = useState("");
  const [quiet, setQuiet] = useState<string | null>(null);
  const [yourTurn, setYourTurn] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shown = useRef("");

  const stop = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const say = useCallback((text: string) => {
    shown.current = text;
    setCaption(text);
  }, []);

  const play = useCallback(
    (upTo = REVEAL.length) =>
      new Promise<void>((resolve) => {
        stop();
        setQuiet(null);
        setStudentSpeaking(false);
        say("");
        setActivity("speaking");
        const steps = REVEAL.slice(0, upTo);
        steps.forEach(([at, n], i) => {
          timers.current.push(
            setTimeout(() => {
              say(TURN.slice(0, n));
              if (i === steps.length - 1) {
                // The voice ends a beat after the last word; the caption lingers.
                timers.current.push(setTimeout(() => setActivity("listening"), 400));
                resolve();
              }
            }, at),
          );
        });
      }),
    [say, stop],
  );

  const interrupt = useCallback(() => {
    stop();
    // The student cut in: the line stops at the last word heard, with a dash.
    const heard = shown.current.replace(/\s+\S*$/, "");
    say(`${heard || shown.current} —`);
    setActivity("listening");
    setStudentSpeaking(true);
  }, [say, stop]);

  const reset = useCallback(() => {
    stop();
    say("");
    setQuiet(null);
    setYourTurn(false);
    setStudentSpeaking(false);
    setActivity("listening");
  }, [say, stop]);

  useEffect(() => {
    window.__bubble = { setCaption: say, setActivity, setStudentSpeaking, setQuiet, setYourTurn, play, interrupt, reset };
    return () => {
      stop();
      delete window.__bubble;
    };
  }, [say, play, interrupt, reset, stop]);

  // One handler for every button, so the list itself holds only data.
  const act = useCallback(
    (id: Control) => {
      if (id === "play") return void play();
      if (id === "interrupt") return interrupt();
      if (id === "reset") return reset();
      stop();
      say("");
      setStudentSpeaking(id === "talking" ? (v) => !v : false);
      if (id === "thinking") setActivity("thinking");
      else if (id === "writing") setActivity("writing");
      else if (id === "talking") setActivity("listening");
      else if (id === "turn") {
        setActivity("listening");
        setYourTurn((v) => !v);
      } else if (id === "quiet") {
        setActivity("listening");
        setQuiet((q) => (q ? null : "Take your time."));
      }
    },
    [play, interrupt, reset, stop, say],
  );
  const on: Partial<Record<Control, boolean>> = {
    play: activity === "speaking",
    thinking: activity === "thinking" && !caption,
    writing: activity === "writing",
    talking: studentSpeaking,
    turn: yourTurn,
    quiet: Boolean(quiet),
  };

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-white text-(--lp-ink)">
      <div className="absolute top-4 left-4 z-40 flex max-w-[calc(100%-32px)] flex-wrap gap-1.5">
        {CONTROLS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={on[c.id] ?? undefined}
            onClick={() => act(c.id)}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1.5 text-[14px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
              on[c.id] ? "border-(--lp-sky) bg-(--lp-sky-soft)" : "border-(--lp-line-strong) bg-white text-(--lp-ink-2) hover:text-(--lp-ink)",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <VoiceDock
        activity={activity}
        isMuted={false}
        onMute={() => {}}
        analyser={null}
        onSendText={() => {}}
        transcript={[]}
        transcriptOpen={transcriptOpen}
        onToggleTranscript={() => setTranscriptOpen((v) => !v)}
        files={[]}
        onAddFiles={() => {}}
        onRemoveFile={() => {}}
        presence={
          <TutorPresence
            activity={activity}
            caption={caption}
            analyser={null}
            yourTurn={yourTurn}
            celebrateKey={0}
            placement={wide ? "column" : "compact"}
            hidden={transcriptOpen}
            quiet={quiet}
            studentSpeaking={studentSpeaking}
          />
        }
      />
    </main>
  );
}
