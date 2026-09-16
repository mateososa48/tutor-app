"use client";

import { ArrowUp, Camera, Mic, Paperclip } from "lucide-react";
import { ChalkMark } from "@/components/app/ChalkMark";
import { cn } from "@/lib/utils";
import { SESSIONS, STARTERS, STUDENT } from "../data";
import { BoardShot, MobileBar, RING, RING_HOVER, Rise } from "../parts";

// 2. Ask first. The whole page is one question and a box to answer it in, the
// way the student would start with a real tutor: "what are you stuck on?"
export default function AskHome() {
  const [current, ...earlier] = SESSIONS;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-white">
      <MobileBar />
      <div className="mx-auto w-full max-w-[760px] px-5 pt-10 pb-28 sm:px-8 sm:pt-[clamp(2.5rem,13vh,8rem)]">
        <Rise className="flex items-center gap-2.5 text-[14.5px] text-(--lp-ink-2)">
          <ChalkMark size={20} />
          Good evening, {STUDENT.name}
        </Rise>
        <Rise i={1}>
          <h1 className="lp-display m-0 mt-3 text-[clamp(2rem,4.2vw,2.9rem)] leading-[1.06] text-balance text-(--lp-ink)">What are you stuck on?</h1>
        </Rise>

        <Rise i={2}>
          <div
            className={cn(
              "mt-7 rounded-[20px] bg-white p-2 transition-[box-shadow] duration-150 focus-within:shadow-[0_0_0_2px_var(--lp-sky),0_8px_24px_-8px_rgba(61,156,255,0.35)]",
              "shadow-[0_0_0_1px_rgba(18,18,21,0.09),0_2px_4px_-1px_rgba(18,18,21,0.06),0_12px_32px_-12px_rgba(18,18,21,0.14)]",
            )}
          >
            <label htmlFor="ask" className="sr-only">
              Your problem
            </label>
            <textarea
              id="ask"
              rows={3}
              placeholder="Type a problem, or tell your tutor what the homework is about"
              className="block min-h-[112px] w-full resize-none rounded-[12px] bg-transparent px-3.5 pt-3 text-[16.5px] leading-relaxed text-(--lp-ink) outline-none placeholder:text-[#76767f]"
            />
            <div className="flex items-center gap-1 pt-1">
              <ToolButton icon={<Paperclip />} label="Worksheet" />
              <ToolButton icon={<Camera />} label="Photo" />
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Talk instead"
                  title="Talk instead"
                  className="grid size-10 place-items-center rounded-[10px] text-(--lp-ink-2) transition-[background-color,scale] duration-150 hover:bg-(--lp-gray) active:scale-[0.96]"
                >
                  <Mic className="size-[18px]" />
                </button>
                <button type="button" className="btn-gloss inline-flex h-10 items-center gap-1.5 rounded-[10px] ps-4 pe-3.5 text-[14.5px] font-semibold">
                  Start
                  <ArrowUp className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </Rise>

        <Rise i={3} className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 py-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              className={cn(
                "h-9 shrink-0 rounded-[10px] bg-white px-3.5 text-[13.5px] text-(--lp-ink-2) transition-[box-shadow,color,scale] duration-150 hover:text-(--lp-ink) active:scale-[0.96]",
                RING,
                RING_HOVER,
              )}
            >
              {s}
            </button>
          ))}
        </Rise>

        <section className="mt-16">
          <h2 className="m-0 mb-3 text-[13.5px] font-medium text-(--lp-ink-3)">Pick up where you left off</h2>
          <a href="#" className={cn("group grid grid-cols-[96px_1fr] items-center gap-4 rounded-[20px] bg-white p-2 pr-4 transition-[box-shadow] duration-150 sm:grid-cols-[132px_1fr_auto]", RING, RING_HOVER)}>
            {current.shot && <BoardShot shot={current.shot} className="aspect-[4/3] rounded-[12px]" sizes="140px" />}
            <div className="min-w-0 py-1">
              <p className="m-0 truncate text-[15.5px] font-semibold text-(--lp-ink)">{current.title}</p>
              <p className="m-0 mt-0.5 text-[13px] text-(--lp-ink-3)">
                Paused {current.ago}, {current.minutes} min in
              </p>
              <p className="lp-hand m-0 mt-2 line-clamp-2 text-[14.5px] leading-snug text-(--lp-ink-2)">&ldquo;{current.lastLine}&rdquo;</p>
            </div>
            <span className="lp-btn lp-btn-lift lp-btn-sm col-span-2 sm:col-span-1">Resume</span>
          </a>
        </section>

        <section className="mt-12">
          <h2 className="m-0 mb-1 text-[13.5px] font-medium text-(--lp-ink-3)">Earlier</h2>
          <ul className="m-0 list-none p-0">
            {earlier.slice(0, 4).map((s) => (
              <li key={s.id} className="border-b border-(--lp-line) last:border-b-0">
                <a href="#" className="-mx-3 flex items-baseline gap-4 rounded-[10px] px-3 py-3 transition-colors duration-150 hover:bg-(--lp-gray)">
                  <span className="min-w-0 flex-1 truncate text-[14.5px] text-(--lp-ink)">{s.title}</span>
                  <span className="shrink-0 text-[13px] text-(--lp-ink-3) tabular-nums">
                    {s.day}, {s.minutes} min
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function ToolButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-10 items-center gap-2 rounded-[10px] px-3 text-[13.5px] font-medium text-(--lp-ink-2) transition-[background-color,color,scale] duration-150 hover:bg-(--lp-gray) hover:text-(--lp-ink) active:scale-[0.96] [&_svg]:size-4"
    >
      {icon}
      {label}
    </button>
  );
}
