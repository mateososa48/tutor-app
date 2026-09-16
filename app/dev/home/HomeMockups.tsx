"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { MOCKUPS } from "./mockups";
import { RISE_CSS } from "./parts";

export default function HomeMockups() {
  const params = useSearchParams();
  const router = useRouter();
  const n = MOCKUPS.length;
  const v = Math.min(n, Math.max(1, Number(params.get("v")) || 1));
  const shot = params.get("shot") === "1";

  useEffect(() => {
    const go = (next: number) => router.replace(`/dev/home?v=${((next - 1 + n) % n) + 1}`, { scroll: false });
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") go(v + 1);
      if (e.key === "ArrowLeft") go(v - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, router, v]);

  const { Component, name } = MOCKUPS[v - 1];
  const href = (next: number) => `/dev/home?v=${((next - 1 + n) % n) + 1}`;

  return (
    <AppShell defaultOpen>
      <style>{RISE_CSS}</style>
      <Component key={v} />
      {!shot && (
        <nav
          aria-label="Mockups"
          className="fixed top-16 left-1/2 z-50 flex md:top-auto md:bottom-4 -translate-x-1/2 items-center gap-0.5 rounded-[14px] bg-(--lp-ink) p-1 text-[13px] text-white shadow-[0_10px_30px_-6px_rgba(18,18,21,0.45)]"
        >
          <button type="button" aria-label="Previous mockup" onClick={() => router.replace(href(v - 1), { scroll: false })} className="grid size-9 place-items-center rounded-[10px] transition-colors hover:bg-white/10">
            <ChevronLeft className="size-4" />
          </button>
          <span className="px-2 whitespace-nowrap">
            <span className="text-white/45 tabular-nums">{v} of {n}</span>
            <span className="ml-2 font-medium">{name}</span>
          </span>
          <button type="button" aria-label="Next mockup" onClick={() => router.replace(href(v + 1), { scroll: false })} className="grid size-9 place-items-center rounded-[10px] transition-colors hover:bg-white/10">
            <ChevronRight className="size-4" />
          </button>
        </nav>
      )}
    </AppShell>
  );
}
