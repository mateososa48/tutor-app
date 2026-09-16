"use client";

import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { Pencil } from "lucide-react";
import { ChalkMark } from "@/components/app/ChalkMark";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { WEEK, type MockSession, type Shot } from "./data";

// Shared pieces for the /dev/home mockups.

// A hairline ring and a soft lift as one shadow (better-ui "shadow as border"),
// tinted with the brand ink instead of pure black.
export const RING = "shadow-[0_0_0_1px_rgba(18,18,21,0.07),0_1px_2px_-1px_rgba(18,18,21,0.08),0_2px_4px_0_rgba(18,18,21,0.04)]";
export const RING_HOVER = "hover:shadow-[0_0_0_1px_rgba(18,18,21,0.12),0_2px_4px_-1px_rgba(18,18,21,0.1),0_8px_18px_-4px_rgba(18,18,21,0.1)]";
export const RING_GROUP_HOVER = "group-hover:shadow-[0_0_0_1px_rgba(18,18,21,0.12),0_2px_4px_-1px_rgba(18,18,21,0.1),0_8px_18px_-4px_rgba(18,18,21,0.1)]";

/** The board's dot grid. */
export const DOTS: CSSProperties = {
  backgroundImage: "radial-gradient(rgba(18, 18, 21, 0.13) 1px, transparent 1.4px)",
  backgroundSize: "22px 22px",
};

/** A photograph of a real board. The full session board is mostly empty on the right, so it is zoomed onto its content. */
export function BoardShot({
  shot,
  alt = "",
  className,
  sizes = "(max-width: 768px) 100vw, 520px",
  zoom,
  position,
  priority,
  dark,
}: {
  shot: Shot;
  alt?: string;
  className?: string;
  sizes?: string;
  zoom?: number;
  position?: string;
  priority?: boolean;
  dark?: boolean;
}) {
  const wide = shot.src.includes("session-board");
  const z = zoom ?? (wide ? 1.7 : 1);
  const pos = position ?? (wide ? "0% 12%" : "30% 30%");
  return (
    <div className={cn("relative overflow-hidden bg-white", className)}>
      <Image
        src={shot.src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
        style={{ objectPosition: pos, transform: z !== 1 ? `scale(${z})` : undefined, transformOrigin: pos }}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit]",
          dark ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]" : "shadow-[inset_0_0_0_1px_rgba(18,18,21,0.08)]",
        )}
      />
    </div>
  );
}

/** A session without a board photo: its title handwritten on the dot grid. */
export function BoardPlaceholder({ title, className, tiny }: { title: string; className?: string; tiny?: boolean }) {
  return (
    <div className={cn("relative flex items-center overflow-hidden bg-white", tiny ? "justify-center" : "px-4", className)} style={tiny ? { ...DOTS, backgroundSize: "9px 9px" } : DOTS}>
      {tiny ? <ChalkMark size={16} color="rgba(18,18,21,0.25)" /> : <span className="lp-hand line-clamp-2 text-[17px] leading-snug text-(--lp-ink-2)">{title}</span>}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_rgba(18,18,21,0.08)]" />
    </div>
  );
}

export function Thumb({
  s,
  className,
  dark,
  tiny,
  sizes = "160px",
  zoom,
  position,
}: {
  s: MockSession;
  className?: string;
  dark?: boolean;
  /** A very small thumbnail: untitled boards show the dot grid alone. */
  tiny?: boolean;
  sizes?: string;
  zoom?: number;
  position?: string;
}) {
  return s.shot ? (
    <BoardShot shot={s.shot} className={className} dark={dark} sizes={sizes} zoom={zoom} position={position} />
  ) : (
    <BoardPlaceholder title={s.title} className={className} tiny={tiny} />
  );
}

/** The board's highlighter behind a few words: yellow look here, green right, blue the step we are on. */
export function Highlight({ children, tone = "yellow" }: { children: ReactNode; tone?: "yellow" | "green" | "blue" }) {
  const c = tone === "yellow" ? "rgba(255, 214, 10, 0.45)" : tone === "green" ? "rgba(52, 199, 89, 0.3)" : "rgba(61, 156, 255, 0.28)";
  return (
    <span
      className="box-decoration-clone rounded-[3px] px-[0.1em]"
      style={{ backgroundImage: `linear-gradient(transparent 40%, ${c} 40%, ${c} 92%, transparent 92%)` }}
    >
      {children}
    </span>
  );
}

/** The tutor's pen and name tag, as it appears on the board. */
export function TutorPen({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("relative inline-flex translate-y-1 flex-col items-start align-baseline", className)}>
      <Pencil className="size-[22px] fill-(--lp-sky) text-white drop-shadow-[0_1px_1px_rgba(18,18,21,0.3)]" strokeWidth={1.5} />
      <span className="-mt-0.5 ml-3 rounded-[5px] bg-(--lp-sky-deep) px-1.5 font-sans text-[11px] leading-[17px] font-bold tracking-normal text-white">
        Tutor
      </span>
    </span>
  );
}

/** Phones: the sidebar is a sheet, so each mockup carries a small bar to open it. */
export function MobileBar({ dark }: { dark?: boolean }) {
  return (
    <div
      className={cn(
        "sticky top-0 z-20 flex h-13 items-center gap-1.5 px-2 md:hidden",
        dark ? "bg-(--lp-ink) text-[#ececef]" : "bg-white/85 text-(--lp-ink) backdrop-blur-md",
      )}
    >
      <SidebarTrigger className="size-10" />
      <ChalkMark size={20} />
      <span className="lp-brand text-[18px] leading-none">chalk</span>
    </div>
  );
}

export function IconButton({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-[10px] text-(--lp-ink-2) transition-[background-color,color,scale] duration-150 ease-out outline-none hover:bg-(--lp-gray) hover:text-(--lp-ink) focus-visible:ring-2 focus-visible:ring-(--lp-sky) active:scale-[0.96] [&_svg]:size-5",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Minutes per day for the last week. Bars only where there was a session; no track behind them. */
export function WeekBars({ dark, height = 72, className }: { dark?: boolean; height?: number; className?: string }) {
  const max = Math.max(1, ...WEEK.map((d) => d.minutes));
  return (
    <div className={cn("grid grid-cols-7 gap-2", className)}>
      {WEEK.map((d, i) => {
        const today = i === WEEK.length - 1;
        return (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="flex w-full items-end" style={{ height }}>
              {d.minutes > 0 ? (
                <div
                  title={`${d.minutes} min`}
                  className={cn(
                    "w-full rounded-[4px]",
                    dark ? (today ? "bg-white" : "bg-white/40") : today ? "bg-(--lp-sky-deep)" : "bg-(--lp-sky)",
                  )}
                  style={{ height: `${Math.max(10, (d.minutes / max) * 100)}%` }}
                />
              ) : (
                <div className={cn("h-[3px] w-full rounded-full", dark ? "bg-white/15" : "bg-(--lp-line-strong)")} />
              )}
            </div>
            <span className={cn("text-[11px] tabular-nums", dark ? "text-white/45" : "text-(--lp-ink-3)", today && (dark ? "text-white" : "font-semibold text-(--lp-ink)"))}>
              {d.day}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A staged entrance for the first view (better-ui split and stagger): 100ms apart, only with motion allowed. */
export function Rise({ children, i = 0, className, style }: { children: ReactNode; i?: number; className?: string; style?: CSSProperties }) {
  return (
    <div className={cn("home-rise", className)} style={{ "--i": i, ...style } as CSSProperties}>
      {children}
    </div>
  );
}

export const RISE_CSS = `
@media (prefers-reduced-motion: no-preference) {
  @keyframes home-rise { from { opacity: 0; transform: translateY(12px); filter: blur(4px); } }
  .home-rise { animation: home-rise 400ms cubic-bezier(0.2, 0, 0, 1) both; animation-delay: calc(var(--i, 0) * 100ms); }
  @keyframes home-swap { from { opacity: 0; filter: blur(4px); } }
  .home-swap { animation: home-swap 220ms cubic-bezier(0.2, 0, 0, 1) both; }
}`;
