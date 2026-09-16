"use client";

import { Keyboard, Mic, Paperclip } from "lucide-react";
import { SpeedGauge } from "@/components/session/SpeedControl";
import { VoiceWave } from "@/components/session/VoiceWave";
import { cn } from "@/lib/utils";
import { SESSIONS, STUDENT } from "../data";
import { IconButton, MobileBar, RING, RING_HOVER, Rise, Thumb } from "../parts";

// 15. Dock. The session's voice dock, made the whole page: the wave, the
// badge and the mic at a size that says this is what Chalk is. The boards
// are a row of chips underneath.
export default function DockHome() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-white">
      <MobileBar />
      <div className="mx-auto flex min-h-full max-w-[720px] flex-col justify-center px-4 py-10 sm:px-6">
        <Rise>
          <div className="rounded-[22px] bg-white p-3 shadow-[0_0_0_1px_rgba(18,18,21,0.07),0_1px_2px_rgba(18,18,21,0.06),0_24px_60px_-24px_rgba(18,18,21,0.28)]">
            <div className="flex items-center justify-between gap-4 px-2 pt-1 pb-3">
              <span className="inline-flex items-center gap-2 text-[13.5px] font-medium text-(--lp-ink)">
                <span aria-hidden className="size-2 rounded-full bg-(--lp-live)" />
                Your tutor is ready
              </span>
              <span className="inline-flex items-center gap-1.5 text-[13px] text-(--lp-ink-3)">
                <SpeedGauge index={1} className="size-4" />
                {STUDENT.voice}, {STUDENT.speed.toLowerCase()}
              </span>
            </div>
            <div className="h-[168px] overflow-hidden rounded-[10px] sm:h-[200px]">
              <VoiceWave analyser={null} speaking className="block h-full w-full" />
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <IconButton label="Add a worksheet">
                <Paperclip />
              </IconButton>
              <button
                type="button"
                className="btn-gloss inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[10px] text-[15px] font-semibold transition-transform duration-150 ease-out active:scale-[0.96]"
              >
                <Mic className="size-[18px]" strokeWidth={2} />
                Start talking
              </button>
              <IconButton label="Type instead">
                <Keyboard />
              </IconButton>
            </div>
          </div>
        </Rise>

        <Rise i={1} className="mt-8">
          <ul className="m-0 flex list-none gap-2.5 overflow-x-auto p-0 pb-1 [scrollbar-width:none]">
            {SESSIONS.slice(0, 4).map((s) => {
              const paused = s.status === "paused";
              return (
                <li key={s.id} className="shrink-0">
                  <a
                    href="#"
                    className={cn("flex items-center gap-2.5 rounded-[12px] bg-white p-1.5 pe-3.5 outline-none transition-[box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-(--lp-sky)", RING, RING_HOVER)}
                  >
                    <Thumb s={s} tiny className="aspect-[4/3] w-12 rounded-[6px]" />
                    <span className="flex flex-col">
                      <span className="text-[13.5px] font-medium text-(--lp-ink)">{s.title}</span>
                      <span className={cn("text-[12px] tabular-nums", paused ? "text-(--lp-sky-deep)" : "text-(--lp-ink-3)")}>{paused ? "Paused, pick it up" : `${s.day}, ${s.minutes} min`}</span>
                    </span>
                  </a>
                </li>
              );
            })}
            <li className="flex shrink-0 items-center">
              <a href="#" className="px-3 text-[13.5px] font-medium text-(--lp-ink-2) transition-colors hover:text-(--lp-ink)">
                All boards
              </a>
            </li>
          </ul>
        </Rise>
      </div>
    </div>
  );
}
