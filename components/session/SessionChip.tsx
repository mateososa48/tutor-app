"use client";

import { LiveDot } from "@/components/app/TopBar";

export type LiveState = "idle" | "connecting" | "active" | "ending" | "error";

// The floating title pill on the live screen: a live dot, the session title,
// the clock, and a small provider or QA tag when one applies.
export function SessionChip({
  liveState,
  title,
  elapsed,
  qaLabel,
}: {
  liveState: LiveState;
  title: string;
  elapsed: string;
  qaLabel: string | null;
}) {
  return (
    <div className="absolute top-4 left-4 z-30 flex h-9 max-w-[min(60%,520px)] items-center gap-2.5 rounded-full border border-(--lp-line-strong) bg-white/92 px-3.5 text-[13px] shadow-(--lp-shadow-card) backdrop-blur-md">
      {liveState === "active" && (
        <>
          <LiveDot />
          <span className="truncate font-medium text-(--lp-ink)">{title}</span>
          <span className="shrink-0 text-(--lp-ink-3) tabular-nums">{elapsed}</span>
          {qaLabel && <span className="shrink-0 text-[10.5px] font-bold tracking-[0.06em] text-(--lp-sky-deep) uppercase">{qaLabel}</span>}
        </>
      )}
      {(liveState === "connecting" || liveState === "idle") && <span className="text-(--lp-ink-3)">Connecting…</span>}
      {liveState === "ending" && <span className="text-(--lp-ink-3)">Ending session…</span>}
      {liveState === "error" && <span className="text-(--lp-ink-3)">Not connected</span>}
    </div>
  );
}
