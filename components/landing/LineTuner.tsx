"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Group, Range, Segmented, Swatch, Toggle, TunerPanel } from "./tuner-parts";

// A temporary instrument for the page's structural lines: the two vertical
// rails at the container's edges and the dashed rule at the top of each white
// section, plus the hairline every card and row border is drawn in.
//
// Open it with Shift+L, or with ?lines in the URL. It only exists in
// development or on a build loaded with ?tune or ?lines, like the shader
// tuner. Everything is written as CSS variables on the `.lp` element, so the
// page changes live; Copy gives back a block that can be pasted straight into
// `globals.css` to make a setting the shipped one.

type LineStyle = "solid" | "dashed";

export type LineSettings = {
  railShow: boolean;
  railW: number;
  /** Half the width between the rails: 590 puts them on the 1180px container. */
  railInset: number;
  railColor: string;
  railAlpha: number;
  railStyle: LineStyle;
  railDash: number;
  railGap: number;
  ruleShow: boolean;
  ruleH: number;
  ruleColor: string;
  ruleAlpha: number;
  ruleStyle: LineStyle;
  ruleDash: number;
  ruleGap: number;
  /** Seconds for a dash to travel one whole period. The crawl's only dial. */
  dashSpeed: number;
  nodeShow: boolean;
  nodeSize: number;
  /** Card, row and border hairlines: `--lp-line` and `--lp-line-strong`. */
  hairColor: string;
  hairAlpha: number;
  hairStrongAlpha: number;
};

// Matches the values in globals.css, so an untouched tuner changes nothing.
export const LINES_DEFAULT: LineSettings = {
  railShow: true,
  railW: 1,
  railInset: 636,
  railColor: "#121215",
  railAlpha: 0.3,
  railStyle: "dashed",
  railDash: 12,
  railGap: 6,
  ruleShow: true,
  ruleH: 1,
  ruleColor: "#121215",
  ruleAlpha: 0.3,
  ruleStyle: "dashed",
  ruleDash: 12,
  ruleGap: 6,
  dashSpeed: 4,
  nodeShow: true,
  nodeSize: 11,
  hairColor: "#121215",
  hairAlpha: 0.09,
  hairStrongAlpha: 0.09,
};

const STORE = "chalk.lines.v1";

function load(): LineSettings | null {
  try {
    const raw = window.localStorage.getItem(STORE);
    return raw ? { ...LINES_DEFAULT, ...(JSON.parse(raw) as Partial<LineSettings>) } : null;
  } catch {
    return null;
  }
}

function save(value: LineSettings | null) {
  try {
    if (value) window.localStorage.setItem(STORE, JSON.stringify(value));
    else window.localStorage.removeItem(STORE);
  } catch {
    // Storage blocked (private window): the settings just won't persist.
  }
}

const round = (v: number) => Math.round(v * 1000) / 1000;

function rgba(hex: string, alpha: number) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return alpha >= 1 ? hex : `rgba(${r}, ${g}, ${b}, ${round(alpha)})`;
}

/** Solid is a plain colour; dashed is a repeating gradient along the line. */
function lineBackground(angle: number, color: string, style: LineStyle, dash: number, gap: number) {
  if (style === "solid" || gap <= 0) return color;
  return `repeating-linear-gradient(${angle}deg, ${color} 0 ${dash}px, transparent ${dash}px ${dash + gap}px)`;
}

/** The variables the page reads, as globals.css declares them. */
function vars(v: LineSettings): Record<string, string> {
  const rail = lineBackground(180, rgba(v.railColor, v.railAlpha), v.railStyle, v.railDash, v.railGap);
  const rule = lineBackground(90, rgba(v.ruleColor, v.ruleAlpha), v.ruleStyle, v.ruleDash, v.ruleGap);
  return {
    "--lp-rail-w": `${v.railW}px`,
    "--lp-rail-inset": `${v.railInset}px`,
    "--lp-rail-bg": v.railShow ? rail : "transparent",
    // The crawl moves the pattern by exactly one period, so it has no seam.
    "--lp-rail-period": `${v.railDash + v.railGap}px`,
    "--lp-rule-h": `${v.ruleH}px`,
    "--lp-rule-bg": v.ruleShow ? rule : "transparent",
    "--lp-rule-period": `${v.ruleDash + v.ruleGap}px`,
    "--lp-dash-speed": `${round(v.dashSpeed)}s`,
    "--lp-node-size": v.nodeShow ? `${v.nodeSize}px` : "0px",
    "--lp-node-color": rgba(v.ruleColor, v.ruleAlpha),
    // The solid version of the same ink, for lines that belong to the grid but
    // are not dashed (the feature deck's top and bottom edges).
    "--lp-rail-ink": rgba(v.ruleColor, v.ruleAlpha),
    "--lp-line": rgba(v.hairColor, v.hairAlpha),
    "--lp-line-strong": rgba(v.hairColor, v.hairStrongAlpha),
  };
}

function apply(value: LineSettings) {
  const el = document.querySelector<HTMLElement>(".lp");
  if (!el) return;
  for (const [name, v] of Object.entries(vars(value))) el.style.setProperty(name, v);
}

function asCss(v: LineSettings) {
  const entries = Object.entries(vars(v))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
  return `/* Paste into the .lp block in app/globals.css */\n.lp {\n${entries}\n}`;
}

/** Development, or any build loaded with ?tune or ?lines. Read after hydration
    only: the server cannot know the URL's query, and guessing is a mismatch. */
function allowed() {
  if (process.env.NODE_ENV !== "production") return true;
  const params = new URLSearchParams(window.location.search);
  return params.has("tune") || params.has("lines");
}

export function LineTuner() {
  // Nothing here may be read during the server's render: the URL's query and
  // this browser's saved settings are both unknowable there, and guessing at
  // them is a hydration mismatch. `enabled` gates every one of those reads.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const enabled = hydrated && allowed();
  const saved = useMemo(() => (enabled ? load() : null), [enabled]);
  const wantsOpen = useMemo(() => enabled && new URLSearchParams(window.location.search).has("lines"), [enabled]);
  const [edited, setEdited] = useState<LineSettings | null>(null);
  const [toggled, setToggled] = useState<boolean | null>(null);

  const value = edited ?? saved ?? LINES_DEFAULT;
  const open = enabled && (toggled ?? wantsOpen);

  // The one side effect: push the values onto the page.
  useEffect(() => {
    if (enabled) apply(value);
  }, [enabled, value]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "L" || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      setToggled((v) => !(v ?? wantsOpen));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, wantsOpen]);

  const change = useCallback((next: LineSettings) => {
    setEdited(next);
    save(next);
  }, []);

  // The defaults are exactly what globals.css declares, so writing them back is
  // the same picture as dropping the overrides.
  const reset = useCallback(() => {
    setEdited(LINES_DEFAULT);
    save(null);
  }, []);

  if (!open) return null;
  const set = <K extends keyof LineSettings>(key: K, next: LineSettings[K]) => change({ ...value, [key]: next });

  return (
    <TunerPanel
      title="Page lines"
      hint="Shift+L toggles. Esc closes."
      at={{ x: Math.max(12, window.innerWidth - 352), y: 96 }}
      onReset={reset}
      onCopy={() => asCss(value)}
      onClose={() => setToggled(false)}
    >
      <Group title="Vertical rails">
        <Toggle label="Show" checked={value.railShow} onChange={(v) => set("railShow", v)} />
        <Range label="Width" value={value.railW} min={0.5} max={6} step={0.5} format={(v) => `${v}px`} onChange={(v) => set("railW", v)} />
        <Swatch label="Colour" value={value.railColor} onChange={(v) => set("railColor", v)} />
        <Range label="Opacity" value={value.railAlpha} min={0.02} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("railAlpha", v)} />
        <Segmented
          value={value.railStyle}
          options={[
            ["solid", "Solid"],
            ["dashed", "Dashed"],
          ]}
          onChange={(v) => set("railStyle", v)}
        />
        <Range label="Dash" value={value.railDash} min={1} max={24} step={1} format={(v) => `${v}px`} disabled={value.railStyle === "solid"} onChange={(v) => set("railDash", v)} />
        <Range label="Gap" value={value.railGap} min={1} max={24} step={1} format={(v) => `${v}px`} disabled={value.railStyle === "solid"} onChange={(v) => set("railGap", v)} />
        <Range label="Half width" value={value.railInset} min={420} max={700} step={2} format={(v) => `${v}px`} onChange={(v) => set("railInset", v)} />
      </Group>

      <Group title="Section rules">
        <Toggle label="Show" checked={value.ruleShow} onChange={(v) => set("ruleShow", v)} />
        <Range label="Thickness" value={value.ruleH} min={0.5} max={6} step={0.5} format={(v) => `${v}px`} onChange={(v) => set("ruleH", v)} />
        <Swatch label="Colour" value={value.ruleColor} onChange={(v) => set("ruleColor", v)} />
        <Range label="Opacity" value={value.ruleAlpha} min={0.02} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("ruleAlpha", v)} />
        <Segmented
          value={value.ruleStyle}
          options={[
            ["solid", "Solid"],
            ["dashed", "Dashed"],
          ]}
          onChange={(v) => set("ruleStyle", v)}
        />
        <Range label="Dash" value={value.ruleDash} min={1} max={24} step={1} format={(v) => `${v}px`} disabled={value.ruleStyle === "solid"} onChange={(v) => set("ruleDash", v)} />
        <Range label="Gap" value={value.ruleGap} min={1} max={24} step={1} format={(v) => `${v}px`} disabled={value.ruleStyle === "solid"} onChange={(v) => set("ruleGap", v)} />
      </Group>

      <Group title="Crawl">
        <Range
          label="Seconds per dash"
          value={value.dashSpeed}
          min={0.4}
          max={12}
          step={0.1}
          format={(v) => `${v.toFixed(1)}s`}
          onChange={(v) => set("dashSpeed", v)}
        />
        <p className="m-0 pt-0.5 pb-1 text-[11.5px] leading-[1.4] text-(--lp-ink-2)">Higher is slower. Reduced motion holds the dashes still.</p>
      </Group>

      <Group title="Crossing nodes">
        <Toggle label="Show" checked={value.nodeShow} onChange={(v) => set("nodeShow", v)} />
        <Range label="Size" value={value.nodeSize} min={4} max={20} step={1} format={(v) => `${v}px`} disabled={!value.nodeShow} onChange={(v) => set("nodeSize", v)} />
      </Group>

      <Group title="Card and row hairlines">
        <Swatch label="Colour" value={value.hairColor} onChange={(v) => set("hairColor", v)} />
        <Range label="Light" value={value.hairAlpha} min={0.02} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("hairAlpha", v)} />
        <Range label="Strong" value={value.hairStrongAlpha} min={0.02} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("hairStrongAlpha", v)} />
      </Group>
    </TunerPanel>
  );
}
