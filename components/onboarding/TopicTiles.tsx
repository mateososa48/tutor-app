"use client";

import { useRef, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import type { StagedLesson } from "@/lib/staged-lessons";
import { cn } from "@/lib/utils";

// The lessons, as things to pick. A tile carries the emoji in its own tinted
// square, the topic, and what you will actually do, because "Fractions" alone
// does not tell a 12-year-old whether it is the one they are stuck on.
//
// A radio group, like the grade chips: arrows and Home/End move the selection
// with a roving tabindex, so the keyboard gets native radio behaviour.

export function TopicTiles({
  lessons,
  value,
  onChange,
  labelledBy,
  columns = 2,
  className,
}: {
  lessons: readonly StagedLesson[];
  value: string | null;
  onChange: (key: string) => void;
  labelledBy: string;
  columns?: 1 | 2;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = lessons.findIndex((l) => l.key === value);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = lessons.length - 1;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = index === 0 ? last : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(lessons[next].key);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={cn("grid gap-2", columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1", className)}
    >
      {lessons.map((lesson, index) => {
        const checked = lesson.key === value;
        const tabbable = selected === -1 ? index === 0 : checked;
        return (
          <button
            key={lesson.key}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onChange(lesson.key)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "group flex min-h-[68px] items-center gap-3 rounded-[14px] border p-3 text-left outline-none",
              "transition-[background-color,border-color,scale] duration-150 ease-out active:scale-[0.96]",
              "focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
              "motion-reduce:transition-none motion-reduce:active:scale-100",
              checked
                ? "border-(--lp-sky) bg-(--lp-sky-soft)"
                : "border-(--lp-line-strong) bg-white hover:border-(--lp-ink)/30",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-[10px] text-[20px] leading-none transition-colors duration-150 motion-reduce:transition-none",
                checked ? "bg-white" : "bg-(--lp-gray) group-hover:bg-(--lp-gray-2)",
              )}
            >
              {lesson.emoji}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-semibold leading-[1.25] text-(--lp-ink)">{lesson.label}</span>
              <span className="mt-0.5 text-[12.5px] leading-[1.35] text-(--lp-ink-2)">{lesson.blurb}</span>
            </span>
            <Check
              aria-hidden
              strokeWidth={2.5}
              className={cn(
                "size-4 shrink-0 text-(--lp-sky-deep) transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
                checked ? "scale-100 opacity-100 blur-none" : "scale-[0.25] opacity-0 blur-[4px]",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
