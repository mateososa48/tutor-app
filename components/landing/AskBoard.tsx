"use client";

import { useRef, type ReactNode } from "react";
import { motion, useInView } from "motion/react";
import { Check, CornerDownRight } from "lucide-react";
import { DockBadge, type DockActivity } from "@/components/session/VoiceDock";
import { SessionChip } from "@/components/session/SessionChip";
import { cn } from "@/lib/utils";
import { BoardShot, T, rise } from "./Fragments";
import { Container, Label, Lede, Reveal, Section, Title } from "./Section";
import { SHOTS } from "./shots.generated";
import { useReduce, useScript } from "./useScript";

// One question, answered the way a session answers it: the student's line
// comes in, the board writes the two steps it takes, and a card on the side
// says what the tutor did and did not do (it stopped before the answer). The
// pieces are the app's own: the session chip, the dock badge, and a board
// photographed off the real whiteboard.

const SCRIPT = [
  { at: 0, key: "ask" },
  { at: 1100, key: "board" },
  { at: 2400, key: "say" },
  { at: 3600, key: "c1" },
  { at: 4300, key: "c2" },
  { at: 5000, key: "c3" },
  { at: 5900, key: "turn" },
] as const;
const LOOP_MS = 12500;

const CHECKS = [
  ["c1", "Distributed the 3"],
  ["c2", "Added 6 to both sides"],
  ["c3", "Stopped before the answer"],
] as const;

function Row({ shown, done, children }: { shown: boolean; done?: boolean; children: ReactNode }) {
  return (
    <motion.li initial={false} animate={rise(shown)} transition={T} className="flex items-start gap-2.5 text-[14px] leading-[1.45] text-(--lp-ink)">
      <span
        className={cn(
          "mt-[2px] inline-flex size-4 shrink-0 items-center justify-center rounded-[5px]",
          done ? "bg-[#e3f4ea] text-[#0f8a5f]" : "bg-(--lp-sky-soft) text-(--lp-sky-deep)",
        )}
      >
        {done ? <Check size={11} strokeWidth={3} aria-hidden /> : <CornerDownRight size={11} strokeWidth={2.6} aria-hidden />}
      </span>
      {children}
    </motion.li>
  );
}

function Stage() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-80px" });
  const reduce = useReduce();
  const { fired } = useScript(SCRIPT, LOOP_MS, inView, reduce);
  const activity: DockActivity = fired("turn") ? "listening" : fired("say") ? "speaking" : fired("board") ? "writing" : "thinking";

  return (
    <div ref={ref} className="relative mt-12 flex flex-col gap-4 lg:block lg:h-[560px]">
      {/* The student's line, as the transcript shows it. */}
      <motion.div
        initial={false}
        animate={rise(fired("ask"))}
        transition={T}
        className="lg:absolute lg:top-2 lg:left-0 lg:w-[272px]"
      >
        <p className="mb-1.5 text-[11px] font-semibold tracking-[0.04em] text-(--lp-ink-3)">You</p>
        <p className="m-0 w-fit rounded-[14px] bg-(--lp-gray) px-4 py-3 text-[15.5px] leading-[1.5] text-(--lp-ink)">
          I don&rsquo;t get how to get rid of the parentheses in 3(x − 2) = 12.
        </p>
      </motion.div>

      {/* What the tutor says while it writes: the voice half of the product. */}
      <motion.div
        initial={false}
        animate={rise(fired("say"))}
        transition={T}
        className="lg:absolute lg:top-[128px] lg:right-0 lg:w-[256px]"
      >
        <p className="mb-1.5 text-[11px] font-semibold tracking-[0.04em] text-(--lp-ink-3) lg:text-right">Tutor</p>
        <p className="m-0 text-[15.5px] leading-[1.5] text-(--lp-ink) lg:text-right">
          Three times each thing inside the brackets. Then the minus six is in the way, so add six to both sides.
        </p>
      </motion.div>

      {/* The board, in the session's own window chrome. */}
      <motion.div
        initial={false}
        animate={rise(fired("board"))}
        transition={T}
        className="lp-window relative overflow-hidden lg:absolute lg:top-[112px] lg:left-[236px] lg:w-[600px]"
      >
        <div className="relative flex h-[52px] items-center px-4">
          <SessionChip liveState="active" title="Solving 3(x − 2) = 12" elapsed="04:12" qaLabel={null} />
          <DockBadge activity={activity} className="ml-auto hidden sm:inline-flex" />
        </div>
        <div className="px-6 pt-2 pb-6 sm:px-8">
          <BoardShot
            shot={SHOTS.steps}
            width={420}
            shown={fired("board")}
            alt="The board: Solve 3(x − 2) = 12, then 3x − 6 = 12 marked distribute the 3, then 3x = 18 marked add 6 to both sides, underlined."
            className="border-0"
          />
        </div>
      </motion.div>

      {/* What the tutor did, ticked off as it happens. */}
      <motion.div
        initial={false}
        animate={rise(fired("c1"))}
        transition={T}
        className="rounded-[18px] border border-(--lp-line-strong) bg-white px-5 py-4 shadow-(--lp-shadow-card) lg:absolute lg:top-[312px] lg:right-0 lg:w-[336px]"
      >
        <p className="m-0 text-[14.5px] leading-[1.5] text-(--lp-ink)">
          Found it: <strong className="font-semibold">undoing the parentheses</strong>. Two steps on the board, one left for you.
        </p>
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
          {CHECKS.map(([key, text]) => (
            <Row key={key} shown={fired(key)} done>
              {text}
            </Row>
          ))}
          <Row shown={fired("turn")}>Your turn: three x is eighteen. What is one x?</Row>
        </ul>
      </motion.div>
    </div>
  );
}

export function AskBoard() {
  return (
    <Section id="how-it-works">
      <Container>
        <Reveal>
          <Label>How it works</Label>
          <Title className="max-w-[18ch]">Ask it the way you&rsquo;d ask a person.</Title>
          <Lede>
            Say what&rsquo;s confusing, in your own words. Chalk finds the step you&rsquo;re missing, draws it, and hands the next
            move back to you.
          </Lede>
        </Reveal>
        <Reveal delay={0.1} amount={0.1}>
          <Stage />
        </Reveal>
      </Container>
    </Section>
  );
}
