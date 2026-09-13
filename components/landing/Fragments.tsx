"use client";

import type { CSSProperties, ReactNode } from "react";
import katex from "katex";
import { motion, useReducedMotion } from "motion/react";
import { Check, FileImage, Loader2, Mic, PenLine } from "lucide-react";
import { TypingText } from "@/components/animate-ui/primitives/texts/typing";

// Pieces of the real session UI, rendered small and layered inside the bento
// tiles. Every fragment takes a `shown` flag so a tile can script them.

const EASE = [0.16, 1, 0.3, 1] as const;

export const rise = (shown: boolean) =>
  shown ? { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" } : { opacity: 0, y: 10, scale: 0.98, filter: "blur(4px)" };

export const T = { duration: 0.5, ease: EASE } as const;

export function Katex({ latex, className }: { latex: string; className?: string }) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: katex.renderToString(latex, { throwOnError: false }) }}
    />
  );
}

export function FragmentCard({
  children,
  className = "",
  style,
  shown = true,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  shown?: boolean;
}) {
  return (
    <motion.div
      initial={false}
      animate={rise(shown)}
      transition={T}
      className={`rounded-2xl ${className}`}
      style={{
        background: "rgba(255,255,255,0.86)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid var(--lp-line)",
        boxShadow: "0 1px 2px rgba(18,18,21,0.04), 0 10px 30px rgba(18,18,21,0.07)",
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}

export function Waveform({ active = true, bars = 9, height = 22 }: { active?: boolean; bars?: number; height?: number }) {
  const reduce = useReducedMotion();
  const heights = [0.35, 0.7, 1, 0.6, 0.85, 0.45, 0.95, 0.55, 0.3, 0.75, 0.5];
  return (
    <span className="inline-flex items-center gap-[3px]" style={{ height }} aria-hidden>
      {heights.slice(0, bars).map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full"
          style={{
            height: `${h * 100}%`,
            background: active ? "var(--lp-sky-deep)" : "var(--lp-ink-3)",
            transformOrigin: "center",
            animation: active && !reduce ? `lp-meter ${0.7 + (i % 3) * 0.2}s ease-in-out ${i * 0.08}s infinite` : "none",
          }}
        />
      ))}
    </span>
  );
}

/* Small board with KaTeX rows that appear one at a time. */
export function BoardFragment({
  title,
  rows,
  shownCount,
  underlineRow,
  className = "",
}: {
  title: string;
  rows: { latex: string; note?: string }[];
  shownCount: number;
  underlineRow?: number;
  className?: string;
}) {
  return (
    <div className={`lp-board lp-katex rounded-2xl p-4 text-(--lp-ink) ${className}`} style={{ border: "1px solid var(--lp-line)" }}>
      <p className="lp-display mb-2.5 text-[13.5px]">{title}</p>
      <div className="flex flex-col gap-2.5">
        {rows.map((r, i) => (
          <motion.div key={r.latex} initial={false} animate={rise(i < shownCount)} transition={T} className="relative flex w-fit items-baseline gap-3">
            <Katex latex={r.latex} className="text-[16px]" />
            {r.note && <span className="lp-hand whitespace-nowrap text-[12.5px]" style={{ color: "var(--lp-sky-deep)" }}>{r.note}</span>}
            {underlineRow === i && (
              <svg aria-hidden className="pointer-events-none absolute -bottom-1.5 left-0" width="90" height="8" viewBox="0 0 90 8" fill="none">
                <motion.path
                  d="M2 5 C 22 2, 44 7, 66 3 S 84 4, 88 5"
                  stroke="var(--lp-sky-deep)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  initial={false}
                  animate={{ pathLength: i < shownCount ? 1 : 0, opacity: i < shownCount ? 1 : 0 }}
                  transition={{ pathLength: { duration: 0.6, delay: 0.35, ease: "easeInOut" }, opacity: { duration: 0.1 } }}
                />
              </svg>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export type Activity = "thinking" | "writing" | "listening" | "speaking";

export function StatusChip({ state, shown = true, className = "" }: { state: Activity; shown?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const label: Record<Activity, string> = {
    thinking: "Thinking…",
    writing: "Writing on the board…",
    listening: "Listening",
    speaking: "Tutor speaking",
  };
  return (
    <FragmentCard shown={shown} className={`inline-flex items-center gap-2 px-3 py-2 text-[12.5px] font-medium text-(--lp-ink) ${className}`}>
      {state === "thinking" && <Loader2 size={13} className={reduce ? "" : "animate-spin"} style={{ color: "var(--lp-sky-deep)" }} aria-hidden />}
      {state === "writing" && <PenLine size={13} style={{ color: "var(--lp-sky-deep)" }} aria-hidden />}
      {(state === "listening" || state === "speaking") && <Mic size={13} style={{ color: "var(--lp-ink-2)" }} aria-hidden />}
      <span>{label[state]}</span>
      {state === "speaking" && <Waveform bars={5} height={12} />}
    </FragmentCard>
  );
}

/* The little "who is talking + time" chip, like the transcript rail shows. */
export function VoiceChip({ who, time, shown = true, active = true, className = "" }: { who: string; time: string; shown?: boolean; active?: boolean; className?: string }) {
  return (
    <FragmentCard shown={shown} className={`px-4 py-3 ${className}`}>
      <div className="flex items-center gap-3">
        <Waveform active={active} />
        <span className="lp-display text-[15px]">{time}</span>
      </div>
      <p className="mt-1.5 text-[12px] text-(--lp-ink-3)">{who}</p>
    </FragmentCard>
  );
}

export function AttemptChip({ text, shown, crossed, className = "" }: { text: string; shown: boolean; crossed: boolean; className?: string }) {
  return (
    <motion.div initial={false} animate={rise(shown)} transition={T} className={`relative w-fit rounded-lg px-3 py-1.5 text-[15px] italic ${className}`} style={{ background: "var(--lp-gray)", color: "var(--lp-ink-2)", border: "1px solid var(--lp-line)" }}>
      {text}
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 32" preserveAspectRatio="none" fill="none">
        <motion.path
          d="M4 21 L 96 11"
          stroke="var(--lp-sky-deep)"
          strokeWidth="2.2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={false}
          animate={{ pathLength: crossed ? 1 : 0, opacity: crossed ? 1 : 0 }}
          transition={{ pathLength: { duration: 0.45, ease: "easeInOut" }, opacity: { duration: 0.1 } }}
        />
      </svg>
    </motion.div>
  );
}

export function TutorBubble({ text, shown, cycle, typing = true, className = "" }: { text: string; shown: boolean; cycle: number; typing?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <FragmentCard shown={shown} className={`px-4 py-3 ${className}`}>
      <p className="mb-1 text-[11px] font-semibold tracking-[0.02em] text-(--lp-ink-3)">Tutor</p>
      <p className="text-[14px] leading-[1.45] font-medium break-words whitespace-normal text-(--lp-ink)">
        {shown && typing && !reduce ? <TypingText key={cycle} text={text} duration={22} inView={false} className="whitespace-normal" /> : text}
      </p>
    </FragmentCard>
  );
}

export function CalloutChip({ text, shown, className = "" }: { text: string; shown: boolean; className?: string }) {
  return (
    <motion.div
      initial={false}
      animate={rise(shown)}
      transition={T}
      className={`inline-flex w-fit items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium ${className}`}
      style={{ background: "var(--lp-sky-soft)", color: "var(--lp-sky-deep)", border: "1px solid rgba(61,156,255,0.28)" }}
    >
      {text}
    </motion.div>
  );
}

function WorksheetThumb() {
  return (
    <svg viewBox="0 0 44 56" width="34" height="44" aria-hidden>
      <rect x="1" y="1" width="42" height="54" rx="5" fill="#fff" stroke="var(--lp-line-strong)" />
      <rect x="8" y="9" width="20" height="3.5" rx="1.75" fill="var(--lp-gray-2)" />
      <rect x="8" y="17" width="28" height="2.5" rx="1.25" fill="var(--lp-gray-2)" />
      <rect x="8" y="23" width="24" height="2.5" rx="1.25" fill="var(--lp-gray-2)" />
      <rect x="8" y="31" width="28" height="2.5" rx="1.25" fill="var(--lp-gray-2)" />
      <rect x="8" y="37" width="18" height="2.5" rx="1.25" fill="var(--lp-gray-2)" />
      <rect x="6" y="28" width="32" height="8" rx="2" fill="none" stroke="var(--lp-sky)" strokeWidth="1.2" strokeDasharray="2 2" />
    </svg>
  );
}

export function FileCard({ name, meta, status, shown, className = "" }: { name: string; meta: string; status: "reading" | "found" | "done"; shown: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const label = status === "reading" ? "Reading the page…" : status === "found" ? "Found 6 problems" : "Problem 4 on the board";
  return (
    <FragmentCard shown={shown} className={`flex items-center gap-3.5 px-4 py-3 ${className}`}>
      <WorksheetThumb />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[14px] font-semibold text-(--lp-ink)">
          <FileImage size={14} className="text-(--lp-ink-3)" aria-hidden />
          <span className="truncate">{name}</span>
        </p>
        <p className="text-[12px] text-(--lp-ink-3)">{meta}</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: status === "reading" ? "var(--lp-ink-2)" : "var(--lp-sky-deep)" }}>
          {status === "reading" ? <Loader2 size={12} className={reduce ? "" : "animate-spin"} aria-hidden /> : <Check size={12} strokeWidth={3} aria-hidden />}
          {label}
        </p>
      </div>
    </FragmentCard>
  );
}

export function NotesCard({ notes, shownCount, className = "" }: { notes: string[]; shownCount: number; className?: string }) {
  return (
    <FragmentCard className={`p-4 ${className}`}>
      <p className="mb-3 text-[11px] font-semibold tracking-[0.02em] text-(--lp-ink-3)">What your tutor remembers</p>
      <ul className="flex flex-col gap-2">
        {notes.map((n, i) => (
          <motion.li key={n} initial={false} animate={rise(i < shownCount)} transition={T} className="flex items-start gap-2.5 text-[13.5px] leading-[1.4] text-(--lp-ink)">
            <span className="mt-[2px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--lp-sky-soft)", color: "var(--lp-sky-deep)" }}>
              <Check size={10} strokeWidth={3} aria-hidden />
            </span>
            {n}
          </motion.li>
        ))}
      </ul>
    </FragmentCard>
  );
}

export function NextSessionChip({ shown, className = "" }: { shown: boolean; className?: string }) {
  return (
    <FragmentCard shown={shown} className={`px-4 py-3 ${className}`}>
      <p className="text-[11px] font-semibold tracking-[0.02em] text-(--lp-ink-3)">Next session</p>
      <p className="mt-1 text-[13.5px] font-medium text-(--lp-ink)">Picks up at factoring, with the area model</p>
    </FragmentCard>
  );
}
