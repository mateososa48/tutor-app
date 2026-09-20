"use client";

import { PenLine } from "lucide-react";
import { BOARD_DOTS } from "@/components/app/board-dots";
import type { BoardNote } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

// The tutor's notepad: what it has written down so far, in the handwriting
// the settings page uses for "what your tutor reads", on the same dotted
// board. A new line wipes in from the left (the settings page's clip-path);
// lines are keyed by their label, so a name being typed updates in place
// instead of rewriting itself on every keystroke.

const UI_FONT = { fontFamily: "var(--lp-font-body), system-ui, sans-serif" } as const;

export function TutorNotesBoard({ notes, className }: { notes: BoardNote[]; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[20px] border border-(--lp-line-strong) bg-white", className)}>
      <div className="flex h-12 items-center gap-2 border-b border-(--lp-line) px-5">
        <PenLine aria-hidden className="size-4 text-(--lp-sky)" strokeWidth={2.25} />
        <h2 className="m-0 text-[13.5px] font-medium text-(--lp-ink)">Your tutor&apos;s notes</h2>
      </div>
      <div className="min-h-[172px] px-5 pt-4 pb-5" style={BOARD_DOTS}>
        {notes.length === 0 ? (
          <p className="lp-hand m-0 text-[16px] leading-[1.4] text-(--lp-ink-2)">I&apos;ll jot things down here as we go.</p>
        ) : (
          <ul className="lp-hand m-0 flex list-none flex-col gap-3 p-0 text-[16px] leading-[1.4] text-(--lp-ink)">
            {notes.map((note, index) => (
              <li
                key={note.label}
                className="transition-[clip-path,opacity] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] starting:opacity-40 starting:[clip-path:inset(0_100%_0_0)] motion-reduce:transition-none"
                style={{ transitionDelay: `${index * 40}ms` }}
              >
                <span className="block text-[12px] text-(--lp-ink-2)" style={UI_FONT}>
                  {note.label}
                </span>
                <span className="block">{note.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
