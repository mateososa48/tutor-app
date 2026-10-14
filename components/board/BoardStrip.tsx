"use client";

import { useValue, type Editor } from "tldraw";
import { ArrowRight } from "lucide-react";
import { ARCHIVE_GAP } from "@/lib/board-archive";

// The finished boards (lib/board-archive) as a small strip at the top of the
// board: one button each, a green check on the solved ones, and "Now" for the
// board in play. A finished board slid off to the left is one click away, and
// while the student looks back the board stops pulling them forward; "Back to
// now" brings them back. Shown only once a board has been turned.

export type StripEntry = { id: string; solved: boolean };

const GREEN = "#15803d";

function CheckMark() {
  return (
    <svg viewBox="0 0 22 22" width={13} height={13} aria-hidden>
      <path d="M5.5 11.8 C 6.8 13, 7.8 14.2, 9 15.8 C 11 12, 13.4 8.8, 16.8 6.4" stroke={GREEN} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function BoardStrip({ editor, entries, onNow }: { editor: Editor; entries: StripEntry[]; onNow: () => void }) {
  // Which board the view is on: a finished one (by its frame) or the one in play.
  const viewing = useValue(
    "board strip view",
    () => {
      const view = editor.getViewportPageBounds();
      const cx = view.x + view.w / 2;
      if (cx >= -ARCHIVE_GAP / 2) return "now";
      for (const entry of entries) {
        const card = editor.getShapePageBounds(entry.id as Parameters<Editor["getShapePageBounds"]>[0]);
        if (card && cx >= card.x - ARCHIVE_GAP / 2 && cx <= card.x + card.w + ARCHIVE_GAP / 2) return entry.id;
      }
      return "elsewhere";
    },
    [editor, entries],
  );
  const back = viewing !== "now";

  const goTo = (id: string) => {
    const card = editor.getShapePageBounds(id as Parameters<Editor["getShapePageBounds"]>[0]);
    if (!card) return;
    const screen = editor.getViewportScreenBounds();
    const zoom = Math.max(0.35, Math.min(1, (screen.w - 64) / card.w, (screen.h - 96) / card.h));
    editor.zoomToBounds(card, { targetZoom: zoom, inset: 32, animation: { duration: 420 } });
  };

  return (
    <nav
      aria-label="Boards"
      className="pointer-events-auto absolute left-1/2 top-4 z-[5] flex h-11 -translate-x-1/2 items-center gap-1 rounded-full border border-(--lp-line-strong) bg-white/95 p-1 shadow-(--lp-shadow-card) backdrop-blur-md max-sm:top-16"
    >
      {entries.map((entry, i) => {
        const current = viewing === entry.id;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => goTo(entry.id)}
            aria-current={current ? "true" : undefined}
            aria-label={`Board ${i + 1}${entry.solved ? ", solved" : ""}`}
            className={`flex h-9 min-w-9 items-center justify-center gap-1 rounded-full px-2.5 text-[13px] font-semibold tabular-nums transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--lp-sky) active:scale-[0.97] ${current ? "bg-(--lp-ink) text-white" : "text-(--lp-ink-2) hover:bg-black/5 hover:text-(--lp-ink)"}`}
          >
            {i + 1}
            {entry.solved ? <CheckMark /> : null}
          </button>
        );
      })}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-(--lp-line-strong)" />
      <button
        type="button"
        onClick={onNow}
        aria-current={!back ? "true" : undefined}
        className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--lp-sky) active:scale-[0.97] ${back ? "bg-(--lp-sky) text-white hover:bg-(--lp-sky-deep)" : "bg-(--lp-ink) text-white"}`}
      >
        {back ? "Back to now" : "Now"}
        {back ? <ArrowRight className="size-3.5" strokeWidth={2.5} aria-hidden /> : null}
      </button>
    </nav>
  );
}
