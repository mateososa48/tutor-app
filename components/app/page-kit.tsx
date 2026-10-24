"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// The parts every page in the sheet is built from (Oct 2026, Paper design
// system "Surfaces"): a centred column, a header of a small line over a
// display title, white cards drawn in hairlines, and settings rows. Depth is
// hairlines, never shadows; corners are 20px on cards, 12px inside them.

export const CARD = "rounded-[20px] border border-(--lp-line) bg-white";
/** The divider between rows inside a card: lighter than the card's own edge. */
export const ROW_LINE = "border-(--lp-line)/60";

export function PageBody({ children, width = "narrow", className }: { children: ReactNode; width?: "narrow" | "wide"; className?: string }) {
  return (
    <div className="page-in min-h-0 flex-1 overflow-y-auto">
      <div
        className={cn(
          "mx-auto w-full px-5 pt-8 pb-24 sm:px-10 sm:pt-11",
          width === "narrow" ? "max-w-[820px]" : "max-w-[1120px]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-8 gap-y-4", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="m-0 mb-1.5 text-[13px] text-(--lp-ink-2)">{eyebrow}</p>}
        <h1 className="lp-display m-0 text-[30px] leading-[1.12] font-medium text-balance text-(--lp-ink) sm:text-[34px]">{title}</h1>
        {lede && <p className="m-0 mt-2.5 max-w-[60ch] text-[15px] leading-[1.55] text-pretty text-(--lp-ink-2)">{lede}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A white card. Its header is optional; content brings its own padding. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = useId();
  return (
    <section id={id} aria-labelledby={title ? headingId : undefined} className={cn(CARD, "scroll-mt-6", className)}>
      {title && (
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-1 sm:px-6">
          <div className="min-w-0">
            <h2 id={headingId} className="m-0 text-[16px] leading-[1.3] font-semibold text-(--lp-ink)">
              {title}
            </h2>
            {description && <p className="m-0 mt-1 text-[13.5px] leading-[1.5] text-(--lp-ink-2)">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A quiet text action in a card's header ("See all"). */
export function PanelLink({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const cls =
    "inline-flex min-h-8 items-center rounded-[8px] px-2 -mr-2 text-[13px] font-medium text-(--lp-ink-2) outline-none transition-colors duration-150 hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)";
  if (href)
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  return (
    <button type="button" onClick={onClick} className={cn(cls, "cursor-pointer")}>
      {children}
    </button>
  );
}

/** One setting: what it is on the left, the control on the right (stacked on a phone). */
export function SettingRow({
  label,
  hint,
  children,
  htmlFor,
  stack = false,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  /** Put the control under the words at every width (wide controls). */
  stack?: boolean;
  className?: string;
}) {
  const Label = htmlFor ? "label" : "div";
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t px-5 py-4.5 first:border-t-0 sm:px-6",
        ROW_LINE,
        !stack && "sm:flex-row sm:items-center sm:justify-between sm:gap-8",
        className,
      )}
    >
      <Label {...(htmlFor ? { htmlFor } : {})} className="block min-w-0 sm:max-w-[46%]">
        <span className="block text-[14.5px] leading-[1.35] font-medium text-(--lp-ink)">{label}</span>
        {hint && <span className="mt-1 block text-[13px] leading-[1.45] text-(--lp-ink-2)">{hint}</span>}
      </Label>
      <div className={cn("min-w-0", !stack && "sm:shrink-0")}>{children}</div>
    </div>
  );
}

/**
 * A row of choices in a pill track (Paper "This week / All time"): a real
 * radio group, arrows move the choice, the chosen one sits on white.
 */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  size = "md",
  className,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    let next = index;
    if (step) next = (index + step + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    else return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      // One line always: on a narrow screen the track scrolls sideways instead of wrapping.
      className={cn("inline-flex max-w-full flex-nowrap gap-0.5 overflow-x-auto rounded-full bg-(--lp-gray) p-[3px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
    >
      {options.map((option, i) => {
        const on = option.value === value;
        return (
          <button
            key={String(option.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onKeyDown={onKey}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative shrink-0 cursor-pointer rounded-full font-medium whitespace-nowrap outline-none transition-[color,background-color,box-shadow] duration-150",
              size === "sm" ? "h-7 px-3 text-[12.5px]" : "h-8 px-3.5 text-[13px]",
              on
                ? "bg-white text-(--lp-ink) shadow-[0_0_0_1px_rgba(18,18,21,0.06),0_1px_2px_rgba(18,18,21,0.08)]"
                : "text-(--lp-ink-2) hover:text-(--lp-ink)",
              "focus-visible:shadow-[0_0_0_2px_var(--lp-sky)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A switch: sky when on. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full p-0.5 outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
        checked ? "bg-(--lp-sky-deep)" : "bg-(--lp-gray-2)",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-5 rounded-full bg-white shadow-[0_1px_2px_rgba(18,18,21,0.2)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

/** What an empty card says: plain words, and what to do about it. */
export function EmptyNote({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("px-5 pt-2 pb-6 sm:px-6", className)}>
      <p className="m-0 max-w-[52ch] text-[14.5px] leading-[1.55] text-(--lp-ink-2)">{children}</p>
      {action && <div className="mt-3.5">{action}</div>}
    </div>
  );
}

/** The quiet secondary button used inside cards. */
export const QUIET_BUTTON =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-(--lp-line-strong) bg-white px-3.5 text-[13.5px] font-medium text-(--lp-ink) outline-none transition-[background-color,scale] duration-150 hover:bg-(--lp-gray)/70 active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:active:scale-100";
/** The one dark button a card may carry. */
export const PRIMARY_BUTTON =
  "btn-gloss btn-gloss-lift inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[10px] px-4 text-[13.5px] font-medium outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) disabled:cursor-not-allowed disabled:opacity-50";

/** Three bars, 10/14/18px tall: how solid a skill is (Paper "Strength meter"). */
export function Strength({ value, label }: { value: 1 | 2 | 3; label: string }) {
  return (
    <span role="img" aria-label={label} title={label} className="flex shrink-0 items-end gap-[3px]">
      {[1, 2, 3].map((n) => (
        <span key={n} className="w-[5px] rounded-full" style={{ height: 6 + n * 4, background: n <= value ? "var(--lp-sky)" : "var(--lp-gray-2)" }} />
      ))}
    </span>
  );
}

/** One bordered strip split by 1px gaps: a label over a number (Paper "Summary"). */
export function StatStrip({ items, className }: { items: readonly { label: string; value: ReactNode; unit?: string }[]; className?: string }) {
  return (
    <dl className={cn("m-0 grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-(--lp-line) bg-(--lp-line) sm:grid-cols-4", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1.5 bg-white px-5 py-4.5 sm:px-6">
          <dt className="text-[13.5px] text-(--lp-ink-2)">{item.label}</dt>
          <dd className="m-0 flex items-baseline gap-1">
            <span className="lp-display text-[30px] leading-none font-medium text-(--lp-ink) tabular-nums">{item.value}</span>
            {item.unit && <span className="text-[15px] font-medium text-(--lp-ink-2)">{item.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
