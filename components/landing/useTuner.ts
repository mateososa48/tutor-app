"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

// The state behind every section tuner (topics wall, reviews): settings that
// start at a shipped default, save to this browser, and open from a Shift+key
// shortcut or a `?param` in the URL. Only in development, or on a build loaded
// with ?tune or that param.
//
// Nothing here is read during the server's render: the URL's query and this
// browser's saved settings are unknowable there, and guessing at them is a
// hydration mismatch. `enabled` gates every one of those reads.

function load<T extends object>(store: string, defaults: T): T | null {
  try {
    const raw = window.localStorage.getItem(store);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<T>) } : null;
  } catch {
    return null;
  }
}

function save(store: string, value: object | null) {
  try {
    if (value) window.localStorage.setItem(store, JSON.stringify(value));
    else window.localStorage.removeItem(store);
  } catch {
    // Storage blocked (private window): the settings just won't persist.
  }
}

export function useTuner<T extends object>({ store, defaults, param, hotkey }: { store: string; defaults: T; param: string; hotkey: string }) {
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const allowed = () => {
    if (process.env.NODE_ENV !== "production") return true;
    const params = new URLSearchParams(window.location.search);
    return params.has("tune") || params.has(param);
  };
  const enabled = hydrated && allowed();
  const saved = useMemo(() => (enabled ? load(store, defaults) : null), [enabled, store, defaults]);
  const wantsOpen = useMemo(() => enabled && new URLSearchParams(window.location.search).has(param), [enabled, param]);
  const [edited, setEdited] = useState<T | null>(null);
  const [toggled, setToggled] = useState<boolean | null>(null);

  const value = edited ?? saved ?? defaults;
  const open = enabled && (toggled ?? wantsOpen);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== hotkey.toUpperCase() || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      setToggled((v) => !(v ?? wantsOpen));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, wantsOpen, hotkey]);

  const change = useCallback(
    (next: T) => {
      setEdited(next);
      save(store, next);
    },
    [store],
  );

  const set = <K extends keyof T>(key: K, next: T[K]) => change({ ...value, [key]: next });

  // The defaults are exactly what ships, so writing them back is the same
  // picture as dropping the saved overrides.
  const reset = useCallback(() => {
    setEdited(defaults);
    save(store, null);
  }, [defaults, store]);

  return {
    value,
    set,
    change,
    reset,
    open,
    close: () => setToggled(false),
    openTuner: enabled ? () => setToggled(true) : null,
  };
}

/** Settings as a pasteable literal, for the tuner's Copy button. */
export function asLiteral(name: string, type: string, file: string, v: object) {
  const body = Object.entries(v)
    .map(([k, x]) => `  ${k}: ${typeof x === "string" ? `"${x}"` : x},`)
    .join("\n");
  return `// Paste over ${name} in ${file}\nexport const ${name}: ${type} = {\n${body}\n};`;
}

export function rgba(hex: string, alpha: number) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

/* Four L-shaped corner ticks as background layers, drawn inside a box: the
   corner language of the page's grid, shared by the topics wall and reviews. */
export function cornerTicks(color: string, len: number) {
  const g = `linear-gradient(${color}, ${color})`;
  const h = `${len}px 1px`;
  const v = `1px ${len}px`;
  return {
    backgroundImage: Array(8).fill(g).join(", "),
    backgroundSize: [h, v, h, v, h, v, h, v].join(", "),
    backgroundPosition: ["left top", "left top", "right top", "right top", "left bottom", "left bottom", "right bottom", "right bottom"].join(", "),
    backgroundRepeat: "no-repeat",
  } as const;
}
