"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// A quiet page header for pages that need one (settings, a paused or ended
// session). The sidebar carries its own toggle, so nothing sits here but the
// page's content and its actions.
export function TopBar({ children, actions, className }: { children?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex h-[52px] shrink-0 items-center gap-3 border-b border-(--lp-line) bg-white px-5", className)}>
      <div className="flex min-w-0 flex-1 items-center gap-3 text-[13.5px]">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-[7px] shrink-0 rounded-full bg-(--lp-live)", className)}
      style={{ animation: "live-pulse 2.2s cubic-bezier(0.22,1,0.36,1) infinite" }}
    />
  );
}
