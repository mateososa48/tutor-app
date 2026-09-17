"use client";

import { useRef, type ReactNode } from "react";
import { useInView } from "motion/react";
import { DockBadge } from "@/components/session/VoiceDock";
import { VoiceWave } from "@/components/session/VoiceWave";
import { BoardShot, Transcript, line } from "./Fragments";
import { Caption, Container, Label, Lede, Reveal, Section, Title } from "./Section";
import { SHOTS } from "./shots.generated";
import { useReduce, useScript } from "./useScript";

// The three things a session does at once, one tinted tile each. The tints
// are the tutor's own pens (the board's blue, violet and green markers, paled),
// and each tile holds a working piece of the product, not a picture of one.

const TINTS = {
  sky: "linear-gradient(180deg, #d4e8ff 0%, #eaf4ff 100%)",
  violet: "linear-gradient(180deg, #e7ddf8 0%, #f4effb 100%)",
  green: "linear-gradient(180deg, #d2eedd 0%, #eaf7ef 100%)",
} as const;

function Tile({ tint, lead, body, delay = 0, children }: { tint: keyof typeof TINTS; lead: string; body: string; delay?: number; children: ReactNode }) {
  return (
    <Reveal delay={delay} className="flex flex-col">
      <div className="relative h-[340px] overflow-hidden rounded-[20px] border border-(--lp-line) p-5" style={{ background: TINTS[tint] }}>
        {children}
      </div>
      <Caption lead={lead} className="mt-5 max-w-[40ch] px-1">
        {body}
      </Caption>
    </Reveal>
  );
}

function useStage() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-60px" });
  const reduce = useReduce();
  return { ref, inView, reduce };
}

/* You talk: the dock's badge, a student line, the voice wave answering. */
const TALK = [
  { at: 0, key: "line" },
  { at: 1600, key: "speak" },
  { at: 6200, key: "listen" },
] as const;

function Talk() {
  const { ref, inView, reduce } = useStage();
  const { fired } = useScript(TALK, 9000, inView, reduce);
  const speaking = fired("speak") && !fired("listen");
  return (
    <div ref={ref} className="flex h-full flex-col">
      <DockBadge activity={speaking ? "speaking" : "listening"} className="self-start" />
      <Transcript entries={[line("student", "Wait, why does the three move to the other side?")]} shown={fired("line")} className="mt-4" />
      <div className="mt-auto -mx-5 -mb-5 h-[110px]" aria-hidden>
        <VoiceWave analyser={null} speaking={speaking} />
      </div>
    </div>
  );
}

/* It writes: the steps arriving on the board, the badge saying so. */
const WRITE = [
  { at: 0, key: "board" },
  { at: 3200, key: "done" },
] as const;

function Write() {
  const { ref, inView, reduce } = useStage();
  const { fired } = useScript(WRITE, 9000, inView, reduce);
  return (
    <div ref={ref} className="relative flex h-full flex-col">
      <DockBadge activity={fired("done") ? "speaking" : "writing"} className="absolute top-0 right-0 z-10" />
      <BoardShot
        shot={SHOTS.steps}
        width={300}
        shown={fired("board")}
        alt="The board: Solve 3(x − 2) = 12, then 3x − 6 = 12 marked distribute the 3, then 3x = 18 marked add 6 to both sides, underlined."
        className="mt-auto shadow-(--lp-shadow-card)"
      />
    </div>
  );
}

/* You try: the attempt on the board, crossed out, and the hint that follows. */
const TRY = [
  { at: 0, key: "board" },
  { at: 2600, key: "hint" },
] as const;

function Try() {
  const { ref, inView, reduce } = useStage();
  const { fired } = useScript(TRY, 9000, inView, reduce);
  return (
    <div ref={ref} className="flex h-full flex-col justify-end gap-3">
      <BoardShot
        shot={SHOTS.hint}
        width={236}
        shown={fired("board")}
        alt="The board: 2x = 8, the student's try x = 16 in their own hand, and x = 16 crossed out in red."
        className="shadow-(--lp-shadow-card)"
      />
      <Transcript entries={[line("tutor", "Close. Two times x is eight. Multiply by two, or divide?")]} shown={fired("hint")} />
    </div>
  );
}

export function Trio() {
  return (
    <Section>
      <Container>
        <Reveal className="flex flex-col items-center text-center">
          <Label>One conversation</Label>
          <Title>
            <span className="block">You talk. It writes.</span>
            <span className="block">You try.</span>
          </Title>
          <Lede className="max-w-[46ch]">Three things happening at once, the way they do with a tutor standing at the board.</Lede>
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          <Tile tint="sky" lead="You talk." body="Say it the way you'd say it to a person. Interrupt, think out loud, ask again.">
            <Talk />
          </Tile>
          <Tile tint="violet" lead="It writes as it explains." body="One step at a time on a shared whiteboard, in time with what it says." delay={0.08}>
            <Write />
          </Tile>
          <Tile tint="green" lead="You try first." body="Your attempt goes on the board, right or wrong, and the smallest hint follows." delay={0.16}>
            <Try />
          </Tile>
        </div>
      </Container>
    </Section>
  );
}
