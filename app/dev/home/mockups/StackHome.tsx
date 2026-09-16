"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SESSIONS, type MockSession } from "../data";
import { Highlight, MobileBar, Thumb } from "../parts";

// 14. Pages. Each session is a page of a pad; scrolling piles them up, newest
// on top, a few pixels of each earlier page showing above the next. The first
// page is the one you left open.
export default function StackHome() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-(--lp-bg)">
      <MobileBar />
      <div className="mx-auto max-w-[1100px] px-4 pt-4 pb-24 sm:px-8 sm:pt-6">
        {SESSIONS.map((s, i) => (
          <Page key={s.id} s={s} i={i} />
        ))}
      </div>
    </div>
  );
}

function Page({ s, i }: { s: MockSession; i: number }) {
  const paused = s.status === "paused";
  return (
    <section
      className="sticky mb-6 grid rounded-[20px] bg-white p-2 shadow-[0_0_0_1px_rgba(18,18,21,0.07),0_1px_2px_rgba(18,18,21,0.06),0_16px_40px_-14px_rgba(18,18,21,0.28)] md:grid-cols-[1.1fr_1fr]"
      style={{ top: 12 + i * 10 }}
    >
      <Thumb s={s} sizes="(max-width: 768px) 100vw, 600px" zoom={s.shot?.src.includes("session-board") ? 1.3 : 1} position={s.shot?.src.includes("session-board") ? "0% 22%" : "50% 50%"} className="aspect-[4/3] rounded-[12px]" />
      <div className="flex flex-col px-4 pt-5 pb-3 md:px-10 md:py-10">
        <p className="m-0 text-[13px] text-(--lp-ink-3) tabular-nums">
          {paused ? `Paused today at ${s.time}, ${s.minutes} min in` : `${s.day} at ${s.time}, ${s.minutes} min`}
        </p>
        <h2 className="lp-display m-0 mt-2 text-[clamp(1.5rem,2.6vw,2rem)] leading-[1.1] text-(--lp-ink)">{s.title}</h2>
        {paused ? (
          <p className="m-0 mt-4 max-w-[40ch] text-[17px] leading-relaxed text-(--lp-ink-2)">
            Your tutor was asking: &ldquo;{s.lastLine}&rdquo;
          </p>
        ) : (
          <p className="m-0 mt-4 max-w-[40ch] text-[17px] leading-relaxed text-(--lp-ink)">
            <Highlight>{s.rule}</Highlight>
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-8">
          {paused ? (
            <>
              <button
                type="button"
                className="btn-gloss inline-flex h-11 items-center gap-2 rounded-[10px] ps-5 pe-4 text-[14.5px] font-semibold transition-transform duration-150 ease-out active:scale-[0.96]"
              >
                Continue
                <ArrowRight className="size-4" strokeWidth={2} />
              </button>
              <button
                type="button"
                className={cn("h-11 rounded-[10px] bg-white px-4 text-[14.5px] font-semibold text-(--lp-ink) transition-[box-shadow,transform] duration-150 ease-out active:scale-[0.96]", "shadow-[inset_0_0_0_1px_rgba(18,18,21,0.14)] hover:shadow-[inset_0_0_0_1px_rgba(18,18,21,0.3)]")}
              >
                New session
              </button>
            </>
          ) : (
            <a href="#" className="inline-flex h-11 items-center gap-1.5 text-[14.5px] font-medium text-(--lp-ink-2) underline-offset-4 transition-colors duration-150 hover:text-(--lp-ink) hover:underline">
              Open the board
              <ArrowRight className="size-4" strokeWidth={1.75} />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
