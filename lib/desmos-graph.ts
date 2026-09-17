// Graphs on the board are drawn by Desmos (components/board/desmos-renderer.ts).
// This module is the pure part, unit-tested: it turns what the tutor wrote into
// LaTeX Desmos reads, catches expressions that cannot be read, picks a view
// that shows the interesting part, and builds the list of Desmos expressions.
import { ComputeEngine, compile } from "@cortex-js/compute-engine";
import { formatNumber, type XYPoint } from "./board-diagrams";
import {
  graphSettings,
  toPx,
  type GraphBounds,
  type GraphExpression,
  type GraphMarker,
  type GraphSize,
  type GraphSpec,
} from "./desmos-spec";

// The spec types live in desmos-spec.ts (version 2); these names stay for callers.
export type { GraphBounds, GraphExpression, GraphMarker, GraphSpec } from "./desmos-spec";
export { graphSpecText } from "./desmos-spec";

export const GRAPH_INK = "#121215";

// ── Tutor input → Desmos LaTeX ────────────────────────────────────────────────
// Desmos reads LaTeX. Models also write plain math: sqrt(x), abs(x), |x|, sin(x),
// x², e^(-x), x^-2. Each of those is an error in Desmos, so they are rewritten.

const SUPERSCRIPTS: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };

const CALLS: Record<string, (arg: string) => string> = {
  sqrt: (a) => `\\sqrt{${a}}`,
  cbrt: (a) => `\\sqrt[3]{${a}}`,
  abs: (a) => `\\left|${a}\\right|`,
  exp: (a) => `e^{${a}}`,
  floor: (a) => `\\operatorname{floor}\\left(${a}\\right)`,
  ceil: (a) => `\\operatorname{ceil}\\left(${a}\\right)`,
  round: (a) => `\\operatorname{round}\\left(${a}\\right)`,
  sign: (a) => `\\operatorname{sign}\\left(${a}\\right)`,
  asin: (a) => `\\arcsin\\left(${a}\\right)`,
  acos: (a) => `\\arccos\\left(${a}\\right)`,
  atan: (a) => `\\arctan\\left(${a}\\right)`,
};
for (const name of ["arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "sin", "cos", "tan", "sec", "csc", "cot", "ln", "log"]) {
  CALLS[name] = (a) => `\\${name}\\left(${a}\\right)`;
}
const CALL_RE = new RegExp(`(^|[^\\\\A-Za-z])(${Object.keys(CALLS).sort((a, b) => b.length - a.length).join("|")})\\s*\\(`);
const RELATION_RE = /(=|<|>|\\le(?![a-z])|\\ge(?![a-z])|\\ne(?![a-z]))/;
const RESTRICTION_RE = /\\left\\\{[\s\S]*?\\right\\\}/g;

/** Index of the ")" that closes the "(" at `open`, or -1. */
function closingParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function rewriteCalls(input: string): string {
  let s = input;
  for (let guard = 0; guard < 40; guard++) {
    const m = CALL_RE.exec(s);
    if (!m) break;
    const nameStart = m.index + m[1].length;
    const open = s.indexOf("(", nameStart + m[2].length);
    const close = closingParen(s, open);
    if (close < 0) break;
    s = s.slice(0, nameStart) + CALLS[m[2]](rewriteCalls(s.slice(open + 1, close))) + s.slice(close + 1);
  }
  return s;
}

/** |x| → \left|x\right|, pairing bars left to right; left alone when they do not pair up. */
function rewriteBars(s: string): string {
  const bars: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "|") continue;
    if (s.slice(Math.max(0, i - 5), i) === "\\left" || s.slice(Math.max(0, i - 6), i) === "\\right") continue;
    bars.push(i);
  }
  if (bars.length === 0 || bars.length % 2 !== 0) return s;
  let out = "";
  let last = 0;
  bars.forEach((pos, k) => {
    out += s.slice(last, pos) + (k % 2 === 0 ? "\\left|" : "\\right|");
    last = pos + 1;
  });
  return out + s.slice(last);
}

/** e^(−x) → e^{−x}, x^-2 → x^{-2}, x^12 → x^{12}. */
function rewriteExponents(input: string): string {
  let s = input;
  for (let guard = 0; guard < 20; guard++) {
    const i = s.search(/\^\s*\(/);
    if (i < 0) break;
    const open = s.indexOf("(", i);
    const close = closingParen(s, open);
    if (close < 0) break;
    s = `${s.slice(0, i)}^{${s.slice(open + 1, close)}}${s.slice(close + 1)}`;
  }
  return s.replace(/\^\s*(-?\d+(?:\.\d+)?)/g, "^{$1}").replace(/\^\s*-\s*([A-Za-z])/g, "^{-$1}");
}

export function toDesmosLatex(input: string): string {
  let s = input.trim();
  s = s
    .replace(/[−–—]/g, "-")
    .replace(/[×✕]/g, "\\times ")
    .replace(/[·⋅∙]/g, "\\cdot ")
    .replace(/÷/g, "/")
    .replace(/≤|<=/g, "\\le ")
    .replace(/≥|>=/g, "\\ge ")
    .replace(/≠|!=/g, "\\ne ")
    .replace(/π/g, "\\pi ")
    .replace(/θ/g, "\\theta ")
    .replace(/\*\*/g, "^");
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => `^{${[...m].map((c) => SUPERSCRIPTS[c]).join("")}}`);
  s = s.replace(/√\s*\(/g, "sqrt(").replace(/√\s*([A-Za-z]|\d+(?:\.\d+)?)/g, "\\sqrt{$1}");
  s = rewriteCalls(s);
  s = s.replace(/(^|[^\\A-Za-z])(sin|cos|tan|sec|csc|cot|ln|log)(?=\s+[A-Za-z0-9\\(])/g, "$1\\$2");
  s = rewriteBars(s);
  s = s.replace(/(^|[^\\A-Za-z])pi(?![A-Za-z])/g, "$1\\pi ");
  s = rewriteExponents(s);
  s = s.replace(/\*/g, "\\cdot ");
  return s.replace(/\s+/g, " ").trim();
}

/** A bare expression in x is graphed as y = …; relations and points are left alone. */
export function ensureRelation(latex: string): string {
  const body = latex.replace(RESTRICTION_RE, "");
  if (RELATION_RE.test(body)) return latex;
  if (/^\(\s*[^()]+,[^()]+\)$/.test(latex.trim())) return latex;
  return `y=${latex}`;
}

// ── Checking and sampling (Compute Engine) ────────────────────────────────────
let ceEngine: ComputeEngine | null = null;
function engine(): ComputeEngine {
  ceEngine ??= new ComputeEngine();
  return ceEngine;
}

// Only broken structure is refused up front. An unknown command (Desmos has
// many Compute Engine does not) is left for Desmos to judge.
const STRUCTURE_PROBLEMS: Record<string, string> = {
  "expected-closing-delimiter": "a bracket is opened but never closed",
  "expected-open-delimiter": "a bracket is closed but never opened",
  "unexpected-delimiter": "a closing bracket has nothing to close",
  "unbalanced-braces": "the braces do not match",
  missing: "part of it is missing",
  "expected-expression": "part of it is missing",
};

/** Why a Desmos LaTeX expression cannot be read, or null when it looks fine. */
export function graphLatexProblem(latex: string): string | null {
  try {
    const expr = engine().parse(latex) as unknown as { isValid?: boolean; errors?: Array<{ json?: unknown }> };
    if (expr.isValid !== false) return null;
    for (const error of expr.errors ?? []) {
      const json = error.json;
      const code = Array.isArray(json) && typeof json[1] === "string" ? json[1].replace(/^'|'$/g, "") : "";
      if (STRUCTURE_PROBLEMS[code]) return STRUCTURE_PROBLEMS[code];
    }
    return null;
  } catch {
    return null;
  }
}

/** y as a function of x for "y = …", "y > …", or a bare expression; null for anything else (a circle, x = 3). */
export function graphFunction(latex: string): ((x: number) => number) | null {
  const body = latex.replace(RESTRICTION_RE, "").trim();
  const m = /^y\s*(?:=|<|>|\\le(?![a-z])|\\ge(?![a-z]))\s*([\s\S]+)$/.exec(body);
  const rhs = m ? m[1] : RELATION_RE.test(body) ? null : body;
  if (!rhs || /(^|[^A-Za-z\\])y([^A-Za-z]|$)/.test(rhs)) return null;
  try {
    const result = compile(engine().parse(rhs)) as unknown as { success?: boolean; run?: (scope: Record<string, number>) => unknown };
    if (!result?.success || typeof result.run !== "function") return null;
    const run = result.run.bind(result);
    return (x: number) => {
      try {
        const value = Number(run({ x }));
        return Number.isFinite(value) ? value : NaN;
      } catch {
        return NaN;
      }
    };
  } catch {
    return null;
  }
}

/** A y-range that shows the curves; the far tails are trimmed so an asymptote cannot flatten the rest. */
export function autoYRange(fns: Array<(x: number) => number>, left: number, right: number, keepYs: number[] = []): { bottom: number; top: number } | null {
  const ys: number[] = [];
  const N = 240;
  for (const f of fns) {
    for (let i = 0; i <= N; i++) {
      const v = f(left + ((right - left) * i) / N);
      if (Number.isFinite(v)) ys.push(v);
    }
  }
  const keep = keepYs.filter(Number.isFinite);
  if (ys.length === 0 && keep.length === 0) return null;
  ys.sort((a, b) => a - b);
  const at = (q: number) => ys[Math.min(ys.length - 1, Math.max(0, Math.round(q * (ys.length - 1))))];
  let lo = ys.length > 20 ? at(0.04) : (ys[0] ?? Infinity);
  let hi = ys.length > 20 ? at(0.96) : (ys[ys.length - 1] ?? -Infinity);
  for (const y of keep) {
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const span = hi - lo;
  // Show the x-axis when it is close by, with room under it for its numbers
  // (at 8% Desmos pinned them, greyed, to the picture's edge).
  if (lo > 0 && lo < span * 0.5) lo = -span * 0.1;
  if (hi < 0 && -hi < span * 0.5) hi = span * 0.1;
  return { bottom: lo, top: hi };
}

/**
 * Square units (a circle looks round, a slope looks like its number) when the
 * ranges are already close to square; otherwise the ranges asked for are kept,
 * so y from 0 to 1000 over x from -10 to 10 is not squashed into a sliver and
 * two lines over x from -2 to 6 are not zoomed out. "equal" always squares.
 * The smaller range grows around its middle; nothing asked for is cut off.
 */
export function fitBounds(b: GraphBounds, w: number, h: number, mode: "auto" | "equal" | "stretch" = "auto"): GraphBounds {
  const xs = b.right - b.left;
  const ys = b.top - b.bottom;
  if (!(xs > 0) || !(ys > 0) || !(w > 0) || !(h > 0) || mode === "stretch") return b;
  const unitX = xs / w;
  const unitY = ys / h;
  const ratio = unitX / unitY;
  if (mode === "auto" && (ratio < 2 / 3 || ratio > 1.5)) return b;
  if (unitX > unitY) {
    const extra = (unitX * h - ys) / 2;
    return { ...b, bottom: b.bottom - extra, top: b.top + extra };
  }
  const extra = (unitY * w - xs) / 2;
  return { ...b, left: b.left - extra, right: b.right + extra };
}

/** Where a math point lands inside a graph picture w × h. */
export function graphPointBox(point: { x: number; y: number }, bounds: GraphBounds, w: number, h: number): { x: number; y: number } {
  return toPx(point, bounds, { w, h });
}

/** Where two curves cross (a sign change of their difference, refined); jumps at asymptotes are not crossings. */
export function curveCrossings(f: (x: number) => number, g: (x: number) => number, left: number, right: number, limit = 3): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const N = 400;
  const d = (x: number) => f(x) - g(x);
  for (let i = 1; i <= N && out.length < limit; i++) {
    let a = left + ((right - left) * (i - 1)) / N;
    let b = left + ((right - left) * i) / N;
    let da = d(a);
    const db = d(b);
    if (!Number.isFinite(da) || !Number.isFinite(db) || da * db > 0) continue;
    for (let k = 0; k < 60; k++) {
      const m = (a + b) / 2;
      const dm = d(m);
      if (!Number.isFinite(dm)) break;
      if (da * dm <= 0) b = m;
      else {
        a = m;
        da = dm;
      }
    }
    const x = (a + b) / 2;
    const y = f(x);
    if (!Number.isFinite(y) || Math.abs(d(x)) > 1e-6 * (1 + Math.abs(y))) continue;
    if (out.some((p) => Math.abs(p.x - x) < ((right - left) / N) * 2)) continue;
    out.push({ x, y });
  }
  return out;
}

// ── Extra lines without Desmos ────────────────────────────────────────────────
// The vector renderer (TldrawCore) draws what it can of the extra expressions:
// a curve y = f(x) (a restricted piece too), a vertical line, a circle, and the
// side an inequality shades. Anything else is left out.

export type VectorExtra = {
  line:
    | { kind: "curve"; fn: (x: number) => number; from: number | null; to: number | null }
    | { kind: "vertical"; x: number; from: number | null; to: number | null }
    | { kind: "circle"; cx: number; cy: number; r: number }
    | null;
  /** A strict inequality's boundary is dashed. */
  dashed: boolean;
  /** The shaded side, for an inequality. */
  shade: "above" | "below" | "left" | "right" | "inside" | "outside" | null;
};

const REL_SPLIT_RE = /(\\le(?![a-z])|\\ge(?![a-z])|<|>|=)/;
const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;

/** (lhs) − (rhs) as a function of x and y, or null. */
function relationFunction(lhs: string, rhs: string): ((x: number, y: number) => number) | null {
  try {
    const result = compile(engine().parse(`\\left(${lhs}\\right)-\\left(${rhs}\\right)`)) as unknown as { success?: boolean; run?: (scope: Record<string, number>) => unknown };
    if (!result?.success || typeof result.run !== "function") return null;
    const run = result.run.bind(result);
    return (x: number, y: number) => {
      try {
        const v = Number(run({ x, y }));
        return Number.isFinite(v) ? v : NaN;
      } catch {
        return NaN;
      }
    };
  } catch {
    return null;
  }
}

/** "\\left\\{1\\le x\\le 3\\right\\}" → the variable and its range; null when it is not that simple. */
function readRestriction(latex: string): { v: "x" | "y"; lo: number; hi: number } | null {
  const m = /^\\left\\{\s*(-?\d+(?:\.\d+)?)\s*(?:<|\\le)\s*([xy])\s*(?:<|\\le)\s*(-?\d+(?:\.\d+)?)\s*\\right\\}$/.exec(latex.trim());
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = Number(m[3]);
  return hi > lo ? { v: m[2] as "x" | "y", lo, hi } : null;
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * (1 + Math.abs(a) + Math.abs(b));

export function vectorExtra(raw: string): VectorExtra | null {
  const latex = ensureRelation(toDesmosLatex(raw));
  const restrictions = latex.match(RESTRICTION_RE) ?? [];
  if (restrictions.length > 1) return null;
  const restriction = restrictions[0] ? readRestriction(restrictions[0]) : null;
  if (restrictions[0] && !restriction) return null;
  const body = latex.replace(RESTRICTION_RE, "").trim();
  const parts = body.split(REL_SPLIT_RE);
  if (parts.length !== 3) return null;
  const [lhsRaw, op, rhsRaw] = parts;
  const lhs = lhsRaw.trim();
  const rhs = rhsRaw.trim();
  if (!lhs || !rhs) return null;
  const g = relationFunction(lhs, rhs);
  if (!g) return null;
  const dashed = op === "<" || op === ">";
  const holds = (x: number, y: number) => {
    const v = g(x, y);
    if (!Number.isFinite(v)) return false;
    return op === "<" ? v < 0 : op === ">" ? v > 0 : op === "=" ? close(v, 0) : op.startsWith("\\le") ? v <= 0 : v >= 0;
  };
  const inequality = op !== "=";

  // x = c (a restriction on y makes it a segment).
  if (lhs === "x" && NUMBER_RE.test(rhs)) {
    if (restriction && restriction.v !== "y") return null;
    const x = Number(rhs);
    return {
      line: { kind: "vertical", x, from: restriction?.lo ?? null, to: restriction?.hi ?? null },
      dashed,
      shade: inequality && !restriction ? (holds(x - 1, 0) ? "left" : "right") : null,
    };
  }
  if (restriction && restriction.v !== "x") return null;
  const from = restriction?.lo ?? null;
  const to = restriction?.hi ?? null;

  // y as a function of x: y op f(x), or anything linear in y (2x + 3y < 6).
  let fn: ((x: number) => number) | null = lhs === "y" ? graphFunction(`y=${rhs}`) : null;
  if (!fn) {
    const probes = [-1.3, 0.7, 2.9];
    const q = g(probes[0], 1) - g(probes[0], 0);
    const linear = Number.isFinite(q) && Math.abs(q) > 1e-9 && probes.every((x) => close(g(x, 1) - g(x, 0), q) && close(g(x, 2) - g(x, 1), q));
    if (linear) fn = (x: number) => -g(x, 0) / q;
  }
  if (fn) {
    const f = fn;
    let shade: VectorExtra["shade"] = null;
    if (inequality && !restriction) {
      const x0 = [0.5, 1.7, -2.3].find((x) => Number.isFinite(f(x)));
      if (x0 !== undefined) shade = holds(x0, f(x0) + 1) ? "above" : "below";
    }
    return { line: { kind: "curve", fn: f, from, to }, dashed, shade };
  }
  if (restriction) return null;

  // A circle: g = a(x² + y²) + bx + cy + d, read from a few values.
  const d = g(0, 0);
  const a = (g(1, 0) + g(-1, 0)) / 2 - d;
  const b = (g(1, 0) - g(-1, 0)) / 2;
  const c = g(0, 1) - a - d;
  const model = (x: number, y: number) => a * (x * x + y * y) + b * x + c * y + d;
  const fits = [[0, -1], [1, 1], [2, -3], [-2.5, 1.5]].every(([x, y]) => close(g(x, y), model(x, y)));
  if (fits && Math.abs(a) > 1e-9) {
    const cx = -b / (2 * a) + 0;
    const cy = -c / (2 * a) + 0;
    const r2 = cx * cx + cy * cy - d / a;
    if (r2 > 0) {
      return {
        line: { kind: "circle", cx, cy, r: Math.sqrt(r2) },
        dashed,
        shade: inequality ? (holds(cx, cy) ? "inside" : "outside") : null,
      };
    }
  }
  return null;
}

// ── Graph specs ───────────────────────────────────────────────────────────────
function num(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  return Object.is(r, -0) ? "0" : String(r);
}

function includeMarkers(b: GraphBounds, markers: GraphMarker[]): GraphBounds {
  const out = { ...b };
  const padX = (b.right - b.left) * 0.08;
  const padY = (b.top - b.bottom) * 0.08;
  for (const m of markers) {
    if (m.x < out.left) out.left = m.x - padX;
    if (m.x > out.right) out.right = m.x + padX;
    if (m.y < out.bottom) out.bottom = m.y - padY;
    if (m.y > out.top) out.top = m.y + padY;
  }
  return out;
}

/** A dot per point marker; label markers ride on their own expressions. */
function markerExpressions(markers: GraphMarker[], color: string): GraphExpression[] {
  return markers
    .filter((m) => m.kind !== "label")
    .map((m, i) => ({ id: `point${i + 1}`, latex: `(${num(m.x)},${num(m.y)})`, color, pointSize: 10, label: m.label, showLabel: Boolean(m.label) }));
}

/** An implicit relation in x and y (a circle): drawn with square units. */
function isImplicit(latex: string): boolean {
  const body = latex.replace(RESTRICTION_RE, "");
  return !/^\s*y\s*(=|<|>|\\le(?![a-z])|\\ge(?![a-z]))/.test(body) && /(^|[^A-Za-z\\])y([^A-Za-z]|$)/.test(body);
}

export type FunctionGraphInput = {
  expression: string;
  second?: string;
  extras?: string[];
  xMin: number;
  xMax: number;
  yMin?: number;
  yMax?: number;
  markPoints?: XYPoint[];
  slopeRun?: { x1: number; x2: number } | null;
  /** Pen colours (hex) for the curves, in order; the slope triangle takes the next one. */
  colors: string[];
  box: GraphSize;
};

export function buildFunctionGraph(input: FunctionGraphInput): { spec: GraphSpec; problems: string[] } {
  const colors = input.colors.length > 0 ? input.colors : ["#4465e9"];
  const raws = [input.expression, input.second, ...(input.extras ?? [])].filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  const problems: string[] = [];
  const expressions: GraphExpression[] = [];
  const fns: Array<(x: number) => number> = [];
  let equalUnits = false;
  const latexByRaw = raws.map((raw) => ensureRelation(toDesmosLatex(raw)));
  latexByRaw.forEach((latex, i) => {
    const problem = graphLatexProblem(latex);
    if (problem) problems.push(`"${raws[i]}": ${problem}`);
    expressions.push({ id: `curve${i + 1}`, latex, color: colors[i % colors.length], lineWidth: 3 });
    const fn = graphFunction(latex);
    if (fn) fns.push(fn);
    if (isImplicit(latex)) equalUnits = true;
  });

  const markers: GraphMarker[] = [];
  const first = latexByRaw[0] ? graphFunction(latexByRaw[0]) : null;
  const second = input.second && latexByRaw[1] ? graphFunction(latexByRaw[1]) : null;
  if (first && second) {
    for (const p of curveCrossings(first, second, input.xMin, input.xMax)) markers.push({ x: p.x, y: p.y, label: `(${formatNumber(p.x)}, ${formatNumber(p.y)})`, kind: "point" });
  }
  for (const p of input.markPoints ?? []) markers.push({ x: p.x, y: p.y, label: p.label?.trim() ?? "", kind: "point" });

  const slope: GraphExpression[] = [];
  const slopeLabels: GraphMarker[] = [];
  if (input.slopeRun && first) {
    const x1 = Math.min(input.slopeRun.x1, input.slopeRun.x2);
    const x2 = Math.max(input.slopeRun.x1, input.slopeRun.x2);
    const y1 = first(x1);
    const y2 = first(x2);
    if (Number.isFinite(y1) && Number.isFinite(y2) && x2 > x1) {
      const c = colors[raws.length % colors.length];
      const lowY = Math.min(y1, y2);
      const highY = Math.max(y1, y2);
      const run = { x: (x1 + x2) / 2, y: y1, label: `run ${formatNumber(x2 - x1)}`, kind: "label" as const, orientation: (y2 >= y1 ? "below" : "above") as GraphMarker["orientation"] };
      const rise = { x: x2, y: (y1 + y2) / 2, label: `rise ${formatNumber(y2 - y1)}`, kind: "label" as const, orientation: "right" as const };
      slope.push(
        { id: "run", latex: `y=${num(y1)}\\left\\{${num(x1)}\\le x\\le ${num(x2)}\\right\\}`, color: c, lineStyle: "DASHED", lineWidth: 2.5 },
        { id: "rise", latex: `x=${num(x2)}\\left\\{${num(lowY)}\\le y\\le ${num(highY)}\\right\\}`, color: c, lineStyle: "DASHED", lineWidth: 2.5 },
        // Label-only points: a near-zero dot. (pointOpacity 0 also hides the
        // label text in Desmos's SVG export, checked Sept 15 2026.)
        { id: "runLabel", latex: `(${num(run.x)},${num(run.y)})`, color: c, pointSize: 0.01, label: run.label, showLabel: true, labelOrientation: run.orientation },
        { id: "riseLabel", latex: `(${num(rise.x)},${num(rise.y)})`, color: c, pointSize: 0.01, label: rise.label, showLabel: true, labelOrientation: rise.orientation },
      );
      markers.push({ x: x1, y: y1, label: "", kind: "point" }, { x: x2, y: y2, label: "", kind: "point" });
      slopeLabels.push(run, rise);
    }
  }
  expressions.push(...slope, ...markerExpressions(markers, GRAPH_INK));

  const auto = autoYRange(fns, input.xMin, input.xMax, markers.map((m) => m.y));
  let bottom: number;
  let top: number;
  if (equalUnits && input.yMin === undefined && input.yMax === undefined) {
    // A circle needs square units: the y range follows the x range the tutor
    // asked for (around the x-axis when the curves cross it), instead of a line
    // on the same axes stretching y and zooming the circle away.
    const span = ((input.xMax - input.xMin) * input.box.h) / input.box.w;
    const mid = !auto || (auto.bottom <= 0 && auto.top >= 0) ? 0 : (auto.bottom + auto.top) / 2;
    bottom = mid - span / 2;
    top = mid + span / 2;
  } else {
    bottom = input.yMin ?? auto?.bottom ?? -5;
    top = input.yMax ?? auto?.top ?? 5;
  }
  if (!(top > bottom)) top = bottom + 10;
  const bounds = fitBounds(includeMarkers({ left: input.xMin, right: input.xMax, bottom, top }, markers), input.box.w, input.box.h, equalUnits ? "equal" : "auto");
  const spec: GraphSpec = {
    v: 2,
    kind: "function",
    size: { ...input.box },
    bounds,
    settings: graphSettings(bounds, input.box),
    expressions,
    markers: [...markers, ...slopeLabels],
    source: {
      kind: "function",
      expression: input.expression,
      xMin: input.xMin,
      xMax: input.xMax,
      extras: {
        markPoints: input.markPoints ?? [],
        slopeRun: input.slopeRun ?? null,
        ...(input.second ? { secondExpression: input.second } : {}),
        ...(input.yMin !== undefined ? { yMin: input.yMin } : {}),
        ...(input.yMax !== undefined ? { yMax: input.yMax } : {}),
        ...(input.extras?.length ? { extraExpressions: input.extras } : {}),
      },
    },
  };
  return { spec, problems };
}

export function buildPointsGraph(input: { points: XYPoint[]; connect: boolean; xMin: number; xMax: number; yMin: number; yMax: number; colors: string[]; box: GraphSize }): GraphSpec {
  const color = input.colors[0] ?? "#4465e9";
  const points = input.points.slice(0, 24);
  const expressions: GraphExpression[] = [];
  if (input.connect && points.length >= 2) {
    expressions.push({ id: "shape", latex: `\\operatorname{polygon}(${points.map((p) => `(${num(p.x)},${num(p.y)})`).join(",")})`, color, fillOpacity: points.length >= 3 ? 0.15 : 0, lineWidth: 3 });
  }
  const markers: GraphMarker[] = points.map((p) => ({ x: p.x, y: p.y, label: p.label?.trim() ?? "", kind: "point" }));
  expressions.push(...markerExpressions(markers, color));
  const bounds = fitBounds(includeMarkers({ left: input.xMin, right: input.xMax, bottom: input.yMin, top: input.yMax }, markers), input.box.w, input.box.h, input.connect ? "equal" : "auto");
  return {
    v: 2,
    kind: "points",
    size: { ...input.box },
    bounds,
    settings: graphSettings(bounds, input.box),
    expressions,
    markers,
    source: { kind: "points", points, connect: input.connect, xMin: input.xMin, xMax: input.xMax, yMin: input.yMin, yMax: input.yMax },
  };
}

export function buildAxesGraph(input: { xMin: number; xMax: number; yMin: number; yMax: number; box: GraphSize }): GraphSpec {
  const bounds = fitBounds({ left: input.xMin, right: input.xMax, bottom: input.yMin, top: input.yMax }, input.box.w, input.box.h);
  return {
    v: 2,
    kind: "axes",
    size: { ...input.box },
    bounds,
    settings: graphSettings(bounds, input.box),
    expressions: [],
    markers: [],
    source: { kind: "axes", xMin: input.xMin, xMax: input.xMax, yMin: input.yMin, yMax: input.yMax },
  };
}
