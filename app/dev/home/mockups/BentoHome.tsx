"use client";

import { ArrowRight, Keyboard, Mic, Paperclip, Search } from "lucide-react";
import { ChalkMark } from "@/components/app/ChalkMark";
import { DitherWave } from "@/components/landing/DitherWave";
import { SWIRL } from "@/components/landing/swirl";
import { useReduce } from "@/components/landing/useScript";
import { cn } from "@/lib/utils";
import { DATE_LINE, NOTES, SESSIONS, STUDENT, TOPICS, WEEK_MINUTES } from "../data";
import { BoardShot, MobileBar, RING, Rise, Thumb, WeekBars } from "../parts";

// 6. Bento. Everything at a glance in one grid, after the shadcnuikit academy
// and Efferd dashboard blocks, in Chalk's own materials: the swirl, board
// photos, the handwriting, sky.
export default function BentoHome() {
  const reduce = useReduce();
  const [current, ...rest] = SESSIONS;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-(--lp-bg)">
      <MobileBar />
      <div className="mx-auto max-w-[1240px] px-4 pt-6 pb-24 sm:px-6 lg:pt-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="m-0 text-[13px] text-(--lp-ink-3)">{DATE_LINE}</p>
            <h1 className="lp-display m-0 mt-1 text-[28px] leading-tight text-(--lp-ink)">Good evening, {STUDENT.name}</h1>
          </div>
          <label className="relative hidden sm:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-(--lp-ink-3)" />
            <input
              aria-label="Search sessions"
              placeholder="Search sessions"
              className={cn(
                "h-10 w-[280px] rounded-[10px] bg-white ps-9 pe-12 text-[14px] text-(--lp-ink) outline-none placeholder:text-[#76767f] focus-visible:shadow-[0_0_0_2px_var(--lp-sky)]",
                RING,
              )}
            />
            <kbd className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-[6px] bg-(--lp-gray) px-1.5 py-0.5 font-sans text-[11px] text-(--lp-ink-2)">&#8984;K</kbd>
          </label>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-6 lg:grid-cols-12 lg:gap-4">
          <Rise className="relative isolate flex min-h-[300px] flex-col justify-end overflow-hidden rounded-[20px] bg-[#8dbcff] p-6 md:col-span-6 lg:col-span-7 lg:row-span-2 lg:p-8">
            <DitherWave {...SWIRL} animate={reduce === false} className="absolute inset-0 -z-10 h-full w-full" />
            <h2 className="lp-display m-0 text-[clamp(1.9rem,3.2vw,2.6rem)] leading-[1.04] text-(--lp-ink)">Start a session</h2>
            <p className="m-0 mt-2 max-w-[36ch] text-[15.5px] text-(--lp-ink)/80">Talk it through or type the problem. Your tutor draws it out as you go.</p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button type="button" className="btn-gloss inline-flex h-12 items-center gap-2 rounded-[10px] px-5 text-[15px] font-semibold active:scale-[0.96]">
                <Mic className="size-[18px]" />
                Start talking
              </button>
              <button type="button" className="btn-gloss-light inline-flex h-12 items-center gap-2 rounded-[10px] px-4 text-[15px] font-semibold active:scale-[0.96]">
                <Keyboard className="size-[18px]" />
                Type
              </button>
              <button type="button" aria-label="Add a worksheet" className="btn-gloss-light grid size-12 place-items-center rounded-[10px] active:scale-[0.96]">
                <Paperclip className="size-[18px]" />
              </button>
            </div>
          </Rise>

          <Rise i={1} className={cn("flex flex-col rounded-[20px] bg-white p-2 md:col-span-6 lg:col-span-5 lg:row-span-2", RING)}>
            {current.shot && <BoardShot shot={current.shot} className="aspect-[16/10] rounded-[12px]" />}
            <div className="flex flex-1 flex-col px-3 pt-4 pb-2">
              <p className="m-0 text-[12.5px] text-(--lp-ink-3)">Continue</p>
              <p className="lp-display m-0 mt-0.5 text-[19px] text-(--lp-ink)">{current.title}</p>
              <p className="lp-hand m-0 mt-2 text-[15px] leading-snug text-(--lp-ink-2)">&ldquo;{current.lastLine}&rdquo;</p>
              <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                <span className="text-[13px] text-(--lp-ink-3)">
                  Paused {current.ago}, {current.minutes} min in
                </span>
                <span className="lp-btn lp-btn-lift lp-btn-sm">Resume</span>
              </div>
            </div>
          </Rise>

          <Rise i={2} className={cn("rounded-[20px] bg-white p-5 md:col-span-3 lg:col-span-4", RING)}>
            <div className="flex items-baseline justify-between">
              <h2 className="m-0 text-[14px] font-medium text-(--lp-ink-2)">This week</h2>
              <span className="lp-display text-[20px] tabular-nums text-(--lp-ink)">
                {Math.floor(WEEK_MINUTES / 60)} h {WEEK_MINUTES % 60} m
              </span>
            </div>
            <WeekBars className="mt-4" height={84} />
            <p className="m-0 mt-3 text-[13px] text-(--lp-ink-3)">5 of the last 7 days</p>
          </Rise>

          <Rise i={3} className={cn("rounded-[20px] bg-white p-5 md:col-span-3 lg:col-span-4", RING)}>
            <h2 className="m-0 text-[14px] font-medium text-(--lp-ink-2)">Your tutor remembers</h2>
            <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
              {NOTES.map((n) => (
                <li key={n} className="lp-hand text-[15px] leading-snug text-(--lp-ink)">
                  {n}
                </li>
              ))}
            </ul>
          </Rise>

          <Rise i={4} className="rounded-[20px] bg-(--lp-sky-tint) p-5 shadow-[inset_0_0_0_1px_rgba(61,156,255,0.18)] md:col-span-6 lg:col-span-4">
            <h2 className="m-0 text-[14px] font-medium text-(--lp-sky-deep)">Friday&rsquo;s quiz</h2>
            <p className="lp-display m-0 mt-1 text-[30px] leading-none text-(--lp-ink)">In 3 days</p>
            <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
              {TOPICS.filter((t) => t.state !== "new").slice(1, 5).map((t) => (
                <li key={t.name} className="flex items-center justify-between text-[14px] text-(--lp-ink)">
                  <span className="flex items-center gap-2">
                    <ChalkMark size={15} color={t.state === "got" ? "var(--lp-sky)" : "rgba(18,18,21,0.22)"} />
                    {t.name}
                  </span>
                  <span className="text-[12.5px] text-(--lp-ink-2)">{t.state === "got" ? "Got it" : t.state === "next" ? "Up next" : "Practicing"}</span>
                </li>
              ))}
            </ul>
            <a href="#" className="mt-4 inline-flex items-center gap-1 text-[14px] font-semibold text-(--lp-sky-deep) hover:underline">
              Practice for it
              <ArrowRight className="size-4" />
            </a>
          </Rise>

          <Rise i={5} className={cn("rounded-[20px] bg-white p-2 md:col-span-6 lg:col-span-12", RING)}>
            <div className="flex items-baseline justify-between px-3 pt-3 pb-2">
              <h2 className="m-0 text-[14px] font-medium text-(--lp-ink-2)">Recent sessions</h2>
              <a href="#" className="text-[13px] font-medium text-(--lp-ink-2) hover:text-(--lp-ink)">
                See all
              </a>
            </div>
            <ul className="m-0 grid list-none gap-1 p-0 md:grid-cols-2">
              {rest.slice(0, 4).map((s) => (
                <li key={s.id}>
                  <a href="#" className="flex items-center gap-3.5 rounded-[12px] p-2 transition-colors duration-150 hover:bg-(--lp-gray)">
                    <Thumb s={s} className="aspect-[4/3] w-[68px] shrink-0 rounded-[8px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium text-(--lp-ink)">{s.title}</span>
                      <span className="block truncate text-[13px] text-(--lp-ink-3)">
                        {s.day}, {s.minutes} min
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Rise>
        </div>
      </div>
    </div>
  );
}
