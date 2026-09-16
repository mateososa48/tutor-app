"use client";

import { DitherWave } from "@/components/landing/DitherWave";
import { useReduce } from "@/components/landing/useScript";
import { VOICE_BLUE } from "@/components/session/VoiceWave";
import type { ReactNode } from "react";
import { SESSIONS, STUDENT, WEEK_MINUTES } from "../data";
import { Composer, ContextLine, EarlierList, Suggestions } from "../pieces";
import { MobileBar, Rise, Thumb, WeekBars } from "../parts";
import { NOTES } from "../data";

// 17. Console. Two rails: the whole left side is the one place a session
// starts, with the tutor's own voice wave rising into the bottom of it; the
// right rail is everything the tutor already knows, in reading order.
export default function ConsoleHome() {
  const reduce = useReduce();
  const [current, ...rest] = SESSIONS;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white lg:flex-row lg:overflow-hidden">
      <MobileBar />

      <section className="relative isolate flex min-w-0 flex-1 flex-col lg:h-full lg:overflow-y-auto">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 hidden h-[26%] [mask-image:linear-gradient(to_top,#000_8%,transparent)] lg:block">
          <DitherWave
            pattern="bands"
            waveColor={VOICE_BLUE.top}
            deepColor={VOICE_BLUE.deep}
            backgroundColor={[1, 1, 1]}
            colorNum={4}
            pixelSize={3}
            waveSpeed={0.038}
            waveFrequency={2}
            waveAmplitude={0.4}
            lightness={0.12}
            animate={reduce === false}
            className="absolute inset-0 h-full w-full"
          />
        </div>

        <div className="mx-auto flex w-full max-w-[680px] flex-1 flex-col px-5 pt-10 pb-10 sm:px-8 lg:pt-[13vh]">
          <Rise>
            <ContextLine text={STUDENT.workingOn} />
          </Rise>
          <Rise i={1}>
            <h1 className="lp-display m-0 mt-2 text-[clamp(1.9rem,3vw,2.6rem)] leading-[1.06] text-(--lp-ink)">What are you stuck on?</h1>
          </Rise>
          <Rise i={2} className="mt-6">
            <Composer />
          </Rise>
          <Rise i={3} className="mt-3">
            <Suggestions />
          </Rise>
          <Rise i={4} className="mt-8">
            <p className="m-0 flex items-center gap-2 text-[13.5px] text-(--lp-ink-2)">
              <span aria-hidden className="size-2 rounded-full bg-(--lp-live)" />
              Your tutor is ready, {STUDENT.voice} at a {STUDENT.speed.toLowerCase()} pace
            </p>
          </Rise>
        </div>
      </section>

      <aside className="w-full shrink-0 border-t border-(--lp-line) bg-(--lp-bg) lg:h-full lg:w-[400px] lg:overflow-y-auto lg:border-t-0 lg:border-s lg:border-(--lp-line)">
        <Rail label="Continue">
          <a href="#" className="group block outline-none">
            <Thumb s={current} sizes="420px" className="aspect-[16/10] rounded-[12px]" />
            <p className="lp-display m-0 mt-3 text-[18px] leading-tight text-(--lp-ink)">{current.title}</p>
            <p className="m-0 mt-1.5 text-[14px] leading-snug text-(--lp-ink-2)">&ldquo;{current.lastLine}&rdquo;</p>
            <p className="m-0 mt-2 text-[12.5px] text-(--lp-ink-3)">
              Paused {current.ago}, {current.minutes} min in
            </p>
            <span className="lp-btn lp-btn-lift lp-btn-sm mt-4">Resume</span>
          </a>
        </Rail>

        <Rail label="This week" aside={<span className="text-[12.5px] text-(--lp-ink-3) tabular-nums">5 of 7 days</span>}>
          <p className="lp-display m-0 text-[26px] leading-none text-(--lp-ink) tabular-nums">
            {Math.floor(WEEK_MINUTES / 60)} h {WEEK_MINUTES % 60} min
          </p>
          <WeekBars className="mt-4" height={52} />
        </Rail>

        <Rail label="Your tutor remembers" aside={<a href="#" className="text-[12.5px] font-medium text-(--lp-ink-2) underline-offset-4 hover:text-(--lp-ink) hover:underline">Edit</a>}>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {NOTES.map((n) => (
              <li key={n} className="text-[14px] leading-snug text-(--lp-ink)">
                {n}
              </li>
            ))}
          </ul>
        </Rail>

        <Rail label="Earlier">
          <EarlierList items={rest.slice(0, 4)} />
        </Rail>
      </aside>
    </div>
  );
}

function Rail({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-(--lp-line) px-5 py-6 last:border-b-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[13px] font-medium text-(--lp-ink-3)">{label}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
