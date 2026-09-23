"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MotionConfig } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { DIRECTIONS } from "./directions";

export default function SummaryMockups() {
  const params = useSearchParams();
  const router = useRouter();
  const n = DIRECTIONS.length;
  const v = Math.min(n, Math.max(1, Number(params.get("v")) || 1));
  const shot = params.get("shot") === "1";
  const href = (next: number) => `/dev/summary?v=${((next - 1 + n) % n) + 1}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A layout that uses the arrows itself (the chapter bar) claims them.
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.closest("[role=tablist]"))) return;
      if (e.key === "ArrowRight") router.replace(href(v + 1), { scroll: false });
      if (e.key === "ArrowLeft") router.replace(href(v - 1), { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  const { Component, name } = DIRECTIONS[v - 1];

  return (
    <AppShell defaultOpen>
      <MotionConfig reducedMotion="user">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Component key={v} />
        </div>
      </MotionConfig>
      {!shot && (
        <nav
          aria-label="Layouts"
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-[14px] bg-(--lp-ink) p-1 text-[13px] text-white shadow-[0_10px_30px_-6px_rgba(18,18,21,0.45)]"
        >
          <button type="button" aria-label="Previous layout" onClick={() => router.replace(href(v - 1), { scroll: false })} className="grid size-9 place-items-center rounded-[10px] transition-colors hover:bg-white/10">
            <ChevronLeft className="size-4" />
          </button>
          <span className="px-2 whitespace-nowrap">
            <span className="text-white/55 tabular-nums">
              {v} of {n}
            </span>
            <span className="ml-2 font-medium">{name}</span>
          </span>
          <button type="button" aria-label="Next layout" onClick={() => router.replace(href(v + 1), { scroll: false })} className="grid size-9 place-items-center rounded-[10px] transition-colors hover:bg-white/10">
            <ChevronRight className="size-4" />
          </button>
        </nav>
      )}
    </AppShell>
  );
}
