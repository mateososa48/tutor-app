"use client";

import { useRef, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// A radio group drawn as chips. Arrow keys move the focus and the selection
// together (a roving tabindex), Home and End jump, so a keyboard gets native
// radio behaviour; a tap selects and stays put. The check stays in the DOM
// in both states and fades, scales and un-blurs in, so it can leave the same
// way instead of popping.

export type GridOption = { value: string; label: string; wide?: boolean };

export function OptionGrid({
  options,
  value,
  onChange,
  columns = 1,
  labelledBy,
  className,
}: {
  options: readonly GridOption[];
  value: string | null;
  onChange: (value: string) => void;
  columns?: 1 | 4;
  labelledBy: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
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
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={cn("grid gap-2", columns === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1", className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        const tabbable = selectedIndex === -1 ? index === 0 : checked;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-[10px] border px-4 text-left text-[15px] font-medium outline-none",
              "transition-[background-color,border-color,scale] duration-150 ease-out active:scale-[0.96]",
              "focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
              "motion-reduce:transition-none motion-reduce:active:scale-100",
              checked
                ? "border-(--lp-sky) bg-(--lp-sky-soft) text-(--lp-ink)"
                : "border-(--lp-line-strong) bg-white text-(--lp-ink) hover:border-(--lp-ink)/30",
              option.wide && "sm:col-span-2",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
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
