"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion, useInView } from "motion/react";
import { Check } from "lucide-react";
import SpotlightCard from "@/components/SpotlightCard";
import { BentoGrid } from "@/components/ui/bento-grid";
import { BlurFade } from "@/components/ui/blur-fade";
import { DockBadge, type DockActivity } from "@/components/session/VoiceDock";
import { FilesPanel } from "@/components/session/FilesPopover";
import type { UploadedFile } from "@/lib/file-processor";
import { BoardShot, Transcript, line, rise, T } from "./Fragments";
import { SHOTS } from "./shots.generated";
import { useReduce, useScript } from "./useScript";

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
  const reduce = useReduce();
  return { ref, inView, reduce };
}

/* ── A: every step on the board ─────────────────────────────────────────── */

const A_SCRIPT = [
  { at: 0, key: "thinking" },
  { at: 700, key: "board" },
  { at: 3400, key: "speak" },
  { at: 7000, key: "listen" },
] as const;

function StageBoard() {
  const { ref, inView, reduce } = useStage();
  const { fired } = useScript(A_SCRIPT, 10500, inView, reduce);
  const state: DockActivity = fired("listen") ? "listening" : fired("speak") ? "speaking" : fired("board") ? "writing" : "thinking";

  return (
    <div ref={ref} className="relative flex flex-col gap-3 sm:block sm:h-[264px]">
      <BoardShot
        shot={SHOTS.steps}
        width={340}
        shown={fired("board")}
        alt="The board: Solve 3(x − 2) = 12, then 3x − 6 = 12 marked distribute the 3, then 3x = 18 marked add 6 to both sides, underlined."
        className="sm:absolute sm:top-0 sm:left-0"
      />
      <DockBadge activity={state} className="self-start sm:absolute sm:top-0 sm:right-0" />
      <Transcript
        entries={[line("tutor", "Three x is eighteen. So what is one x?")]}
        shown={fired("speak")}
        className="sm:absolute sm:right-0 sm:bottom-0 sm:w-[min(100%,272px)]"
      />
    </div>
  );
}

/* ── B: hints before answers ───────────────────────────────────────────── */

const B_SCRIPT = [
  { at: 0, key: "board" },
  { at: 2600, key: "bubble" },
] as const;

function StageHints() {
  const { ref, inView, reduce } = useStage();
  const { fired } = useScript(B_SCRIPT, 8000, inView, reduce);
  return (
    <div ref={ref} className="flex flex-col justify-end gap-3 sm:h-[264px]">
      <BoardShot
        shot={SHOTS.hint}
        width={250}
        shown={fired("board")}
        alt="The board: 2x = 8, the student's try x = 16 in their own hand, and x = 16 crossed out in red."
      />
      <Transcript entries={[line("tutor", "Close. Two times x is eight. Multiply by two, or divide?")]} shown={fired("bubble")} />
    </div>
  );
}

/* ── C: snap the worksheet ─────────────────────────────────────────────── */

const C_SCRIPT = [
  { at: 0, key: "file" },
  { at: 1400, key: "board" },
] as const;

const WORKSHEET: UploadedFile = { id: "w1", label: "File 1", name: "algebra-hw.jpg", mimeType: "image/jpeg", base64: "" };

function StageWorksheet() {
  const { ref, inView, reduce } = useStage();
  const { fired } = useScript(C_SCRIPT, 8000, inView, reduce);
  const [files, setFiles] = useState<UploadedFile[]>([WORKSHEET]);
  return (
    <div ref={ref} className="flex flex-col gap-3">
      <motion.div initial={false} animate={rise(fired("file"))} transition={T} className="rounded-[16px] border border-(--lp-line-strong) bg-white p-2 shadow-(--lp-shadow-card)">
        <FilesPanel files={files} onAddFiles={(added) => setFiles((f) => [...f, ...added])} onRemoveFile={(id) => setFiles((f) => f.filter((x) => x.id !== id))} />
      </motion.div>
      <BoardShot
        shot={SHOTS.worksheet}
        width={240}
        shown={fired("board")}
        alt="The board: Problem 4, then 5x + 2 = 17 marked from the worksheet."
        className="self-end"
      />
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

const NOTES = [
  "Got factoring after the area-model picture",
  "Mixes up which side to undo first",
  "Likes to try a step before hearing a hint",
];

function StageMemory() {
  const { ref, inView, reduce } = useStage();
  const { fired } = useScript(D_SCRIPT, 9000, inView, reduce);
  const count = (["n1", "n2", "n3"] as const).filter((k) => fired(k)).length;
  return (
    <div ref={ref} className="relative flex flex-col gap-3 sm:block sm:h-[264px]">
      <div className="rounded-[18px] border border-(--lp-line-strong) bg-white px-5 py-4 shadow-(--lp-shadow-card) sm:absolute sm:top-0 sm:left-0 sm:w-[min(100%,372px)]">
        <p className="mb-2.5 text-[11px] font-semibold tracking-[0.04em] text-(--lp-ink-3)">Tutor notes</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {NOTES.map((n, i) => (
            <motion.li key={n} initial={false} animate={rise(i < count)} transition={T} className="flex items-start gap-2.5 text-[14px] leading-[1.45] text-(--lp-ink)">
              <span className="mt-[3px] inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-(--lp-sky-soft) text-(--lp-sky-deep)">
                <Check size={10} strokeWidth={3} aria-hidden />
              </span>
              {n}
            </motion.li>
          ))}
        </ul>
      </div>
      <motion.div
        initial={false}
        animate={rise(fired("next"))}
        transition={T}
        className="rounded-[18px] border border-(--lp-line-strong) bg-white px-5 py-4 shadow-(--lp-shadow-card) sm:absolute sm:right-0 sm:bottom-0 sm:w-[min(100%,264px)]"
      >
        <p className="text-[11px] font-semibold tracking-[0.04em] text-(--lp-ink-3)">Next session</p>
        <p className="mt-1 text-[14px] leading-[1.45] text-(--lp-ink)">Picks up at factoring, with the area model.</p>
      </motion.div>
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
