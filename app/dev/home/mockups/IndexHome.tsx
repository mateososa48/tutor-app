"use client";

import { Keyboard, Mic, Paperclip, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { SESSIONS, WEEK_MINUTES, type MockSession } from "../data";
import { MobileBar, RING, Rise, Thumb } from "../parts";

// 16. Index. The tool version: the actions in one row, then every session as a
// hairline list with a small board, a takeaway and the numbers. Dense, quiet,
// no cards.
// Under Today and Yesterday the time of day says when; earlier, the day does.
const GROUPS: { label: string; items: MockSession[]; stamp: (s: MockSession) => string }[] = [
  { label: "Today", items: [SESSIONS[0]], stamp: (s) => s.time },
  { label: "Yesterday", items: [SESSIONS[1]], stamp: (s) => s.time },
  { label: "Earlier", items: SESSIONS.slice(2), stamp: (s) => s.day },
];

export default function IndexHome() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-white">
      <MobileBar />
      <div className="mx-auto max-w-[1040px] px-5 pt-6 pb-24 sm:px-10 lg:pt-10">
        <Rise className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-gloss inline-flex h-10 items-center gap-2 rounded-[10px] ps-3.5 pe-4 text-[14px] font-semibold transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            <Mic className="size-4" strokeWidth={2} />
            Start talking
          </button>
          <GhostButton icon={<Keyboard />} label="Type" />
          <GhostButton icon={<Paperclip />} label="Upload" />
          <label className="relative ml-auto hidden sm:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-(--lp-ink-3)" strokeWidth={1.75} />
            <input
              aria-label="Search sessions"
              placeholder="Search"
              className={cn("h-10 w-[240px] rounded-[10px] bg-white ps-9 pe-11 text-[14px] text-(--lp-ink) outline-none placeholder:text-[#76767f] focus-visible:shadow-[0_0_0_2px_var(--lp-sky)]", RING)}
            />
            <kbd className="absolute top-1/2 right-2 -translate-y-1/2 rounded-[6px] bg-(--lp-gray) px-1.5 py-0.5 font-sans text-[11px] text-(--lp-ink-2)">&#8984;K</kbd>
          </label>
        </Rise>

        <Rise i={1} className="mt-10 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-[10px] bg-(--lp-gray) p-1 text-[13.5px] font-medium">
            {[
              ["All", SESSIONS.length, true],
              ["Paused", 1, false],
              ["This week", 5, false],
            ].map(([label, n, on]) => (
              <button
                key={String(label)}
                type="button"
                aria-pressed={Boolean(on)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-[6px] px-3 transition-[background-color,color,box-shadow] duration-150",
                  on ? "bg-white text-(--lp-ink) shadow-[0_1px_2px_rgba(18,18,21,0.08)]" : "text-(--lp-ink-2) hover:text-(--lp-ink)",
                )}
              >
                {label}
                <span className="text-(--lp-ink-3) tabular-nums">{n}</span>
              </button>
            ))}
          </div>
          <span className="text-[13.5px] text-(--lp-ink-3) tabular-nums">
            {Math.floor(WEEK_MINUTES / 60)} h {WEEK_MINUTES % 60} min this week
          </span>
        </Rise>

        <Rise i={2} className="mt-2">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <p className="m-0 pt-7 pb-2 text-[13px] font-medium text-(--lp-ink-3)">{g.label}</p>
              <ul className="m-0 list-none border-t border-(--lp-line) p-0">
                {g.items.map((s) => (
                  <Row key={s.id} s={s} stamp={g.stamp(s)} />
                ))}
              </ul>
            </div>
          ))}
        </Rise>
      </div>
    </div>
  );
}

function Row({ s, stamp }: { s: MockSession; stamp: string }) {
  const paused = s.status === "paused";
  return (
    <li className="border-b border-(--lp-line)">
      <a
        href="#"
        className="grid grid-cols-[52px_1fr] items-center gap-x-4 gap-y-1 py-3 outline-none transition-colors duration-150 hover:bg-(--lp-gray) focus-visible:bg-(--lp-gray) sm:grid-cols-[52px_1fr_112px_64px] sm:gap-y-0"
      >
        <Thumb s={s} tiny className="aspect-[4/3] w-[52px] rounded-[5px]" />
        <span className="min-w-0">
          <span className="block truncate text-[14.5px] font-medium text-(--lp-ink)">{s.title}</span>
          <span className={cn("block truncate text-[13px]", paused ? "text-(--lp-sky-deep)" : "text-(--lp-ink-3)")}>{paused ? "Paused, pick it up" : s.rule}</span>
        </span>
        <span className="col-start-2 text-[13px] text-(--lp-ink-3) tabular-nums sm:col-start-auto sm:text-(--lp-ink-2)">
          {stamp}
          <span className="sm:hidden">, {s.minutes} min</span>
        </span>
        <span className="hidden text-right text-[13px] text-(--lp-ink-2) tabular-nums sm:block">{s.minutes} min</span>
      </a>
    </li>
  );
}

function GhostButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-[10px] bg-white ps-3 pe-3.5 text-[14px] font-medium text-(--lp-ink) transition-[box-shadow,transform] duration-150 ease-out active:scale-[0.96] [&_svg]:size-4",
        RING,
        "hover:shadow-[0_0_0_1px_rgba(18,18,21,0.14),0_1px_2px_-1px_rgba(18,18,21,0.08)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
