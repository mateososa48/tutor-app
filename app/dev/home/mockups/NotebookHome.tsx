"use client";

import { ArrowUpRight, Plus } from "lucide-react";
import { SESSIONS, WEEK_MINUTES, type MockSession } from "../data";
import { Highlight, MobileBar, Rise, Thumb } from "../parts";

// 4. Notebook. Sessions read as pages in a notebook, newest first, and each
// one keeps the rule the student left with, in the board's handwriting.
const GROUPS = [
  { label: "Today", items: [SESSIONS[0]] },
  { label: "Yesterday", items: [SESSIONS[1]] },
  { label: "Earlier this week", items: SESSIONS.slice(2, 5) },
  { label: "Last week", items: [SESSIONS[5]] },
];

export default function NotebookHome() {
  const rules = SESSIONS.filter((s) => s.rule).length;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-white">
      <MobileBar />
      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 pt-10 pb-24 sm:px-8 lg:grid-cols-[300px_1fr] lg:gap-16 lg:pt-16">
        <aside className="lg:sticky lg:top-16 lg:self-start">
          <Rise>
            <h1 className="lp-display m-0 text-[clamp(2.1rem,3.4vw,2.8rem)] leading-[1.04] text-(--lp-ink)">Your notebook</h1>
            <p className="m-0 mt-3 max-w-[30ch] text-[15.5px] leading-relaxed text-(--lp-ink-2)">
              Every session with your tutor, and the rule you took away from it.
            </p>
          </Rise>
          <Rise i={1}>
            <button type="button" className="lp-btn lp-btn-lift mt-7">
              <Plus className="size-4" strokeWidth={2.4} />
              Start a session
            </button>
          </Rise>
          <Rise i={2}>
            <dl className="m-0 mt-10 grid grid-cols-2 gap-6 border-t border-(--lp-line) pt-6">
              <div>
                <dt className="text-[12.5px] text-(--lp-ink-3)">This week</dt>
                <dd className="lp-display m-0 mt-1 text-[24px] tabular-nums text-(--lp-ink)">
                  {Math.floor(WEEK_MINUTES / 60)} h {WEEK_MINUTES % 60} m
                </dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-(--lp-ink-3)">Rules learned</dt>
                <dd className="lp-display m-0 mt-1 text-[24px] tabular-nums text-(--lp-ink)">{rules}</dd>
              </div>
            </dl>
          </Rise>
        </aside>

        <main className="min-w-0">
          {GROUPS.map((g, gi) => (
            <Rise key={g.label} i={gi + 1} className="mb-4">
              <div className="flex items-center gap-4">
                <h2 className="lp-display m-0 shrink-0 text-[15px] text-(--lp-ink)">{g.label}</h2>
                <span aria-hidden className="h-px flex-1 bg-(--lp-line)" />
              </div>
              {g.items.map((s) => (
                <Entry key={s.id} s={s} />
              ))}
            </Rise>
          ))}
        </main>
      </div>
    </div>
  );
}

function Entry({ s }: { s: MockSession }) {
  const paused = s.status === "paused";
  return (
    <article className="grid gap-5 py-7 sm:grid-cols-[1fr_236px] sm:gap-8">
      <div className="min-w-0">
        <p className="m-0 text-[12.5px] text-(--lp-ink-3) tabular-nums">
          {s.time}, {s.minutes} min{paused ? ", paused" : ""}
        </p>
        <h3 className="lp-display m-0 mt-1 text-[21px] leading-tight text-(--lp-ink)">{s.title}</h3>
        {paused ? (
          <>
            <p className="m-0 mt-4 text-[12.5px] text-(--lp-ink-3)">Where you stopped</p>
            <p className="lp-hand m-0 mt-1 text-[18px] leading-snug text-(--lp-ink-2)">&ldquo;{s.lastLine}&rdquo;</p>
          </>
        ) : (
          <>
            <p className="m-0 mt-4 text-[12.5px] text-(--lp-ink-3)">Today&rsquo;s rule</p>
            <p className="lp-hand m-0 mt-1 text-[18px] leading-snug text-(--lp-ink)">
              <Highlight>{s.rule}</Highlight>
            </p>
          </>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-5">
          {paused && (
            <button type="button" className="lp-btn lp-btn-lift lp-btn-sm">
              Resume
            </button>
          )}
          <a href="#" className="inline-flex h-9 items-center gap-1 text-[14px] font-medium text-(--lp-ink-2) underline-offset-4 transition-colors hover:text-(--lp-ink) hover:underline">
            Open the board
            <ArrowUpRight className="size-4" />
          </a>
        </div>
      </div>
      <Thumb s={s} className="aspect-[4/3] w-full rounded-[12px]" />
    </article>
  );
}
