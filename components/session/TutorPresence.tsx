"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { TutorPet } from "@/components/board/TutorPet";
import { PetBubble } from "@/components/board/PetBubble";
import { useReduce } from "@/lib/reduced-motion";
import { presenceBubble, presenceLook, presenceState, type PresenceActivity } from "@/lib/tutor-presence";

export type { PresenceActivity };

// The tutor, in person (Sept 22 2026).
//
// The pet stands on the voice dock: the tutor's face beside its voice, and
// never on the student's work. It listens, thinks ("Thinking" in its bubble),
// writes (eyes on the board), speaks (it pulses with the voice) and hops when
// the student gets one right. What it says is its speech bubble, the live
// caption, which used to be a dark bar in the middle of the board; each word
// keeps its place for the whole turn and only new words fade in (PetBubble,
// lib/caption-words.ts). When a blank is waiting and the tutor is quiet, it
// says "Your turn" and looks at the board. After a long silence the page can
// give it a quiet line ("Take your time."), said in muted ink, which is the
// lowest-key thing it says and takes the place of "Your turn". While the
// student is talking (`studentSpeaking`) it only listens: no bubble of its
// own. The order and the poses are in lib/tutor-presence.ts, tested.
//
// On a laptop the dock has a column of its own, so the pet stands at full
// size (120px, Mateo's rule) above the pills and its bubble rises into the
// empty column. On a phone it is smaller and stands on the dock's edge beside
// the pills; the board keeps a band clear for it (TldrawCore's camera). With
// the transcript open the words are in the sheet, so the pet steps away.

type Props = {
  /**
   * The dock's activity. "listening" (what the dock shows whenever nobody is
   * talking) and "idle" both mean the tutor is waiting on the student.
   */
  activity: PresenceActivity;
  /** The tutor's words as they are spoken (the live caption). */
  caption: string;
  /** The tutor's voice, for the pet's pulse while it speaks. */
  analyser: AnalyserNode | null;
  /** A blank on the board is waiting for the student's answer. */
  yourTurn: boolean;
  /** Bumped when the student gets one right: a small hop. */
  celebrateKey: number;
  /** "column": a laptop, the dock in its own column. "compact": a phone or tablet. */
  placement: "column" | "compact";
  /** The transcript is open: the pet steps away. */
  hidden?: boolean;
  /**
   * A line for a long silence ("Take your time."). Shown in muted ink while
   * the tutor is not speaking, thinking or writing and the student is not
   * talking, in place of "Your turn".
   */
  quiet?: string | null;
  /** The student is talking right now: the pet listens, with no bubble of its own. */
  studentSpeaking?: boolean;
};

const HOP_MS = 1500;
// Keep in step with the camera's band in TldrawCore (PHONE_RESERVE).
export const PET_SIZE = { column: 120, compact: 72 } as const;
// How much of a long turn the bubble shows: its last sentence or two once the
// turn passes this many characters, from the line that holds the first of them
// (PetBubble rolls the older lines up out of the window). A phone takes less.
const CAPTION_CHARS = { column: 160, compact: 110 } as const;
// The body fills the middle 55% of the pet's canvas, so there is headroom
// above it. A speech bubble dips into it, its tail just over the pet's head;
// a thought bubble stands higher, leaving room for its two circles.
const BUBBLE_GAP = {
  column: { speech: -20, thought: 0 },
  compact: { speech: -12, thought: 10 },
} as const;

export function TutorPresence({
  activity,
  caption,
  analyser,
  yourTurn,
  celebrateKey,
  placement,
  hidden = false,
  quiet = null,
  studentSpeaking = false,
}: Props) {
  const reduce = useReduce() ?? false;
  const [level, setLevel] = useState(0);
  const [hopping, setHopping] = useState(false);
  const firstKey = useRef(celebrateKey);
  const compact = placement === "compact";

  // The voice level from the tutor's audio, while it speaks.
  useEffect(() => {
    if (!analyser || activity !== "speaking") {
      const t = setTimeout(() => setLevel(0), 0);
      return () => clearTimeout(t);
    }
    const data = new Float32Array(analyser.fftSize);
    let raf = 0;
    let last = 0;
    let smooth = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 40) return;
      last = now;
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      smooth = smooth * 0.6 + Math.min(1, rms * 6) * 0.4;
      setLevel((prev) => (Math.abs(prev - smooth) > 0.03 ? smooth : prev));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyser, activity]);

  // A right answer: a hop, then back to whatever the tutor is doing.
  useEffect(() => {
    if (celebrateKey === firstKey.current) return;
    const on = setTimeout(() => setHopping(true), 0);
    const off = setTimeout(() => setHopping(false), HOP_MS);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [celebrateKey]);

  const input = { activity, caption, yourTurn, studentSpeaking, quiet, hidden, hopping };
  const state = presenceState(input);
  const look = presenceLook(input);
  const says = presenceBubble(input);
  const kind = says.what === null ? "speech" : says.kind;

  const size = PET_SIZE[placement];
  return (
    <motion.div
      initial={false}
      animate={hidden ? { opacity: 0, y: 16, scale: 0.92 } : { opacity: 1, y: 0, scale: 1 }}
      transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 320, damping: 30 }}
      style={{ transformOrigin: "bottom left" }}
      // The body fills the middle 55% of its canvas (room to hop and squash),
      // so the canvas is set 22.5% of its size lower than the body should
      // stand. Laptop: 8px above the pills (10px over the dock, 36px tall).
      // Phone: on the dock's edge, left of the pills.
      className={
        compact
          ? "pointer-events-none absolute bottom-[calc(100%-12px)] left-0"
          : "pointer-events-none absolute bottom-[calc(100%+27px)] left-0"
      }
      data-pet-state={state}
      aria-hidden={hidden}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <TutorPet shape="square" state={state} level={level} look={look} size={size} reduceMotion={reduce} />
        <PetBubble
          open={says.what !== null}
          text={"text" in says ? says.text : undefined}
          kind={kind}
          tone={says.what === "quiet" ? "quiet" : "default"}
          tail={says.what === "caption" ? CAPTION_CHARS[placement] : undefined}
          side="top"
          align="start"
          maxWidth={340}
          gap={BUBBLE_GAP[placement][kind]}
        />
      </div>
    </motion.div>
  );
}
