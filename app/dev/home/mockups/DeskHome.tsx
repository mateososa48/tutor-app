"use client";

import { ArrowRight, Camera, Mic, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { SESSIONS } from "../data";
import { MemoryPanel, WeekPanel } from "../pieces";
import { IconButton, MobileBar, RING, RING_HOVER, Rise, Thumb } from "../parts";

// 20. Desk. One bar across the top holds every way to start, so the page below
// belongs to the work itself: the last board at full size with the tutor's
// question on it in ink, and the boards before it on a shelf.
export default function DeskHome() {
  const [current, ...rest] = SESSIONS;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-(--lp-bg)">
      <MobileBar />
      <div className="mx-auto max-w-[1240px] px-4 pt-4 pb-16 sm:px-6 sm:pt-6">
        <Rise>
          <div className={cn("flex flex-wrap items-center gap-2 rounded-[18px] bg-white p-2", RING)}>
            <button
              type="button"
              className="btn-gloss inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-[10px] ps-3.5 pe-4 text-[14.5px] font-semibold transition-transform duration-150 ease-out active:scale-[0.96] sm:w-auto sm:justify-start"
            >
              <Mic className="size-[18px]" strokeWidth={2} />
              Start talking
            </button>
            <input
              aria-label="Type a problem"
              placeholder="or type a problem, or drop a worksheet anywhere"
              className="h-12 min-w-[10rem] flex-1 rounded-[10px] bg-transparent px-2.5 text-[15.5px] text-(--lp-ink) outline-none placeholder:text-[#76767f] focus-visible:bg-(--lp-gray)"
            />
            <IconButton label="Add a worksheet" className="rounded-[10px]">
              <Paperclip />
            </IconButton>
            <IconButton label="Take a photo" className="rounded-[10px]">
              <Camera />
            </IconButton>
          </div>
        </Rise>

        <div className="mt-4 grid gap-4 lg:grid-cols-12">
          <Rise i={1} className="lg:col-span-8">
            <div className={cn("relative overflow-hidden rounded-[20px] bg-white p-2", RING)}>
              <Thumb s={current} sizes="(max-width: 1024px) 100vw, 820px" zoom={1.3} position="0% 4%" className="aspect-[16/10] rounded-[12px]" />
              <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[14px] bg-(--lp-ink) p-2 ps-4 shadow-[0_12px_32px_-12px_rgba(18,18,21,0.55)]">
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="m-0 text-[12.5px] text-white/55">
                    Paused {current.ago}, {current.minutes} min in
                  </p>
                  <p className="lp-display m-0 mt-0.5 truncate text-[17px] text-white">{current.title}</p>
                  <p className="m-0 mt-1 line-clamp-1 hidden text-[13.5px] text-white/70 sm:block">&ldquo;{current.lastLine}&rdquo;</p>
                </div>
                <button
                  type="button"
                  className="btn-gloss-light inline-flex h-11 shrink-0 items-center gap-2 rounded-[10px] ps-4 pe-3.5 text-[14.5px] font-semibold transition-transform duration-150 ease-out active:scale-[0.96]"
                >
                  Resume
                  <ArrowRight className="size-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          </Rise>

          <Rise i={2} className="flex flex-col gap-4 lg:col-span-4">
            <MemoryPanel />
            <WeekPanel className="flex-1" />
          </Rise>
        </div>

        <Rise i={3} className="mt-8">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="lp-display m-0 text-[16px] text-(--lp-ink)">Earlier boards</h2>
            <a href="#" className="text-[13.5px] font-medium text-(--lp-ink-2) underline-offset-4 hover:text-(--lp-ink) hover:underline">
              See all
            </a>
          </div>
          <ul className="m-0 mt-3 flex snap-x list-none gap-4 overflow-x-auto p-1 [scrollbar-width:none]">
            {rest.map((s) => (
              <li key={s.id} className="w-[232px] shrink-0 snap-start">
                <a
                  href="#"
                  className={cn(
                    "block rounded-[16px] bg-white p-1.5 outline-none transition-[box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-(--lp-sky)",
                    RING,
                    RING_HOVER,
                  )}
                >
                  <Thumb s={s} sizes="260px" className="aspect-[4/3] rounded-[10px]" />
                  <div className="px-2 pt-2.5 pb-1">
                    <p className="m-0 truncate text-[13.5px] font-medium text-(--lp-ink)">{s.title}</p>
                    <p className="m-0 mt-0.5 text-[12.5px] text-(--lp-ink-3) tabular-nums">
                      {s.day}, {s.minutes} min
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </Rise>
      </div>
    </div>
  );
}
