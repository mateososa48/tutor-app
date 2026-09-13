"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { ArrowRight, Home, Menu, Mic, Plus } from "lucide-react";
import { TypingText } from "@/components/animate-ui/primitives/texts/typing";
import { StatusChip, rise, T, type Activity } from "./Fragments";
import { Arrow, Attempt, NumberLine, Ring, Row, Sticky, Underline } from "./Board";
import { useScript } from "./useScript";

// The session screen, replayed: nav rail, whiteboard, transcript sidebar.

const SCRIPT = [
  { at: 0, key: "student1" },
  { at: 1700, key: "bridge" },
  { at: 2500, key: "title" },
  { at: 3300, key: "step1" },
  { at: 4400, key: "ask" },
  { at: 6100, key: "student2" },
  { at: 7000, key: "step2" },
  { at: 7600, key: "arrow" },
  { at: 8600, key: "attempt" },
  { at: 9400, key: "ring" },
  { at: 10100, key: "line" },
  { at: 11400, key: "sticky" },
] as const;

function Meter({ active }: { active: boolean }) {
  return (
    <span className="inline-flex h-3.5 items-end gap-[2.5px]" aria-hidden>
      {[0, 0.12, 0.22, 0.08, 0.3].map((delay, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full"
          style={{
            height: "100%",
            background: active ? "var(--lp-sky-deep)" : "var(--lp-ink-3)",
            transformOrigin: "bottom",
            transform: active ? undefined : "scaleY(0.3)",
            animation: active ? `lp-meter 0.9s ease-in-out ${delay}s infinite` : "none",
          }}
        />
      ))}
    </span>
  );
}

function Rail() {
  return (
    <div className="hidden w-[52px] flex-col items-center justify-between py-3 sm:flex" style={{ background: "#121215" }} aria-hidden>
      <div className="flex flex-col items-center gap-3">
        <Menu size={15} color="#8b8b95" />
        <span className="mt-1 flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "#26262c" }}>
          <Plus size={13} color="#d6d6dc" />
        </span>
        <div className="mt-2 flex flex-col gap-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="block h-[3px] w-4 rounded-full" style={{ background: i === 0 ? "#6d6d78" : "#3a3a42" }} />
          ))}
        </div>
      </div>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "#26262c" }}>
        <Home size={13} color="#d6d6dc" />
      </span>
    </div>
  );
}

export function SessionMock() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-80px" });
  const reduce = useReducedMotion();
  const { fired, cycle } = useScript(SCRIPT, 15600, inView, reduce);

  const tutorTalking = (fired("bridge") && !fired("title")) || (fired("ask") && !fired("student2")) || fired("sticky");
  const activity: Activity = tutorTalking
    ? "speaking"
    : fired("step1") || (fired("student2") && fired("step2"))
      ? "writing"
      : fired("bridge")
        ? "thinking"
        : "listening";

  const label: Record<Activity, string> = {
    listening: "Listening",
    thinking: "Thinking…",
    writing: "Writing on the board…",
    speaking: "Tutor speaking",
  };

  return (
    <div ref={ref} className="text-(--lp-ink)">
      {/* window chrome */}
      <div className="grid h-11 grid-cols-[1fr_auto_1fr] items-center border-b px-4" style={{ borderColor: "var(--lp-line)" }}>
        <span className="flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[10px] w-[10px] rounded-full" style={{ background: "#e3e3e8", boxShadow: "inset 0 0 0 1px rgba(18,18,21,0.08)" }} />
          ))}
        </span>
        <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-(--lp-ink-2)">
          <span className="h-[7px] w-[7px] rounded-full" style={{ background: "var(--lp-live)", animation: reduce ? "none" : "lp-live-pulse 2.2s ease-out infinite" }} />
          Algebra
          <span className="text-(--lp-ink-3)">·</span>
          <span className="tabular-nums text-(--lp-ink-3)">04:12</span>
        </span>
        <span className="justify-self-end text-[12px] font-medium text-(--lp-ink-3)">{label[activity]}</span>
      </div>

      <div className="grid sm:grid-cols-[52px_minmax(0,1fr)_250px] lg:grid-cols-[52px_minmax(0,1fr)_300px]">
        <Rail />

        {/* board */}
        <div className="lp-board relative min-h-[340px] overflow-hidden p-6 sm:min-h-[420px] sm:p-8 lg:p-10">
          <div className="relative w-fit">
            <motion.h3 initial={false} animate={rise(fired("title"))} transition={T} className="lp-display text-[19px]">
              Solving 2x + 3 = 11
            </motion.h3>
            <Underline on={fired("title")} width={190} className="absolute -bottom-2 left-0" />
          </div>

          <div className="mt-8 flex flex-col gap-4">
            <Row latex="2x + 3 = 11" on={fired("step1")} size={22} />
            <div className="relative">
              <Row latex="2x = 8" note="subtract 3 from both sides" on={fired("step2")} size={22} />
              <Arrow on={fired("arrow")} className="absolute top-[-14px] left-[96px] hidden sm:block" />
            </div>
            <div className="relative mt-1 w-fit">
              <Attempt text="x = 4 ?" on={fired("attempt")} />
              <Ring on={fired("ring")} className="absolute -top-3 -left-4" />
            </div>
          </div>

          <div className="absolute top-[68px] right-6 hidden md:block lg:right-10">
            <NumberLine on={fired("line")} markOn={fired("line")} label="x = 4" width={250} />
          </div>

          <Sticky text="Your turn: try 3x − 5 = 7" on={fired("sticky")} className="absolute bottom-7 left-6 sm:left-8 lg:left-10" />

          {!fired("title") && !reduce && (
            <span aria-hidden className="absolute top-8 left-8 h-[20px] w-[2px] rounded-full lg:top-10 lg:left-10" style={{ background: "var(--lp-sky-deep)", animation: "lp-cursor 1s steps(1) infinite" }} />
          )}

          <StatusChip state={activity} shown={activity !== "listening"} className="absolute right-5 bottom-5 lg:right-8" />
        </div>

        {/* transcript sidebar */}
        <div className="flex flex-col border-t sm:border-t-0 sm:border-l" style={{ borderColor: "var(--lp-line)", background: "var(--lp-bg)" }}>
          <div className="flex items-baseline justify-between border-b px-4 pt-3.5 pb-2.5" style={{ borderColor: "var(--lp-line)" }}>
            <span className="text-[10.5px] font-semibold tracking-[0.08em] text-(--lp-ink-3) uppercase">Transcript</span>
            <span className="text-[10px] font-bold tracking-[0.08em] uppercase" style={{ color: "var(--lp-live)" }}>live</span>
          </div>

          <div className="flex flex-1 flex-col justify-end gap-2.5 px-4 py-4">
            <div className="min-h-[15px] text-[13px] italic leading-[1.4] text-(--lp-ink-2)">
              {reduce ? "I'm stuck on 2x plus 3 equals 11" : <TypingText key={cycle} text="I'm stuck on 2x plus 3 equals 11" duration={38} inView={false} />}
            </div>
            <motion.p initial={false} animate={rise(fired("bridge"))} transition={T} className="flex gap-2.5 text-[13.5px] leading-[1.45] font-medium">
              <span className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full bg-(--lp-ink)" aria-hidden />
              Let me put that on the board.
            </motion.p>
            <motion.p initial={false} animate={rise(fired("ask"))} transition={T} className="flex gap-2.5 text-[13.5px] leading-[1.45] font-medium">
              <span className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full bg-(--lp-ink)" aria-hidden />
              What would undo that plus three?
            </motion.p>
            <motion.p initial={false} animate={rise(fired("student2"))} transition={T} className="text-[13px] italic leading-[1.4] text-(--lp-ink-2)">
              subtract 3?
            </motion.p>
            <motion.p initial={false} animate={rise(fired("sticky"))} transition={T} className="flex gap-2.5 text-[13.5px] leading-[1.45] font-medium">
              <span className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full bg-(--lp-ink)" aria-hidden />
              Exactly. So two x is eight, and x is four. Try the next one.
            </motion.p>
          </div>

          <div className="flex flex-col gap-2.5 border-t px-4 py-4" style={{ borderColor: "var(--lp-line)", background: "var(--lp-gray)" }}>
            <div className="flex items-center justify-between text-[11.5px] font-semibold text-(--lp-ink-2)">
              <span>{activity === "speaking" ? "Tutor speaking" : activity === "listening" ? "Listening" : "Take your time…"}</span>
              <Meter active={activity === "speaking" && !reduce} />
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-white py-1.5 pr-1.5 pl-3" style={{ borderColor: "var(--lp-line)" }}>
              <span className="flex-1 text-[12.5px] text-(--lp-ink-3)">Type a message…</span>
              <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: "var(--lp-gray)" }}>
                <ArrowRight size={12} className="text-(--lp-ink-3)" aria-hidden />
              </span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <span className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border bg-white text-[12px] font-semibold" style={{ borderColor: "var(--lp-line)" }}>
                <Mic size={12} aria-hidden /> Mute
              </span>
              <span className="inline-flex h-8 items-center rounded-lg border px-3 text-[12px] font-semibold" style={{ borderColor: "#f3c4c4", color: "#b91c1c", background: "#fff" }}>
                End
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
