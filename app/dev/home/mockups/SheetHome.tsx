"use client";

import Image from "next/image";
import { ArrowRight, LayoutGrid } from "lucide-react";
import { SHOTS } from "@/components/landing/shots.generated";
import { SESSIONS } from "../data";
import { MobileBar, Rise } from "../parts";

// 11. Sheet. Open the app and you are back at the board: the last board fills
// the page edge to edge, and one glass bar holds the two things to do.
export default function SheetHome() {
  const [current] = SESSIONS;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <MobileBar />
      <div className="relative min-h-0 flex-1">
        <Image src={SHOTS.hero.src} alt="" fill priority sizes="100vw" className="origin-top-left scale-[1.15] object-cover object-[0%_0%]" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white/70 to-transparent" />

        <Rise className="absolute top-4 left-4 sm:top-6 sm:left-6">
          <span className="glass inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-[13px] font-medium text-(--lp-ink)">
            <span aria-hidden className="size-1.5 rounded-full bg-(--lp-sky)" />
            <span>
              Paused<span className="hidden sm:inline"> today at {current.time}</span>, {current.minutes} min in
            </span>
          </span>
        </Rise>
        <Rise i={1} className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <button
            type="button"
            aria-label="All boards" className="glass inline-flex h-9 items-center gap-2 rounded-[10px] ps-3 pe-3.5 text-[13px] font-medium text-(--lp-ink) transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            <LayoutGrid className="size-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">All boards</span>
            <span className="text-(--lp-ink-3) tabular-nums">{SESSIONS.length}</span>
          </button>
        </Rise>

        <Rise i={2} className="absolute inset-x-3 bottom-3 sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:w-[min(760px,calc(100%-48px))] sm:-translate-x-1/2">
          <div className="glass flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[18px] p-2">
            <div className="min-w-0 flex-1 ps-3 pt-1 sm:pt-0">
              <p className="lp-display m-0 truncate text-[16.5px] text-(--lp-ink)">{current.title}</p>
              <p className="m-0 truncate text-[13.5px] text-(--lp-ink-2)">&ldquo;{current.lastLine}&rdquo;</p>
            </div>
            <div className="flex w-full items-center gap-1.5 sm:w-auto">
              <button
                type="button"
                className="h-11 flex-1 rounded-[10px] px-4 text-[14.5px] font-semibold text-(--lp-ink) transition-[background-color,transform] duration-150 ease-out hover:bg-white/70 active:scale-[0.96] sm:flex-none"
              >
                New session
              </button>
              <button
                type="button"
                className="btn-gloss inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] ps-5 pe-4 text-[14.5px] font-semibold transition-transform duration-150 ease-out active:scale-[0.96] sm:flex-none"
              >
                Continue
                <ArrowRight className="size-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        </Rise>
      </div>
    </div>
  );
}
