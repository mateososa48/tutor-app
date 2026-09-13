// Pure geometry and parsing for the whiteboard diagram tools. No tldraw, no
// DOM, so every function here is unit-tested with node:test. The renderer in
// components/TldrawCore.tsx turns these numbers into shapes.

export type Pt = { x: number; y: number };

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function splitPipe(input: string | undefined): string[] {
  return (input ?? "").split("|").map((s) => s.trim()).filter(Boolean);
}

// "3/4", "-1/2", "1.5", "2", "1 1/2" (mixed number). Null when unparseable.
export function parseNumber(input: string): number | null {
  const s = input.trim().replace(/−/g, "-");
  if (!s) return null;
  const mixed = s.match(/^(-?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const sign = mixed[1] === "-" ? -1 : 1;
    const whole = Number(mixed[2]);
    const d = Number(mixed[4]);
    if (d === 0) return null;
    return sign * (whole + Number(mixed[3]) / d);
  }
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (frac) {
    const d = Number(frac[2]);
    if (d === 0) return null;
    return Number(frac[1]) / d;
  }
  if (/^[+-]?inf(inity)?$/i.test(s)) return s.startsWith("-") ? -Infinity : Infinity;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ── Fractions ──────────────────────────────────────────────────────────────

export type Fraction = { n: number; d: number };

// "3/4" → {3,4}. "2" → {2,1}. "1 1/2" → {3,2}. Denominator capped at 24 so a
// pie or bar stays legible; numerator may exceed the denominator (improper).
export function parseFraction(input: string): Fraction | null {
  const s = input.trim().replace(/−/g, "-");
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const d = Number(mixed[3]);
    if (d < 1 || d > 24) return null;
    return { n: Number(mixed[1]) * d + Number(mixed[2]), d };
  }
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const d = Number(frac[2]);
    if (d < 1 || d > 24) return null;
    return { n: Number(frac[1]), d };
  }
  if (/^\d+$/.test(s)) return { n: Number(s), d: 1 };
  return null;
}

export function fractionText(f: Fraction): string {
  return f.d === 1 ? `${f.n}` : `${f.n}/${f.d}`;
}

export function fractionLatex(f: Fraction): string {
  return f.d === 1 ? `${f.n}` : `\\dfrac{${f.n}}{${f.d}}`;
}

// How many whole models a fraction needs: 3/4 → 1, 5/4 → 2, 8/4 → 2.
export function wholesNeeded(f: Fraction): number {
  return Math.max(1, Math.ceil(f.n / f.d));
}

export function describeFractionModel(f: Fraction, model: "circle" | "bar"): string {
  const wholes = wholesNeeded(f);
  const noun = model === "circle" ? "circle" : "bar";
  const plural = wholes === 1 ? noun : `${noun}s`;
  const parts = f.d === 1 ? "whole" : `${f.d} equal parts`;
  return `${wholes} ${plural} cut into ${parts}, ${f.n} shaded (${fractionText(f)})`;
}

// Angles in degrees, screen orientation (0° = right, 90° = down). Sectors
// start at the top (-90°) and go clockwise, the way fraction pies are drawn.
export function dividerAngles(d: number): number[] {
  if (d <= 1) return [];
  return Array.from({ length: d }, (_, i) => -90 + (360 * i) / d);
}

export function arcPolyline(cx: number, cy: number, r: number, startDeg: number, endDeg: number, stepDeg = 6): Pt[] {
  const span = endDeg - startDeg;
  const steps = Math.max(2, Math.ceil(Math.abs(span) / stepDeg));
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((startDeg + (span * i) / steps) * Math.PI) / 180;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

// Closed pie-slice polygon: centre → arc → back to centre.
export function sectorPolygon(cx: number, cy: number, r: number, startDeg: number, endDeg: number, stepDeg = 6): Pt[] {
  const arc = arcPolyline(cx, cy, r, startDeg, endDeg, stepDeg);
  return [{ x: cx, y: cy }, ...arc, { x: cx, y: cy }];
}

// ── Number lines ───────────────────────────────────────────────────────────

const UNIT_DENOMINATORS = [2, 3, 4, 5, 6, 8, 10, 12, 16];

// Pick a tick spacing that gives at most `maxTicks` labelled ticks.
export function niceStep(min: number, max: number, maxTicks = 10): number {
  const span = Math.abs(max - min);
  if (span === 0) return 1;
  const rough = span / maxTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    const step = m * pow;
    if (span / step <= maxTicks) return step;
  }
  return 10 * pow;
}

export function tickValues(min: number, max: number, step: number): number[] {
  if (!(step > 0) || !(max > min)) return [];
  const eps = step * 1e-6;
  const first = Math.ceil((min - eps) / step) * step;
  const values: number[] = [];
  for (let v = first; v <= max + eps && values.length < 200; v += step) {
    values.push(Math.abs(v) < eps ? 0 : Number(v.toFixed(10)));
  }
  return values;
}

// Label a tick. Fractional steps get fraction labels ("3/4"), integer steps
// get integers, anything else a trimmed decimal.
export function formatTick(value: number, step: number): string {
  const eps = 1e-9;
  if (Math.abs(value - Math.round(value)) < eps) return `${Math.round(value)}`;
  if (step < 1) {
    for (const d of UNIT_DENOMINATORS) {
      const n = value * d;
      if (Math.abs(n - Math.round(n)) < 1e-6) {
        const num = Math.round(n);
        const g = gcd(Math.abs(num), d);
        return `${num / g}/${d / g}`;
      }
    }
  }
  return `${Number(value.toFixed(3))}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export type LineMark = { value: number; label?: string };

// "0, 2:x≥2, 1/2:half" or ";"-separated.
export function parseLineMarks(input?: string): LineMark[] {
  if (!input?.trim()) return [];
  const marks: LineMark[] = [];
  for (const raw of input.split(/[;,\n]/)) {
    const chunk = raw.trim();
    if (!chunk) continue;
    const idx = chunk.indexOf(":");
    const valueRaw = idx >= 0 ? chunk.slice(0, idx) : chunk;
    const label = idx >= 0 ? chunk.slice(idx + 1).trim() : "";
    const value = parseNumber(valueRaw);
    if (value === null || !Number.isFinite(value)) continue;
    marks.push(label ? { value, label } : { value });
  }
  return marks;
}

export type LineInterval = {
  from: number; // -Infinity for a ray to the left
  to: number;   // Infinity for a ray to the right
  openFrom: boolean;
  openTo: boolean;
  label?: string;
};

// "2..5" closed, "(2..5)" open, "[2..5)" mixed, "2..inf" ray, "-inf..3" ray.
// "2 to 5" is accepted too. Optional ":label" suffix.
export function parseLineIntervals(input?: string): LineInterval[] {
  if (!input?.trim()) return [];
  const out: LineInterval[] = [];
  for (const raw of input.split(/[;\n]/)) {
    let chunk = raw.trim();
    if (!chunk) continue;
    let label: string | undefined;
    const labelIdx = chunk.lastIndexOf(":");
    if (labelIdx > 0 && !/\.\.|to/.test(chunk.slice(labelIdx))) {
      label = chunk.slice(labelIdx + 1).trim() || undefined;
      chunk = chunk.slice(0, labelIdx).trim();
    }
    let openFrom = false;
    let openTo = false;
    if (chunk.startsWith("(")) { openFrom = true; chunk = chunk.slice(1); }
    else if (chunk.startsWith("[")) { chunk = chunk.slice(1); }
    if (chunk.endsWith(")")) { openTo = true; chunk = chunk.slice(0, -1); }
    else if (chunk.endsWith("]")) { chunk = chunk.slice(0, -1); }
    const parts = chunk.split(/\.\.|\s+to\s+/).map((s) => s.trim());
    if (parts.length !== 2) continue;
    const from = parseNumber(parts[0]);
    const to = parseNumber(parts[1]);
    if (from === null || to === null || !(to > from)) continue;
    out.push({
      from,
      to,
      openFrom: from === -Infinity ? true : openFrom,
      openTo: to === Infinity ? true : openTo,
      ...(label ? { label } : {}),
    });
  }
  return out;
}

export type LineJump = { from: number; to: number; label?: string };

// "0>3:+3; 3>5:+2" (also "0->3"). Jumps may go left ("5>2:-3").
export function parseLineJumps(input?: string): LineJump[] {
  if (!input?.trim()) return [];
  const out: LineJump[] = [];
  for (const raw of input.split(/[;\n]/)) {
    const chunk = raw.trim();
    if (!chunk) continue;
    const m = chunk.match(/^(.+?)\s*-?>\s*([^:]+?)\s*(?::\s*(.+))?$/);
    if (!m) continue;
    const from = parseNumber(m[1]);
    const to = parseNumber(m[2]);
    if (from === null || to === null || !Number.isFinite(from) || !Number.isFinite(to) || from === to) continue;
    out.push(m[3]?.trim() ? { from, to, label: m[3].trim() } : { from, to });
  }
  return out;
}

// ── Geometry figures ───────────────────────────────────────────────────────

export type FigureKind = "triangle" | "right_triangle" | "square" | "rectangle" | "circle";

export function isFigureKind(value: string): value is FigureKind {
  return value === "triangle" || value === "right_triangle" || value === "square" || value === "rectangle" || value === "circle";
}

// Vertices in a w×h box, listed so edge i runs from pts[i] to pts[i+1] and
// the base is edge 0 (bottom, left to right). Right triangles put the right
// angle at the bottom-left vertex.
export function figureVertices(figure: Exclude<FigureKind, "circle">, w: number, h: number): Pt[] {
  switch (figure) {
    case "triangle":
      return [{ x: 0, y: h }, { x: w, y: h }, { x: w * 0.38, y: 0 }];
    case "right_triangle":
      return [{ x: 0, y: h }, { x: w, y: h }, { x: 0, y: 0 }];
    case "square":
    case "rectangle":
      return [{ x: 0, y: h }, { x: w, y: h }, { x: w, y: 0 }, { x: 0, y: 0 }];
  }
}

export function centroid(pts: Pt[]): Pt {
  const n = pts.length || 1;
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / n,
    y: pts.reduce((s, p) => s + p.y, 0) / n,
  };
}

// Point `dist` outside edge i (from pts[i] to pts[i+1]), measured from its midpoint.
export function edgeLabelPoint(pts: Pt[], i: number, dist: number): Pt {
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const c = centroid(pts);
  const dx = mid.x - c.x;
  const dy = mid.y - c.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: mid.x + (dx / len) * dist, y: mid.y + (dy / len) * dist };
}

// Point `dist` outside vertex i, away from the centroid.
export function vertexLabelPoint(pts: Pt[], i: number, dist: number): Pt {
  const p = pts[i];
  const c = centroid(pts);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / len) * dist, y: p.y + (dy / len) * dist };
}

// Point `dist` inside vertex i, toward the centroid (for angle labels).
export function angleLabelPoint(pts: Pt[], i: number, dist: number): Pt {
  const p = pts[i];
  const c = centroid(pts);
  const dx = c.x - p.x;
  const dy = c.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / len) * dist, y: p.y + (dy / len) * dist };
}

// ── Sketches ───────────────────────────────────────────────────────────────

export type SketchStroke = { points: Pt[]; closed: boolean };

// Strokes separated by ";". Each stroke is "x,y x,y x,y" in a 0–100 box,
// optionally prefixed with "closed" to fill it: "closed 10,90 90,90 50,20".
export function parseSketchStrokes(input: string): SketchStroke[] {
  const out: SketchStroke[] = [];
  for (const raw of input.split(/[;\n]/)) {
    let chunk = raw.trim();
    if (!chunk) continue;
    let closed = false;
    if (/^closed\b/i.test(chunk)) {
      closed = true;
      chunk = chunk.replace(/^closed\b:?/i, "").trim();
    }
    const points: Pt[] = [];
    for (const pair of chunk.split(/\s+/)) {
      const m = pair.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
      if (!m) continue;
      points.push({ x: clamp(Number(m[1]), 0, 100), y: clamp(Number(m[2]), 0, 100) });
    }
    if (points.length >= 2) out.push({ points, closed: closed && points.length >= 3 });
    if (out.length >= 24) break;
  }
  return out;
}

export type SketchLabel = { x: number; y: number; text: string };

// "50,10:ramp; 80,60:box"
export function parseSketchLabels(input?: string): SketchLabel[] {
  if (!input?.trim()) return [];
  const out: SketchLabel[] = [];
  for (const raw of input.split(/[;\n]/)) {
    const m = raw.trim().match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\s*:\s*(.+)$/);
    if (!m) continue;
    out.push({ x: clamp(Number(m[1]), 0, 100), y: clamp(Number(m[2]), 0, 100), text: m[3].trim() });
    if (out.length >= 12) break;
  }
  return out;
}

// ── Charts and arrays ──────────────────────────────────────────────────────

export function parsePipeNumbers(input: string | undefined): number[] {
  return splitPipe(input).map((s) => parseNumber(s)).filter((n): n is number => n !== null && Number.isFinite(n));
}

export function niceMax(maxValue: number): number {
  if (maxValue <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(maxValue)));
  for (const m of [1, 2, 2.5, 4, 5, 10]) {
    if (maxValue <= m * pow) return m * pow;
  }
  return 10 * pow;
}

// ── Structured inputs the renderer draws (built by the tool dispatcher) ───

export type BoardColumn = "left" | "right";

export type FractionDrawing = {
  fractions: Fraction[];
  model: "circle" | "bar";
  label?: string;
  column?: BoardColumn;
};

export type NumberLineDrawing = {
  min: number;
  max: number;
  step?: number;
  marks: LineMark[];
  intervals: LineInterval[];
  jumps: LineJump[];
  label?: string;
  column?: BoardColumn;
};

export type FigureDrawing = {
  figure: FigureKind;
  sideLabels: string[];
  vertexLabels: string[];
  angleLabels: string[];
  markRightAngle: boolean;
  radiusLabel?: string;
  diameterLabel?: string;
  label?: string;
  column?: BoardColumn;
};

export type AngleDrawing = {
  degrees: number;
  label?: string;
  caption?: string;
  column?: BoardColumn;
};

export type ArrayDrawing = {
  rows: number;
  columns: number;
  splitAfterColumn?: number;
  splitAfterRow?: number;
  label?: string;
  column?: BoardColumn;
};

export type BalanceDrawing = {
  left: string[];
  right: string[];
  tilt: "level" | "left" | "right";
  label?: string;
  column?: BoardColumn;
};

export type BarChartDrawing = {
  categories: string[];
  values: number[];
  unit?: string;
  label?: string;
  column?: BoardColumn;
};

export type SketchDrawing = {
  strokes: SketchStroke[];
  labels: SketchLabel[];
  width: number;
  height: number;
  label?: string;
  column?: BoardColumn;
};

// Insert points along long straight segments so tldraw's stroke smoothing
// keeps them straight instead of rounding every corner into a curve.
export function densifyPolyline(points: Pt[], spacing = 10): Pt[] {
  if (points.length < 2) return points;
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / spacing));
    for (let k = 1; k <= n; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
  }
  return out;
}
