"use client";

import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { SESSIONS, STUDENT } from "../data";
import { Composer, ContextLine, ContinueRow, EarlierList, MemoryPanel, Suggestions, WeekPanel } from "../pieces";
import { MobileBar, RING, RING_HOVER, Rise } from "../parts";

// 19. Two doors. Ask first, but honest about the two ways in: the box you type
// in and the button you talk into, side by side and the same height, with the
// session's context underneath instead of empty page.
export default function DoorsTwoHome() {
  const [current, ...rest] = SESSIONS;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-white">
      <MobileBar />
      <div className="mx-auto w-full max-w-[880px] px-5 pt-10 pb-20 sm:px-8 lg:pt-16">
        <Rise>
          <ContextLine text={STUDENT.workingOn} />
        </Rise>
        <Rise i={1}>
          <h1 className="lp-display m-0 mt-2 text-[clamp(2rem,3.2vw,2.75rem)] leading-[1.05] text-(--lp-ink)">What do you need help with?</h1>
        </Rise>

        <Rise i={2} className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
          <Composer primary="send" minH="min-h-[120px]" />
          <button
            type="button"
            className={cn(
              "group flex items-center justify-center gap-4 rounded-[20px] bg-white p-5 outline-none transition-[box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-(--lp-sky) sm:w-[148px] sm:flex-col sm:gap-3",
              RING,
              RING_HOVER,
            )}
          >
            <span className="btn-gloss grid size-14 place-items-center rounded-full transition-transform duration-150 ease-out group-active:scale-[0.96]">
              <Mic className="size-6" strokeWidth={2} />
            </span>
            <span className="text-[14.5px] font-semibold text-(--lp-ink) sm:text-center">Talk it through</span>
          </button>
        </Rise>

        <Rise i={3} className="mt-3">
          <Suggestions />
        </Rise>

        <Rise i={4} className="mt-14">
          <h2 className="m-0 mb-3 text-[14px] font-medium text-(--lp-ink-2)">Pick up where you left off</h2>
          <ContinueRow s={current} />
        </Rise>

        <Rise i={5} className="mt-4 grid gap-4 sm:grid-cols-2">
          <MemoryPanel />
          <WeekPanel />
        </Rise>

        <Rise i={6} className="mt-12">
          <h2 className="m-0 mb-1 text-[14px] font-medium text-(--lp-ink-2)">Earlier</h2>
          <EarlierList items={rest.slice(0, 4)} />
        </Rise>
      </div>
    </div>
  );
}
