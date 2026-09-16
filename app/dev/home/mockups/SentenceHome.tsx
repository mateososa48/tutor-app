"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SESSIONS, WEEK_MINUTES } from "../data";
import { MobileBar, RING, Rise, Thumb } from "../parts";

// 10. Sentence. One line of type says everything the page can do, and the two
// things you can do are the two links in it. Under it, the sessions as a
// plain list; pointing at one shows its board on the right.
export default function SentenceHome() {
  const [activeId, setActiveId] = useState(SESSIONS[0].id);
  const active = SESSIONS.find((s) => s.id === activeId) ?? SESSIONS[0];
  const [current, ...rest] = SESSIONS;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-white">
      <MobileBar />
      <div className="mx-auto max-w-[1180px] px-6 pt-12 pb-24 sm:px-10 lg:pt-24">
        <Rise>
          <h1 className="lp-display m-0 max-w-[18ch] text-[clamp(1.9rem,4.4vw,3.9rem)] leading-[1.08] text-(--lp-ink)">
            Pick up <Underlined>{current.title.replace("Solving ", "")}</Underlined>, or <Underlined>start something new</Underlined>.
          </h1>
        </Rise>

        <div className="mt-16 grid gap-12 lg:mt-24 lg:grid-cols-[1fr_360px] lg:gap-20">
          <Rise i={1} className="min-w-0">
            <ul className="m-0 list-none border-t border-(--lp-line) p-0">
              {[current, ...rest].map((s) => {
                const paused = s.status === "paused";
                return (
                  <li key={s.id} className="border-b border-(--lp-line)">
                    <a
                      href="#"
                      onMouseEnter={() => setActiveId(s.id)}
                      onFocus={() => setActiveId(s.id)}
                      className={cn(
                        "group flex items-center gap-4 py-3.5 outline-none transition-colors duration-150 lg:py-4",
                        activeId === s.id ? "text-(--lp-ink)" : "text-(--lp-ink-2) hover:text-(--lp-ink) focus-visible:text-(--lp-ink)",
                      )}
                    >
                      <Thumb s={s} tiny className="aspect-[4/3] w-14 shrink-0 rounded-[6px] lg:hidden" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-medium">{s.title}</span>
                        <span className="block truncate text-[13.5px] text-(--lp-ink-3)">{paused ? `Paused at “${s.lastLine}”` : s.rule}</span>
                      </span>
                      <span className="shrink-0 text-[13.5px] text-(--lp-ink-3) tabular-nums">
                        {s.day}, {s.minutes} min
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
            <p className="m-0 mt-10 text-[16px] text-(--lp-ink-2)">
              {Math.floor(WEEK_MINUTES / 60)} h {WEEK_MINUTES % 60} min with your tutor this week, on 5 of the last 7 days.
            </p>
          </Rise>

          <Rise i={2} className="hidden lg:block">
            <div className="sticky top-10">
              <div key={active.id} className={cn("home-swap rounded-[14px] bg-white p-1.5", RING)}>
                <Thumb s={active} sizes="360px" className="aspect-[4/3] rounded-[8px]" />
              </div>
              <p className="m-0 mt-3 text-[13px] text-(--lp-ink-3)">{active.title}</p>
            </div>
          </Rise>
        </div>
      </div>
    </div>
  );
}

/** A link in display type with the board's sky pen stroke under it. */
function Underlined({ children }: { children: ReactNode }) {
  return (
    <a
      href="#"
      className="relative inline-block whitespace-nowrap text-(--lp-ink) outline-none transition-colors duration-150 hover:text-(--lp-sky-deep) focus-visible:text-(--lp-sky-deep)"
    >
      {children}
      <svg aria-hidden viewBox="0 0 100 10" preserveAspectRatio="none" className="pointer-events-none absolute -bottom-[0.06em] left-0 h-[0.16em] w-full overflow-visible">
        <path
          d="M1 6 C 12 2.5, 22 8.5, 34 5 S 56 2.5, 68 5.5 S 88 8, 99 4.5"
          fill="none"
          stroke="var(--lp-sky)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ vectorEffect: "non-scaling-stroke" }}
        />
      </svg>
    </a>
  );
}
