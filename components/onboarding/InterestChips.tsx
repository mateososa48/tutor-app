"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Check, Plus, X } from "lucide-react";
import { INTERESTS, INTEREST_MAX_LEN, INTERESTS_MAX, interestEmoji } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

// What they are into, as chips they can add to. Ours are suggestions, not a
// closed list: a 13-year-old whose whole life is skateboarding or K-pop
// should not have to pick "Sports" instead, so "Add your own" writes a chip
// that behaves exactly like the rest.
//
// Multi-select, so these are toggle buttons rather than a radio group.
// At the cap the unchosen ones go quiet instead of disappearing, so the
// limit is visible rather than surprising.

export function InterestChips({
  value,
  onChange,
  className,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const full = value.length >= INTERESTS_MAX;
  const chosen = new Set(value.map((v) => v.toLowerCase()));
  // Ours first, then anything they typed, so the row does not reshuffle.
  const theirs = value.filter((v) => !INTERESTS.some((i) => i.label.toLowerCase() === v.toLowerCase()));

  function toggle(label: string) {
    if (chosen.has(label.toLowerCase())) onChange(value.filter((v) => v.toLowerCase() !== label.toLowerCase()));
    else if (!full) onChange([...value, label]);
  }

  function commit() {
    const label = draft.replace(/\s+/g, " ").trim().slice(0, INTEREST_MAX_LEN);
    setDraft("");
    if (!label || full || chosen.has(label.toLowerCase())) {
      setAdding(false);
      return;
    }
    onChange([...value, label]);
    // Straight into the next one: adding two is as likely as adding one.
    if (value.length + 1 < INTERESTS_MAX) inputRef.current?.focus();
    else setAdding(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft("");
      setAdding(false);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
      {INTERESTS.map(({ label, emoji }) => {
        const on = chosen.has(label.toLowerCase());
        return (
          <Chip
            key={label}
            emoji={emoji}
            label={label}
            selected={on}
            disabled={full && !on}
            onClick={() => toggle(label)}
          />
        );
      })}

      {theirs.map((label) => (
        <Chip key={label} emoji={interestEmoji(label)} label={label} selected own onClick={() => toggle(label)} />
      ))}

      {adding ? (
        <span className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border border-(--lp-sky) bg-white pr-1 pl-3 ring-3 ring-(--lp-sky-glow)">
          <span aria-hidden className="text-[16px] leading-none">
            ✨
          </span>
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            maxLength={INTEREST_MAX_LEN}
            aria-label="Something else you're into"
            // Not a real example: after adding one, a placeholder that named
            // a thing read as a second, ghostly copy of the chip just made.
            placeholder="Type anything"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            className="w-[124px] bg-transparent text-[14px] font-medium text-(--lp-ink) outline-none placeholder:text-(--lp-ink-3)"
          />
          <button
            type="button"
            aria-label="Cancel"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setDraft("");
              setAdding(false);
            }}
            className="grid size-11 place-items-center rounded-[8px] text-(--lp-ink-3) outline-none transition-colors duration-150 hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
          >
            <X className="size-4" strokeWidth={2.25} aria-hidden />
          </button>
        </span>
      ) : (
        !full && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(
              "inline-flex h-11 items-center gap-1.5 rounded-[10px] border border-dashed border-(--lp-line-strong) px-3.5 text-[14px] font-medium text-(--lp-ink-2) outline-none",
              "transition-[border-color,color,scale] duration-150 ease-out active:scale-[0.96]",
              "hover:border-(--lp-ink)/30 hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
              "motion-reduce:transition-none motion-reduce:active:scale-100",
            )}
          >
            <Plus className="size-4" strokeWidth={2.25} aria-hidden />
            Add your own
          </button>
        )
      )}
      </div>
      {/* At the cap the rest go quiet, which needs saying rather than leaving
          them to wonder why a chip stopped answering. */}
      {full && (
        <p className="m-0 mt-2.5 text-[13px] leading-[1.45] text-(--lp-ink-2)" role="status">
          Six is plenty. Take one off to swap in another.
        </p>
      )}
    </div>
  );
}

function Chip({
  emoji,
  label,
  selected,
  disabled = false,
  own = false,
  onClick,
}: {
  emoji: string;
  label: string;
  selected: boolean;
  disabled?: boolean;
  own?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-[10px] border px-3.5 text-[14px] font-medium outline-none",
        "transition-[background-color,border-color,opacity,scale] duration-150 ease-out active:scale-[0.96]",
        "focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        selected
          ? "border-(--lp-sky) bg-(--lp-sky-soft) text-(--lp-ink)"
          : "border-(--lp-line-strong) bg-white text-(--lp-ink) hover:border-(--lp-ink)/30",
        disabled && "opacity-55 hover:border-(--lp-line-strong)",
      )}
    >
      <span aria-hidden className="text-[16px] leading-none">
        {emoji}
      </span>
      {label}
      {own ? (
        <X aria-hidden strokeWidth={2.5} className="size-3.5 text-(--lp-sky-deep)" />
      ) : (
        <Check
          aria-hidden
          strokeWidth={2.5}
          className={cn(
            "size-3.5 text-(--lp-sky-deep) transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
            selected ? "scale-100 opacity-100 blur-none" : "hidden",
          )}
        />
      )}
    </button>
  );
}
