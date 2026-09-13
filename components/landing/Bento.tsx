"use client";

import { useRef, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import SpotlightCard from "@/components/SpotlightCard";
import { BentoGrid } from "@/components/ui/bento-grid";
import { BlurFade } from "@/components/ui/blur-fade";
import {
  AttemptChip,
  BoardFragment,
  CalloutChip,
  FileCard,
  Katex,
  NextSessionChip,
  NotesCard,
  StatusChip,
  TutorBubble,
  VoiceChip,
  rise,
  T,
  type Activity,
} from "./Fragments";
import { useScript } from "./useScript";

/* ── Tile: double border (frame + inner card), wash, spotlight ─────────── */

function Tile({
  title,
  body,
  span,
  children,
  delay = 0,
}: {
  title: string;
  body: string;
  span: string;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <BlurFade inView delay={delay} className={span}>
      <div className="lp-frame h-full">
        <SpotlightCard
          spotlightColor="rgba(61, 156, 255, 0.14)"
          className="flex h-full flex-col rounded-[20px] border-(--lp-line) bg-white p-6"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(80% 50% at 15% 0%, rgba(61,156,255,0.12), transparent 70%), linear-gradient(180deg, var(--lp-sky-tint) 0%, rgba(255,255,255,0) 55%)",
            }}
          />
          <div className="relative flex-1">{children}</div>
          <div className="relative mt-6">
            <h3 className="lp-display text-[20px] leading-[1.2]">{title}</h3>
            <p className="mt-1.5 max-w-[46ch] text-[15px] leading-[1.5] text-(--lp-ink-2)">{body}</p>
          </div>
        </SpotlightCard>
      </div>
    </BlurFade>
  );
}

function useStage() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-60px" });
  const reduce = useReducedMotion();
  return { ref, inView, reduce };
}

/* ── A: every step on the board ─────────────────────────────────────────── */

const A_SCRIPT = [
  { at: 0, key: "thinking" },
  { at: 900, key: "title" },
  { at: 1500, key: "row1" },
  { at: 2600, key: "row2" },
  { at: 3700, key: "row3" },
  { at: 4900, key: "speak" },
  { at: 7200, key: "listen" },
] as const;

function StageBoard() {
  const { ref, inView, reduce } = useStage();
  const { fired } = useScript(A_SCRIPT, 10500, inView, reduce);
  const rows = (["row1", "row2", "row3"] as const).filter((k) => fired(k)).length;
  const state: Activity = fired("listen") ? "listening" : fired("speak") ? "speaking" : fired("row1") ? "writing" : "thinking";

  return (
    <div ref={ref} className="relative flex flex-col gap-3 sm:block sm:h-[224px]">
      <StatusChip state={state} className="self-start sm:absolute sm:top-0 sm:right-0" />
      <motion.div initial={false} animate={rise(fired("title"))} transition={T} className="w-full sm:absolute sm:top-0 sm:left-0 sm:w-[min(100%,460px)]">
        <BoardFragment
          title="Solve 3(x − 2) = 12"
          rows={[
            { latex: "3(x - 2) = 12", note: "given" },
            { latex: "3x - 6 = 12", note: "distribute" },
            { latex: "3x = 18", note: "add 6 to both sides" },
          ]}
          shownCount={rows}
          underlineRow={2}
        />
      </motion.div>
      <VoiceChip who="Tutor, on the distributive step" time="0:04" shown={fired("speak")} active={!fired("listen")} className="sm:absolute sm:right-0 sm:bottom-0 sm:w-[min(100%,272px)]" />
    </div>
  );
}

/* ── B: hints before answers ───────────────────────────────────────────── */

const B_SCRIPT = [
  { at: 0, key: "attempt" },
  { at: 1000, key: "cross" },
  { at: 1700, key: "bubble" },
  { at: 4300, key: "callout" },
] as const;

function StageHints() {
  const { ref, inView, reduce } = useStage();
  const { fired, cycle } = useScript(B_SCRIPT, 8400, inView, reduce);
  return (
    <div ref={ref} className="flex flex-col justify-end gap-3 sm:h-[224px]">
      <div className="lp-katex flex items-center gap-2.5 text-(--lp-ink-3)">
        <Katex latex="2x = 8" className="text-[16px] text-(--lp-ink)" />
        <span className="text-[11.5px]">already on the board</span>
      </div>
      <AttemptChip text="you: x = 16" shown={fired("attempt")} crossed={fired("cross")} />
      <TutorBubble cycle={cycle} shown={fired("bubble")} text="Close. Two times x is eight. So are we multiplying by two, or dividing?" />
      <CalloutChip text="Your turn: what is x?" shown={fired("callout")} />
    </div>
  );
}

/* ── C: snap the worksheet ─────────────────────────────────────────────── */

const C_SCRIPT = [
  { at: 0, key: "file" },
  { at: 1300, key: "found" },
  { at: 2400, key: "board" },
  { at: 3100, key: "row" },
] as const;

function StageWorksheet() {
  const { ref, inView, reduce } = useStage();
  const { fired } = useScript(C_SCRIPT, 8200, inView, reduce);
  const status = fired("board") ? "done" : fired("found") ? "found" : "reading";
  return (
    <div ref={ref} className="relative flex flex-col gap-3 sm:block sm:h-[224px]">
      <FileCard name="algebra-hw.jpg" meta="Photo, 2.1 MB" status={status} shown={fired("file")} className="sm:absolute sm:top-0 sm:left-0 sm:w-[min(100%,264px)]" />
      <motion.div initial={false} animate={rise(fired("board"))} transition={T} className="sm:absolute sm:right-0 sm:bottom-0 sm:w-[min(100%,250px)]">
        <BoardFragment title="Problem 4" rows={[{ latex: "5x + 2 = 17", note: "from the sheet" }]} shownCount={fired("row") ? 1 : 0} />
      </motion.div>
    </div>
  );
}

/* ── D: it remembers what clicked ──────────────────────────────────────── */

const D_SCRIPT = [
  { at: 0, key: "n1" },
  { at: 900, key: "n2" },
  { at: 1800, key: "n3" },
  { at: 3000, key: "next" },
] as const;

function StageMemory() {
  const { ref, inView, reduce } = useStage();
  const { fired } = useScript(D_SCRIPT, 9000, inView, reduce);
  const count = (["n1", "n2", "n3"] as const).filter((k) => fired(k)).length;
  return (
    <div ref={ref} className="relative flex flex-col gap-3 sm:block sm:h-[224px]">
      <NotesCard
        notes={[
          "Got factoring after the area-model analogy",
          "Mixes up kinetic and potential energy",
          "Likes to try a step before hearing a hint",
        ]}
        shownCount={count}
        className="sm:absolute sm:top-0 sm:left-0 sm:w-[min(100%,372px)]"
      />
      <NextSessionChip shown={fired("next")} className="sm:absolute sm:right-0 sm:bottom-0 sm:w-[min(100%,264px)]" />
    </div>
  );
}

/* ── Section ────────────────────────────────────────────────────────────── */

export function Bento() {
  return (
    <section id="capabilities" className="scroll-mt-24 py-16 sm:py-24">
      <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
        <BlurFade inView>
          <h2 className="lp-display max-w-[18ch] text-[clamp(2rem,3.6vw,3rem)] leading-[1.06]">
            Built like a real tutor, not a chat box.
          </h2>
          <p className="mt-4 max-w-[52ch] text-[1.0625rem] leading-[1.55] text-(--lp-ink-2)">
            A chat box hands you a paragraph. A tutor sits next to you, writes as they talk, and waits for you to try.
          </p>
        </BlurFade>

        <BentoGrid className="mt-12 auto-rows-auto grid-cols-1 gap-4 md:grid-cols-3">
          <Tile span="md:col-span-2" title="Every step, on the board." body="It writes the line you just reached and stops. No wall of solution, no scrolling back to find where you got lost.">
            <StageBoard />
          </Tile>
          <Tile span="md:col-span-1" delay={0.06} title="Hints before answers." body="Your attempt goes on the board first. Then the smallest nudge that gets you moving again.">
            <StageHints />
          </Tile>
          <Tile span="md:col-span-1" delay={0.12} title="Snap the worksheet." body="Photo or PDF in. It reads the page, asks which problem, and puts that one on the board.">
            <StageWorksheet />
          </Tile>
          <Tile span="md:col-span-2" delay={0.18} title="It remembers what clicked." body="Notes carry over between sessions, so next week starts from what worked, not from zero.">
            <StageMemory />
          </Tile>
        </BentoGrid>
      </div>
    </section>
  );
}
