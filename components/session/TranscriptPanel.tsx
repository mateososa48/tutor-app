"use client";

import { useEffect, useMemo, useRef } from "react";
import type { TranscriptEntry } from "@/lib/live-types";
import { cn } from "@/lib/utils";

// Two voices, read like a script: consecutive lines from one speaker are
// grouped under a single label, the student's words sit in a soft chip so
// they are distinguishable without avatars, and the list follows new lines
// only when the reader is already at the bottom.

type Group = { role: "tutor" | "student"; entries: TranscriptEntry[] };

function groupTurns(entries: TranscriptEntry[]): Group[] {
  const groups: Group[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.role === entry.role) last.entries.push(entry);
    else groups.push({ role: entry.role, entries: [entry] });
  }
  return groups;
}

export function TranscriptList({ transcript, emptyText = "Nothing said yet." }: { transcript: TranscriptEntry[]; emptyText?: string }) {
  const groups = useMemo(() => groupTurns(transcript), [transcript]);
  return (
    <>
      {groups.length === 0 ? (
        <p className="pt-2 text-[13px] text-(--lp-ink-3)">{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-5">
        {groups.map((group, i) => (
            <div key={`${group.role}-${group.entries[0].id}-${i}`}>
              <div className="mb-1.5 text-[11px] font-semibold tracking-[0.04em] text-(--lp-ink-3)">
                {group.role === "tutor" ? "Tutor" : "You"}
              </div>
              <div className="flex flex-col gap-1.5">
                {group.entries.map((entry) =>
                  group.role === "tutor" ? (
                    <p key={entry.id} className="m-0 text-[14px] leading-[1.55] text-(--lp-ink)">
                      {entry.text}
                    </p>
                  ) : (
                    <p key={entry.id} className="m-0 w-fit max-w-full rounded-[12px] bg-(--lp-gray) px-3 py-1.5 text-[14px] leading-[1.5] text-(--lp-ink-2)">
                      {entry.text}
                    </p>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function TranscriptPanel({
  transcript,
  live,
  emptyText = "Nothing said yet.",
  className,
}: {
  transcript: TranscriptEntry[];
  live: boolean;
  emptyText?: string;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-(--lp-line) px-5">
        <span className="text-[13px] font-semibold text-(--lp-ink)">Transcript</span>
        {live && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.04em] text-(--lp-live) uppercase">
            <span className="size-1.5 rounded-full bg-(--lp-live)" style={{ animation: "live-pulse 2.2s ease-out infinite" }} />
            Live
          </span>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:thin] [scrollbar-color:rgba(18,18,21,0.18)_transparent]"
      >
        <TranscriptList transcript={transcript} emptyText={emptyText} />
      </div>
    </div>
  );
}
