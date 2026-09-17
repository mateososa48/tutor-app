// Graph specs, version 2 (Sept 17 2026).
//
// A graph on the board keeps its spec as JSON in the graph shape's `spec` prop
// (components/board/GraphShape.tsx). Version 1 (Sept 15) held the view, the
// Desmos expressions and the labelled points; the size lived in TldrawCore and
// every Desmos setting stayed at whatever the previous graph had left. Version
// 2 carries everything a picture depends on, so every renderer (the hidden
// calculator, the Explore panel, the vector fallback) draws the same graph:
//   size       the picture's box in board pixels
//   settings   every Desmos setting, sent in full on every render
//   markers    words on the graph the tutor can point at, in math coordinates
//   source     what the tutor asked for, so the vector renderer can redraw it
//   sliders, studentState   for the Explore panel
// The shape has no migrations, so the version lives inside the JSON and
// parseGraphSpec upgrades a version 1 spec when it reads one. Pure; tested in
// desmos-spec.test.ts.

import type { GraphExtras, XYPoint } from "./board-diagrams";

export type GraphBounds = { left: number; right: number; bottom: number; top: number };
export type GraphSize = { w: number; h: number };
export type GraphRect = { x: number; y: number; w: number; h: number };

/** The board's graph box: a 4:3 picture, three across a laptop board page. */
export const DEFAULT_GRAPH_SIZE: GraphSize = { w: 420, h: 315 };

// Desmos.LabelOrientations values (lowercase strings, checked on the probe page).
export type LabelOrientation =
  | "default"
  | "center"
  | "above"
  | "below"
  | "left"
  | "right"
  | "above_left"
  | "above_right"
  | "below_left"
  | "below_right";

type DragMode = "NONE" | "X" | "Y" | "XY" | "AUTO";
type LineStyle = "SOLID" | "DASHED" | "DOTTED";
type PointStyle = "POINT" | "OPEN" | "CROSS";

/** One Desmos expression, in the shape the Desmos API's setExpressions takes. */
export type GraphExpression = {
  type?: "expression";
  id: string;
  latex: string;
  color?: string;
  lineStyle?: LineStyle;
  lineWidth?: number;
  lineOpacity?: number;
  pointStyle?: PointStyle;
  pointSize?: number;
  pointOpacity?: number;
  fillOpacity?: number;
  points?: boolean;
  lines?: boolean;
  fill?: boolean;
  hidden?: boolean;
  /** Kept out of a visible calculator's expression list (Explore scaffolding). */
  secret?: boolean;
  label?: string;
  showLabel?: boolean;
  /** A LaTeX size multiplier: "1" is Desmos's default, "1.5" bigger. */
  labelSize?: string;
  labelOrientation?: LabelOrientation;
  parametricDomain?: { min: string; max: string };
  sliderBounds?: { min: string; max: string; step?: string };
  dragMode?: DragMode;
};

export type GraphTableColumn = {
  latex: string;
  values: string[];
  color?: string;
  hidden?: boolean;
  points?: boolean;
  lines?: boolean;
  lineStyle?: LineStyle;
  lineWidth?: number;
  pointStyle?: PointStyle;
  pointSize?: number;
  dragMode?: DragMode;
};

export type GraphTable = { type: "table"; id: string; columns: GraphTableColumn[]; secret?: boolean };

export type GraphItem = GraphExpression | GraphTable;

export function isGraphTable(item: GraphItem): item is GraphTable {
  return item.type === "table";
}

/**
 * Words on a graph the tutor can point at. "point": a dot and its label (the
 * dot is the target). "label": words set beside a spot, placed by
 * `orientation` (the rise and run of a slope triangle).
 */
export type GraphMarker = {
  x: number;
  y: number;
  label: string;
  kind?: "point" | "label";
  orientation?: LabelOrientation;
};

export type AxisArrowMode = "NONE" | "POSITIVE" | "BOTH";
export type AxisScale = "linear" | "logarithmic";

export type GraphSettings = {
  showGrid: boolean;
  showXAxis: boolean;
  showYAxis: boolean;
  xAxisNumbers: boolean;
  yAxisNumbers: boolean;
  /** 0: Desmos picks. */
  xAxisStep: number;
  yAxisStep: number;
  /** 0: Desmos picks. */
  xAxisMinorSubdivisions: number;
  yAxisMinorSubdivisions: number;
  xAxisArrowMode: AxisArrowMode;
  yAxisArrowMode: AxisArrowMode;
  xAxisLabel: string;
  yAxisLabel: string;
  degreeMode: boolean;
  polarMode: boolean;
  xAxisScale: AxisScale;
  yAxisScale: AxisScale;
};

/** Desmos's own defaults. A render sends all of them, so one graph never inherits another's. */
export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  showGrid: true,
  showXAxis: true,
  showYAxis: true,
  xAxisNumbers: true,
  yAxisNumbers: true,
  xAxisStep: 0,
  yAxisStep: 0,
  xAxisMinorSubdivisions: 0,
  yAxisMinorSubdivisions: 0,
  xAxisArrowMode: "NONE",
  yAxisArrowMode: "NONE",
  xAxisLabel: "",
  yAxisLabel: "",
  degreeMode: false,
  polarMode: false,
  xAxisScale: "linear",
  yAxisScale: "linear",
};

export type GraphKind = "function" | "points" | "axes" | "free" | "number_line" | "bar_chart" | "figure" | "data";
const KINDS = new Set<string>(["function", "points", "axes", "free", "number_line", "bar_chart", "figure", "data"]);

/** What the tutor asked for, in the terms the vector renderer draws from. */
export type GraphSource =
  | {
      kind: "function";
      expression: string;
      xMin: number;
      xMax: number;
      extras?: Partial<GraphExtras>;
    }
  | { kind: "points"; points: XYPoint[]; connect: boolean; xMin: number; xMax: number; yMin: number; yMax: number }
  | { kind: "axes"; xMin: number; xMax: number; yMin: number; yMax: number };

/** A variable the student can drag in Explore. */
export type GraphSlider = { name: string; value: number; min: number; max: number; step?: number };

/** What the student changed in Explore, drawn back onto the board. */
export type GraphStudentState = {
  sliders?: Record<string, number>;
  points?: Record<string, { x: number; y: number }>;
  bounds?: GraphBounds;
};

export type GraphSpec = {
  v: 2;
  kind: GraphKind;
  size: GraphSize;
  bounds: GraphBounds;
  settings: GraphSettings;
  expressions: GraphItem[];
  markers: GraphMarker[];
  sliders?: GraphSlider[];
  source?: GraphSource;
  studentState?: GraphStudentState;
};

// ── Coordinates ───────────────────────────────────────────────────────────────

/** Board pixels per math unit along each axis. */
export function pxPerUnit(bounds: GraphBounds, size: GraphSize): { x: number; y: number } {
  return { x: size.w / (bounds.right - bounds.left), y: size.h / (bounds.top - bounds.bottom) };
}

/** Where a math point lands inside the picture (y grows down). */
export function toPx(point: { x: number; y: number }, bounds: GraphBounds, size: GraphSize): { x: number; y: number } {
  return {
    x: ((point.x - bounds.left) / (bounds.right - bounds.left)) * size.w,
    y: ((bounds.top - point.y) / (bounds.top - bounds.bottom)) * size.h,
  };
}

/** The math point under a spot in the picture. */
export function toMath(point: { x: number; y: number }, bounds: GraphBounds, size: GraphSize): { x: number; y: number } {
  return {
    x: bounds.left + (point.x / size.w) * (bounds.right - bounds.left),
    y: bounds.top - (point.y / size.h) * (bounds.top - bounds.bottom),
  };
}

// Desmos label text at its default size on the board's 420 × 315 picture
// (measured Sept 17 2026): about 6.8px a character and 17px tall ("rise 4" is
// 37 × 17), set 6px from its point. With the default orientation Desmos picks
// the side itself (left, right, above or below), so a point's own dot is the
// target there.
export const LABEL_CHAR_PX = 6.8;
export const LABEL_H = 17;
const LABEL_GAP = 6;
const PAD_X = 5;
const PAD_Y = 4;

/** The box a highlight dabs for a marker, in picture pixels, kept inside the picture. */
export function markerBox(marker: GraphMarker, bounds: GraphBounds, size: GraphSize): GraphRect {
  const at = toPx(marker, bounds, size);
  let box: GraphRect;
  if (marker.kind !== "label") {
    box = { x: at.x - 16, y: at.y - 13, w: 32, h: 26 };
  } else {
    const textW = Math.max(8, marker.label.length * LABEL_CHAR_PX);
    const w = textW + 2 * PAD_X;
    const h = LABEL_H + 2 * PAD_Y;
    const o = marker.orientation ?? "default";
    const left = o.endsWith("left") ? at.x - LABEL_GAP - textW - PAD_X : o.endsWith("right") ? at.x + LABEL_GAP - PAD_X : at.x - w / 2;
    const top = o.startsWith("above") ? at.y - LABEL_GAP - LABEL_H - PAD_Y : o.startsWith("below") ? at.y + LABEL_GAP - PAD_Y : at.y - h / 2;
    box = { x: left, y: top, w, h };
  }
  const x = Math.min(Math.max(0, box.x), Math.max(0, size.w - box.w));
  const y = Math.min(Math.max(0, box.y), Math.max(0, size.h - box.h));
  return { x, y, w: Math.min(box.w, size.w), h: Math.min(box.h, size.h) };
}

/** The first marker whose words pass `test`. */
export function findMarker(spec: GraphSpec, test: (label: string) => boolean): GraphMarker | undefined {
  return spec.markers.find((m) => m.label.trim() !== "" && test(m.label));
}

/** The words on a graph (point labels, rise and run), for pointing and highlighting by text. */
export function graphSpecText(spec: GraphSpec): string {
  return spec.markers
    .map((m) => m.label.trim())
    .filter(Boolean)
    .join(" · ");
}

/** The same items with every id prefixed: each render gets ids no earlier render used. */
export function prefixIds(items: GraphItem[], prefix: string): GraphItem[] {
  return items.map((item) => ({ ...item, id: `${prefix}${item.id}` }));
}

// ── Axis numbers ──────────────────────────────────────────────────────────────
// Desmos's automatic step numbers a 420 × 315 picture's x axis only every 5
// units and often leaves y bare (probe, Sept 16), so every graph names its steps.

const NICE_STEPS = [1, 2, 5];
// Desmos axis numbers are smaller than its labels: about 8px a character.
const DIGIT_PX = 8;

function roundStep(v: number): number {
  return Number(v.toPrecision(6));
}

/** The smallest 1, 2 or 5 × 10ⁿ step that leaves at least `minGap` pixels between numbered lines. */
export function niceAxisStep(span: number, pixels: number, minGap: number): number {
  if (!(span > 0) || !(pixels > 0) || !(minGap > 0)) return 0;
  const raw = (span * minGap) / pixels;
  const exp = Math.floor(Math.log10(raw));
  for (let e = exp; e <= exp + 1; e++) {
    for (const n of NICE_STEPS) {
      const step = roundStep(n * 10 ** e);
      if (step >= raw * (1 - 1e-9)) return step;
    }
  }
  return roundStep(10 ** (exp + 1));
}

function decimals(step: number): number {
  const s = String(step);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

/** Room one x-axis number needs, from its widest value. */
function xNumberGap(bounds: GraphBounds, step: number): number {
  const widest = Math.max(Math.abs(bounds.left), Math.abs(bounds.right));
  const chars = String(Math.round(widest)).length + (bounds.left < 0 ? 1 : 0) + (decimals(step) > 0 ? decimals(step) + 1 : 0);
  return Math.max(30, chars * DIGIT_PX + 14);
}

// Minor grid lines at least 15px apart, splitting a step into round parts
// (Desmos's automatic choice put them 8px apart once the steps were set;
// empty -10..10 axes keep their unit grid at 15.75px).
const MINOR_GAP = 15;

/** How many parts a major step's gap is cut into by minor lines; 1 draws none. */
export function minorSubdivisions(step: number, pxPerStep: number): number {
  if (!(step > 0) || !(pxPerStep > 0)) return 0;
  const lead = Math.round(step / 10 ** Math.floor(Math.log10(step)));
  const options = lead === 2 ? [4, 2] : lead === 5 ? [5] : [5, 2];
  return options.find((n) => pxPerStep / n >= MINOR_GAP) ?? 1;
}

type AxisGrid = Pick<GraphSettings, "xAxisStep" | "yAxisStep" | "xAxisMinorSubdivisions" | "yAxisMinorSubdivisions">;

/** Axis steps that number every major grid line (equal when the units are square), and calm minor lines. */
export function axisSteps(bounds: GraphBounds, size: GraphSize): AxisGrid {
  const xSpan = bounds.right - bounds.left;
  const ySpan = bounds.top - bounds.bottom;
  if (!(xSpan > 0) || !(ySpan > 0) || !(size.w > 0) || !(size.h > 0)) {
    return { xAxisStep: 0, yAxisStep: 0, xAxisMinorSubdivisions: 0, yAxisMinorSubdivisions: 0 };
  }
  let xStep = niceAxisStep(xSpan, size.w, xNumberGap(bounds, 1));
  if (xStep < 1) xStep = niceAxisStep(xSpan, size.w, xNumberGap(bounds, xStep));
  let yStep = niceAxisStep(ySpan, size.h, 28);
  const units = pxPerUnit(bounds, size);
  if (Math.abs(units.x - units.y) / Math.max(units.x, units.y) < 0.03) {
    xStep = Math.max(xStep, yStep);
    yStep = xStep;
  }
  return {
    xAxisStep: xStep,
    yAxisStep: yStep,
    xAxisMinorSubdivisions: minorSubdivisions(xStep, xStep * units.x),
    yAxisMinorSubdivisions: minorSubdivisions(yStep, yStep * units.y),
  };
}

/** Full settings for a picture: Desmos's defaults, numbered axes, then the builder's own choices. */
export function graphSettings(bounds: GraphBounds, size: GraphSize, overrides: Partial<GraphSettings> = {}): GraphSettings {
  return { ...DEFAULT_GRAPH_SETTINGS, ...axisSteps(bounds, size), ...overrides };
}

// ── Reading specs ─────────────────────────────────────────────────────────────

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function readBounds(v: unknown): GraphBounds | null {
  if (!record(v)) return null;
  const { left, right, bottom, top } = v;
  if (!finite(left) || !finite(right) || !finite(bottom) || !finite(top)) return null;
  if (!(right > left) || !(top > bottom)) return null;
  return { left, right, bottom, top };
}

function readSize(v: unknown): GraphSize | null {
  if (!record(v) || !finite(v.w) || !finite(v.h) || v.w <= 0 || v.h <= 0) return null;
  return { w: v.w, h: v.h };
}

function readItem(v: unknown): GraphItem[] {
  if (!record(v) || typeof v.id !== "string") return [];
  if (v.type === "table") return Array.isArray(v.columns) ? [v as GraphTable] : [];
  return typeof v.latex === "string" ? [v as GraphExpression] : [];
}

function readMarker(v: unknown): GraphMarker[] {
  if (!record(v) || !finite(v.x) || !finite(v.y)) return [];
  const marker: GraphMarker = { x: v.x, y: v.y, label: typeof v.label === "string" ? v.label : "" };
  if (v.kind === "label" || v.kind === "point") marker.kind = v.kind;
  if (typeof v.orientation === "string") marker.orientation = v.orientation as LabelOrientation;
  return [marker];
}

const SETTING_CHOICES: Record<string, readonly string[]> = {
  xAxisArrowMode: ["NONE", "POSITIVE", "BOTH"],
  yAxisArrowMode: ["NONE", "POSITIVE", "BOTH"],
  xAxisScale: ["linear", "logarithmic"],
  yAxisScale: ["linear", "logarithmic"],
};

function readSettings(v: unknown): Partial<GraphSettings> {
  if (!record(v)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(DEFAULT_GRAPH_SETTINGS)) {
    const value = v[key];
    if (typeof value !== typeof fallback) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    if (SETTING_CHOICES[key] && !SETTING_CHOICES[key].includes(value as string)) continue;
    out[key] = value;
  }
  return out as Partial<GraphSettings>;
}

function readSource(v: unknown): GraphSource | undefined {
  if (!record(v)) return undefined;
  if (v.kind === "function" && typeof v.expression === "string" && finite(v.xMin) && finite(v.xMax)) return v as GraphSource;
  if (v.kind === "points" && Array.isArray(v.points) && finite(v.xMin) && finite(v.xMax) && finite(v.yMin) && finite(v.yMax)) return v as GraphSource;
  if (v.kind === "axes" && finite(v.xMin) && finite(v.xMax) && finite(v.yMin) && finite(v.yMax)) return v as GraphSource;
  return undefined;
}

/** "(1.5,-2)" → the point, else null. */
export function pointOfLatex(latex: string): { x: number; y: number } | null {
  const m = /^\s*\(\s*(-?\d+(?:\.\d+)?(?:e-?\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:e-?\d+)?)\s*\)\s*$/.exec(latex);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

const stripY = (latex: string) => latex.replace(/^\s*y\s*=\s*/, "");

// Version 1 had no record of what was asked; rebuild enough of it from the
// expressions for the vector renderer (curve ids were curve1…, joined points "shape").
function sourceFromV1(kind: GraphKind, bounds: GraphBounds, items: GraphItem[], markers: GraphMarker[]): GraphSource {
  const view = { xMin: bounds.left, xMax: bounds.right, yMin: bounds.bottom, yMax: bounds.top };
  if (kind === "points") {
    return { kind: "points", points: markers.map((m) => ({ x: m.x, y: m.y, ...(m.label ? { label: m.label } : {}) })), connect: items.some((i) => i.id === "shape"), ...view };
  }
  const curves = items.filter((i): i is GraphExpression => !isGraphTable(i) && /^curve\d+$/.test(i.id)).map((i) => stripY(i.latex));
  if (kind === "axes" || curves.length === 0) return { kind: "axes", ...view };
  return {
    kind: "function",
    expression: curves[0],
    xMin: bounds.left,
    xMax: bounds.right,
    extras: {
      yMin: bounds.bottom,
      yMax: bounds.top,
      markPoints: markers.filter((m) => m.label).map((m) => ({ x: m.x, y: m.y, label: m.label })),
      slopeRun: null,
      extraExpressions: curves.slice(1),
    },
  };
}

/**
 * A graph spec from a shape's JSON (or an object): version 2 as saved, version
 * 1 upgraded (size from `fallbackSize`, numbered axes, rise and run as
 * markers, a source rebuilt from its curves), null when it cannot be read.
 */
export function parseGraphSpec(input: unknown, fallbackSize: GraphSize = DEFAULT_GRAPH_SIZE): GraphSpec | null {
  let raw = input;
  if (typeof raw === "string") {
    if (!raw.trim()) return null;
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!record(raw)) return null;
  const bounds = readBounds(raw.bounds);
  if (!bounds) return null;
  const expressions = Array.isArray(raw.expressions) ? raw.expressions.flatMap(readItem) : [];
  const markers = Array.isArray(raw.markers) ? raw.markers.flatMap(readMarker) : [];

  if (raw.v === 2) {
    const size = readSize(raw.size) ?? fallbackSize;
    const spec: GraphSpec = {
      v: 2,
      kind: typeof raw.kind === "string" && KINDS.has(raw.kind) ? (raw.kind as GraphKind) : "free",
      size,
      bounds,
      settings: { ...DEFAULT_GRAPH_SETTINGS, ...readSettings(raw.settings) },
      expressions,
      markers,
    };
    if (Array.isArray(raw.sliders)) {
      spec.sliders = raw.sliders.filter((s): s is GraphSlider => record(s) && typeof s.name === "string" && finite(s.value) && finite(s.min) && finite(s.max));
    }
    const source = readSource(raw.source);
    if (source) spec.source = source;
    if (record(raw.studentState)) spec.studentState = raw.studentState as GraphStudentState;
    return spec;
  }

  // Version 1.
  const size = fallbackSize;
  const labelled: GraphMarker[] = [];
  for (const item of expressions) {
    if (isGraphTable(item) || !item.label || item.showLabel === false || (item.pointSize ?? 1) >= 0.1) continue;
    const at = pointOfLatex(item.latex);
    if (at) labelled.push({ ...at, label: item.label, kind: "label", orientation: item.labelOrientation ?? "default" });
  }
  const ids = expressions.map((e) => e.id);
  const kind: GraphKind = ids.length === 0 ? "axes" : ids.every((id) => id === "shape" || /^point\d+$/.test(id)) ? "points" : "function";
  const points = markers.map((m) => ({ ...m, kind: "point" as const }));
  return {
    v: 2,
    kind,
    size,
    bounds,
    settings: graphSettings(bounds, size),
    expressions,
    markers: [...points, ...labelled],
    source: sourceFromV1(kind, bounds, expressions, points),
  };
}
