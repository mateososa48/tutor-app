"use client";

import { Keyboard, Mic } from "lucide-react";
import { DitherWave } from "@/components/landing/DitherWave";
import { SWIRL } from "@/components/landing/swirl";
import { useReduce } from "@/components/landing/useScript";
import { cn } from "@/lib/utils";
import { SESSIONS, WEEK_MINUTES } from "../data";
import { MobileBar, RING, Rise, Thumb } from "../parts";

// 12. Doors. The sign-in page's composition, continued inside the app: the
// swirl on one side is the door to a new session; the other side is where
// you were.
export default function SplitHome() {
  const reduce = useReduce();
  const [current, ...rest] = SESSIONS;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white lg:flex-row lg:overflow-hidden">
      <MobileBar />
      <section className="relative isolate flex min-h-[52svh] shrink-0 flex-col justify-end overflow-hidden bg-[#8dbcff] p-6 sm:p-10 lg:h-full lg:min-h-0 lg:w-[44%]">
        <DitherWave {...SWIRL} animate={reduce === false} className="absolute inset-0 -z-10 h-full w-full" />
        <Rise>
          <h1 className="lp-display m-0 max-w-[12ch] text-[clamp(2rem,3.4vw,2.9rem)] leading-[1.04] text-(--lp-ink)">Start a session</h1>
          <p className="m-0 mt-2 max-w-[30ch] text-[16px] text-(--lp-ink)/75">Talk it through, or type the problem.</p>
        </Rise>
        <Rise i={1} className="mt-6 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="btn-gloss inline-flex h-13 items-center gap-2.5 rounded-[12px] ps-4 pe-5 text-[15.5px] font-semibold transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            <Mic className="size-[19px]" strokeWidth={2} />
            Start talking
          </button>
          <button
            type="button"
            className="btn-gloss-light inline-flex h-13 items-center gap-2.5 rounded-[12px] ps-4 pe-5 text-[15.5px] font-semibold transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            <Keyboard className="size-[19px]" strokeWidth={2} />
            Type instead
          </button>
        </Rise>
      </section>

      <section className="min-w-0 flex-1 px-6 py-8 sm:px-10 lg:overflow-y-auto lg:px-14 lg:py-14">
        <Rise i={2}>
          <h2 className="lp-display m-0 text-[20px] text-(--lp-ink)">Where you were</h2>
          <a href="#" className="group mt-4 grid gap-4 outline-none sm:grid-cols-[200px_1fr] sm:items-center sm:gap-6">
            <div className={cn("rounded-[12px] bg-white p-1 transition-[box-shadow] duration-150", RING, "group-hover:shadow-[0_0_0_1px_rgba(18,18,21,0.12),0_2px_4px_-1px_rgba(18,18,21,0.1),0_8px_18px_-4px_rgba(18,18,21,0.1)]")}>
              <Thumb s={current} className="aspect-[4/3] rounded-[8px]" />
            </div>
            <div className="min-w-0">
              <p className="m-0 text-[17px] font-semibold text-(--lp-ink)">{current.title}</p>
              <p className="m-0 mt-1 text-[15px] leading-snug text-(--lp-ink-2)">&ldquo;{current.lastLine}&rdquo;</p>
              <p className="m-0 mt-2 text-[13px] text-(--lp-ink-3)">
                Paused today, {current.minutes} min in
              </p>
              <span className="lp-btn lp-btn-lift lp-btn-sm mt-4">Resume</span>
            </div>
          </a>
        </Rise>

        <Rise i={3} className="mt-12">
          <h2 className="lp-display m-0 text-[20px] text-(--lp-ink)">Earlier</h2>
          <ul className="m-0 mt-2 list-none p-0">
            {rest.map((s) => (
              <li key={s.id} className="border-b border-(--lp-line) last:border-b-0">
                <a href="#" className="group flex items-center gap-4 py-3 outline-none">
                  <Thumb s={s} tiny className="aspect-[4/3] w-12 shrink-0 rounded-[5px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium text-(--lp-ink) group-hover:underline group-hover:decoration-(--lp-line-strong) group-hover:underline-offset-4">{s.title}</span>
                    <span className="block truncate text-[13px] text-(--lp-ink-3)">{s.rule}</span>
                  </span>
                  <span className="shrink-0 text-[13px] text-(--lp-ink-3) tabular-nums">
                    {s.day}, {s.minutes} min
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-8 text-[14px] text-(--lp-ink-2)">
            {Math.floor(WEEK_MINUTES / 60)} h {WEEK_MINUTES % 60} min this week, on 5 of the last 7 days.
          </p>
        </Rise>
      </section>
    </div>
  );
}
