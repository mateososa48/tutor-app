"use client";

import { Keyboard, Mic, SlidersHorizontal } from "lucide-react";
import { DitherWave } from "@/components/landing/DitherWave";
import { SWIRL } from "@/components/landing/swirl";
import { useReduce } from "@/components/landing/useScript";
import { cn } from "@/lib/utils";
import { DATE_LINE, NOTES, SESSIONS, STUDENT, WEEK_MINUTES } from "../data";
import { BoardShot, MobileBar, RING, RING_HOVER, Rise, Thumb, WeekBars } from "../parts";

// 3. Call your tutor. The sign-in swirl becomes the front door: one big panel
// that is mostly the button to start talking, with the week underneath.
export default function CallHome() {
  const reduce = useReduce();
  const [current, ...rest] = SESSIONS;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-(--lp-bg)">
      <MobileBar />
      <div className="mx-auto max-w-[1160px] px-4 pt-4 pb-24 sm:px-6 sm:pt-6">
        <section className="relative isolate flex min-h-[clamp(380px,54vh,500px)] flex-col justify-end overflow-hidden rounded-[20px] bg-[#8dbcff] p-6 sm:p-10">
          <DitherWave {...SWIRL} lightness={0.04} animate={reduce === false} className="absolute inset-0 -z-10 h-full w-full" />
          <div className="absolute top-4 right-4 inline-flex items-center gap-2 rounded-[10px] bg-white/70 px-3 py-2 text-[13px] font-medium text-(--lp-ink) shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)] backdrop-blur-md sm:top-6 sm:right-6">
            <SlidersHorizontal className="size-3.5" />
            {STUDENT.voice}, speaking {STUDENT.speed.toLowerCase()}ly
          </div>
          <Rise>
            <p className="m-0 text-[14px] font-medium text-(--lp-ink)/70">{DATE_LINE}</p>
          </Rise>
          <Rise i={1}>
            <h1 className="lp-display m-0 mt-2 max-w-[13ch] text-[clamp(2.4rem,5.6vw,4.25rem)] leading-[1.02] text-(--lp-ink)">
              Ready when you are, {STUDENT.name}.
            </h1>
          </Rise>
          <Rise i={2} className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-gloss inline-flex h-14 items-center gap-3 rounded-[14px] ps-2 pe-6 text-[16px] font-semibold active:scale-[0.96]">
              <span className="grid size-10 place-items-center rounded-[10px] bg-white/12">
                <Mic className="size-5" />
              </span>
              Start talking
            </button>
            <button type="button" className="btn-gloss-light inline-flex h-14 items-center gap-2.5 rounded-[14px] px-5 text-[15px] font-semibold active:scale-[0.96]">
              <Keyboard className="size-[18px]" />
              Type instead
            </button>
          </Rise>
        </section>

        <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-[1.35fr_1fr]">
          <a href="#" className={cn("group flex flex-col rounded-[20px] bg-white p-2 transition-[box-shadow] duration-150", RING, RING_HOVER)}>
            {current.shot && <BoardShot shot={current.shot} className="aspect-[16/9] rounded-[12px]" zoom={1.3} position="0% 40%" />}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-3 pt-4 pb-3">
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[13px] text-(--lp-ink-3)">Continue</p>
                <p className="lp-display m-0 mt-0.5 truncate text-[19px] text-(--lp-ink)">{current.title}</p>
                <p className="m-0 mt-1 text-[13.5px] text-(--lp-ink-2)">
                  Paused {current.ago}, {current.minutes} min in
                </p>
              </div>
              <span className="lp-btn lp-btn-lift lp-btn-sm">Resume</span>
            </div>
          </a>

          <div className="grid gap-4 sm:gap-6">
            <section className={cn("rounded-[20px] bg-white p-5", RING)}>
              <div className="flex items-baseline justify-between">
                <h2 className="m-0 text-[14px] font-medium text-(--lp-ink-2)">This week</h2>
                <span className="text-[12.5px] text-(--lp-ink-3)">5 of 7 days</span>
              </div>
              <p className="lp-display m-0 mt-1 text-[30px] tabular-nums text-(--lp-ink)">
                {Math.floor(WEEK_MINUTES / 60)} h {WEEK_MINUTES % 60} min
              </p>
              <WeekBars className="mt-4" height={64} />
            </section>
            <section className={cn("rounded-[20px] bg-white p-5", RING)}>
              <h2 className="m-0 text-[14px] font-medium text-(--lp-ink-2)">Your tutor remembers</h2>
              <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
                {NOTES.slice(0, 3).map((n) => (
                  <li key={n} className="lp-hand text-[15px] leading-snug text-(--lp-ink)">
                    {n}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <section className={cn("mt-4 rounded-[20px] bg-white p-2 sm:mt-6", RING)}>
          <h2 className="m-0 px-3 pt-3 pb-2 text-[14px] font-medium text-(--lp-ink-2)">Recent sessions</h2>
          <ul className="m-0 list-none p-0">
            {rest.slice(0, 4).map((s) => (
              <li key={s.id}>
                <a href="#" className="flex items-center gap-4 rounded-[12px] p-2 transition-colors duration-150 hover:bg-(--lp-gray)">
                  <Thumb s={s} className="aspect-[4/3] w-16 shrink-0 rounded-[8px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium text-(--lp-ink)">{s.title}</span>
                    <span className="block text-[13px] text-(--lp-ink-3)">{s.rule}</span>
                  </span>
                  <span className="hidden shrink-0 text-[13px] text-(--lp-ink-3) tabular-nums sm:block">
                    {s.day}, {s.minutes} min
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
