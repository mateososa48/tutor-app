"use client";

import { Check } from "lucide-react";
import { ChalkMark } from "@/components/app/ChalkMark";
import { cn } from "@/lib/utils";
import { DATE_LINE, PLAN, SESSIONS, TOPICS, type TopicState } from "../data";
import { DOTS, Highlight, MobileBar, RING, Rise, TutorPen } from "../parts";

// 8. Today's plan. After OnePrep's tailored plan: the tutor proposes a short
// session in three parts, and shows which topics are solid, in practice, or
// next. Needs the attempt records and help-level policy the tutor is getting.
const GROUPS: { state: TopicState; label: string }[] = [
  { state: "got", label: "Got it" },
  { state: "practicing", label: "Practicing" },
  { state: "next", label: "Up next" },
];

export default function PlanHome() {
  const total = PLAN.reduce((s, p) => s + p.minutes, 0);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-white">
      <MobileBar />
      <div className="mx-auto max-w-[1140px] px-5 pt-10 pb-24 sm:px-8 lg:pt-14">
        <Rise className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="m-0 text-[13px] text-(--lp-ink-3)">{DATE_LINE}</p>
            <h1 className="lp-display m-0 mt-2 text-[clamp(1.85rem,3.6vw,2.75rem)] leading-[1.05] text-(--lp-ink)">Today&rsquo;s plan, {total} minutes</h1>
            <p className="m-0 mt-2 max-w-[58ch] text-[15.5px] leading-relaxed text-(--lp-ink-2)">
              Built from yesterday&rsquo;s session and your quiz on Friday. Your tutor changes it as you go.{" "}
              <button type="button" className="font-medium text-(--lp-ink) underline decoration-(--lp-line-strong) underline-offset-4 transition-[text-decoration-color] hover:decoration-(--lp-ink)">
                Plan something else
              </button>
            </p>
          </div>
        </Rise>

        <ol className="m-0 mt-10 grid list-none gap-4 p-0 lg:grid-cols-3">
          {PLAN.map((p, i) => {
            const next = p.state === "next";
            const done = p.state === "done";
            return (
              <Rise key={p.verb} i={i + 1}>
                <li
                  className={cn(
                    "flex h-full flex-col rounded-[20px] bg-white p-2",
                    next ? "shadow-[0_0_0_2px_var(--lp-sky),0_14px_32px_-14px_rgba(61,156,255,0.5)]" : RING,
                  )}
                >
                  <div className="relative flex h-[148px] items-center overflow-hidden rounded-[12px] bg-white px-6" style={DOTS}>
                    <span className={cn("lp-hand relative text-[24px] whitespace-nowrap text-(--lp-ink) sm:text-[26px]", done && "text-(--lp-ink-3)")}>
                      {done ? <Highlight tone="green">{p.math}</Highlight> : p.math}
                      {next && <TutorPen className="absolute top-full right-0 -mt-1" />}
                    </span>
                    <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_rgba(18,18,21,0.06)]" />
                  </div>
                  <div className="flex flex-1 flex-col px-3 pt-4 pb-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="lp-display m-0 text-[19px] text-(--lp-ink)">{p.verb}</h2>
                      <span className="text-[13px] text-(--lp-ink-3) tabular-nums">{p.minutes} min</span>
                    </div>
                    <p className="m-0 mt-1 text-[14.5px] text-(--lp-ink)">{p.what}</p>
                    <p className="lp-hand m-0 mt-1.5 text-[14.5px] text-(--lp-ink-3)">{p.why}</p>
                    <div className="mt-auto pt-5">
                      {done && (
                        <span className="inline-flex h-9 items-center gap-1.5 text-[14px] font-medium text-(--lp-ink-2)">
                          <Check className="size-4 text-[#1d7a4c]" strokeWidth={2.5} />
                          Done in 4 min
                        </span>
                      )}
                      {next && (
                        <button type="button" className="lp-btn lp-btn-lift lp-btn-sm">
                          Start this part
                        </button>
                      )}
                      {p.state === "later" && <span className="inline-flex h-9 items-center text-[14px] text-(--lp-ink-3)">After that</span>}
                    </div>
                  </div>
                </li>
              </Rise>
            );
          })}
        </ol>

        <div className="mt-16 grid gap-12 lg:grid-cols-[1.15fr_1fr]">
          <section>
            <h2 className="lp-display m-0 text-[18px] text-(--lp-ink)">Where you are</h2>
            <p className="m-0 mt-1 text-[14px] text-(--lp-ink-3)">Marked by your tutor while you work</p>
            <div className="mt-5 flex flex-col gap-5">
              {GROUPS.map((g) => (
                <div key={g.state} className="grid gap-2 sm:grid-cols-[104px_1fr] sm:items-center">
                  <span className="text-[13px] font-medium text-(--lp-ink-2)">{g.label}</span>
                  <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                    {TOPICS.filter((t) => t.state === g.state).map((t) => (
                      <li
                        key={t.name}
                        className={cn(
                          "inline-flex h-10 items-center gap-2 rounded-[10px] px-3.5 text-[14px]",
                          g.state === "next" ? "bg-(--lp-sky-tint) text-(--lp-sky-deep) shadow-[inset_0_0_0_1px_rgba(61,156,255,0.4)]" : cn("bg-white text-(--lp-ink)", RING),
                        )}
                      >
                        <ChalkMark size={15} color={g.state === "got" ? "var(--lp-sky)" : g.state === "practicing" ? "rgba(18,18,21,0.25)" : "var(--lp-sky-deep)"} />
                        {t.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="lp-display m-0 text-[18px] text-(--lp-ink)">Rules so far</h2>
            <ul className="m-0 mt-4 flex list-none flex-col gap-4 p-0">
              {SESSIONS.filter((s) => s.rule)
                .slice(0, 4)
                .map((s) => (
                  <li key={s.id}>
                    <p className="lp-hand m-0 text-[17px] leading-snug text-(--lp-ink)">{s.rule}</p>
                    <p className="m-0 mt-0.5 text-[12.5px] text-(--lp-ink-3)">
                      {s.title}, {s.day}
                    </p>
                  </li>
                ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
