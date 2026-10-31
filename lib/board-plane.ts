// A coordinate plane that stays and grows (Oct 25 2026). Mateo, after a
// session where the tutor graphed y = 2x − 1: "it just switched the screen
// over and then graphed two different graphs. First the dots, and then the
// line, but they looked like they had different slopes because it was more
// spread out… it should be like a playground, where it can move stuff around,
// mark stuff… and draw lines." Each draw_desmos call was a new Desmos picture
// with its own view: the three points fitted to x 0..2, the line alone to
// −10..10, so the same line looked twice as steep in one as in the other, and
// a Desmos picture is a screenshot nothing can be added to or marked on.
//
// So a graph is a spec (a view, points, lines, arrows) drawn as SVG with named
// parts, shown by the illustration shape (traced in as a hand draws it). The
// `graph` tool called again on the same page adds to the same plane at the
// same scale (only what is new is drawn in); the view always holds the origin
// and has square units, so a slope looks like what it is; a point the view
// does not hold widens it. Points are P1, P2…, lines L1…, arrows A1…, so the
// tutor can ring "b7.P2" or "b7.(1, 1)" and swipe over "y = 2x − 1".
//
// Why not a library: Mafs (MIT) and JSXGraph (MIT/LGPL) are the open-source
// graphing kits, and both are live widgets that draw from their own
// stylesheet and own the pointer. Everything on this board (marks, the
// tutor's picture of the board, the written-in reveal, undo) works from a
// shape's own SVG and its named parts, so the graph is drawn the same way,
// with Mafs's look: a light unit grid, ink axes, numbers on the axes.
//
// Pure: parsing, merging, the view and the drawing.

import { graphFunction, toDesmosLatex } from "./desmos-graph";
import { latexToPlain } from "./latex-plain";
import { textWidth } from "./illustration/scene";

export type PlanePoint = { id: string; x: number; y: number; name?: string };
export type PlaneLine = { id: string; text: string; latex: string } | { id: string; text: string; vertical: number };
export type PlaneArrow = { id: string; from: [number, number]; to: [number, number]; label?: string };
export type PlaneSpec = {
  kind: "plane";
  x: [number, number];
  y: [number, number];
  /** The view was asked for (x_min…), so content alone never moves it. */
  fixed?: boolean;
  points: PlanePoint[];
  lines: PlaneLine[];
  arrows: PlaneArrow[];
  caption?: string;
};
export type Rect = { x: number; y: number; w: number; h: number };
export type RenderedPlane = { svg: string; w: number; h: number; parts: Record<string, Rect>; aliases: Record<string, string> };
export type PlaneInput = { points?: unknown; lines?: unknown; arrows?: unknown; caption?: unknown; view?: { xMin?: number; xMax?: number; yMin?: number; yMax?: number } };

const MAX_POINTS = 20;
const MAX_LINES = 4;
const MAX_ARROWS = 6;
const FONT = "'tldraw_sans', 'IBM Plex Sans', 'Hanken Grotesk', system-ui, sans-serif";
const HAND = "'tldraw_draw', 'Shantell Sans', cursive";
const GRID = "#e9eaee";
const AXIS = "#3a3a42";
const NUMBER = "#6b6b75";
// One pen for the graph's own content (the points and the line they make),
// green for a second line, and the sky of every tutor mark for arrows.
const PEN = "#1d7ee6";
const PENS = [PEN, "#15803d", "#e5484d", "#5b5b66"];
const MARK = "#3d9cff";
const HALO = `stroke="#ffffff" stroke-width="4" stroke-linejoin="round" paint-order="stroke"`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n1 = (v: number) => Math.round(v * 10) / 10;
const minus = (s: string) => s.replace(/-(?=\s*[\d.(a-z])/gi, "−");
/** A number as it is written: 2, −1, 0.5, 1.25. */
export const fmt = (v: number) => minus(String(Math.round(v * 1000) / 1000));
const coordKey = (x: number, y: number) => `(${Math.round(x * 1000) / 1000},${Math.round(y * 1000) / 1000})`;
const textKey = (s: string) => s.replace(/\s+/g, "").replace(/[−–—]/g, "-").replace(/\$/g, "").toLowerCase();

const NUM = String.raw`[-−]?\d+(?:\.\d+)?|[-−]?\.\d+`;
const PAIR = new RegExp(String.raw`(?:\b([A-Za-z]\w{0,2})\s*)?\(\s*(${NUM})\s*,\s*(${NUM})\s*\)`, "g");
const num = (s: string) => Number(s.replace("−", "-"));

/** The points in "(0, -1); (1, 1); A(2, 3)", each once. */
export function parsePoints(input: unknown): Array<{ x: number; y: number; name?: string }> {
  if (typeof input !== "string") return [];
  const out: Array<{ x: number; y: number; name?: string }> = [];
  for (const m of input.matchAll(PAIR)) {
    const x = num(m[2]);
    const y = num(m[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const at = out.findIndex((p) => coordKey(p.x, p.y) === coordKey(x, y));
    // "P1(2, 0)" names the point by the board's own id: not a name to print.
    const name = m[1] && !/^(?:at|to|and|or|is|the)$/i.test(m[1]) && !/^P\d+$/i.test(m[1]) ? m[1].toUpperCase() : undefined;
    if (at >= 0) {
      if (name && !out[at].name) out[at].name = name;
      continue;
    }
    out.push({ x, y, ...(name ? { name } : {}) });
  }
  return out;
}

type LineIn = { text: string; latex: string } | { text: string; vertical: number };

/** One line from "y = 2x - 1", "x = 3" or "through (0, -1) and (2, 3)". */
export function parseLine(raw: string): LineIn | { error: string } {
  const s = raw.trim().replace(/^\$|\$$/g, "");
  const pts = parsePoints(s);
  if (pts.length === 2 && /through|between|join|from|to|\band\b|^\s*\(/i.test(s)) {
    const [a, b] = pts;
    if (a.x === b.x) return a.y === b.y ? { error: `"${raw}" names one point twice.` } : { text: `x = ${fmt(a.x)}`, vertical: a.x };
    const m = (b.y - a.y) / (b.x - a.x);
    const c = a.y - m * a.x;
    const text = `y = ${m === 0 ? "" : `${m === 1 ? "" : m === -1 ? "-" : fmt(m)}x`}${c === 0 ? (m === 0 ? "0" : "") : `${m === 0 ? "" : c < 0 ? " - " : " + "}${fmt(m === 0 ? c : Math.abs(c))}`}`;
    return { text: minus(text), latex: `y=${m}x+(${c})` };
  }
  const v = /^\s*x\s*=\s*([-−]?\d+(?:\.\d+)?)\s*$/.exec(s);
  if (v) return { text: `x = ${fmt(num(v[1]))}`, vertical: num(v[1]) };
  const rel = /^\s*y\s*=/i.test(s) ? s : /^\s*f\s*\(\s*x\s*\)\s*=/i.test(s) ? s.replace(/^\s*f\s*\(\s*x\s*\)/i, "y") : /x/.test(s) && !/=/.test(s) ? `y = ${s}` : null;
  if (!rel) return { error: `Could not draw "${raw}": write a line as "y = 2x - 1", "x = 3" or "through (0, -1) and (2, 3)".` };
  const latex = toDesmosLatex(rel);
  const f = graphFunction(latex);
  if (!f || !Number.isFinite(f(0.37))) return { error: `Could not read "${raw}" as y = something in x.` };
  const text = /\\/.test(rel) ? latexToPlain(rel) : rel.replace(/\s+/g, " ").replace(/\*/g, "").replace(/\^2\b/g, "²").replace(/\^3\b/g, "³");
  return { text: minus(text.trim()), latex };
}

/** The arrows in "(0, -1) to (1, -1): right 1; (1, -1) to (1, 1): up 2". */
export function parseArrows(input: unknown): Array<{ from: [number, number]; to: [number, number]; label?: string }> | { error: string } {
  if (typeof input !== "string" || !input.trim()) return [];
  const out: Array<{ from: [number, number]; to: [number, number]; label?: string }> = [];
  for (const raw of input.split(/\s*;\s*|\n/).filter(Boolean)) {
    const [path, ...rest] = raw.split(":");
    const pts = parsePoints(path.replace(/\b[A-Za-z]\w{0,2}(?=\s*\()/g, ""));
    if (pts.length !== 2) return { error: `"${raw.trim()}" needs two points: "(0, -1) to (1, -1): right 1".` };
    const label = rest.join(":").trim().slice(0, 24);
    out.push({ from: [pts[0].x, pts[0].y], to: [pts[1].x, pts[1].y], ...(label ? { label } : {}) });
  }
  return out;
}

const isFn = (l: PlaneLine): l is { id: string; text: string; latex: string } => "latex" in l;

/** A view that holds the origin and every point with room, units square. */
export function chooseView(points: Array<{ x: number; y: number }>, lines: PlaneLine[] = []): { x: [number, number]; y: [number, number] } {
  const xs = [0, ...points.map((p) => p.x)];
  const ys = [0, ...points.map((p) => p.y)];
  // With no points a line says where it is: where it crosses the y-axis, and the x-axis.
  if (points.length === 0) {
    for (const l of lines) {
      if (!isFn(l)) {
        xs.push(l.vertical);
        continue;
      }
      const f = graphFunction(l.latex);
      const b = f ? f(0) : NaN;
      if (Number.isFinite(b) && Math.abs(b) <= 20) ys.push(b);
      const r = f ? f(1) - b : NaN;
      if (Number.isFinite(r) && r !== 0 && Math.abs(-b / r) <= 20) xs.push(-b / r);
    }
    xs.push(-4, 4);
    ys.push(-4, 4);
  }
  let x0 = Math.floor(Math.min(...xs)) - 1;
  let x1 = Math.ceil(Math.max(...xs)) + 1;
  let y0 = Math.floor(Math.min(...ys)) - 1;
  let y1 = Math.ceil(Math.max(...ys)) + 1;
  const widen = (lo: number, hi: number, span: number): [number, number] => {
    let a = lo;
    let b = hi;
    for (let i = 0; b - a < span; i++) {
      if (i % 2 === 0) b++;
      else a--;
    }
    return [a, b];
  };
  [x0, x1] = widen(x0, x1, 6);
  [y0, y1] = widen(y0, y1, 6);
  // Not too tall or too flat a picture: the shorter side grows.
  const xs1 = x1 - x0;
  const ys1 = y1 - y0;
  if (ys1 > xs1 * 1.25) [x0, x1] = widen(x0, x1, Math.ceil(ys1 / 1.25));
  else if (ys1 < xs1 * 0.7) [y0, y1] = widen(y0, y1, Math.ceil(xs1 * 0.7));
  return { x: [x0, x1], y: [y0, y1] };
}

const inView = (spec: Pick<PlaneSpec, "x" | "y">, x: number, y: number) => x > spec.x[0] && x < spec.x[1] && y > spec.y[0] && y < spec.y[1];

/** A new plane, or an old one with this call's content added; what is new, and what changed. */
export function buildPlane(
  old: PlaneSpec | null,
  input: PlaneInput,
): { spec: PlaneSpec; fresh: Set<string>; added: string[]; rescaled: boolean } | { error: string } {
  const pts = parsePoints(input.points);
  const lineRaw = typeof input.lines === "string" ? input.lines.split(/\s*;\s*|\n/).map((l) => l.trim()).filter(Boolean) : [];
  const lines: LineIn[] = [];
  for (const raw of lineRaw) {
    const l = parseLine(raw);
    if ("error" in l) return l;
    lines.push(l);
  }
  const arrows = parseArrows(input.arrows);
  if ("error" in arrows) return arrows;
  const spec: PlaneSpec = old
    ? { ...old, points: [...old.points], lines: [...old.lines], arrows: [...old.arrows] }
    : { kind: "plane", x: [-5, 5], y: [-5, 5], points: [], lines: [], arrows: [] };
  const fresh = new Set<string>();
  const added: string[] = [];
  for (const p of pts) {
    const had = spec.points.find((q) => coordKey(q.x, q.y) === coordKey(p.x, p.y));
    if (had) {
      if (p.name && !had.name) had.name = p.name;
      continue;
    }
    if (spec.points.length >= MAX_POINTS) return { error: `A graph holds ${MAX_POINTS} points at most.` };
    const id = `P${spec.points.length + 1}`;
    spec.points.push({ id, x: p.x, y: p.y, ...(p.name ? { name: p.name } : {}) });
    fresh.add(id);
    added.push(`${id} ${p.name ? `${p.name} ` : ""}(${fmt(p.x)}, ${fmt(p.y)})`);
  }
  for (const l of lines) {
    if (spec.lines.some((q) => textKey(q.text) === textKey(l.text))) continue;
    if (spec.lines.length >= MAX_LINES) return { error: `A graph holds ${MAX_LINES} lines at most; start another with new_graph=true.` };
    const id = `L${spec.lines.length + 1}`;
    spec.lines.push({ id, ...l });
    fresh.add(id);
    added.push(`${id} ${l.text}`);
  }
  for (const a of arrows) {
    if (spec.arrows.length >= MAX_ARROWS) break;
    const id = `A${spec.arrows.length + 1}`;
    spec.arrows.push({ id, ...a });
    fresh.add(id);
    added.push(`${id} arrow${a.label ? ` "${a.label}"` : ""}`);
  }
  const caption = typeof input.caption === "string" && input.caption.trim() ? input.caption.trim().slice(0, 60) : undefined;
  if (caption && caption !== spec.caption) {
    spec.caption = caption;
    fresh.add("caption");
  }
  // The view: asked for, or fitted to the content; an old graph keeps its
  // own until a point falls outside it.
  const v = input.view ?? {};
  const asked = [v.xMin, v.xMax, v.yMin, v.yMax].some((n) => typeof n === "number");
  let rescaled = false;
  const all = [...spec.points, ...spec.arrows.flatMap((a) => [{ x: a.from[0], y: a.from[1] }, { x: a.to[0], y: a.to[1] }])];
  if (asked) {
    const xa: [number, number] = [Math.min(v.xMin ?? spec.x[0], 0), Math.max(v.xMax ?? spec.x[1], 0)];
    const ya: [number, number] = [Math.min(v.yMin ?? spec.y[0], 0), Math.max(v.yMax ?? spec.y[1], 0)];
    if (!(xa[1] > xa[0]) || !(ya[1] > ya[0])) return { error: "x_max must be more than x_min, and y_max more than y_min." };
    rescaled = Boolean(old) && (xa[0] !== spec.x[0] || xa[1] !== spec.x[1] || ya[0] !== spec.y[0] || ya[1] !== spec.y[1]);
    spec.x = xa;
    spec.y = ya;
    spec.fixed = true;
  } else if (!old) {
    const view = chooseView(all, spec.lines);
    spec.x = view.x;
    spec.y = view.y;
  } else if (all.some((p) => !inView(spec, p.x, p.y))) {
    const view = chooseView(all, spec.lines);
    spec.x = [Math.min(view.x[0], spec.x[0]), Math.max(view.x[1], spec.x[1])];
    spec.y = [Math.min(view.y[0], spec.y[0]), Math.max(view.y[1], spec.y[1])];
    rescaled = true;
  }
  // A number line fits its values: whole numbers with a step either side and
  // zero; decimals on the wholes around them (0.35 and 0.5 on 0 to 1, in tenths).
  if (!asked && isNumberLine(spec)) {
    const xs = all.map((p) => p.x);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const whole = xs.every((x) => Number.isInteger(x));
    const t = tickStep(Math.max(hi, 0) - Math.min(lo, 0));
    const view: [number, number] = !whole ? [Math.min(0, Math.floor(lo)), Math.max(1, Math.ceil(hi))] : t === 1 ? [Math.min(0, lo - 1), Math.max(0, hi + 1)] : [lo >= 0 ? 0 : Math.floor((lo - t / 2) / t) * t, hi <= 0 ? 0 : Math.ceil((hi + t / 2) / t) * t];
    if (view[0] !== spec.x[0] || view[1] !== spec.x[1]) rescaled = Boolean(old);
    spec.x = view;
  }
  return { spec, fresh, added, rescaled };
}

/** The step between numbered ticks for a span of this many units. */
export function tickStep(span: number): number {
  return span <= 12 ? 1 : span <= 24 ? 2 : span <= 60 ? 5 : span <= 120 ? 10 : 20;
}

/**
 * Everything on y = 0 and no lines: a number line, not a plane (Oct 31:
 * −7 − 4 was drawn on a coordinate plane, every dot labelled "(−7, 0)").
 */
export function isNumberLine(spec: PlaneSpec): boolean {
  return spec.lines.length === 0 && spec.points.length + spec.arrows.length > 0 && spec.points.every((p) => p.y === 0) && spec.arrows.every((a) => a.from[1] === 0 && a.to[1] === 0);
}

/** A number line: ticks and numbers under it, dots on it, hops arcing over it with their labels in lanes. */
function renderNumberLine(spec: PlaneSpec, fresh: Set<string>, width: number): RenderedPlane {
  const xSpan = spec.x[1] - spec.x[0];
  const M = 14;
  // Room for every whole number on a short line; a long one shrinks to fit.
  // Every whole number numbered on a short line; a long one shrinks to fit.
  const unit = Math.max(width / xSpan, xSpan <= 16 ? 32 : xSpan <= 30 ? 16 : 0);
  const gw = xSpan * unit;
  const top = spec.caption ? 28 : 0;
  const parts: Record<string, Rect> = {};
  const aliases: Record<string, string> = {};
  const out: string[] = [];
  const wrap = (id: string, inner: string) => (fresh.has(id) ? `<g data-fresh="1">${inner}</g>` : inner);
  const X = (x: number) => M + (x - spec.x[0]) * unit;
  // Hops first: their labels take lanes, and the line sits under the highest lane.
  const LANE = 18;
  const lanes: Rect[][] = [];
  const hops = spec.arrows.map((a) => {
    const x1 = X(a.from[0]);
    const x2 = X(a.to[0]);
    const lw = a.label ? textWidth(a.label, 15) : 0;
    const cx = (x1 + x2) / 2;
    let lane = 0;
    const r = (k: number) => ({ x: cx - lw / 2 - 3, y: k, w: lw + 6, h: 1 });
    while (a.label && (lanes[lane] ?? []).some((o) => r(lane).x < o.x + o.w && o.x < r(lane).x + r(lane).w)) lane++;
    if (a.label) (lanes[lane] ??= []).push(r(lane));
    return { a, x1, x2, cx, lw, lane };
  });
  const arcH = Math.min(26, Math.max(12, unit * 0.7));
  const laneCount = lanes.length;
  const base = top + M + (spec.arrows.length ? arcH + 8 + (laneCount ? 14 + (laneCount - 1) * LANE : 0) : 6);
  if (spec.caption) {
    out.push(wrap("caption", `<text x="${M}" y="17" font-family="${FONT}" font-size="15" font-weight="600" fill="#5b5b66">${esc(spec.caption)}</text>`));
    parts.caption = { x: M, y: 2, w: textWidth(spec.caption, 15), h: 20 };
  }
  const head = (x: number, y: number, dx: number) => `M${n1(x - dx * 7)} ${n1(y - 4)}L${n1(x)} ${n1(y)}L${n1(x - dx * 7)} ${n1(y + 4)}`;
  out.push(`<path d="M${n1(X(spec.x[0]) - 6)} ${n1(base)}H${n1(X(spec.x[1]) + 6)}${head(X(spec.x[1]) + 6, base, 1)}${head(X(spec.x[0]) - 6, base, -1)}" stroke="${AXIS}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
  parts["x-axis"] = { x: X(spec.x[0]), y: base - 6, w: gw, h: 12 };
  aliases.numberline = "x-axis";
  // A tick at every tenth, half or whole (whatever the span needs); a number
  // on each tick there is room for, else on every few.
  // Numbers on a round step with room for them (1, 2, 5, 10 …, or tenths and
  // halves on a short line); small ticks between, never closer than 8px.
  const NICE = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const step = NICE.find((n) => n * unit >= 30) ?? xSpan;
  const minor = [step / 10, step / 5, step / 2, step].find((m) => m * unit >= 8 && (step < 1 || Number.isInteger(m))) ?? step;
  const ticks: string[] = [];
  const nums: string[] = [];
  const k0 = Math.ceil(spec.x[0] / minor - 1e-9);
  for (let k = k0; k * minor <= spec.x[1] + 1e-9; k++) {
    const x = Math.round(k * minor * 1000) / 1000;
    const big = Math.abs(x / step - Math.round(x / step)) < 1e-6;
    ticks.push(`M${n1(X(x))} ${n1(base - (big ? 6 : 4))}V${n1(base + (big ? 6 : 4))}`);
    if (big) nums.push(`<text x="${n1(X(x))}" y="${n1(base + 21)}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="500" fill="#3a3a42" ${HALO}>${fmt(x)}</text>`);
  }
  out.push(`<path d="${ticks.join("")}" stroke="${AXIS}" stroke-width="1.4" fill="none"/>`);
  out.push(nums.join(""));
  for (const h of hops) {
    const dir = h.x2 >= h.x1 ? 1 : -1;
    const apex = base - arcH;
    const end = { x: h.x2 - dir * 1.5, y: base - 3 };
    // An arc over the line, its head pointing down at where the hop lands.
    let inner = `<path d="M${n1(h.x1)} ${n1(base - 3)}Q${n1(h.cx)} ${n1(apex - arcH * 0.5)} ${n1(end.x)} ${n1(end.y)}" stroke="${MARK}" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M${n1(end.x - dir * 6)} ${n1(end.y - 7)}L${n1(end.x)} ${n1(end.y)}L${n1(end.x - dir * 1)} ${n1(end.y - 9)}" stroke="${MARK}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    let box: Rect = { x: Math.min(h.x1, h.x2) - 2, y: apex - 4, w: Math.abs(h.x2 - h.x1) + 4, h: base - apex + 4 };
    if (h.a.label) {
      const ly = apex - 8 - h.lane * LANE;
      inner += `<text x="${n1(h.cx)}" y="${n1(ly)}" text-anchor="middle" font-family="${HAND}" font-size="15" font-weight="600" fill="${MARK}" ${HALO}>${esc(h.a.label)}</text>`;
      box = { x: Math.min(box.x, h.cx - h.lw / 2), y: ly - 14, w: Math.max(box.x + box.w, h.cx + h.lw / 2) - Math.min(box.x, h.cx - h.lw / 2), h: base - ly + 14 };
      aliases[textKey(h.a.label)] ??= h.a.id;
    }
    out.push(wrap(h.a.id, inner));
    parts[h.a.id] = box;
  }
  // Dots on the line; a named one has its name under the numbers.
  let low = base + 26;
  for (const p of spec.points) {
    const px = X(p.x);
    let inner = `<circle cx="${n1(px)}" cy="${n1(base)}" r="5.5" fill="${PEN}" stroke="#ffffff" stroke-width="1.5"/>`;
    if (p.name) {
      const tw = textWidth(p.name, 13);
      inner += `<text x="${n1(px)}" y="${n1(base + 38)}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="600" fill="${PEN}" ${HALO}>${esc(p.name)}</text>`;
      parts[`${p.id}.label`] = { x: px - tw / 2, y: base + 26, w: tw, h: 16 };
      aliases[p.name.toLowerCase()] = p.id;
      low = base + 44;
    }
    out.push(wrap(p.id, inner));
    parts[p.id] = { x: px - 8, y: base - 8, w: 16, h: 16 };
    aliases[coordKey(p.x, p.y)] = p.id;
    aliases[textKey(fmt(p.x))] ??= p.id;
  }
  const w = gw + M * 2;
  const h = low + M - 6;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n1(w)} ${n1(h)}" width="${n1(w)}" height="${n1(h)}">${out.join("")}</svg>`, w, h, parts, aliases };
}

/** Draw it. `width` is the plane's own width in px; units are square. */
export function renderPlane(spec: PlaneSpec, fresh: Set<string> = new Set(), width = 340): RenderedPlane {
  if (isNumberLine(spec)) return renderNumberLine(spec, fresh, Math.max(width, 380));
  const xSpan = spec.x[1] - spec.x[0];
  const ySpan = spec.y[1] - spec.y[0];
  let unit = width / xSpan;
  if (unit * ySpan > 400) unit = 400 / ySpan;
  const M = 10;
  const top = spec.caption ? 28 : 0;
  const gw = xSpan * unit;
  const gh = ySpan * unit;
  const w = gw + M * 2;
  const h = gh + M * 2 + top;
  const X = (x: number) => M + (x - spec.x[0]) * unit;
  const Y = (y: number) => top + M + (spec.y[1] - y) * unit;
  const out: string[] = [];
  const parts: Record<string, Rect> = {};
  const aliases: Record<string, string> = {};
  const wrap = (id: string, inner: string) => (fresh.has(id) ? `<g data-fresh="1">${inner}</g>` : inner);
  if (spec.caption) {
    out.push(wrap("caption", `<text x="${M}" y="17" font-family="${FONT}" font-size="15" font-weight="600" fill="#5b5b66">${esc(spec.caption)}</text>`));
    parts.caption = { x: M, y: 2, w: textWidth(spec.caption, 15), h: 20 };
  }
  // The grid: a line at every unit, or at every step when units are small.
  const step = tickStep(Math.max(xSpan, ySpan));
  const gridStep = unit >= 14 ? Math.min(step, 1) : step;
  const grid: string[] = [];
  for (let x = Math.ceil(spec.x[0] / gridStep) * gridStep; x <= spec.x[1] + 1e-9; x += gridStep) if (Math.abs(x) > 1e-9) grid.push(`M${n1(X(x))} ${n1(Y(spec.y[1]))}V${n1(Y(spec.y[0]))}`);
  for (let y = Math.ceil(spec.y[0] / gridStep) * gridStep; y <= spec.y[1] + 1e-9; y += gridStep) if (Math.abs(y) > 1e-9) grid.push(`M${n1(X(spec.x[0]))} ${n1(Y(y))}H${n1(X(spec.x[1]))}`);
  out.push(`<path d="${grid.join("")}" stroke="${GRID}" stroke-width="1" fill="none"/>`);
  // The axes, with arrowheads at the positive ends.
  const ox = X(0);
  const oy = Y(0);
  const head = (x: number, y: number, dx: number, dy: number) => `M${n1(x - dx * 7 - dy * 4)} ${n1(y - dy * 7 + dx * 4)}L${n1(x)} ${n1(y)}L${n1(x - dx * 7 + dy * 4)} ${n1(y - dy * 7 - dx * 4)}`;
  out.push(`<path d="M${n1(X(spec.x[0]))} ${n1(oy)}H${n1(X(spec.x[1]))}${head(X(spec.x[1]), oy, 1, 0)}M${n1(ox)} ${n1(Y(spec.y[0]))}V${n1(Y(spec.y[1]))}${head(ox, Y(spec.y[1]), 0, -1)}" stroke="${AXIS}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
  parts["x-axis"] = { x: X(spec.x[0]), y: oy - 6, w: gw, h: 12 };
  parts["y-axis"] = { x: ox - 6, y: Y(spec.y[1]), w: 12, h: gh };
  parts.origin = { x: ox - 8, y: oy - 8, w: 16, h: 16 };
  // Numbers along the axes, skipping the one the arrowhead sits on and any
  // a point sits on (its own label says it).
  const nums: string[] = [];
  // Where the axis numbers sit, so no point or arrow label lands on one
  // (Oct 31: "(2, −1)" ran into the tick "3").
  const tickRects: Rect[] = [];
  const under = (x: number, y: number) => spec.points.some((p) => Math.abs(X(p.x) - x) < 12 && Math.abs(Y(p.y) - y) < 12);
  for (let x = Math.ceil(spec.x[0] / step) * step; x < spec.x[1] - 1e-9; x += step) {
    if (Math.abs(x) < 1e-9 || x <= spec.x[0] + 1e-9 || under(X(x), oy + 4)) continue;
    nums.push(`<text x="${n1(X(x))}" y="${n1(oy + 15)}" text-anchor="middle" font-family="${FONT}" font-size="11.5" fill="${NUMBER}" ${HALO}>${fmt(x)}</text>`);
    tickRects.push({ x: X(x) - 10, y: oy + 4, w: 20, h: 14 });
  }
  for (let y = Math.ceil(spec.y[0] / step) * step; y < spec.y[1] - 1e-9; y += step) {
    if (Math.abs(y) < 1e-9 || y <= spec.y[0] + 1e-9 || under(ox - 4, Y(y))) continue;
    nums.push(`<text x="${n1(ox - 6)}" y="${n1(Y(y) + 4)}" text-anchor="end" font-family="${FONT}" font-size="11.5" fill="${NUMBER}" ${HALO}>${fmt(y)}</text>`);
    tickRects.push({ x: ox - 28, y: Y(y) - 8, w: 22, h: 14 });
  }
  nums.push(`<text x="${n1(ox - 6)}" y="${n1(oy + 15)}" text-anchor="end" font-family="${FONT}" font-size="11.5" fill="${NUMBER}" ${HALO}>0</text>`);
  out.push(nums.join(""));
  // Lines, clipped to the view.
  const slopeAt = (x: number): number | null => {
    for (const l of spec.lines) {
      if (!isFn(l)) continue;
      const f = graphFunction(l.latex);
      if (!f) continue;
      const s = (f(x + 0.01) - f(x - 0.01)) / 0.02;
      if (Number.isFinite(s)) return s;
    }
    return null;
  };
  // Where the lines run, in small boxes, so no label is written across one.
  const curveBoxes: Rect[] = [];
  spec.lines.forEach((l, i) => {
    const color = PENS[i % PENS.length];
    let d = "";
    let end: { x: number; y: number } | null = null;
    if (!isFn(l)) {
      if (l.vertical <= spec.x[0] || l.vertical >= spec.x[1]) return;
      d = `M${n1(X(l.vertical))} ${n1(Y(spec.y[0]))}V${n1(Y(spec.y[1]))}`;
      end = { x: X(l.vertical) + 6, y: Y(spec.y[1]) + 16 };
    } else {
      const f = graphFunction(l.latex);
      if (!f) return;
      const N = 240;
      let pen = false;
      let prev: { x: number; y: number } | null = null;
      for (let k = 0; k <= N; k++) {
        const x = spec.x[0] + (xSpan * k) / N;
        const y = f(x);
        if (!Number.isFinite(y)) {
          pen = false;
          prev = null;
          continue;
        }
        const inside = y >= spec.y[0] && y <= spec.y[1];
        if (prev && Math.abs(y - prev.y) > ySpan * 2) pen = false;
        if (inside && k % 3 === 0) curveBoxes.push({ x: X(x) - 3, y: Y(y) - 3, w: 6, h: 6 });
        if (inside) {
          if (!pen) {
            // Enter at the edge it came in through.
            if (prev && (prev.y < spec.y[0] || prev.y > spec.y[1])) {
              const edge = prev.y < spec.y[0] ? spec.y[0] : spec.y[1];
              const t = (edge - prev.y) / (y - prev.y);
              d += `M${n1(X(prev.x + (x - prev.x) * t))} ${n1(Y(edge))}L${n1(X(x))} ${n1(Y(y))}`;
            } else d += `M${n1(X(x))} ${n1(Y(y))}`;
            pen = true;
          } else d += `L${n1(X(x))} ${n1(Y(y))}`;
          end = { x: X(x), y: Y(y) };
        } else if (pen && prev) {
          const edge = y < spec.y[0] ? spec.y[0] : spec.y[1];
          const t = (edge - prev.y) / (y - prev.y);
          const ex = prev.x + (x - prev.x) * t;
          d += `L${n1(X(ex))} ${n1(Y(edge))}`;
          end = { x: X(ex), y: Y(edge) };
          pen = false;
        }
        prev = { x, y };
      }
    }
    if (!d || !end) return;
    // The equation beside the line's far end, kept inside the picture.
    const label = l.text;
    const lw = textWidth(label, 14);
    // Beside the end, on the side with room: right of it if it fits, else left, clear of the line.
    const lx = end.x + 10 + lw <= w - M ? end.x + 10 : Math.max(M + 2, end.x - lw - 14);
    const ly = Math.max(top + M + 14, Math.min(end.y + (end.y < top + M + 30 ? 22 : -8), h - M - 4));
    out.push(wrap(l.id, `<path d="${d}" stroke="${color}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="${n1(lx)}" y="${n1(ly)}" font-family="${FONT}" font-size="14" font-weight="600" fill="${color}" ${HALO}>${esc(label)}</text>`));
    parts[l.id] = { x: lx, y: ly - 14, w: lw, h: 18 };
    aliases[textKey(l.text)] = l.id;
  });
  // Arrows: the tutor's own marks on the graph (right 1, up 2), in sky, labelled by hand.
  const arrowLabels: Rect[] = [];
  // A dot and a ring round it take this much room from point labels; an arrow's label only needs to miss the dot.
  const dotZones = spec.points.filter((q) => inView(spec, q.x, q.y)).map((q) => ({ x: X(q.x) - 10, y: Y(q.y) - 10, w: 20, h: 20 }));
  const shafts: Rect[] = spec.arrows.map((o) => ({ x: Math.min(X(o.from[0]), X(o.to[0])) - 3, y: Math.min(Y(o.from[1]), Y(o.to[1])) - 3, w: Math.abs(X(o.to[0]) - X(o.from[0])) + 6, h: Math.abs(Y(o.to[1]) - Y(o.from[1])) + 6 }));
  for (const a of spec.arrows) {
    const x1 = X(a.from[0]);
    const y1 = Y(a.from[1]);
    const x2 = X(a.to[0]);
    const y2 = Y(a.to[1]);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const dx = (x2 - x1) / len;
    const dy = (y2 - y1) / len;
    let inner = `<path d="M${n1(x1)} ${n1(y1)}L${n1(x2)} ${n1(y2)}${head(x2, y2, dx, dy)}" stroke="${MARK}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    let box: Rect = { x: Math.min(x1, x2) - 4, y: Math.min(y1, y2) - 4, w: Math.abs(x2 - x1) + 8, h: Math.abs(y2 - y1) + 8 };
    if (a.label) {
      const lw = textWidth(a.label, 15);
      // Spots round the arrow: under or over a sideways one, right or left of
      // an upright one, at its middle and then nearer its ends; the first that
      // is inside the picture and clear of every other label, arrow, dot and
      // axis number wins (Oct 31: "right 1" and "right 2" from one start were
      // written on top of each other, "up 1" sat on the axis).
      const side = Math.abs(dx) >= Math.abs(dy);
      const spots: Array<[number, number]> = [];
      for (const t of [0.5, 0.3, 0.7]) {
        const mx = x1 + (x2 - x1) * t;
        const my = y1 + (y2 - y1) * t;
        if (side) spots.push([mx - lw / 2, my + 19], [mx - lw / 2, my - 7], [mx - lw / 2, my + 37], [mx - lw / 2, my - 25]);
        else spots.push([mx + 7, my + 5], [mx - lw - 7, my + 5]);
      }
      const axisBand: Rect[] = [{ x: X(spec.x[0]), y: oy - 3, w: gw, h: 6 }, { x: ox - 3, y: Y(spec.y[1]), w: 6, h: gh }];
      const clear = ([x, y]: [number, number]) => {
        const r = { x: x - 2, y: y - 14, w: lw + 4, h: 18 };
        if (r.x < 2 || r.x + r.w > w - 2 || r.y < top + 2 || r.y + r.h > h - 2) return false;
        const hits = (o: Rect) => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h;
        return ![...arrowLabels, ...dotZones, ...tickRects, ...shafts, ...axisBand, ...curveBoxes].some(hits);
      };
      const [lx2, ly] = spots.find(clear) ?? spots.find(([x, y]) => clear([x, y]) || ![...arrowLabels].some((o) => x < o.x + o.w && o.x < x + lw && y - 14 < o.y + o.h && o.y < y + 4)) ?? spots[0];
      arrowLabels.push({ x: lx2, y: ly - 14, w: lw, h: 18 });
      inner += `<text x="${n1(lx2)}" y="${n1(ly)}" font-family="${HAND}" font-size="15" font-weight="600" fill="${MARK}" ${HALO}>${esc(a.label)}</text>`;
      box = { x: Math.min(box.x, lx2), y: Math.min(box.y, ly - 14), w: Math.max(box.x + box.w, lx2 + lw) - Math.min(box.x, lx2), h: Math.max(box.y + box.h, ly + 4) - Math.min(box.y, ly - 14) };
      aliases[textKey(a.label)] = a.id;
    }
    out.push(wrap(a.id, inner));
    parts[a.id] = box;
  }
  // Points last, over the lines, each with its coordinates.
  const placedLabels: Rect[] = [...Object.entries(parts).filter(([k]) => /^L\d+$/.test(k)).map(([, r]) => r), ...arrowLabels, ...tickRects, ...shafts, ...curveBoxes];
  // Each dot with the room a ring round it takes, so no label sits under a ring
  // (Oct 31 2026: the rings on (2, 0) and (3, 0) covered their labels).
  const dots: Rect[] = spec.points.filter((q) => inView(spec, q.x, q.y)).map((q) => ({ x: X(q.x) - 17, y: Y(q.y) - 17, w: 34, h: 34 }));
  for (const p of spec.points) {
    if (!inView(spec, p.x, p.y) && !(p.x === spec.x[0] || p.y === spec.y[0])) continue;
    const px = X(p.x);
    const py = Y(p.y);
    const text = `${p.name ? `${p.name} ` : ""}(${fmt(p.x)}, ${fmt(p.y)})`;
    const tw = textWidth(text, 13);
    // Off the line's side: up and left of a rising line, up and right otherwise.
    const s = slopeAt(p.x);
    // Up and left of a rising line, up and right otherwise; then the other
    // spots round the dot, the first that is inside the picture and clear of
    // every other label and dot (Oct 31 2026: (2, 0) and (3, 0) ran into each other).
    const left = px - tw - 19, right = px + 19, above = py - 15, below = py + 29;
    const near: Array<[number, number]> = (s !== null && s > 0 ? [[left, above], [right, below], [right, above], [left, below]] : [[right, above], [left, below], [left, above], [right, below]]) as Array<[number, number]>;
    // Then straight above or below, then a step further out.
    const tries: Array<[number, number]> = [...near, [px - tw / 2, py - 19], [px - tw / 2, py + 33], ...near.map(([x, y]): [number, number] => [x + (x < px ? -14 : 14), y + (y < py ? -12 : 12)])];
    const fits = ([x, y]: [number, number]) => {
      const r = { x, y: y - 12, w: tw, h: 16 };
      if (r.x < M || r.x + r.w > w - M || r.y < top + M || r.y + r.h > h - M) return false;
      const hits = (o: Rect) => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h;
      return !placedLabels.some(hits) && !dots.some(hits);
    };
    const [lx, ly] = tries.find(fits) ?? tries[0];
    placedLabels.push({ x: lx, y: ly - 12, w: tw, h: 16 });
    out.push(wrap(p.id, `<circle cx="${n1(px)}" cy="${n1(py)}" r="5" fill="${PEN}" stroke="${PEN}" stroke-width="1.5"/><text x="${n1(lx)}" y="${n1(ly)}" font-family="${FONT}" font-size="13" font-weight="500" fill="#3a3a42" ${HALO}>${esc(text)}</text>`));
    // The dot itself: a ring round it stays inside the room kept free above.
    parts[p.id] = { x: px - 8, y: py - 8, w: 16, h: 16 };
    parts[`${p.id}.label`] = { x: lx, y: ly - 12, w: tw, h: 16 };
    aliases[coordKey(p.x, p.y)] = p.id;
    if (p.name) aliases[p.name.toLowerCase()] = p.id;
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n1(w)} ${n1(h)}" width="${n1(w)}" height="${n1(h)}">${out.join("")}</svg>`, w, h, parts, aliases };
}

/** The graph as the tutor reads it back. */
export function describePlane(spec: PlaneSpec): string {
  if (isNumberLine(spec)) {
    const bits = [
      spec.points.length ? `dots ${spec.points.map((p) => `${p.id} ${p.name ? `${p.name} ` : ""}at ${fmt(p.x)}`).join(", ")}` : "",
      spec.arrows.length ? `hops ${spec.arrows.map((a) => `${a.id} from ${fmt(a.from[0])} to ${fmt(a.to[0])}${a.label ? ` "${a.label}"` : ""}`).join(", ")}` : "",
    ].filter(Boolean);
    return `a number line from ${fmt(spec.x[0])} to ${fmt(spec.x[1])}, every whole number marked; ${bits.join("; ")}`;
  }
  const bits = [
    spec.points.length ? `points ${spec.points.map((p) => `${p.id} ${p.name ? `${p.name} ` : ""}(${fmt(p.x)}, ${fmt(p.y)})`).join(", ")}` : "",
    spec.lines.length ? `lines ${spec.lines.map((l) => `${l.id} ${l.text}`).join(", ")}` : "",
    spec.arrows.length ? `arrows ${spec.arrows.map((a) => `${a.id}${a.label ? ` "${a.label}"` : ""}`).join(", ")}` : "",
  ].filter(Boolean);
  return `${bits.join("; ") || "empty"}; x ${fmt(spec.x[0])} to ${fmt(spec.x[1])}, y ${fmt(spec.y[0])} to ${fmt(spec.y[1])}`;
}

/** A part's id from what the tutor called it: "P2", "(1, 1)", "y = 2x - 1", "A", "up 2". */
export function findPart(parts: Record<string, Rect>, aliases: Record<string, string>, want: string): string | null {
  const w = want.trim();
  if (parts[w]) return w;
  const upper = w.toUpperCase();
  if (parts[upper]) return upper;
  const pair = /\(\s*([-−]?[\d.]+)\s*,\s*([-−]?[\d.]+)\s*\)/.exec(w);
  if (pair) {
    const id = aliases[coordKey(num(pair[1]), num(pair[2]))];
    if (id) return id;
  }
  return aliases[textKey(w)] ?? null;
}
