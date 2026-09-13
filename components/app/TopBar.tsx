"use client";

import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// The one header every app page shares: sidebar toggle, then whatever the
// page wants on the left, actions on the right. 52px, hairline below.
export function TopBar({ children, actions, className }: { children?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex h-[52px] shrink-0 items-center gap-3 border-b border-(--lp-line) bg-white px-3", className)}>
      <SidebarTrigger className="size-8 text-(--lp-ink-2) hover:text-(--lp-ink)" />
      <Separator orientation="vertical" className="h-5! self-center" />
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
