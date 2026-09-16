"use client";

import { ArrowRight } from "lucide-react";
import { ChalkMark } from "@/components/app/ChalkMark";
import { cn } from "@/lib/utils";
import { DATE_LINE, NOTES, SESSIONS, STUDENT, WEEK, WEEK_MINUTES } from "../data";
import { DOTS, Highlight, MobileBar, RING, Rise, Thumb } from "../parts";

// 5. A note from your tutor. The first thing on the page is a short handwritten
// note, written from the last session and the tutor's saved notes, that ends
// with a suggestion the student can accept in one click.
export default function LetterHome() {
  const max = Math.max(...WEEK.map((d) => d.minutes));
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-(--lp-bg)">
      <MobileBar />
      <div className="mx-auto grid max-w-[1120px] gap-8 px-4 pt-8 pb-24 sm:px-8 lg:grid-cols-[1fr_300px] lg:gap-12 lg:pt-14">
        <main className="min-w-0">
          <p className="m-0 mb-4 text-[13px] text-(--lp-ink-3)">{DATE_LINE}</p>
          <Rise>
            <article className="lp-frame">
              <div className="relative rounded-[20px] bg-white px-6 py-8 sm:px-12 sm:py-12" style={DOTS}>
                <div className="lp-hand max-w-[34ch] text-[clamp(1.3rem,2.3vw,1.7rem)] leading-[1.55] text-(--lp-ink)">
                  <p className="m-0">Hi {STUDENT.name},</p>
                  <p className="m-0 mt-4">
                    Yesterday you solved <span className="whitespace-nowrap">3(x &minus; 2) = 12</span> on your own. One thing to watch: when you take something away, take it from{" "}
                    <Highlight>both sides</Highlight>.
                  </p>
                  <p className="m-0 mt-4">Your quiz is on Friday. Want to do a few two-step problems today, then one that looks harder than it is?</p>
                </div>
                <p className="lp-hand m-0 mt-8 flex items-center gap-2 text-[19px] text-(--lp-ink-2)">
                  <ChalkMark size={24} />
                  your tutor
                </p>
              </div>
            </article>
          </Rise>
          <Rise i={1} className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" className="lp-btn lp-btn-lift">
              Let&rsquo;s do it
              <ArrowRight className="size-4" />
            </button>
            <button
              type="button"
              className="h-12 rounded-[10px] px-4 text-[15px] font-semibold text-(--lp-ink-2) transition-[background-color,color,scale] duration-150 hover:bg-(--lp-gray) hover:text-(--lp-ink) active:scale-[0.96]"
            >
              Something else
            </button>
          </Rise>

          <section className="mt-14">
            <h2 className="lp-display m-0 mb-2 text-[16px] text-(--lp-ink)">Past sessions</h2>
            <ul className="m-0 list-none p-0">
              {SESSIONS.slice(0, 4).map((s) => (
                <li key={s.id}>
                  <a href="#" className="-mx-2 flex items-center gap-4 rounded-[12px] p-2 transition-colors duration-150 hover:bg-white">
                    <Thumb s={s} className="aspect-[4/3] w-[72px] shrink-0 rounded-[8px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium text-(--lp-ink)">{s.title}</span>
                      <span className="block truncate text-[13px] text-(--lp-ink-3)">{s.rule ?? `Paused ${s.ago}`}</span>
                    </span>
                    <span className="hidden shrink-0 text-[13px] text-(--lp-ink-3) tabular-nums sm:block">{s.day}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </main>

        <aside className="flex flex-col gap-4 lg:pt-9">
          <section className={cn("rounded-[20px] bg-white p-5", RING)}>
            <h2 className="m-0 text-[14px] font-semibold text-(--lp-ink)">What your tutor remembers</h2>
            <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
              {NOTES.map((n) => (
                <li key={n} className="text-[14px] leading-snug text-(--lp-ink-2)">
                  {n}
                </li>
              ))}
            </ul>
            <a href="#" className="mt-4 inline-block text-[13px] font-medium text-(--lp-ink) underline decoration-(--lp-line-strong) underline-offset-4 hover:decoration-(--lp-ink)">
              Change in Settings
            </a>
          </section>
          <section className={cn("rounded-[20px] bg-white p-5", RING)}>
            <div className="flex items-baseline justify-between">
              <h2 className="m-0 text-[14px] font-semibold text-(--lp-ink)">Your week</h2>
              <span className="text-[13px] text-(--lp-ink-3) tabular-nums">
                {Math.floor(WEEK_MINUTES / 60)} h {WEEK_MINUTES % 60} min
              </span>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-1.5">
              {WEEK.map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <span
                    title={`${d.minutes} min`}
                    className="aspect-square w-full rounded-[6px]"
                    style={{ background: d.minutes ? `rgba(61, 156, 255, ${0.25 + 0.75 * (d.minutes / max)})` : "var(--lp-gray)" }}
                  />
                  <span className="text-[11px] text-(--lp-ink-3)">{d.day}</span>
                </div>
              ))}
            </div>
            <p className="m-0 mt-3 text-[13px] text-(--lp-ink-2)">5 days out of the last 7</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
