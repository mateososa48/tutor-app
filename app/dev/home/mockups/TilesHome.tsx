"use client";

import type { CSSProperties, ReactNode } from "react";
import { Keyboard, Mic, Plus } from "lucide-react";
import { VoiceWave } from "@/components/session/VoiceWave";
import { cn } from "@/lib/utils";
import { SESSIONS } from "../data";
import { BoardShot, DOTS, MobileBar, RING, RING_HOVER, Rise, TutorPen } from "../parts";

// 13. Tiles. After libraries.dev: the things on your desk float around one
// sentence and one button. Every tile is real: three boards, the tutor's
// voice, its pen, and a fresh page.
const SPOTS = [
  { "--l": "9%", "--t": "15%" },
  { "--l": "38%", "--t": "4%" },
  { "--l": "73%", "--t": "9%" },
  { "--l": "81%", "--t": "52%" },
  { "--l": "57%", "--t": "72%" },
  { "--l": "20%", "--t": "62%" },
] as unknown as CSSProperties[];

export default function TilesHome() {
  const boards = SESSIONS.filter((s) => s.shot).slice(0, 3);
  const tiles: { label: string; node: ReactNode; paused?: boolean }[] = [
    { label: boards[0].title, node: <BoardShot shot={boards[0].shot!} className="h-full w-full" zoom={1.9} position="6% 14%" sizes="140px" />, paused: true },
    {
      label: "The tutor's pen",
      node: (
        <div className="grid h-full w-full place-items-center bg-white" style={DOTS}>
          <TutorPen className="-translate-y-1" />
        </div>
      ),
    },
    { label: boards[1].title, node: <BoardShot shot={boards[1].shot!} className="h-full w-full" sizes="140px" position="20% 30%" /> },
    { label: boards[2].title, node: <BoardShot shot={boards[2].shot!} className="h-full w-full" sizes="140px" position="30% 40%" /> },
    { label: "Your tutor's voice", node: <VoiceWave analyser={null} speaking className="block h-full w-full" /> },
    {
      label: "A fresh page",
      node: (
        <div className="grid h-full w-full place-items-center bg-white text-(--lp-ink-2)" style={DOTS}>
          <Plus className="size-7" strokeWidth={1.75} />
        </div>
      ),
    },
  ];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-(--lp-bg)">
      <MobileBar />
      <div className="relative flex flex-col items-center px-5 pt-12 pb-16 md:min-h-[720px] md:justify-center md:py-0">
        <Rise className="relative z-10 flex max-w-[560px] flex-col items-center text-center">
          <span className={cn("inline-flex h-8 items-center rounded-full bg-white px-3.5 text-[13px] font-medium text-(--lp-ink-2)", RING)}>
            Two-step equations, quiz on Friday
          </span>
          <h1 className="lp-display m-0 mt-5 text-[clamp(2.2rem,4vw,3.4rem)] leading-[1.04] text-balance text-(--lp-ink)">Your tutor is ready.</h1>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              className="btn-gloss inline-flex h-12 items-center gap-2.5 rounded-[10px] ps-4 pe-5 text-[15px] font-semibold transition-transform duration-150 ease-out active:scale-[0.96]"
            >
              <Mic className="size-[18px]" strokeWidth={2} />
              Start talking
            </button>
            <button
              type="button"
              className="btn-gloss-light inline-flex h-12 items-center gap-2 rounded-[10px] ps-4 pe-5 text-[15px] font-semibold transition-transform duration-150 ease-out active:scale-[0.96]"
            >
              <Keyboard className="size-[18px]" strokeWidth={2} />
              Type
            </button>
          </div>
        </Rise>

        <ul className="m-0 mt-12 grid w-full max-w-[420px] list-none grid-cols-3 gap-4 p-0 md:static md:mt-0 md:block md:max-w-none">
          {tiles.map((t, i) => (
            <li key={t.label} className="home-rise md:absolute md:left-(--l) md:top-(--t)" style={{ ...SPOTS[i], "--i": i + 1 } as CSSProperties}>
                <a
                  href="#"
                  aria-label={t.label}
                  title={t.label}
                  className={cn(
                    "group relative block w-full rounded-[24px] bg-white p-2 outline-none transition-[translate,box-shadow] duration-150 ease-out hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-(--lp-sky) focus-visible:ring-offset-2 md:w-[136px]",
                    RING,
                    RING_HOVER,
                  )}
                >
                  <div className="aspect-square overflow-hidden rounded-[16px]">{t.node}</div>
                  {t.paused && <span aria-hidden className="absolute top-3 right-3 size-2 rounded-full bg-(--lp-sky) ring-2 ring-white" />}
                </a>
              </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
