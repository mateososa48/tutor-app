"use client";

import { useId, type ReactNode } from "react";
import { ArrowRight, ArrowUp, Camera, Mic, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTES, SUGGESTIONS, TOPICS, WEEK_MINUTES, type MockSession, type TopicState } from "./data";
import { RING, RING_HOVER, Thumb, WeekBars } from "./parts";

// The parts the five composed home layouts (v17 to v21) share, so every one of
// them gets the same craft: one hairline ring, concentric radii, a 0.96 press.

const SURFACE = "shadow-[0_0_0_1px_rgba(18,18,21,0.08),0_1px_2px_-1px_rgba(18,18,21,0.06),0_14px_36px_-16px_rgba(18,18,21,0.18)]";
const GLASS = "bg-white/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.75),0_1px_2px_rgba(18,18,21,0.06),0_16px_40px_-16px_rgba(18,18,21,0.3)] backdrop-blur-xl";

/** Where a session starts: type it, attach it, or talk. Outer radius 20 = inner 12 + 8 padding. */
export function Composer({
  glass,
  primary = "talk",
  minH = "min-h-[104px]",
  className,
}: {
  /** Sitting on the shader: a frosted white surface instead of a solid one. */
  glass?: boolean;
  /** "talk" makes the mic the filled button; "send" pairs a plain send button with a separate voice door. */
  primary?: "talk" | "send";
  minH?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        "rounded-[20px] p-2 transition-[box-shadow] duration-150 ease-out focus-within:shadow-[0_0_0_2px_var(--lp-sky),0_14px_36px_-16px_rgba(61,156,255,0.45)]",
        glass ? GLASS : cn("bg-white", SURFACE),
        className,
      )}
    >
      <label htmlFor={id} className="sr-only">
        What are you stuck on?
      </label>
      <textarea
        id={id}
        rows={2}
        placeholder="Type a problem, paste a question, or just start talking"
        className={cn(
          "block w-full resize-none rounded-[12px] bg-transparent px-3.5 pt-3 pb-1 text-[16.5px] leading-relaxed text-(--lp-ink) outline-none placeholder:text-[#76767f]",
          minH,
        )}
      />
      <div className="flex items-center gap-1">
        <ToolButton icon={<Paperclip />} label="Worksheet" />
        <ToolButton icon={<Camera />} label="Photo" />
        <div className="ms-auto flex items-center gap-1.5">
          {primary === "talk" ? (
            <>
              <button
                type="button"
                aria-label="Send what you typed"
                title="Send what you typed"
                className="grid size-11 place-items-center rounded-[12px] text-(--lp-ink-2) transition-[background-color,color,scale] duration-150 ease-out hover:bg-(--lp-gray) hover:text-(--lp-ink) active:scale-[0.96]"
              >
                <ArrowUp className="size-[18px]" strokeWidth={2} />
              </button>
              <button
                type="button"
                className="btn-gloss inline-flex h-11 items-center gap-2 rounded-[12px] ps-3.5 pe-4 text-[14.5px] font-semibold transition-transform duration-150 ease-out active:scale-[0.96]"
              >
                <Mic className="size-[18px]" strokeWidth={2} />
                Start talking
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-gloss inline-flex h-11 items-center gap-2 rounded-[12px] ps-4 pe-3.5 text-[14.5px] font-semibold transition-transform duration-150 ease-out active:scale-[0.96]"
            >
              Start
              <ArrowUp className="size-4" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolButton({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-11 items-center gap-2 rounded-[12px] px-3 text-[13.5px] font-medium text-(--lp-ink-2) transition-[background-color,color,scale] duration-150 ease-out hover:bg-(--lp-gray) hover:text-(--lp-ink) active:scale-[0.96] [&_svg]:size-[17px]"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/** Starters from this student's own notes, not generic prompts. */
export function Suggestions({ glass, className }: { glass?: boolean; className?: string }) {
  return (
    <ul className={cn("m-0 flex list-none gap-2 overflow-x-auto p-0 py-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible", className)}>
      {SUGGESTIONS.map((s) => (
        <li key={s} className="shrink-0">
          <button
            type="button"
            className={cn(
              "h-9 rounded-[10px] px-3.5 text-[13.5px] whitespace-nowrap transition-[box-shadow,background-color,color,scale] duration-150 ease-out active:scale-[0.96]",
              glass
                ? "bg-white/80 text-(--lp-ink) shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)] backdrop-blur-md hover:bg-white"
                : cn("bg-white text-(--lp-ink-2) hover:text-(--lp-ink)", RING, RING_HOVER),
            )}
          >
            {s}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[20px] bg-white p-5", RING, className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[14px] font-medium text-(--lp-ink-2)">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PausedLine({ s, className }: { s: MockSession; className?: string }) {
  return (
    <p className={cn("m-0 flex items-center gap-2 text-[12.5px] text-(--lp-ink-3)", className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-(--lp-sky)" />
      Paused {s.ago}, {s.minutes} min in
    </p>
  );
}

/** The paused session as a tile: board on top, the tutor's question under it. */
export function ContinueTile({ s, className }: { s: MockSession; className?: string }) {
  return (
    <a
      href="#"
      className={cn(
        "group flex flex-col rounded-[20px] bg-white p-2 outline-none transition-[box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-(--lp-sky) focus-visible:ring-offset-2",
        RING,
        RING_HOVER,
        className,
      )}
    >
      <Thumb s={s} sizes="(max-width: 1024px) 100vw, 560px" className="aspect-[16/10] rounded-[12px]" />
      <div className="flex flex-1 flex-col px-3 pt-4 pb-2">
        <PausedLine s={s} />
        <p className="lp-display m-0 mt-1 text-[19px] leading-tight text-(--lp-ink)">{s.title}</p>
        <p className="m-0 mt-2 text-[14.5px] leading-snug text-(--lp-ink-2)">&ldquo;{s.lastLine}&rdquo;</p>
        <div className="mt-auto pt-4">
          <span className="lp-btn lp-btn-lift lp-btn-sm">Resume</span>
        </div>
      </div>
    </a>
  );
}

/** The same thing as a wide row: board on the leading side. */
export function ContinueRow({ s, className }: { s: MockSession; className?: string }) {
  return (
    <a
      href="#"
      className={cn(
        "group grid grid-cols-[104px_1fr] items-center gap-4 rounded-[20px] bg-white p-2 outline-none transition-[box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-(--lp-sky) sm:grid-cols-[168px_1fr_auto] sm:gap-5 sm:pe-5",
        RING,
        RING_HOVER,
        className,
      )}
    >
      <Thumb s={s} sizes="200px" className="aspect-[4/3] rounded-[12px]" />
      <div className="min-w-0 py-1">
        <PausedLine s={s} />
        <p className="lp-display m-0 mt-1 truncate text-[18px] text-(--lp-ink)">{s.title}</p>
        <p className="m-0 mt-1 line-clamp-2 text-[14.5px] leading-snug text-(--lp-ink-2)">&ldquo;{s.lastLine}&rdquo;</p>
      </div>
      <span className="lp-btn lp-btn-lift lp-btn-sm col-span-2 sm:col-span-1">Resume</span>
    </a>
  );
}

export function WeekPanel({ className }: { className?: string }) {
  return (
    <Panel title="This week" action={<span className="text-[12.5px] text-(--lp-ink-3) tabular-nums">5 of 7 days</span>} className={className}>
      <p className="lp-display m-0 mt-1.5 text-[28px] leading-none text-(--lp-ink) tabular-nums">
        {Math.floor(WEEK_MINUTES / 60)} h {WEEK_MINUTES % 60} min
      </p>
      <WeekBars className="mt-4" height={56} />
    </Panel>
  );
}

export function MemoryPanel({ limit = 4, className }: { limit?: number; className?: string }) {
  return (
    <Panel
      title="Your tutor remembers"
      action={
        <a href="#" className="text-[12.5px] font-medium text-(--lp-ink-2) underline-offset-4 hover:text-(--lp-ink) hover:underline">
          Edit
        </a>
      }
      className={className}
    >
      <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
        {NOTES.slice(0, limit).map((n) => (
          <li key={n} className="text-[14.5px] leading-snug text-(--lp-ink)">
            {n}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const STATE_LABEL: Record<TopicState, string> = { got: "Got it", practicing: "Practicing", next: "Up next", new: "New" };

export function TopicsPanel({ className }: { className?: string }) {
  const next = TOPICS.find((t) => t.state === "next");
  return (
    <Panel title="Where you are" className={className}>
      <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
        {TOPICS.filter((t) => t.state !== "new").map((t) => (
          <li key={t.name} className="flex items-baseline justify-between gap-3 text-[14.5px] text-(--lp-ink)">
            <span className="min-w-0 truncate">{t.name}</span>
            <span className={cn("shrink-0 text-[12.5px]", t.state === "next" ? "font-medium text-(--lp-sky-deep)" : "text-(--lp-ink-3)")}>{STATE_LABEL[t.state]}</span>
          </li>
        ))}
      </ul>
      {next && (
        <a href="#" className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-semibold text-(--lp-ink) underline-offset-4 hover:underline">
          Practice {next.name}
          <ArrowRight className="size-3.5" strokeWidth={2} />
        </a>
      )}
    </Panel>
  );
}

export function EarlierList({ items, columns = 1, className }: { items: MockSession[]; columns?: 1 | 2; className?: string }) {
  return (
    <ul className={cn("m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-x-10 p-0", columns === 2 && "sm:grid-cols-[repeat(2,minmax(0,1fr))]", className)}>
      {items.map((s) => (
        <li key={s.id} className="border-b border-(--lp-line)">
          <a href="#" className="group flex items-center gap-3.5 py-3 outline-none">
            <Thumb s={s} tiny className="aspect-[4/3] w-12 shrink-0 rounded-[6px]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium text-(--lp-ink) underline-offset-4 group-hover:underline group-focus-visible:underline">{s.title}</span>
              <span className="block truncate text-[13px] text-(--lp-ink-3)">{s.rule}</span>
            </span>
            <span className="shrink-0 text-[13px] text-(--lp-ink-3) tabular-nums">
              {s.day}, {s.minutes} min
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The one-line context the tutor already keeps in the student's profile. */
export function ContextLine({ text, className, onShader }: { text: string; className?: string; onShader?: boolean }) {
  return (
    <p className={cn("m-0 text-[14px]", onShader ? "text-(--lp-ink)/70" : "text-(--lp-ink-2)", className)}>
      Working on {text.charAt(0).toLowerCase() + text.slice(1)}
    </p>
  );
}
