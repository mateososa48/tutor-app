// A small scene language for the tutor's illustrations, and the layout that
// draws it (Oct 14 2026). The illustrator says WHAT is in the picture: rows of
// objects, containers, labels, equal-part bars, exact pies, a balance, an
// axis, arrows and brackets. This file decides WHERE, so nothing overlaps and
// every picture comes out in the board's style. Every node with an `id` keeps
// its box (`parts`), so the tutor can point at it or ring it later.
//
// Pure: the scene in, an SVG string and the parts out. Text is measured with
// a width estimate (about 0.55 em a character for the board's sans), which
// is close enough to lay out by; the board can re-measure in the browser.

import { BOARD_ICONS } from "../board-icons.generated";
import { resolveIconName } from "../board-icons";

// ── The language ────────────────────────────────────────────────────────

export type Tone = "ink" | "pencil" | "sky" | "green" | "red";
export type Size = "s" | "m" | "l";

export type SceneNode =
  | { type: "row" | "column"; children: SceneNode[]; gap?: number; align?: "start" | "center" | "end"; nowrap?: boolean; id?: string }
  | { type: "items"; icon: string; count: number; per_row?: number; crossed?: number; highlight?: number; size?: Size; color?: string; fill?: number; id?: string }
  | { type: "icon"; icon: string; size?: Size; color?: string; fill?: number; id?: string }
  | { type: "container"; shape: "box" | "jar" | "bag" | "plate" | "circle" | "none"; child: SceneNode; label?: string; label_side?: "top" | "bottom"; id?: string }
  | { type: "label"; text: string; size?: Size; tone?: Tone; id?: string }
  | { type: "bar"; parts: Array<{ value?: number; label?: string; shade?: boolean | number }>; shaded?: number; width?: number; unit?: number; total_label?: string; id?: string }
  | { type: "grid"; rows: number; cols: number; cell?: number; shaded?: number; top_label?: string; side_label?: string; id?: string }
  | { type: "pie"; slices: number; shaded?: number; colors?: string[]; size?: Size; style?: "plain" | "pizza"; label?: string; id?: string }
  | { type: "lineup"; icon?: string; values: number[]; labels?: string[]; color?: string; id?: string }
  | { type: "pictograph"; rows: Array<{ label: string; icon: string; count: number; color?: string }>; id?: string }
  | { type: "balance"; left: SceneNode; right: SceneNode; tilt?: -1 | 0 | 1; id?: string }
  | { type: "axis"; min: number; max: number; step?: number; orientation?: "horizontal" | "vertical"; marks?: Array<{ at: number; icon?: string; label?: string; tone?: Tone }>; moves?: Array<{ from: number; to: number; label?: string }>; unit?: string; hide?: number[]; id?: string }
  | { type: "bundles"; bundles: number; size?: number; loose?: number; id?: string }
  | { type: "custom"; use: string; size?: Size; id?: string }
  | { type: "spacer"; w?: number; h?: number };

export type Scene = {
  title?: string;
  /** Custom objects drawn once and reused by name (`custom.use`, or `items.icon`). */
  defs?: Record<string, { svg: string; w: number; h: number }>;
  root: SceneNode;
  arrows?: Array<{ from: string; to: string; label?: string; tone?: Tone }>;
  brackets?: Array<{ over: string | string[]; side?: "top" | "bottom" | "left" | "right"; label?: string; tone?: Tone }>;
};

export type Rect = { x: number; y: number; w: number; h: number };
export type Rendered = { svg: string; w: number; h: number; parts: Record<string, Rect>; problems: string[] };

// ── Style ───────────────────────────────────────────────────────────────

export const COLORS: Record<Tone, string> = { ink: "#1d1d21", pencil: "#5b5b66", sky: "#3d9cff", green: "#15803d", red: "#e5484d" };
const SKY_SOFT = "#e6f1ff";
const FONT = "'tldraw_sans', 'IBM Plex Sans', 'Hanken Grotesk', system-ui, sans-serif";
const STROKE = 2.5;
const FONT_PX: Record<Size, number> = { s: 15, m: 19, l: 26 };
const ICON_PX: Record<Size, number> = { s: 26, m: 36, l: 54 };
const MAX_ITEMS = 120;

export function textWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) w += /[il1.,:;'|!]/.test(ch) ? 0.3 : /[mwMW@%]/.test(ch) ? 0.85 : /[A-Z0-9$]/.test(ch) ? 0.62 : ch === " " ? 0.3 : 0.53;
  return w * px;
}

// Text over lines gets a white halo (an outline painted under the fill), so a
// dashed ground line or an arrow never reads as striking the words through.
const HALO = `stroke="#ffffff" stroke-width="5" stroke-linejoin="round" paint-order="stroke"`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n1 = (v: number) => Math.round(v * 10) / 10;

// ── Layout ──────────────────────────────────────────────────────────────

type Box = { w: number; h: number; draw: (x: number, y: number, out: Out) => void };
/** Every id inside a node, its own included. */
function idsIn(n: SceneNode | undefined, acc = new Set<string>()): Set<string> {
  if (!n || typeof n !== "object") return acc;
  if ("id" in n && n.id) acc.add(n.id);
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && "type" in c && idsIn(c as SceneNode, acc));
    else if (v && typeof v === "object" && "type" in v) idsIn(v as SceneNode, acc);
  }
  return acc;
}

/** Wider than this, a row of like things wraps (the board shows a picture at most 600px wide). */
const WRAP_W = 680;

type Out = { svg: string[]; parts: Record<string, Rect>; problems: string[]; /** What arrows and brackets cover, so the picture grows to fit them. */ ext: Rect[] };

// Objects the emoji set lacks, drawn here once (Oct 2026: the bake-off's
// pictures used a t-shirt for a jacket, a coffee cup for flour, and could not
// draw a stick or a marble). Each is a 24×24 body in the board's style.
const marble = (fill: string, rim: string) => `<circle cx="12" cy="12" r="10.5" fill="${fill}"/><circle cx="12" cy="12" r="10.5" fill="none" stroke="${rim}" stroke-width="1.6"/><ellipse cx="8.3" cy="8" rx="3.2" ry="2.1" fill="#ffffff" opacity="0.75"/>`;
export const BUILTIN_OBJECTS: Record<string, { svg: string; w: number; h: number }> = {
  marble: { svg: marble("#6fb6ff", "#1d7ee6"), w: 24, h: 24 },
  blue_marble: { svg: marble("#6fb6ff", "#1d7ee6"), w: 24, h: 24 },
  red_marble: { svg: marble("#ff7a7e", "#d63a40"), w: 24, h: 24 },
  green_marble: { svg: marble("#6fd69a", "#15803d"), w: 24, h: 24 },
  yellow_marble: { svg: marble("#ffd45e", "#c99400"), w: 24, h: 24 },
  stick: { svg: `<rect x="10" y="1" width="4" height="22" rx="2" fill="#e8b46a" stroke="#a8742c" stroke-width="1"/>`, w: 24, h: 24 },
  block: { svg: `<rect x="3" y="3" width="18" height="18" rx="3" fill="#ffb86b" stroke="#c46b12" stroke-width="1.6"/>`, w: 24, h: 24 },
  x_bag: { svg: `<path d="M8 5 L16 5 L15 8 C21 10 22 21 18 22 L6 22 C2 21 3 10 9 8 Z" fill="#e9d3a8" stroke="#8a6a32" stroke-width="1.4" stroke-linejoin="round"/><text x="12" y="18.5" text-anchor="middle" font-family="${"'IBM Plex Sans', system-ui, sans-serif"}" font-size="9" font-weight="700" fill="#1d1d21">x</text>`, w: 24, h: 24 },
  measuring_cup: { svg: `<path d="M5 4 H17 L16 21 H6 Z" fill="#eaf4ff" stroke="#1d1d21" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.6 11 H16.4 L16 21 H6 Z" fill="#f4ecd8"/><path d="M17 7 C21 7 21 13 16.5 13" fill="none" stroke="#1d1d21" stroke-width="1.4"/><path d="M8 8 H10 M8 12 H11 M8 16 H10" stroke="#5b5b66" stroke-width="1"/>`, w: 24, h: 24 },
  flour_cup: { svg: "", w: 24, h: 24 },
  elevator: { svg: `<rect x="3" y="2" width="18" height="20" rx="2" fill="#e6f1ff" stroke="#1d1d21" stroke-width="1.6"/><path d="M12 3 V21" stroke="#1d1d21" stroke-width="1.2"/><path d="M7 7 L9 5 L11 7 M13 17 L15 19 L17 17" fill="none" stroke="#1d7ee6" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`, w: 24, h: 24 },
  jacket: { svg: `<path d="M8 3 L12 6 L16 3 L21 7 L19 12 L17 11 L17 22 L7 22 L7 11 L5 12 L3 7 Z" fill="#8fb8e8" stroke="#1d1d21" stroke-width="1.3" stroke-linejoin="round"/><path d="M12 6 V22" stroke="#1d1d21" stroke-width="1.1"/><circle cx="13.6" cy="13" r="0.9" fill="#1d1d21"/><circle cx="13.6" cy="17" r="0.9" fill="#1d1d21"/>`, w: 24, h: 24 },
};
BUILTIN_OBJECTS.flour_cup = BUILTIN_OBJECTS.measuring_cup;
// US coins, each in its own metal and size with its value on its face (Oct 17
// 2026: Maya's 35 pennies and 5 dimes came out as one gold emoji coin twice, so
// the picture hid the very difference it was drawn to show).
const coin = (r: number, fill: string, rim: string, value: string, ink = "#1d1d21") =>
  `<circle cx="12" cy="12" r="${r}" fill="${fill}" stroke="${rim}" stroke-width="1.4"/><circle cx="12" cy="12" r="${r - 2.2}" fill="none" stroke="${rim}" stroke-width="0.6" opacity="0.6"/><text x="12" y="${n1(12 + (r > 9 ? 3.3 : 2.9))}" text-anchor="middle" font-family="'IBM Plex Sans', system-ui, sans-serif" font-size="${r > 9 ? 8.5 : 7.5}" font-weight="700" fill="${ink}">${value}</text>`;
BUILTIN_OBJECTS.penny = { svg: coin(9.2, "#e0a070", "#9a5a2a", "1¢"), w: 24, h: 24 };
BUILTIN_OBJECTS.nickel = { svg: coin(10, "#dcdfe4", "#7c828c", "5¢"), w: 24, h: 24 };
BUILTIN_OBJECTS.dime = { svg: coin(8.4, "#e3e6ea", "#7c828c", "10¢"), w: 24, h: 24 };
BUILTIN_OBJECTS.quarter = { svg: coin(11, "#d6dae0", "#6b717b", "25¢"), w: 24, h: 24 };
// A whole pizza and a whole round cake: the emoji "pizza" is a single slice,
// so "3 pizzas" read as 3 slices to every judge (Oct 19 2026, 7 pictures).
BUILTIN_OBJECTS.pizza = {
  svg: `<circle cx="12" cy="12" r="10.6" fill="#f4b860" stroke="#9a5a12" stroke-width="1.2"/><circle cx="12" cy="12" r="8.4" fill="#fbe3a3"/><circle cx="8.6" cy="8.8" r="1.5" fill="#d64545"/><circle cx="15" cy="9.4" r="1.5" fill="#d64545"/><circle cx="11.6" cy="15.4" r="1.5" fill="#d64545"/><circle cx="15.8" cy="14.6" r="1.2" fill="#d64545"/><circle cx="7.8" cy="13.6" r="1.2" fill="#d64545"/>`,
  w: 24,
  h: 24,
};
BUILTIN_OBJECTS.whole_pizza = BUILTIN_OBJECTS.pizza;
BUILTIN_OBJECTS.round_cake = {
  svg: `<ellipse cx="12" cy="17" rx="10" ry="4" fill="#e9a6c1" stroke="#1d1d21" stroke-width="1.2"/><path d="M2 10 V17 A10 4 0 0 0 22 17 V10" fill="#f7c6d9" stroke="#1d1d21" stroke-width="1.2"/><ellipse cx="12" cy="10" rx="10" ry="4" fill="#fff4f8" stroke="#1d1d21" stroke-width="1.2"/><circle cx="12" cy="9" r="1.3" fill="#d64545"/>`,
  w: 24,
  h: 24,
};
BUILTIN_OBJECTS.whole_cake = BUILTIN_OBJECTS.round_cake;
export const BUILTIN_NAMES = Object.keys(BUILTIN_OBJECTS);

/** A built-in object by a loose name: "pennies", "Dime coin", "red marbles". */
export function builtinObject(name: string): { svg: string; w: number; h: number } | undefined {
  const base = name.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/_coins?$/, "");
  const tries = [base, base.replace(/ies$/, "y"), base.replace(/es$/, ""), base.replace(/s$/, "")];
  for (const t of tries) if (BUILTIN_OBJECTS[t]) return BUILTIN_OBJECTS[t];
  return undefined;
}

// ── Objects that take a colour or a fill level (Oct 19 2026) ───────────
// The test set's failures: socks that had to be black and white were one
// yellow-and-blue emoji pair, cups that had to be 1, 1/2 and 3/4 full looked
// the same, kids that had to differ in height were one size. These are drawn
// here so a scene can say {"icon": "sock", "color": "black"} or
// {"icon": "measuring_cup", "fill": 0.75}.

const PAINT: Record<string, [string, string]> = {
  red: ["#ff7a7e", "#d63a40"], blue: ["#6fb6ff", "#1d7ee6"], green: ["#6fd69a", "#15803d"], yellow: ["#ffd45e", "#c99400"],
  orange: ["#ffb86b", "#c46b12"], purple: ["#c4a1ff", "#7c4dd6"], pink: ["#ff9ecf", "#d6457f"], black: ["#3a3a42", "#121215"],
  white: ["#ffffff", "#5b5b66"], gray: ["#c9ccd2", "#6b717b"], grey: ["#c9ccd2", "#6b717b"], brown: ["#c08a5a", "#7a4a22"], sky: ["#bfe0ff", "#3d9cff"],
};

/** A colour name or hex as a fill and a darker rim. */
export function paint(color: string | undefined, dflt: string): [string, string] {
  const c = (color ?? dflt).trim().toLowerCase();
  if (PAINT[c]) return PAINT[c];
  if (/^#[0-9a-f]{6}$/.test(c)) return [c, "#1d1d21"];
  return PAINT[dflt];
}

const clamp01 = (v: number | undefined, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

/** Objects drawn from parameters: name → a 24×24 body, or undefined when the name is not one of them. */
function paramObject(rawName: string, opts: { color?: string; fill?: number }): string | undefined {
  const name = rawName.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/_coins?$/, "");
  const key = [name, name.replace(/ies$/, "y"), name.replace(/es$/, ""), name.replace(/s$/, ""), name.replace(/ren$/, "")].find((n) => PARAM_OBJECTS[n]);
  return key ? PARAM_OBJECTS[key](opts) : undefined;
}

const PARAM_OBJECTS: Record<string, (o: { color?: string; fill?: number }) => string> = {
  marble: (o) => {
    const [f, r] = paint(o.color, "blue");
    return `<circle cx="12" cy="12" r="10.5" fill="${f}" stroke="${r}" stroke-width="1.6"/><ellipse cx="8.3" cy="8" rx="3.2" ry="2.1" fill="#ffffff" opacity="0.75"/>`;
  },
  sock: (o) => {
    const [f, r] = paint(o.color, "blue");
    return `<path d="M8 2 H15 V12 L19.5 16 C21.5 18 20 22.5 16.5 21.5 L8.5 16.5 C7 15.5 8 13.5 8 12 Z" fill="${f}" stroke="${r === "#5b5b66" ? "#5b5b66" : "#1d1d21"}" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 5 H15" stroke="${r}" stroke-width="1.2"/>`;
  },
  block: (o) => {
    const [f, r] = paint(o.color, "orange");
    return `<rect x="3" y="3" width="18" height="18" rx="3" fill="${f}" stroke="${r}" stroke-width="1.6"/>`;
  },
  cube: (o) => {
    const [f, r] = paint(o.color, "orange");
    return `<path d="M4 8 L12 4 L20 8 V17 L12 21 L4 17 Z" fill="${f}" stroke="${r}" stroke-width="1.4" stroke-linejoin="round"/><path d="M4 8 L12 12 L20 8 M12 12 V21" fill="none" stroke="${r}" stroke-width="1.2"/>`;
  },
  shirt: (o) => {
    const [f] = paint(o.color, "blue");
    return `<path d="M8 3 L12 5.5 L16 3 L21 7 L18.5 11 L17 10 V21 H7 V10 L5.5 11 L3 7 Z" fill="${f}" stroke="#1d1d21" stroke-width="1.3" stroke-linejoin="round"/>`;
  },
  pants: (o) => {
    const [f] = paint(o.color, "blue");
    return `<path d="M6 3 H18 L19 21 H13.5 L12 10 L10.5 21 H5 Z" fill="${f}" stroke="#1d1d21" stroke-width="1.3" stroke-linejoin="round"/><path d="M6 6 H18" stroke="#1d1d21" stroke-width="1"/>`;
  },
  measuring_cup: (o) => {
    const fl = clamp01(o.fill, 0);
    const top = 5;
    const bot = 21;
    const y = bot - (bot - top) * fl;
    return `<path d="M5 4 H17 L16 21 H6 Z" fill="#eaf4ff"/>${fl > 0 ? `<path d="M${n1(5 + (y - 4) / 17)} ${n1(y)} H${n1(17 - (y - 4) / 17)} L16 21 H6 Z" fill="#f4ecd8"/>` : ""}<path d="M5 4 H17 L16 21 H6 Z" fill="none" stroke="#1d1d21" stroke-width="1.4" stroke-linejoin="round"/><path d="M17 7 C21 7 21 13 16.5 13" fill="none" stroke="#1d1d21" stroke-width="1.4"/><path d="M8 8.25 H10 M8 12.5 H11 M8 16.75 H10" stroke="#5b5b66" stroke-width="1"/>`;
  },
  glass: (o) => {
    const fl = clamp01(o.fill, 0.5);
    const y = 21 - 17 * fl;
    const [f] = paint(o.color, "sky");
    return `${fl > 0 ? `<path d="M${n1(6 + (y - 4) * 0.06)} ${n1(y)} H${n1(18 - (y - 4) * 0.06)} L17 21 H7 Z" fill="${f}"/>` : ""}<path d="M6 4 H18 L17 21 H7 Z" fill="none" stroke="#1d1d21" stroke-width="1.4" stroke-linejoin="round"/>`;
  },
  bucket: (o) => {
    const fl = clamp01(o.fill, 0);
    const y = 21 - 14 * fl;
    const [f] = paint(o.color, "sky");
    return `<path d="M5 7 C5 1 19 1 19 7" fill="none" stroke="#5b5b66" stroke-width="1.3"/>${fl > 0 ? `<path d="M${n1(4 + (y - 7) * 0.1)} ${n1(y)} H${n1(20 - (y - 7) * 0.1)} L18 21 H6 Z" fill="${f}"/>` : ""}<path d="M4 7 H20 L18 21 H6 Z" fill="none" stroke="#1d1d21" stroke-width="1.4" stroke-linejoin="round"/>`;
  },
  kid: (o) => {
    const [f] = paint(o.color, "blue");
    return `<circle cx="12" cy="5" r="3.4" fill="#f2c6a0" stroke="#1d1d21" stroke-width="1.2"/><path d="M8 9.5 H16 L17 16 H14.8 L14.5 23 H9.5 L9.2 16 H7 Z" fill="${f}" stroke="#1d1d21" stroke-width="1.2" stroke-linejoin="round"/>`;
  },
};
PARAM_OBJECTS.cup = PARAM_OBJECTS.measuring_cup;
PARAM_OBJECTS.flour_cup = PARAM_OBJECTS.measuring_cup;
PARAM_OBJECTS.child = PARAM_OBJECTS.kid;
PARAM_OBJECTS.student = PARAM_OBJECTS.kid;
PARAM_OBJECTS.person = PARAM_OBJECTS.kid;
PARAM_OBJECTS.trousers = PARAM_OBJECTS.pants;
PARAM_OBJECTS.jeans = PARAM_OBJECTS.pants;
export const PARAM_OBJECT_NAMES = Object.keys(PARAM_OBJECTS);

// A larger icon set the engine may draw from where it is loaded (the server
// and scripts: lib/illustration/icon-library.ts); the browser has only the
// curated set. An exact name in the curated set wins, then the larger set's
// exact name, then the curated set's loose match ("red apple" → apple).
type IconBody = { body: string; w: number; h: number };
let ICON_SOURCE: ((name: string) => IconBody | null) | null = null;
export function setIconSource(fn: ((name: string) => IconBody | null) | null) {
  ICON_SOURCE = fn;
}
function lookupIcon(name: string): IconBody | null {
  const key = name.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const curated = (BOARD_ICONS as Record<string, IconBody>)[key];
  if (curated) return curated;
  const wide = ICON_SOURCE?.(key);
  if (wide) return wide;
  const resolved = resolveIconName(name);
  return resolved ? (BOARD_ICONS as Record<string, IconBody>)[resolved] : null;
}

function iconMarkup(name: string, x: number, y: number, size: number, defs: Scene["defs"], out: Out, opts: { color?: string; fill?: number } = {}): void {
  // Objects that take a colour or a fill are drawn from their parameters
  // whenever one is given, and always for the ones the emoji set lacks.
  const pbody = opts.color !== undefined || opts.fill !== undefined || /^(socks?|pants|trousers|jeans|glass(es)?|buckets?|kids?|child|children|students?|persons?|cubes?)$/i.test(name.trim()) ? paramObject(name, opts) : undefined;
  if (pbody) {
    const s = size / 24;
    out.svg.push(`<g transform="translate(${n1(x)} ${n1(y)}) scale(${n1(s * 1000) / 1000})">${pbody}</g>`);
    return;
  }
  const def = defs?.[name] ?? builtinObject(name);
  if (def) {
    const s = size / Math.max(def.w, def.h);
    out.svg.push(`<g transform="translate(${n1(x + (size - def.w * s) / 2)} ${n1(y + (size - def.h * s) / 2)}) scale(${n1(s * 1000) / 1000})">${def.svg}</g>`);
    return;
  }
  const icon = lookupIcon(name);
  if (!icon) {
    out.problems.push(`no icon or def named "${name}"`);
    out.svg.push(`<circle cx="${n1(x + size / 2)}" cy="${n1(y + size / 2)}" r="${n1(size * 0.4)}" fill="${SKY_SOFT}" stroke="${COLORS.sky}" stroke-width="2"/>`);
    return;
  }
  const s = size / Math.max(icon.w, icon.h);
  out.svg.push(`<g transform="translate(${n1(x)} ${n1(y)}) scale(${n1(s * 1000) / 1000})">${icon.body}</g>`);
}

function label(text: string, size: Size = "m", tone: Tone = "ink", weight = 500): Box {
  const px = FONT_PX[size];
  const w = textWidth(text, px);
  const h = px * 1.3;
  return {
    w,
    h,
    draw: (x, y, out) => out.svg.push(`<text x="${n1(x)}" y="${n1(y + px * 1.0)}" font-family="${FONT}" font-size="${px}" font-weight="${weight}" fill="${COLORS[tone]}">${esc(text)}</text>`),
  };
}

function perRowFor(count: number, given?: number): number {
  if (given && given > 0) return Math.min(given, count);
  if (count <= 6) return count;
  if (count % 5 === 0 && count <= 30) return 5;
  if (count <= 12) return Math.ceil(count / 2);
  return Math.ceil(Math.sqrt(count));
}

function build(node: SceneNode, scene: Scene, out: Out): Box {
  const withId = (box: Box, id?: string): Box =>
    id
      ? {
          ...box,
          draw: (x, y, o) => {
            o.parts[id] = { x: n1(x), y: n1(y), w: n1(box.w), h: n1(box.h) };
            o.svg.push(`<g data-part="${esc(id)}">`);
            box.draw(x, y, o);
            o.svg.push("</g>");
          },
        }
      : box;

  switch (node.type) {
    case "spacer":
      return { w: node.w ?? 16, h: node.h ?? 16, draw: () => {} };

    case "label":
      return withId(label(node.text, node.size, node.tone), node.id);

    case "bundles": {
      // Bundles of sticks you can count: each bundle is `size` upright sticks
      // tied with a band (the bake-off's bundles were blobs no one could count).
      const n = Math.max(0, Math.min(12, Math.round(node.bundles)));
      const size = Math.max(2, Math.min(12, Math.round(node.size ?? 10)));
      const loose = Math.max(0, Math.min(12, Math.round(node.loose ?? 0)));
      const SW = 6;
      const SG = 3;
      const SH = 70;
      const bundleW = size * SW + (size - 1) * SG;
      const GAP = 26;
      const w = n * bundleW + Math.max(0, n - 1) * GAP + (loose ? (n ? GAP + 12 : 0) + loose * SW + (loose - 1) * (SG + 6) : 0);
      const stick = (sx: number, sy: number) =>
        `<rect x="${n1(sx)}" y="${n1(sy)}" width="${SW}" height="${SH}" rx="3" fill="#e8b46a" stroke="#a8742c" stroke-width="1.2"/>`;
      return withId(
        {
          w,
          h: SH,
          draw: (x, y, o) => {
            for (let b = 0; b < n; b++) {
              const bx = x + b * (bundleW + GAP);
              for (let i = 0; i < size; i++) o.svg.push(stick(bx + i * (SW + SG), y));
              o.svg.push(`<rect x="${n1(bx - 3)}" y="${n1(y + SH / 2 - 6)}" width="${n1(bundleW + 6)}" height="12" rx="4" fill="${COLORS.red}" opacity="0.9"/>`);
              if (node.id) o.parts[`${node.id}.bundle${b + 1}`] = { x: n1(bx), y: n1(y), w: n1(bundleW), h: SH };
            }
            const lx = x + n * (bundleW + GAP) + (n ? 12 : 0);
            for (let i = 0; i < loose; i++) o.svg.push(stick(lx + i * (SW + SG + 6), y));
            if (node.id && loose) o.parts[`${node.id}.loose`] = { x: n1(lx), y: n1(y), w: n1(loose * (SW + SG + 6)), h: SH };
          },
        },
        node.id,
      );
    }

    case "icon":
    case "custom": {
      const size = ICON_PX[node.size ?? "m"];
      const name = node.type === "icon" ? node.icon : node.use;
      // A lone object nobody can draw is left out rather than shown as a dot
      // (Oct 17 2026: "road" beside the car read as a stray circle). Rows of
      // items keep their dots, because there the count is the point.
      if (!scene.defs?.[name] && !builtinObject(name) && !lookupIcon(name) && !paramObject(name, {})) {
        out.problems.push(`no icon or def named "${name}"`);
        // One the picture refers to (an arrow's end, a bracket, a part to point
        // at) is written as its name on a small tile: left out, the toaster
        // picture lost its toast and the arrow to it (Oct 23 2026). A purely
        // decorative one is still left out.
        if (!node.id && !(node as { tile?: boolean }).tile) return { w: 0, h: 0, draw: () => {} };
        const word = name.replace(/[_-]+/g, " ").trim().slice(0, 18);
        const px = FONT_PX.s;
        const w = Math.max(size, textWidth(word, px) + 20);
        const h = Math.round(size * 0.72);
        return withId({ w, h, draw: (x, y, o) => {
          o.svg.push(`<rect x="${n1(x + 1)}" y="${n1(y + 1)}" width="${n1(w - 2)}" height="${n1(h - 2)}" rx="10" fill="#ffffff" stroke="${COLORS.pencil}" stroke-width="2"/>`);
          o.svg.push(`<text x="${n1(x + w / 2)}" y="${n1(y + h / 2 + px * 0.35)}" text-anchor="middle" font-family="${FONT}" font-size="${px}" font-weight="600" fill="${COLORS.ink}">${esc(word)}</text>`);
        } }, node.id ?? "");
      }
      const opts = node.type === "icon" ? { color: node.color, fill: node.fill } : {};
      return withId({ w: size, h: size, draw: (x, y, o) => iconMarkup(name, x, y, size, scene.defs, o, opts) }, node.id);
    }

    case "items": {
      let count = Math.max(0, Math.round(node.count));
      if (count > MAX_ITEMS) {
        out.problems.push(`items: ${count} is too many to draw; drew ${MAX_ITEMS}`);
        count = MAX_ITEMS;
      }
      const size = ICON_PX[node.size ?? (count > 30 ? "s" : "m")];
      const gap = Math.round(size * 0.22);
      const per = perRowFor(count, node.per_row);
      const rows = Math.ceil(count / Math.max(1, per));
      const w = per * size + (per - 1) * gap;
      const h = rows * size + (rows - 1) * gap;
      const crossed = Math.min(count, node.crossed ?? 0);
      const lit = Math.min(count, node.highlight ?? 0);
      return withId(
        {
          w,
          h,
          draw: (x, y, o) => {
            for (let i = 0; i < count; i++) {
              const cx = x + (i % per) * (size + gap);
              const cy = y + Math.floor(i / per) * (size + gap);
              if (i < lit) o.svg.push(`<circle cx="${n1(cx + size / 2)}" cy="${n1(cy + size / 2)}" r="${n1(size * 0.62)}" fill="${SKY_SOFT}"/>`);
              iconMarkup(node.icon, cx, cy, size, scene.defs, o, { color: node.color, fill: node.fill });
              // The last ones are the crossed ones (taken away).
              if (i >= count - crossed) {
                const p = size * 0.12;
                o.svg.push(`<path d="M${n1(cx + p)} ${n1(cy + p)}L${n1(cx + size - p)} ${n1(cy + size - p)}M${n1(cx + size - p)} ${n1(cy + p)}L${n1(cx + p)} ${n1(cy + size - p)}" stroke="${COLORS.red}" stroke-width="3" stroke-linecap="round"/>`);
              }
            }
          },
        },
        node.id,
      );
    }

    case "row":
    case "column": {
      let gap = node.gap ?? 28;
      // Arrows running between the children need room to fan out: in 40px six
      // arrows from three shirts to two pants were a knot (Oct 19 2026).
      if (scene.arrows?.length && (node.children ?? []).length >= 2) {
        const owner = (id: string) => (node.children ?? []).findIndex((c) => idsIn(c).has(id));
        if (scene.arrows.some((a) => { const i = owner(a.from), j = owner(a.to); return i >= 0 && j >= 0 && i !== j; })) gap = Math.max(gap, 110);
      }
      // A long row of like things (six boxes of children, eight plates) wraps
      // onto lines of about equal length instead of shrinking until the faces
      // inside cannot be told apart (Oct 19 2026, the class-ratio picture: six
      // groups in one 1270px row, every child the same yellow blob).
      if (node.type === "row" && !node.nowrap) {
        const kids0 = node.children ?? [];
        const sameKind = kids0.length >= 4 && kids0.every((c) => c.type === kids0[0].type && c.type !== "spacer");
        if (sameKind) {
          const probe = kids0.map((c) => build(c, scene, { svg: [], parts: {}, problems: [], ext: [] }));
          const wide = probe.reduce((s, k) => s + k.w, 0) + gap * (kids0.length - 1);
          if (wide > WRAP_W) {
            const lines = Math.ceil(wide / WRAP_W);
            const per = Math.ceil(kids0.length / lines);
            const rows: SceneNode[] = [];
            for (let i = 0; i < kids0.length; i += per) rows.push({ type: "row", gap, align: node.align, nowrap: true, children: kids0.slice(i, i + per) });
            return build({ type: "column", gap: Math.max(gap, 24), children: rows, id: node.id }, scene, out);
          }
        }
      }
      const kids = (node.children ?? []).map((c) => build(c, scene, out));
      const horiz = node.type === "row";
      const w = horiz ? kids.reduce((s, k) => s + k.w, 0) + gap * Math.max(0, kids.length - 1) : Math.max(0, ...kids.map((k) => k.w));
      const h = horiz ? Math.max(0, ...kids.map((k) => k.h)) : kids.reduce((s, k) => s + k.h, 0) + gap * Math.max(0, kids.length - 1);
      const align = node.align ?? "center";
      return withId(
        {
          w,
          h,
          draw: (x, y, o) => {
            let at = horiz ? x : y;
            for (const k of kids) {
              const off = (horiz ? h - k.h : w - k.w) * (align === "start" ? 0 : align === "end" ? 1 : 0.5);
              if (horiz) k.draw(at, y + off, o);
              else k.draw(x + off, at, o);
              at += (horiz ? k.w : k.h) + gap;
            }
          },
        },
        node.id,
      );
    }

    case "container": {
      // A container's own object is never decoration: unknown, it is written
      // on a tile rather than leaving the box empty (the toaster, Oct 23 2026).
      const child = node.child && (node.child.type === "icon" || node.child.type === "custom") ? { ...node.child, tile: true } : node.child;
      const inner = build(child as SceneNode, scene, out);
      const pad = node.shape === "none" ? 0 : node.shape === "circle" ? 20 : node.shape === "bag" ? 24 : 16;
      const neck = node.shape === "jar" ? 14 : node.shape === "bag" ? 26 : 0;
      const plate = node.shape === "plate" ? 14 : 0;
      let bw = inner.w + pad * 2;
      // A wide bag gets more height, or its round body cannot hold a long row.
      // Its body is kept to at most about 2:1, so it reads as a sack, not a boat.
      const padY = node.shape === "bag" ? Math.max(pad, Math.min(90, (inner.w / 2.1 - inner.h) / 2)) : pad;
      let bh = inner.h + padY * 2 + neck + plate;
      if (node.shape === "circle") bw = bh = Math.max(inner.w, inner.h) * 1.42 + pad;
      const lab = node.label ? label(node.label, "m", "ink") : null;
      const labGap = lab ? 10 : 0;
      const w = Math.max(bw, lab?.w ?? 0);
      const h = bh + (lab ? lab.h + labGap : 0);
      const top = node.label_side === "top";
      return withId(
        {
          w,
          h,
          draw: (x, y, o) => {
            const bx = x + (w - bw) / 2;
            const by = y + (lab && top ? lab.h + labGap : 0);
            const s = `stroke="${COLORS.ink}" stroke-width="${STROKE}" stroke-linejoin="round" stroke-linecap="round"`;
            if (node.shape === "box") o.svg.push(`<rect x="${n1(bx)}" y="${n1(by)}" width="${n1(bw)}" height="${n1(bh)}" rx="12" fill="none" ${s}/>`);
            if (node.shape === "jar") {
              const r = 16;
              const nx = bx + bw * 0.16;
              const nw = bw * 0.68;
              o.svg.push(`<path d="M${n1(nx)} ${n1(by)}H${n1(nx + nw)}M${n1(nx + 4)} ${n1(by)}V${n1(by + neck)}H${n1(bx + r)}Q${n1(bx)} ${n1(by + neck)} ${n1(bx)} ${n1(by + neck + r)}V${n1(by + bh - r)}Q${n1(bx)} ${n1(by + bh)} ${n1(bx + r)} ${n1(by + bh)}H${n1(bx + bw - r)}Q${n1(bx + bw)} ${n1(by + bh)} ${n1(bx + bw)} ${n1(by + bh - r)}V${n1(by + neck + r)}Q${n1(bx + bw)} ${n1(by + neck)} ${n1(bx + bw - r)} ${n1(by + neck)}H${n1(nx + nw - 4)}V${n1(by)}" fill="#f6fbff" ${s}/>`);
            }
            if (node.shape === "bag") {
              const mid = bx + bw / 2;
              // A sack: a narrow gathered neck tied with a cord, flaring into
              // a round body well wider than its contents (the first bag's
              // sides curved in and marbles hung off; the second read as a pot).
              const nw = Math.max(26, bw * 0.16);
              const top = by + 2;
              const tie = by + neck;
              // The body passes 14px outside the contents at their middle
              // height, so a long row of marbles stays inside the sack (Oct 17
              // 2026: one curve from neck to bottom never reached the row's ends).
              const cy = by + neck + padY + inner.h / 2;
              const lx = bx - 14;
              const rx = bx + bw + 14;
              const bot = by + bh;
              o.svg.push(
                `<path d="M${n1(mid - nw)} ${n1(tie)}C${n1(lx + (mid - nw - lx) * 0.35)} ${n1(tie + 2)} ${n1(lx)} ${n1(cy - (cy - tie) * 0.6)} ${n1(lx)} ${n1(cy)}C${n1(lx)} ${n1(cy + (bot - cy) * 0.75)} ${n1(bx + bw * 0.18)} ${n1(bot)} ${n1(mid)} ${n1(bot)}C${n1(bx + bw * 0.82)} ${n1(bot)} ${n1(rx)} ${n1(cy + (bot - cy) * 0.75)} ${n1(rx)} ${n1(cy)}C${n1(rx)} ${n1(cy - (cy - tie) * 0.6)} ${n1(rx - (rx - mid - nw) * 0.35)} ${n1(tie + 2)} ${n1(mid + nw)} ${n1(tie)}Z" fill="#f3e3c3" ${s}/>`,
              );
              o.svg.push(`<path d="M${n1(mid - nw)} ${n1(tie)}L${n1(mid - nw * 1.35)} ${n1(top)}Q${n1(mid)} ${n1(top + 7)} ${n1(mid + nw * 1.35)} ${n1(top)}L${n1(mid + nw)} ${n1(tie)}Z" fill="#f3e3c3" ${s}/>`);
              o.svg.push(`<path d="M${n1(mid - nw - 3)} ${n1(tie)}H${n1(mid + nw + 3)}" stroke="#a8742c" stroke-width="4" stroke-linecap="round"/>`);
            }
            if (node.shape === "plate") o.svg.push(`<ellipse cx="${n1(bx + bw / 2)}" cy="${n1(by + bh - plate)}" rx="${n1(bw / 2)}" ry="${n1(plate)}" fill="#f7f7f9" ${s}/>`);
            if (node.shape === "circle") o.svg.push(`<circle cx="${n1(bx + bw / 2)}" cy="${n1(by + bh / 2)}" r="${n1(bw / 2)}" fill="none" ${s}/>`);
            inner.draw(bx + (bw - inner.w) / 2, by + neck + (node.shape === "circle" ? (bh - inner.h) / 2 : padY), o);
            if (lab) lab.draw(x + (w - lab.w) / 2, top ? y : by + bh + labGap, o);
          },
        },
        node.id,
      );
    }

    case "bar": {
      // `shaded: 1.5` fills parts from the left: one whole part and half the
      // next. Per-part `shade` stays for a gap or an odd pattern; Haiku asked to
      // shade one and a half marked two parts true and the third 0.5 (Oct 19
      // 2026, the tip picture, five times in eight), a count it cannot get
      // wrong this way.
      const parts = (node.parts?.length ? node.parts : [{}]).map((p, i) =>
        typeof node.shaded === "number" && node.shaded > 0 ? { ...p, shade: Math.max(0, Math.min(1, node.shaded - i)) || undefined } : p,
      );
      const total = parts.reduce((s, p) => s + (p.value && p.value > 0 ? p.value : 1), 0);
      // One whole is one length, however many pieces it is cut into: a bar of
      // fourths drawn shorter than a bar of eighths, both "1 whole", undid the
      // lesson it was drawn for (Oct 19 2026, raters on the eighths picture).
      // `unit` instead draws every unit the same size across bars (a tape
      // diagram: Lia 1 box, Sam 3 boxes of that size; Oct 19 2026).
      const bw = node.width ?? (node.unit && node.unit > 0 ? Math.max(40, Math.min(720, total * node.unit)) : Math.max(480, parts.length * 44));
      const bh = 52;
      const top = node.total_label ? label(node.total_label, "m", "ink") : null;
      const shadeOf = (p: (typeof parts)[number]) => (p.shade === true ? 1 : typeof p.shade === "number" ? Math.max(0, Math.min(1, p.shade)) : 0);
      // A piece shaded only in part has its edge through the middle of the
      // piece, right through a centred "$2" (Oct 19 2026, the tip picture), so
      // such a bar writes its piece labels under the bar instead.
      const under = parts.some((p) => shadeOf(p) > 0 && shadeOf(p) < 1) && parts.some((p) => p.label);
      const underH = under ? FONT_PX.s * 1.3 + 8 : 0;
      const h = bh + (top ? top.h + 20 : 0) + underH;
      return withId(
        {
          w: Math.max(bw, top?.w ?? 0),
          h,
          draw: (x, y, o) => {
            const by = y + (top ? top.h + 20 : 0);
            if (top) {
              o.svg.push(`<path d="M${n1(x)} ${n1(by - 6)}V${n1(by - 14)}H${n1(x + bw)}V${n1(by - 6)}" fill="none" stroke="${COLORS.pencil}" stroke-width="2" stroke-linecap="round"/>`);
              top.draw(x + (bw - top.w) / 2, y, o);
            }
            let at = x;
            let shadeFrom = -1;
            let shadeTo = -1;
            parts.forEach((p, i) => {
              const pw = (bw * (p.value && p.value > 0 ? p.value : 1)) / total;
              // `shade` may be part of a piece (0.5 shades its left half: a tip of one and a half tenths).
              const sh = shadeOf(p);
              if (sh > 0 && (shadeTo < 0 || Math.abs(shadeTo - at) < 0.5)) {
                if (shadeFrom < 0) shadeFrom = at;
                shadeTo = at + pw * sh;
              }
              o.svg.push(`<rect x="${n1(at)}" y="${n1(by)}" width="${n1(pw)}" height="${bh}" fill="#ffffff" stroke="${COLORS.ink}" stroke-width="${STROKE}"/>`);
              if (sh > 0) {
                o.svg.push(`<rect x="${n1(at + 1.25)}" y="${n1(by + 1.25)}" width="${n1(pw * sh - 2.5)}" height="${bh - 2.5}" fill="${SKY_SOFT}"/>`);
                o.svg.push(`<rect x="${n1(at + 2)}" y="${n1(by + 2)}" width="${n1(Math.max(0, pw * sh - 4))}" height="${bh - 4}" fill="none" stroke="${COLORS.sky}" stroke-width="2"/>`);
              }
              if (p.label) {
                const l = label(p.label, under || pw < 70 ? "s" : "m", "ink");
                l.draw(at + (pw - l.w) / 2, under ? by + bh + 6 : by + (bh - l.h) / 2, o);
              }
              if (node.id) o.parts[`${node.id}.${i + 1}`] = { x: n1(at), y: n1(by), w: n1(pw), h: bh };
              at += pw;
            });
            // The shaded stretch as one part, so a bracket can name exactly it
            // (one and a half pieces, not two).
            if (node.id && shadeFrom >= 0) o.parts[`${node.id}.shaded`] = { x: n1(shadeFrom), y: n1(by), w: n1(shadeTo - shadeFrom), h: bh + underH };
          },
        },
        node.id,
      );
    }

    case "grid": {
      const rows = Math.max(1, Math.min(20, Math.round(node.rows)));
      const cols = Math.max(1, Math.min(20, Math.round(node.cols)));
      const cell = node.cell ?? Math.max(26, Math.min(48, Math.floor(320 / Math.max(rows, cols))));
      const topL = node.top_label ? label(node.top_label, "m", "ink") : null;
      const sideL = node.side_label ? label(node.side_label, "m", "ink") : null;
      const offX = sideL ? sideL.w + 14 : 0;
      const offY = topL ? topL.h + 10 : 0;
      return withId(
        {
          w: offX + cols * cell,
          h: offY + rows * cell,
          draw: (x, y, o) => {
            const gx = x + offX;
            const gy = y + offY;
            const shaded = Math.min(rows * cols, node.shaded ?? 0);
            for (let i = 0; i < rows * cols; i++) {
              const cx = gx + (i % cols) * cell;
              const cy = gy + Math.floor(i / cols) * cell;
              o.svg.push(`<rect x="${n1(cx)}" y="${n1(cy)}" width="${cell}" height="${cell}" fill="${i < shaded ? SKY_SOFT : "#fbf8f2"}" stroke="${COLORS.pencil}" stroke-width="1.5"/>`);
            }
            o.svg.push(`<rect x="${n1(gx)}" y="${n1(gy)}" width="${cols * cell}" height="${rows * cell}" fill="none" stroke="${COLORS.ink}" stroke-width="${STROKE}"/>`);
            if (topL) topL.draw(gx + (cols * cell - topL.w) / 2, y, o);
            if (sideL) sideL.draw(x, gy + (rows * cell - sideL.h) / 2, o);
          },
        },
        node.id,
      );
    }

    case "pie": {
      const slices = Math.max(1, Math.min(24, Math.round(node.slices)));
      const d = node.size === "l" ? 170 : node.size === "s" ? 90 : 130;
      const lab = node.label ? label(node.label, "m", "ink") : null;
      const pizza = node.style === "pizza";
      return withId(
        {
          w: Math.max(d, lab?.w ?? 0),
          h: d + (lab ? lab.h + 10 : 0),
          draw: (x, y, o) => {
            const W = Math.max(d, lab?.w ?? 0);
            const cx = x + W / 2;
            const cy = y + d / 2;
            const r = d / 2 - 2;
            const shaded = Math.min(slices, node.shaded ?? 0);
            if (pizza) o.svg.push(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" fill="#f4b860" stroke="${COLORS.ink}" stroke-width="${STROKE}"/><circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r - 9)}" fill="#fbe3a3"/>`);
            for (let i = 0; i < slices; i++) {
              const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / slices;
              const a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / slices;
              const rr = pizza ? r - 9 : r;
              const big = a1 - a0 > Math.PI ? 1 : 0;
              const path = slices === 1 ? `M${n1(cx - rr)} ${n1(cy)}a${n1(rr)} ${n1(rr)} 0 1 0 ${n1(rr * 2)} 0a${n1(rr)} ${n1(rr)} 0 1 0 ${n1(-rr * 2)} 0` : `M${n1(cx)} ${n1(cy)}L${n1(cx + rr * Math.cos(a0))} ${n1(cy + rr * Math.sin(a0))}A${n1(rr)} ${n1(rr)} 0 ${big} 1 ${n1(cx + rr * Math.cos(a1))} ${n1(cy + rr * Math.sin(a1))}Z`;
              // `colors` paints each part (a spinner's red, blue, green, yellow).
              const own = node.colors?.[i] ? paint(node.colors[i], "sky")[0] : null;
              const fill = own ?? (i < shaded ? (pizza ? "#e5484d" : SKY_SOFT) : pizza ? "none" : "#ffffff");
              o.svg.push(`<path d="${path}" fill="${fill}" fill-opacity="${pizza && i < shaded && !own ? 0.45 : 1}" stroke="${COLORS.ink}" stroke-width="2"/>`);
              if (node.id) o.parts[`${node.id}.${i + 1}`] = { x: n1(cx + rr * 0.55 * Math.cos((a0 + a1) / 2) - 12), y: n1(cy + rr * 0.55 * Math.sin((a0 + a1) / 2) - 12), w: 24, h: 24 };
              if (pizza && i < shaded) {
                // Pepperoni on the shaded slice, so it reads as the slice you take.
                const am = (a0 + a1) / 2;
                o.svg.push(`<circle cx="${n1(cx + rr * 0.55 * Math.cos(am))}" cy="${n1(cy + rr * 0.55 * Math.sin(am))}" r="${n1(Math.max(4, rr * 0.11))}" fill="#c0392b"/>`);
              }
            }
            o.svg.push(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" fill="none" stroke="${COLORS.ink}" stroke-width="${STROKE}"/>`);
            if (lab) lab.draw(cx - lab.w / 2, y + d + 10, o);
          },
        },
        node.id,
      );
    }

    case "pictograph": {
      // A picture graph: one row per category, every row's first icon on the
      // same line, so lengths compare at a glance (the rows of a hand-built
      // graph started where their labels ended; Oct 19 2026).
      const rows = (node.rows ?? []).slice(0, 8);
      const size = ICON_PX.m;
      const gap = Math.round(size * 0.2);
      const labs = rows.map((r) => label(r.label, "m", "ink"));
      const labW = Math.max(0, ...labs.map((l) => l.w)) + 16;
      const rowH = size + 12;
      const maxN = Math.max(1, ...rows.map((r) => Math.min(30, Math.max(0, Math.round(r.count)))));
      const w = labW + maxN * size + (maxN - 1) * gap;
      const h = rows.length * rowH - 12;
      return withId(
        {
          w,
          h,
          draw: (x, y, o) => {
            o.svg.push(`<path d="M${n1(x + labW - 8)} ${n1(y - 4)}V${n1(y + h + 4)}" stroke="${COLORS.pencil}" stroke-width="2" stroke-linecap="round"/>`);
            rows.forEach((r, i) => {
              const ry = y + i * rowH;
              labs[i].draw(x + labW - 16 - labs[i].w, ry + (size - labs[i].h) / 2, o);
              const n = Math.min(30, Math.max(0, Math.round(r.count)));
              for (let k = 0; k < n; k++) iconMarkup(r.icon, x + labW + k * (size + gap), ry, size, scene.defs, o, { color: r.color });
              if (node.id) o.parts[`${node.id}.${i + 1}`] = { x: n1(x + labW), y: n1(ry), w: n1(Math.max(size, n * (size + gap) - gap)), h: size };
            });
          },
        },
        node.id,
      );
    }

    case "lineup": {
      // Figures standing side by side, each as tall as its value (to scale,
      // from a common floor), labelled under its feet: heights, a bar chart a
      // child reads as people (Oct 19 2026, the median-height case).
      const values = (node.values ?? []).filter((v) => Number.isFinite(v)).slice(0, 12);
      if (!values.length) {
        out.problems.push("lineup: no values");
        return { w: 0, h: 0, draw: () => {} };
      }
      const max = Math.max(...values.map((v) => Math.abs(v)), 1e-9);
      const tallest = 190;
      const slot = 74;
      const labs = values.map((v, i) => label(node.labels?.[i] ?? String(v), "s", "ink"));
      const labH = Math.max(...labs.map((l) => l.h));
      const w = values.length * slot;
      const h = tallest + 10 + labH;
      return withId(
        {
          w,
          h,
          draw: (x, y, o) => {
            const floor = y + tallest;
            o.svg.push(`<path d="M${n1(x - 6)} ${n1(floor)}H${n1(x + w + 6)}" stroke="${COLORS.pencil}" stroke-width="2" stroke-linecap="round"/>`);
            values.forEach((v, i) => {
              const hh = (tallest * Math.abs(v)) / max;
              const cx = x + i * slot + slot / 2;
              // The figure's own 24-unit box, stretched to its height.
              const sc = hh / 24;
              const body = paramObject(node.icon ?? "kid", { color: node.color }) ?? paramObject("kid", { color: node.color })!;
              o.svg.push(`<g transform="translate(${n1(cx - 12 * sc * 0.75)} ${n1(floor - hh)}) scale(${n1(sc * 0.75 * 1000) / 1000} ${n1(sc * 1000) / 1000})">${body}</g>`);
              labs[i].draw(cx - labs[i].w / 2, floor + 8, o);
              if (node.id) o.parts[`${node.id}.${i + 1}`] = { x: n1(cx - slot / 2), y: n1(floor - hh), w: slot, h: n1(hh) };
            });
          },
        },
        node.id,
      );
    }

    case "balance": {
      const left = build(node.left, scene, out);
      const right = build(node.right, scene, out);
      const panW = Math.max(150, left.w + 30, right.w + 30);
      const load = Math.max(left.h, right.h);
      const tilt = node.tilt ?? 0;
      const beam = panW * 2 + 120;
      const h = load + 14 + 150;
      return withId(
        {
          w: beam,
          h,
          draw: (x, y, o) => {
            const cx = x + beam / 2;
            const beamY = y + load + 40;
            const dy = tilt * 16;
            const lx = x + panW / 2;
            const rx = x + beam - panW / 2;
            const s = `stroke="${COLORS.ink}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"`;
            // Post, foot, beam, strings, pans.
            o.svg.push(`<path d="M${n1(cx)} ${n1(beamY)}V${n1(y + h - 6)}M${n1(cx - 50)} ${n1(y + h - 6)}H${n1(cx + 50)}" fill="none" ${s}/>`);
            o.svg.push(`<path d="M${n1(cx - 10)} ${n1(beamY + 2)}L${n1(cx)} ${n1(beamY - 12)}L${n1(cx + 10)} ${n1(beamY + 2)}Z" fill="${COLORS.ink}"/>`);
            o.svg.push(`<path d="M${n1(lx)} ${n1(beamY + dy)}L${n1(rx)} ${n1(beamY - dy)}" ${s}/>`);
            for (const [px, d, k] of [[lx, dy, left], [rx, -dy, right]] as const) {
              const panY = beamY + d - 18 + 0;
              o.svg.push(`<path d="M${n1(px - panW / 2 + 6)} ${n1(panY)}Q${n1(px)} ${n1(panY + 22)} ${n1(px + panW / 2 - 6)} ${n1(panY)}" fill="#f7f7f9" ${s}/>`);
              o.svg.push(`<path d="M${n1(px)} ${n1(beamY + d)}V${n1(panY + 8)}" stroke="${COLORS.pencil}" stroke-width="1.5"/>`);
              k.draw(px - k.w / 2, panY - k.h - 2, o);
            }
          },
        },
        node.id,
      );
    }

    case "axis": {
      const step = node.step && node.step > 0 ? node.step : 1;
      // The axis reaches one step past every move and mark: an arrow ran off
      // the end of the scale, and one that stopped on the last tick made the
      // answer the axis's end (Oct 17 2026, the elevator pictures).
      const ends = [...(node.moves ?? []).flatMap((m) => [m.from, m.to]), ...(node.marks ?? []).map((m) => m.at)].filter(Number.isFinite);
      const min = Math.min(node.min, node.max, ...ends.map((v) => v - step));
      const max = Math.max(node.min, node.max, ...ends.map((v) => v + step));
      const ticks = Math.floor((max - min) / step) + 1;
      const vertical = node.orientation === "vertical";
      const gapPx = Math.max(22, Math.min(46, (vertical ? 420 : 560) / Math.max(1, ticks - 1)));
      const len = (ticks - 1) * gapPx;
      // A mark labelled with its own value ("+3" at 3, "-7" at -7) repeats the
      // tick beside it; the elevator picture had one on every floor (Oct 17 2026).
      const marks = (node.marks ?? [])
        .map((m) => (m.label && Number(m.label.replace(/^\+/, "").trim()) === m.at ? { ...m, label: undefined } : m))
        .filter((m) => m.label || m.icon);
      const markW = Math.max(0, ...marks.map((m) => (m.icon ? 40 : 0) + (m.label ? textWidth(m.label, FONT_PX.m) + 12 : 0)));
      const moves = node.moves ?? [];
      // Moves run in their own lane beside the marks (vertical) or above the
      // line (horizontal): "down 4" from the elevator, a hop of +3.
      const moveW = moves.length ? 34 + Math.max(0, ...moves.map((m) => (m.label ? textWidth(m.label, FONT_PX.m) + 10 : 0))) : 0;
      const numW = Math.max(...[min, max].map((v) => textWidth(String(v), FONT_PX.s))) + 10;
      const w = vertical ? numW + 24 + 16 + markW + moveW : len + 40;
      const h = vertical ? len + 30 : moves.length ? 150 : 104;
      const pos = (v: number) => ((v - min) / step) * gapPx;
      return withId(
        {
          w,
          h,
          draw: (x, y, o) => {
            const s = `stroke="${COLORS.ink}" stroke-width="${STROKE}" stroke-linecap="round"`;
            if (vertical) {
              const ax = x + numW + 12;
              const top = y + 15;
              o.svg.push(`<path d="M${n1(ax)} ${n1(top - 8)}V${n1(top + len + 8)}" ${s}/>`);
              for (let i = 0; i < ticks; i++) {
                const v = max - i * step;
                const ty = top + i * gapPx;
                const zero = Math.abs(v) < 1e-9;
                o.svg.push(`<path d="M${n1(ax - (zero ? 10 : 6))} ${n1(ty)}H${n1(ax + (zero ? 10 : 6))}" ${s}/>`);
                const t = tickText(node, v);
                o.svg.push(`<text x="${n1(ax - 12 - textWidth(t, FONT_PX.s))}" y="${n1(ty + 5)}" font-family="${FONT}" font-size="${FONT_PX.s}" font-weight="${zero ? 700 : 500}" fill="${COLORS.ink}">${esc(t)}</text>`);
                if (zero) o.svg.push(`<path d="M${n1(ax + 10)} ${n1(ty)}H${n1(x + w)}" stroke="${COLORS.green}" stroke-width="2" stroke-dasharray="6 5"/>`);
              }
              moves.forEach((mv) => {
                const lx = ax + 18 + markW + 14;
                const y0 = top + pos(max) - pos(mv.from);
                const y1 = top + pos(max) - pos(mv.to);
                const dir = y1 > y0 ? 1 : -1;
                o.svg.push(`<path d="M${n1(lx)} ${n1(y0)}V${n1(y1 - dir * 2)}" stroke="${COLORS.sky}" stroke-width="3" stroke-linecap="round"/>`);
                o.svg.push(`<path d="M${n1(lx - 7)} ${n1(y1 - dir * 10)}L${n1(lx)} ${n1(y1)}L${n1(lx + 7)} ${n1(y1 - dir * 10)}" fill="none" stroke="${COLORS.sky}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
                o.svg.push(`<path d="M${n1(lx - 6)} ${n1(y0)}H${n1(lx + 6)}" stroke="${COLORS.sky}" stroke-width="3" stroke-linecap="round"/>`);
                if (mv.label) o.svg.push(`<text x="${n1(lx + 10)}" y="${n1((y0 + y1) / 2 + 6)}" font-family="${FONT}" font-size="${FONT_PX.m}" font-weight="600" fill="${COLORS.sky}" ${HALO}>${esc(mv.label)}</text>`);
              });
              marks.forEach((m, i) => {
                const my = top + pos(max) - pos(m.at);
                let mx = ax + 18;
                if (m.icon) {
                  iconMarkup(m.icon, mx, my - 18, 36, scene.defs, o);
                  mx += 40;
                }
                if (m.label) o.svg.push(`<text x="${n1(mx)}" y="${n1(my + 6)}" font-family="${FONT}" font-size="${FONT_PX.m}" font-weight="600" fill="${COLORS[m.tone ?? "sky"]}" ${HALO}>${esc(m.label)}</text>`);
                if (node.id) o.parts[`${node.id}.mark${i + 1}`] = { x: n1(ax), y: n1(my - 18), w: n1(x + w - ax), h: 36 };
              });
            } else {
              const ay = y + (moves.length ? 102 : 56);
              const left = x + 20;
              moves.forEach((mv) => {
                const x0 = left + pos(mv.from);
                const x1 = left + pos(mv.to);
                const peak = ay - 30 - Math.min(40, Math.abs(x1 - x0) * 0.25);
                const cx = (x0 + x1) / 2;
                const cy = peak - 12;
                o.svg.push(`<path d="M${n1(x0)} ${n1(ay - 8)}Q${n1(cx)} ${n1(cy)} ${n1(x1)} ${n1(ay - 8)}" fill="none" stroke="${COLORS.sky}" stroke-width="3" stroke-linecap="round"/>`);
                // The head points along the curve where it lands.
                const ang = Math.atan2(ay - 8 - cy, x1 - cx);
                const hl = 12;
                o.svg.push(`<path d="M${n1(x1 - hl * Math.cos(ang - 0.45))} ${n1(ay - 8 - hl * Math.sin(ang - 0.45))}L${n1(x1)} ${n1(ay - 8)}L${n1(x1 - hl * Math.cos(ang + 0.45))} ${n1(ay - 8 - hl * Math.sin(ang + 0.45))}" fill="none" stroke="${COLORS.sky}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
                if (mv.label) o.svg.push(`<text x="${n1((x0 + x1) / 2 - textWidth(mv.label, FONT_PX.m) / 2)}" y="${n1(peak - 16)}" font-family="${FONT}" font-size="${FONT_PX.m}" font-weight="600" fill="${COLORS.sky}" ${HALO}>${esc(mv.label)}</text>`);
              });
              o.svg.push(`<path d="M${n1(left - 10)} ${n1(ay)}H${n1(left + len + 10)}" ${s}/>`);
              for (let i = 0; i < ticks; i++) {
                const v = min + i * step;
                const tx = left + i * gapPx;
                o.svg.push(`<path d="M${n1(tx)} ${n1(ay - 6)}V${n1(ay + 6)}" ${s}/>`);
                const t = tickText(node, v) + (node.unit && i === ticks - 1 && tickText(node, v) ? ` ${node.unit}` : "");
                o.svg.push(`<text x="${n1(tx - textWidth(String(v), FONT_PX.s) / 2)}" y="${n1(ay + 26)}" font-family="${FONT}" font-size="${FONT_PX.s}" fill="${COLORS.ink}">${esc(t)}</text>`);
              }
              marks.forEach((m, i) => {
                const mx = left + pos(m.at);
                if (m.icon) iconMarkup(m.icon, mx - 18, ay - 48, 36, scene.defs, o);
                if (m.label) o.svg.push(`<text x="${n1(mx - textWidth(m.label, FONT_PX.s) / 2)}" y="${n1(ay + (m.icon || moves.length ? 46 : -14))}" font-family="${FONT}" font-size="${FONT_PX.s}" font-weight="600" fill="${COLORS[m.tone ?? "sky"]}" ${HALO}>${esc(m.label)}</text>`);
                if (node.id) o.parts[`${node.id}.mark${i + 1}`] = { x: n1(mx - 18), y: n1(ay - 48), w: 36, h: 60 };
              });
            }
          },
        },
        node.id,
      );
    }
  }
  out.problems.push(`unknown node type "${(node as { type?: string }).type}"`);
  return { w: 0, h: 0, draw: () => {} };
}

/**
 * A tick's number. Where a move lands is hidden; a lone "?" between -10 and
 * -12 named -11 to every judge (Oct 19 2026), so with anything hidden only
 * landmarks keep their numbers: zero, multiples of 5, the ends, and the marks
 * and move starts. The student counts from a landmark, which is the skill.
 */
function tickText(node: Extract<SceneNode, { type: "axis" }>, v: number): string {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  if (!node.hide?.length) return String(v);
  if (node.hide.some((h) => near(h, v))) return "";
  const landmarks = [0, Math.min(node.min, node.max), Math.max(node.min, node.max), ...(node.marks ?? []).map((m) => m.at), ...(node.moves ?? []).map((m) => m.from)];
  return landmarks.some((l) => near(l, v)) || near(v % 5, 0) ? String(v) : "";
}

// ── Arrows and brackets, drawn over the laid-out parts ──────────────────

function center(r: Rect) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function edgePoint(r: Rect, toward: { x: number; y: number }, pad = 8) {
  const c = center(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const sx = dx === 0 ? Infinity : (r.w / 2 + pad) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (r.h / 2 + pad) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

/** The side of `r` that faces `o`. */
function facing(r: Rect, o: Rect): "l" | "r" | "t" | "b" {
  const c = center(r), d = center(o);
  const dx = d.x - c.x, dy = d.y - c.y;
  return Math.abs(dx) * (r.h + o.h) >= Math.abs(dy) * (r.w + o.w) ? (dx > 0 ? "r" : "l") : dy > 0 ? "b" : "t";
}

/**
 * Where each arrow leaves and lands. Arrows that share an edge of a part are
 * spaced along it in the order of their other ends, so they fan out instead of
 * meeting at one corner (Oct 19 2026, the outfits picture: six arrows from
 * three shirts to two pants, three heads piled in the gap between the pants).
 */
function arrowAnchors(pairs: Array<[Rect, Rect]>): Array<[{ x: number; y: number }, { x: number; y: number }]> {
  const ends: Array<{ i: number; end: 0 | 1; r: Rect; side: string; other: Rect }> = [];
  pairs.forEach(([a, b], i) => {
    ends.push({ i, end: 0, r: a, side: facing(a, b), other: b });
    ends.push({ i, end: 1, r: b, side: facing(b, a), other: a });
  });
  const out = pairs.map(([a, b]) => [edgePoint(a, center(b)), edgePoint(b, center(a))] as [{ x: number; y: number }, { x: number; y: number }]);
  const groups = new Map<string, typeof ends>();
  for (const e of ends) {
    const k = `${e.r.x},${e.r.y},${e.r.w},${e.r.h},${e.side}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const vert = g[0].side === "l" || g[0].side === "r";
    g.sort((p, q) => (vert ? center(p.other).y - center(q.other).y : center(p.other).x - center(q.other).x));
    const r = g[0].r;
    const span = (vert ? r.h : r.w) * 0.7;
    g.forEach((e, j) => {
      const t = g.length === 1 ? 0.5 : j / (g.length - 1);
      const along = (vert ? r.y + r.h / 2 : r.x + r.w / 2) - span / 2 + span * t;
      const pt = vert ? { x: e.side === "r" ? r.x + r.w + 4 : r.x - 4, y: along } : { x: along, y: e.side === "b" ? r.y + r.h + 4 : r.y - 4 };
      out[e.i][e.end] = pt;
    });
  }
  return out;
}

function drawArrow(a: Rect, b: Rect, text: string | undefined, tone: Tone, out: Out, at?: [{ x: number; y: number }, { x: number; y: number }], fan = false) {
  const p0 = at?.[0] ?? edgePoint(a, center(b));
  const p1 = at?.[1] ?? edgePoint(b, center(a));
  const mx = (p0.x + p1.x) / 2;
  const my = (p0.y + p1.y) / 2;
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  // A gentle bow, the way a hand draws an arrow.
  const nx = -(p1.y - p0.y) / len;
  const ny = (p1.x - p0.x) / len;
  // Fanned arrows go nearly straight: bowed, they cross each other twice.
  const bow = fan ? Math.min(8, len * 0.05) : Math.min(26, len * 0.14);
  const qx = mx + nx * bow;
  const qy = my + ny * bow;
  const col = COLORS[tone];
  out.svg.push(`<path d="M${n1(p0.x)} ${n1(p0.y)}Q${n1(qx)} ${n1(qy)} ${n1(p1.x)} ${n1(p1.y)}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`);
  out.ext.push(union([{ x: p0.x, y: p0.y, w: 0, h: 0 }, { x: p1.x, y: p1.y, w: 0, h: 0 }, { x: qx, y: qy, w: 0, h: 0 }]));
  const ang = Math.atan2(p1.y - qy, p1.x - qx);
  const hl = 11;
  out.svg.push(`<path d="M${n1(p1.x - hl * Math.cos(ang - 0.45))} ${n1(p1.y - hl * Math.sin(ang - 0.45))}L${n1(p1.x)} ${n1(p1.y)}L${n1(p1.x - hl * Math.cos(ang + 0.45))} ${n1(p1.y - hl * Math.sin(ang + 0.45))}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`);
  if (text) {
    const px = FONT_PX.m;
    const tw = textWidth(text, px);
    // Beside the bow first, then further out, then the other side, then by
    // either end: the first spot that covers no other words and no part the
    // arrow does not join (Oct 17 2026: "1 cup" and "price" sat on labels).
    const avoid = [...textRects(out), ...out.ext, ...Object.values(out.parts).filter((r) => r !== a && r !== b && !inside(a, r) && !inside(b, r))];
    const spots: Array<{ x: number; y: number }> = [];
    for (const off of [16, 32, 50]) for (const side of [1, -1]) spots.push({ x: mx + nx * (bow * side + off * side), y: my + ny * (bow * side + off * side) });
    spots.push({ x: p0.x, y: p0.y - 22 }, { x: p1.x, y: p1.y - 22 }, { x: p0.x, y: p0.y + 26 });
    const boxAt = (c: { x: number; y: number }) => ({ x: c.x - tw / 2 - 4, y: c.y - px * 0.65, w: tw + 8, h: px * 1.3 });
    const spot = spots.find((c) => !avoid.some((r) => overlaps(boxAt(c), r))) ?? spots[0];
    const box = boxAt(spot);
    const lx = box.x + 4;
    const ly = box.y + px;
    out.ext.push(box);
    out.svg.push(`<text x="${n1(lx)}" y="${n1(ly)}" font-family="${FONT}" font-size="${px}" font-weight="600" fill="${col}" ${HALO}>${esc(text)}</text>`);
  }
}

/** Where the words already drawn sit, read back from the SVG so far (icon bodies' tiny text left out). */
function textRects(out: Out): Rect[] {
  const rects: Rect[] = [];
  for (const chunk of out.svg) {
    for (const m of chunk.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)"[^>]*font-size="(\d+)"[^>]*>([^<]*)</g)) {
      const px = Number(m[3]);
      if (px < 12) continue;
      rects.push({ x: Number(m[1]), y: Number(m[2]) - px, w: textWidth(m[4], px), h: px * 1.3 });
    }
  }
  return rects;
}

function textsIn(out: Out): string[] {
  const texts: string[] = [];
  for (const chunk of out.svg) for (const m of chunk.matchAll(/<text x="[-\d.]+" y="[-\d.]+"[^>]*font-size="(\d+)"[^>]*>([^<]*)</g)) if (Number(m[1]) >= 12) texts.push(m[2]);
  return texts;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function inside(small: Rect, big: Rect): boolean {
  return small.x >= big.x - 1 && small.y >= big.y - 1 && small.x + small.w <= big.x + big.w + 1 && small.y + small.h <= big.y + big.h + 1;
}

function drawBracket(r: Rect, side: "top" | "bottom" | "left" | "right", text: string | undefined, tone: Tone, out: Out, gap = 12) {
  const col = COLORS[tone];
  const s = `fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
  const px = FONT_PX.m;
  if (side === "top" || side === "bottom") {
    const y = side === "top" ? r.y - gap : r.y + r.h + gap;
    const d = side === "top" ? -8 : 8;
    const mid = r.x + r.w / 2;
    out.svg.push(`<path d="M${n1(r.x)} ${n1(y - d)}Q${n1(r.x)} ${n1(y)} ${n1(r.x + 10)} ${n1(y)}H${n1(mid - 8)}Q${n1(mid)} ${n1(y)} ${n1(mid)} ${n1(y + d)}Q${n1(mid)} ${n1(y)} ${n1(mid + 8)} ${n1(y)}H${n1(r.x + r.w - 10)}Q${n1(r.x + r.w)} ${n1(y)} ${n1(r.x + r.w)} ${n1(y - d)}" ${s}/>`);
    const ty = side === "top" ? y + d - 8 : y + d + px + 4;
    // The whole curl and the label: for a bottom bracket the line itself sits
    // above y + d, and leaving it out let a label below the picture sit on it.
    // The ends curl 8px back toward the thing bracketed, the middle 8px away.
    const top = Math.min(y - 8, ty - px);
    const bottom = Math.max(y + 8, ty + px * 0.3);
    out.ext.push({ x: r.x, y: top, w: r.w, h: bottom - top });
    if (text) out.ext.push({ x: mid - textWidth(text, px) / 2, y: ty - px, w: textWidth(text, px), h: px * 1.3 });
    if (text) out.svg.push(`<text x="${n1(mid - textWidth(text, px) / 2)}" y="${n1(ty)}" font-family="${FONT}" font-size="${px}" font-weight="600" fill="${col}">${esc(text)}</text>`);
  } else {
    const x = side === "left" ? r.x - gap : r.x + r.w + gap;
    const d = side === "left" ? -8 : 8;
    const mid = r.y + r.h / 2;
    out.svg.push(`<path d="M${n1(x - d)} ${n1(r.y)}Q${n1(x)} ${n1(r.y)} ${n1(x)} ${n1(r.y + 10)}V${n1(mid - 8)}Q${n1(x)} ${n1(mid)} ${n1(x + d)} ${n1(mid)}Q${n1(x)} ${n1(mid)} ${n1(x)} ${n1(mid + 8)}V${n1(r.y + r.h - 10)}Q${n1(x)} ${n1(r.y + r.h)} ${n1(x - d)} ${n1(r.y + r.h)}" ${s}/>`);
    const tx = side === "left" ? x + d - 6 - textWidth(text ?? "", px) : x + d + 6;
    out.ext.push({ x: Math.min(x + d, tx), y: r.y, w: Math.abs(d) + 6 + textWidth(text ?? "", px), h: r.h });
    if (text) out.svg.push(`<text x="${n1(tx)}" y="${n1(mid + px * 0.35)}" font-family="${FONT}" font-size="${px}" font-weight="600" fill="${col}">${esc(text)}</text>`);
  }
}

function union(all: Rect[]): Rect {
  // A rect with a NaN in it would make the whole picture NaN; it is left out.
  const rs = all.filter((r) => [r.x, r.y, r.w, r.h].every(Number.isFinite));
  if (!rs.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ── Render ──────────────────────────────────────────────────────────────

/** Lay the scene out and draw it. Never throws: what it cannot draw goes in `problems`. */
export function renderScene(scene: Scene): Rendered {
  const out: Out = { svg: [], parts: {}, problems: [], ext: [] };
  const M = 34; // room round the picture for arrows, brackets and their labels
  let body: Box;
  try {
    body = build(scene.root, scene, out);
  } catch (err) {
    out.problems.push(`could not lay out: ${(err as Error).message}`);
    body = { w: 0, h: 0, draw: () => {} };
  }
  const title = scene.title ? label(scene.title, "l", "ink", 600) : null;
  const titleH = title ? title.h + 18 : 0;
  const w = Math.ceil(Math.max(body.w, title?.w ?? 0) + M * 2);
  const h = Math.ceil(body.h + titleH + M * 2);
  body.draw(M + (w - M * 2 - body.w) / 2, M + titleH, out);
  const drawable: Array<{ a: NonNullable<Scene["arrows"]>[number]; from: Rect; to: Rect }> = [];
  for (const a of scene.arrows ?? []) {
    const from = out.parts[a.from];
    const to = out.parts[a.to];
    if (!from || !to) {
      out.problems.push(`arrow ${a.from} → ${a.to}: no part with that id`);
      continue;
    }
    // An arrow from a part to itself has no direction and no length (Oct 17
    // 2026: Haiku drew "warmer" from the thermometer to itself, and the
    // picture's size came out NaN, so the board showed nothing).
    if (from === to || a.from === a.to) {
      out.problems.push(`arrow ${a.from} → ${a.to}: an arrow needs two different parts`);
      continue;
    }
    drawable.push({ a, from, to });
  }
  const anchors = arrowAnchors(drawable.map((d) => [d.from, d.to]));
  const fan = drawable.length >= 3;
  drawable.forEach((d, i) => drawArrow(d.from, d.to, d.a.label, d.a.tone ?? "sky", out, anchors[i], fan));
  for (const b of scene.brackets ?? []) {
    const ids = Array.isArray(b.over) ? b.over : [b.over];
    const rs = ids.map((id) => out.parts[id]).filter((r): r is Rect => Boolean(r));
    if (rs.length === 0) {
      out.problems.push(`bracket over ${ids.join(", ")}: no part with that id`);
      continue;
    }
    // A bracket over things inside a container (marbles in a bag, cans in a
    // batch) goes outside the container on its side, or it crosses the bag's
    // neck and the box's own label (Oct 17 2026, the bag and paint pictures).
    const inner = union(rs);
    const holderOf = (r: Rect) =>
      Object.entries(out.parts)
        .filter(([k, h]) => !ids.includes(k) && !k.includes(".") && h.w * h.h > r.w * r.h * 1.05 && inside(r, h))
        .map(([, h]) => h)
        .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    const holders = rs.map(holderOf).filter((h): h is Rect => Boolean(h));
    const side = b.side ?? "top";
    const outer = union([inner, ...holders]);
    const span =
      side === "top" || side === "bottom"
        ? { x: inner.x, w: inner.w, y: outer.y, h: outer.h }
        : { y: inner.y, h: inner.h, x: outer.x, w: outer.w };
    // "4 ft" on a bracket over a grid that already says "4 ft" on its edge is
    // the same words twice (Oct 17 2026, the tiles and chairs pictures).
    const said = (t: string) => t.toLowerCase().replace(/[^a-z0-9/.%-]+/g, " ").trim();
    if (b.label && textRects(out).some((r, i) => overlaps(r, { x: span.x - 30, y: span.y - 30, w: span.w + 60, h: span.h + 60 }) && said(textsIn(out)[i]) === said(b.label!))) continue;
    // Further out until it covers no other words and no earlier bracket
    // (Oct 17 2026: "4 equal parts" sat on "$40 price", "3 yellow" on "Batch 1").
    const avoid = [...textRects(out).filter((r) => !inside(r, inner)), ...out.ext];
    let drawn: Out | null = null;
    for (const gap of [12, 28, 44, 60, 76]) {
      const tmp: Out = { svg: [], parts: {}, problems: [], ext: [] };
      drawBracket(span, b.side ?? "top", b.label, b.tone ?? "sky", tmp, gap);
      drawn ??= tmp;
      if (!tmp.ext.some((e) => avoid.some((a) => overlaps(e, a)))) {
        drawn = tmp;
        break;
      }
    }
    out.svg.push(...drawn!.svg);
    out.ext.push(...drawn!.ext);
  }
  // The title goes above everything, brackets and arrow labels included
  // (a bracket's label over the top row had landed on the title).
  if (title) {
    const top = Math.min(M + titleH, ...out.ext.map((r) => r.y));
    const ty = Math.min(M - 6, top - title.h - 12);
    title.draw(M, ty, out);
    out.ext.push({ x: M, y: ty, w: title.w, h: title.h });
  }
  // Grow the picture to hold whatever the arrows and brackets reach past it.
  const all = union([{ x: 0, y: 0, w, h }, ...out.ext.map((r) => ({ x: r.x - 10, y: r.y - 10, w: r.w + 20, h: r.h + 20 }))]);
  const vx = Math.floor(all.x);
  const vy = Math.floor(all.y);
  const vw = Math.ceil(all.w);
  const vh = Math.ceil(all.h);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}">${out.svg.join("")}</svg>`;
  const parts = Object.fromEntries(Object.entries(out.parts).map(([k, r]) => [k, { ...r, x: n1(r.x - vx), y: n1(r.y - vy) }]));
  return { svg, w: vw, h: vh, parts, problems: out.problems };
}

/** Read a scene from model output: JSON, possibly wrapped in a code fence. Null when it is not one. */
export function parseScene(text: string): Scene | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as Scene;
    return obj && typeof obj === "object" && obj.root ? obj : null;
  } catch {
    return null;
  }
}
