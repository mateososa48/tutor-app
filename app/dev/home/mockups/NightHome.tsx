"use client";

import { ArrowRight, Plus } from "lucide-react";
import { DitherWave } from "@/components/landing/DitherWave";
import { useReduce } from "@/components/landing/useScript";
import { VOICE_BLUE } from "@/components/session/VoiceWave";
import { DATE_LINE, SESSIONS, STUDENT } from "../data";
import { BoardPlaceholder, BoardShot, MobileBar, Rise } from "../parts";

// 7. Night desk. The page continues the sidebar's ink instead of switching to
// white beside it. The tutor's voice wave lies along the bottom like a horizon
// and past boards sit on a shelf above it.
const INK: [number, number, number] = [0.071, 0.071, 0.082]; // #121215

export default function NightHome() {
  const reduce = useReduce();
  const [current] = SESSIONS;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-(--lp-ink) text-[#ececef]">
      <MobileBar dark />
      <div className="relative isolate flex min-h-full flex-col">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[48%] [mask-image:linear-gradient(to_top,#000_45%,transparent)]">
          <DitherWave
            pattern="bands"
            waveColor={VOICE_BLUE.top}
            deepColor={VOICE_BLUE.deep}
            backgroundColor={INK}
            colorNum={4}
            pixelSize={3}
            waveSpeed={0.04}
            waveFrequency={2.2}
            waveAmplitude={0.5}
            animate={reduce === false}
            className="absolute inset-0 h-full w-full"
          />
        </div>

        <div className="mx-auto w-full max-w-[1180px] px-5 pt-12 sm:px-10 lg:pt-20">
          <Rise>
            <p className="m-0 text-[13.5px] text-white/50">{DATE_LINE}</p>
          </Rise>
          <Rise i={1}>
            <h1 className="lp-display m-0 mt-3 max-w-[15ch] text-[clamp(2.6rem,5.6vw,4.4rem)] leading-[1.02] text-white">Good evening, {STUDENT.name}.</h1>
          </Rise>
          <Rise i={2}>
            <p className="m-0 mt-4 max-w-[44ch] text-[17px] leading-relaxed text-white/65">
              This afternoon you stopped at 2x = 8. Pick it back up, or bring something new.
            </p>
          </Rise>
          <Rise i={3} className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-gloss-light inline-flex h-12 items-center gap-2 rounded-[10px] ps-5 pe-4 text-[15px] font-semibold active:scale-[0.96]">
              Continue {current.title.replace("Solving ", "")}
              <ArrowRight className="size-4" />
            </button>
            <button
              type="button"
              className="inline-flex h-12 items-center gap-2 rounded-[10px] px-4 text-[15px] font-semibold text-white/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)] transition-[background-color,scale] duration-150 hover:bg-white/[0.06] active:scale-[0.96]"
            >
              <Plus className="size-4" />
              New session
            </button>
          </Rise>
        </div>

        <section className="mx-auto mt-auto w-full max-w-[1180px] pt-16 pb-10 sm:pb-14">
          <div className="flex items-baseline justify-between px-5 sm:px-10">
            <h2 className="m-0 text-[14px] font-medium text-white/60">Recent boards</h2>
            <a href="#" className="text-[13.5px] font-medium text-white/60 hover:text-white">
              See all
            </a>
          </div>
          <ul className="m-0 mt-3 flex snap-x scroll-px-5 list-none gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:scroll-px-10 sm:px-10">
            {SESSIONS.map((s) => (
              <li key={s.id} className="w-[240px] shrink-0 snap-start sm:w-[264px]">
                <a
                  href="#"
                  className="block rounded-[16px] bg-[rgba(18,18,21,0.72)] p-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] backdrop-blur-md transition-[background-color] duration-150 hover:bg-[rgba(34,34,40,0.8)]"
                >
                  {s.shot ? (
                    <BoardShot shot={s.shot} dark className="aspect-[4/3] rounded-[10px]" sizes="270px" />
                  ) : (
                    <BoardPlaceholder title={s.title} className="aspect-[4/3] rounded-[10px]" />
                  )}
                  <div className="px-2 pt-2.5 pb-1.5">
                    <p className="m-0 truncate text-[14px] font-medium text-white">{s.title}</p>
                    <p className="m-0 mt-0.5 text-[12.5px] text-white/50">
                      {s.day}, {s.minutes} min
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
