"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Slider } from "@base-ui/react/slider";
import { Check, Copy, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useReduce } from "./useScript";

// The chrome and controls shared by the page's tuners (the hero's shader and
// the line tuner): one draggable liquid-glass panel, one set of rows. These are
// development instruments, not product surfaces.

export const PANEL_W = 320;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// The header's liquid glass: bright top edge, faint lower edge, a hairline and a soft drop.
const GLASS_SHADOW =
  "inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(255,255,255,0.35), 0 0 0 1px rgba(18,18,21,0.08), 0 18px 48px rgba(18,18,21,0.16), 0 2px 6px rgba(18,18,21,0.08)";

function place(at: { x: number; y: number }) {
  const h = Math.min(660, window.innerHeight - 24);
  return {
    x: clamp(at.x + 14, 12, window.innerWidth - PANEL_W - 12),
    y: clamp(at.y - 24, 12, window.innerHeight - h - 12),
  };
}

export function TunerPanel({
  title,
  hint = "Drag to move. Esc closes.",
  at,
  onReset,
  onCopy,
  onClose,
  children,
}: {
  title: string;
  hint?: string;
  at: { x: number; y: number };
  onReset: () => void;
  /** Returns the text to put on the clipboard. */
  onCopy: () => string;
  onClose: () => void;
  children: ReactNode;
}) {
  const reduce = useReduce();
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => place(at));
  const [copied, setCopied] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // The parent passes a new onClose on every change; read it through a ref so
  // this runs once. Re-running it moved focus off a slider after each step.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(onCopy());
      setCopied(true);
    } catch {
      // Clipboard blocked: nothing to show.
    }
  };

  const target = document.querySelector<HTMLElement>(".lp") ?? document.body;

  return createPortal(
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="glass fixed z-50 flex flex-col overflow-hidden rounded-[20px] text-(--lp-ink) outline-none"
      style={{
        left: pos.x,
        top: pos.y,
        width: PANEL_W,
        maxHeight: "min(660px, calc(100dvh - 24px))",
        transformOrigin: "top left",
        background: "rgba(255,255,255,0.6)",
        boxShadow: GLASS_SHADOW,
      }}
    >
      {/* The glass's light, as on the header: a soft highlight from the top left. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(120%_70%_at_0%_0%,rgba(255,255,255,0.7),transparent_55%)]"
      />

      <div
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setPos({
            x: clamp(e.clientX - d.dx, 80 - PANEL_W, window.innerWidth - 80),
            y: clamp(e.clientY - d.dy, 8, window.innerHeight - 48),
          });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        className="relative flex cursor-grab touch-none items-center gap-1 border-b border-white/60 py-2.5 pr-2 pl-4 select-none active:cursor-grabbing"
      >
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[13px] font-semibold">{title}</p>
          <p className="m-0 text-[11.5px] text-(--lp-ink-2)">{hint}</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Reset to the shipped look" title="Reset" onClick={onReset}>
          <RotateCcw />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Copy values" title="Copy values" onClick={copy}>
          {copied ? <Check className="text-(--lp-sky-deep)" /> : <Copy />}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Close" title="Close" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4 [scrollbar-width:thin] [scrollbar-color:rgba(18,18,21,0.18)_transparent]">
        {children}
        <p className="m-0 mt-4 text-[11.5px] leading-[1.45] text-(--lp-ink-2)">
          Saved in this browser only. Reset brings back the shipped look.
        </p>
      </div>
    </motion.div>,
    target,
  );
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="m-0 mb-1 text-[12px] font-semibold text-(--lp-ink)">{title}</h3>
      {children}
    </section>
  );
}

export function Range({
  label,
  value,
  min,
  max,
  step,
  format,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className={cn("py-1", disabled && "pointer-events-none opacity-45")}>
      <div className="flex items-baseline justify-between text-[12.5px]">
        <span className="text-(--lp-ink-2)">{label}</span>
        <span className="font-medium tabular-nums">{format(value)}</span>
      </div>
      <Slider.Root value={value} min={min} max={max} step={step} disabled={disabled} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}>
        <Slider.Control className="relative flex h-6 w-full cursor-pointer touch-none items-center px-2 select-none">
          <Slider.Track className="relative h-1 w-full rounded-full bg-(--lp-ink)/10">
            <Slider.Indicator className="rounded-full bg-(--lp-sky)" />
            <Slider.Thumb
              getAriaLabel={() => label}
              className="size-4 rounded-full bg-white shadow-[0_0_0_1px_rgba(18,18,21,0.1),0_1px_3px_rgba(18,18,21,0.2)] outline-none transition-[scale] duration-150 has-[input:focus-visible]:shadow-[0_0_0_4px_var(--lp-sky-glow),0_1px_3px_rgba(18,18,21,0.2)] data-[dragging]:scale-110 motion-reduce:transition-none"
            />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex w-full cursor-pointer items-center justify-between py-1.5 text-[12.5px] outline-none"
    >
      <span className="text-(--lp-ink-2)">{label}</span>
      <span
        className={cn(
          "relative h-[18px] w-[30px] rounded-full transition-colors duration-200 group-focus-visible:ring-3 group-focus-visible:ring-(--lp-sky-glow)",
          checked ? "bg-(--lp-sky)" : "bg-(--lp-ink)/15",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] left-[2px] size-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(18,18,21,0.2)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            checked && "translate-x-3",
          )}
        />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="grid gap-1 rounded-[10px] bg-(--lp-ink)/[0.06] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "h-7 cursor-pointer rounded-[7px] text-[12.5px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
            value === v ? "bg-white text-(--lp-ink) shadow-[0_1px_2px_rgba(18,18,21,0.12)]" : "text-(--lp-ink-2) hover:text-(--lp-ink)",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** A colour row. `value` and the change are plain `#rrggbb`. */
export function Swatch({ label, value, disabled = false, onChange }: { label: string; value: string; disabled?: boolean; onChange: (hex: string) => void }) {
  return (
    <label className={cn("flex items-center justify-between py-1.5 text-[12.5px]", disabled && "opacity-45")}>
      <span className="text-(--lp-ink-2)">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-[11.5px] uppercase tabular-nums">{value}</span>
        <span
          className="relative size-6 overflow-hidden rounded-[7px] shadow-[inset_0_0_0_1px_rgba(18,18,21,0.12)] focus-within:ring-3 focus-within:ring-(--lp-sky-glow)"
          style={{ background: value }}
        >
          <input
            type="color"
            value={value}
            disabled={disabled}
            aria-label={`${label} color`}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </span>
      </span>
    </label>
  );
}
