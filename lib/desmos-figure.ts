// 2D figures drawn by Desmos (Sept 17 2026), from draw_figure's drawing.
// A figure is drawn to scale whenever its labels give enough lengths (a right
// triangle from any two sides, a triangle from three, a rectangle from width
// and height, a trapezoid from its bases and height, a circle from its radius
// or diameter), in equal units, with no axes; otherwise it keeps the vector
// renderer's proportions and says it is not to scale. Numbers that cannot
// make the shape (6, 8 and 11 as a right triangle) come back as a warning, so
// the tutor hears about its own slip. 3D solids stay with the vector
// renderer. Pure; tested in desmos-figure.test.ts.

import { figureSideLabels, parseNumber, type FigureDrawing, type FigureKind } from "./board-diagrams";
import {
  arc,
  boundsAround,
  boxOf,
  dot,
  INK_HEX,
  label,
  labelMarker,
  orientationFor,
  polygon,
  polyline,
  segment,
  type Frame,
  type XY,
} from "./desmos-primitives";
import { DEFAULT_GRAPH_SETTINGS, niceAxisStep, type GraphExpression, type GraphMarker, type GraphSpec } from "./desmos-spec";

export type FigureInput = FigureDrawing & { colors: string[] };

export type FigureModel = {
  /** Corners in math units, counter-clockwise; edge i runs from corner i to corner i + 1. */
  vertices: XY[];
  circle?: { r: number };
  toScale: boolean;
  /** Numbers that cannot make this shape, in words. */
  warning?: string;
};

export const DESMOS_FIGURES: ReadonlySet<FigureKind> = new Set<FigureKind>([
  "triangle", "right_triangle", "square", "rectangle", "circle", "parallelogram", "trapezoid", "rhombus", "pentagon", "hexagon",
]);

const MAX_W = 380;
const MAX_H = 300;
const MARGIN = 46;
const LABEL_SCALE = 1.35;

/** The length a label gives: "6", "6 cm", "r = 5", "2.5 in" → the number; "x", "?", "2x" → null. */
export function labelLength(text?: string): number | null {
  if (!text) return null;
  const t = text.trim().replace(/^[a-zA-Z]\s*=\s*/, "");
  // A unit is a known abbreviation ("6cm", "6 cm") or a word after a space ("6 inches"); "2x" is not a length.
  const m = /^(\d+\s+\d+\/\d+|\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)(?:\s*(?:mm|cm|km|m|in|ft|yd|mi|units?)\.?|\s+[a-zA-Z]{2,12}\.?)?$/.exec(t);
  if (!m) return null;
  const v = parseNumber(m[1]);
  return v !== null && Number.isFinite(v) && v > 0 ? v : null;
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
const fmt = (v: number) => String(Math.round(v * 100) / 100);

function regular(n: number, side: number): XY[] {
  const R = side / (2 * Math.sin(Math.PI / n));
  const start = -Math.PI / 2 - Math.PI / n;
  const pts = Array.from({ length: n }, (_, k) => ({ x: R * Math.cos(start + (k * 2 * Math.PI) / n), y: R * Math.sin(start + (k * 2 * Math.PI) / n) }));
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  return pts.map((p) => ({ x: p.x - minX, y: p.y - minY }));
}

/** Where the corners go, and whether the labels say how big. */
export function figureModel(d: FigureDrawing): FigureModel {
  const labels = d.sideLabels;
  const L = (i: number) => labelLength(labels[i]);
  const h = labelLength(d.heightLabel);
  switch (d.figure) {
    case "right_triangle": {
      const { edges } = figureSideLabels("right_triangle", labels);
      const a = labelLength(edges[0]);
      const c = labelLength(edges[1]);
      const b = labelLength(edges[2]);
      let legA = a;
      let legB = b;
      let toScale = false;
      let warning: string | undefined;
      if (a && b) {
        toScale = true;
        if (c && !close(a * a + b * b, c * c)) warning = `${fmt(a)}² + ${fmt(b)}² is not ${fmt(c)}², so these sides do not make a right triangle; drawn with legs ${fmt(a)} and ${fmt(b)}`;
      } else if (a && c) {
        if (c > a) [legB, toScale] = [Math.sqrt(c * c - a * a), true];
        else warning = `the hypotenuse ${fmt(c)} must be longer than the leg ${fmt(a)}`;
      } else if (b && c) {
        if (c > b) [legA, toScale] = [Math.sqrt(c * c - b * b), true];
        else warning = `the hypotenuse ${fmt(c)} must be longer than the leg ${fmt(b)}`;
      }
      if (!legA && !legB) [legA, legB] = [4, 3];
      else if (!legA) legA = (legB as number) * 1.33;
      else if (!legB) legB = legA * 0.75;
      return { vertices: [{ x: 0, y: 0 }, { x: legA as number, y: 0 }, { x: 0, y: legB as number }], toScale, warning };
    }
    case "triangle": {
      const base = L(0);
      const right = L(1);
      const left = L(2);
      if (base && right && left) {
        if (base + right > left && base + left > right && right + left > base) {
          const x = (base * base + left * left - right * right) / (2 * base);
          return { vertices: [{ x: 0, y: 0 }, { x: base, y: 0 }, { x, y: Math.sqrt(Math.max(0, left * left - x * x)) }], toScale: true };
        }
        const warning = `sides ${fmt(base)}, ${fmt(right)} and ${fmt(left)} cannot make a triangle (the two shorter sides must add up to more than the longest)`;
        return { vertices: [{ x: 0, y: 0 }, { x: base, y: 0 }, { x: base * 0.38, y: base * 0.74 }], toScale: false, warning };
      }
      if (base && h) return { vertices: [{ x: 0, y: 0 }, { x: base, y: 0 }, { x: base * 0.38, y: h }], toScale: !right && !left };
      const b = base ?? 4.6;
      return { vertices: [{ x: 0, y: 0 }, { x: b, y: 0 }, { x: b * 0.38, y: b * 0.74 }], toScale: false };
    }
    case "square": {
      const s = labels.map((t) => labelLength(t)).find((v): v is number => v !== null);
      const side = s ?? 3;
      return { vertices: [{ x: 0, y: 0 }, { x: side, y: 0 }, { x: side, y: side }, { x: 0, y: side }], toScale: Boolean(s) };
    }
    case "rectangle": {
      const wv = L(0);
      const hv = L(1) ?? L(3);
      const width = wv ?? 4.6;
      const height = hv ?? (wv ? wv * 0.58 : 2.7);
      return { vertices: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }], toScale: Boolean(wv && hv) };
    }
    case "parallelogram": {
      const b = L(0) ?? L(2);
      const s = L(1) ?? L(3);
      const base = b ?? 4.6;
      let height = h ?? base * 0.54;
      let off = base * 0.28;
      if (s && h) {
        if (s >= h) off = Math.sqrt(s * s - h * h);
        else return { vertices: parallelogram(base, off, height), toScale: false, warning: `the slanted side ${fmt(s)} cannot be shorter than the height ${fmt(h)}` };
      } else if (s) {
        height = s * Math.sin((62 * Math.PI) / 180);
        off = s * Math.cos((62 * Math.PI) / 180);
      }
      return { vertices: parallelogram(base, off, height), toScale: Boolean(b && (h || s)) };
    }
    case "trapezoid": {
      const b1 = L(0);
      const b2 = L(2);
      const leg = L(1) ?? L(3);
      if (b1 && b2) {
        const d = (b1 - b2) / 2;
        let height = h;
        let warning: string | undefined;
        if (!height && leg) {
          if (leg > Math.abs(d)) height = Math.sqrt(leg * leg - d * d);
          else warning = `legs of ${fmt(leg)} cannot join bases of ${fmt(b1)} and ${fmt(b2)}`;
        }
        const toScale = Boolean(height) && !warning;
        const hh = height ?? Math.max(b1, b2) * 0.55;
        return { vertices: [{ x: 0, y: 0 }, { x: b1, y: 0 }, { x: d + b2, y: hh }, { x: d, y: hh }], toScale, warning };
      }
      const w = b1 ?? 4.6;
      const hh = h ?? w * 0.56;
      return { vertices: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w * 0.76, y: hh }, { x: w * 0.24, y: hh }], toScale: false };
    }
    case "rhombus": {
      const s = labels.map((t) => labelLength(t)).find((v): v is number => v !== null);
      const side = s ?? 3;
      const a = (62 * Math.PI) / 180;
      const off = side * Math.cos(a);
      return { vertices: parallelogram(side, off, side * Math.sin(a)), toScale: false };
    }
    case "pentagon":
    case "hexagon": {
      const s = labels.map((t) => labelLength(t)).find((v): v is number => v !== null);
      return { vertices: regular(d.figure === "pentagon" ? 5 : 6, s ?? 2.4), toScale: Boolean(s) };
    }
    case "circle": {
      const r = labelLength(d.radiusLabel) ?? (labelLength(d.diameterLabel) ?? 0) / 2;
      return { vertices: [], circle: { r: r || 2.5 }, toScale: r > 0 };
    }
    default:
      return { vertices: [], toScale: false };
  }
}

function parallelogram(base: number, off: number, height: number): XY[] {
  return [{ x: off, y: 0 }, { x: off + base, y: 0 }, { x: base, y: height }, { x: 0, y: height }];
}

function signedArea(pts: XY[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

const unit = (v: XY): XY => {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
};

/** A right-angle mark `size` pixels in the corner at v between directions d1 and d2. */
function squareMark(id: string, v: XY, d1: XY, d2: XY, frame: Frame, size = 12): GraphExpression {
  const a = unit(d1);
  const b = unit(d2);
  const s = size * frame.ux;
  return polyline(id, [
    { x: v.x + a.x * s, y: v.y + a.y * s },
    { x: v.x + (a.x + b.x) * s, y: v.y + (a.y + b.y) * s },
    { x: v.x + b.x * s, y: v.y + b.y * s },
  ], { color: INK_HEX, width: 1.5 });
}

export function buildFigureGraph(input: FigureInput): { spec: GraphSpec; model: FigureModel } {
  const model = figureModel(input);
  const colors = input.colors.length > 0 ? input.colors : ["#4465e9"];
  let pen = 0;
  const nextPen = () => colors[pen++ % colors.length];
  const out: GraphExpression[] = [];
  const markers: GraphMarker[] = [];
  const say = (id: string, at: XY, text: string, orientation: ReturnType<typeof orientationFor> | "center", color: string, size = LABEL_SCALE) => {
    out.push(label(id, at, text, orientation, { color, size }));
    markers.push(labelMarker(at, text, orientation, size));
  };

  let pts = model.vertices;
  if (pts.length >= 3 && signedArea(pts) < 0) pts = [...pts].reverse();
  const box = model.circle
    ? { left: -model.circle.r, right: model.circle.r, bottom: -model.circle.r, top: model.circle.r }
    : boxOf(pts);
  const bw = Math.max(1e-6, box.right - box.left);
  const bh = Math.max(1e-6, box.top - box.bottom);
  const pxPerUnit = Math.min((MAX_W - 2 * MARGIN) / bw, (MAX_H - 2 * MARGIN) / bh);
  const size = { w: Math.max(220, Math.round(bw * pxPerUnit + 2 * MARGIN)), h: Math.max(170, Math.round(bh * pxPerUnit + 2 * MARGIN)) };
  const bounds = boundsAround(box, size, { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }, true);
  const frame: Frame = { bounds, size, ux: (bounds.right - bounds.left) / size.w, uy: (bounds.top - bounds.bottom) / size.h };
  const u = frame.ux;

  if (model.circle) {
    const r = model.circle.r;
    const fill = nextPen();
    out.push({ id: "disc", latex: `x^{2}+y^{2}\\le ${fmtLatex(r * r)}`, color: fill, fillOpacity: 0.1, lineOpacity: 0, lineWidth: 0.5 });
    out.push({ id: "rim", latex: `x^{2}+y^{2}=${fmtLatex(r * r)}`, color: INK_HEX, lineWidth: 2.5 });
    out.push(dot("centre", { x: 0, y: 0 }, { color: INK_HEX, size: 7 }));
    if (input.diameterLabel) {
      const c = nextPen();
      out.push(segment("diameter", { x: -r, y: 0 }, { x: r, y: 0 }, { color: c, width: 2.5 }));
      say("diameterLabel", { x: -r / 2, y: -3 * u }, input.diameterLabel, "below", c);
    }
    if (input.radiusLabel) {
      const c = nextPen();
      const tilt = input.diameterLabel ? Math.PI / 4 : 0;
      const end = { x: r * Math.cos(tilt), y: r * Math.sin(tilt) };
      out.push(segment("radius", { x: 0, y: 0 }, end, { color: c, width: 2.5 }));
      say("radiusLabel", { x: end.x / 2 - (tilt ? 4 * u : 0), y: end.y / 2 + 3 * u }, input.radiusLabel, tilt ? "above_left" : "above", c);
    }
  } else if (pts.length >= 3) {
    const fill = nextPen();
    out.push(polygon("shape", pts, { color: fill, fill: 0.08, width: 0.5 }));
    out.push(polyline("outline", [...pts, pts[0]], { color: INK_HEX, width: 2.5 }));
    const n = pts.length;
    const at = (i: number) => pts[((i % n) + n) % n];
    const mid = { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };

    // Right angles: the corner square (right triangle, square, rectangle).
    const rightCorner = input.markRightAngle && (input.figure === "right_triangle" || input.figure === "square" || input.figure === "rectangle");
    if (rightCorner) {
      const corner = model.vertices[0];
      const i = pts.findIndex((p) => p.x === corner.x && p.y === corner.y);
      if (i >= 0) out.push(squareMark("rightAngle", at(i), { x: at(i + 1).x - at(i).x, y: at(i + 1).y - at(i).y }, { x: at(i - 1).x - at(i).x, y: at(i - 1).y - at(i).y }, frame));
    }

    // Side labels, outside each edge's middle. The drawing's edge order
    // (bottom first, counter-clockwise) matches the model's corners.
    const edges = input.figure === "right_triangle" ? figureSideLabels("right_triangle", input.sideLabels).edges : input.sideLabels;
    const order = model.vertices;
    edges.slice(0, order.length).forEach((text, i) => {
      if (!text) return;
      const a = order[i];
      const b = order[(i + 1) % order.length];
      const normal = unit({ x: b.y - a.y, y: -(b.x - a.x) });
      const outward = (mid.x - (a.x + b.x) / 2) * normal.x + (mid.y - (a.y + b.y) / 2) * normal.y > 0 ? -1 : 1;
      const nx = normal.x * outward;
      const ny = normal.y * outward;
      const c = nextPen();
      say(`side${i}`, { x: (a.x + b.x) / 2 + nx * 4 * u, y: (a.y + b.y) / 2 + ny * 4 * u }, text, orientationFor(Math.atan2(ny, nx)), c);
    });

    // Corner names, outside each corner.
    input.vertexLabels.slice(0, order.length).forEach((text, i) => {
      if (!text) return;
      const v = order[i];
      const dir = unit({ x: v.x - mid.x, y: v.y - mid.y });
      const p = { x: v.x + dir.x * 3 * u, y: v.y + dir.y * 3 * u };
      out.push(label(`corner${i}`, p, text, orientationFor(Math.atan2(dir.y, dir.x)), { color: INK_HEX, size: LABEL_SCALE }));
      markers.push({ x: v.x, y: v.y, label: text, kind: "point" });
    });

    // Angle labels inside each corner, with an arc (a square for a right angle).
    input.angleLabels.slice(0, order.length).forEach((text, i) => {
      if (!text) return;
      const k = pts.indexOf(order[i]);
      if (k < 0) return;
      const v = at(k);
      const d1 = { x: at(k + 1).x - v.x, y: at(k + 1).y - v.y };
      const d2 = { x: at(k - 1).x - v.x, y: at(k - 1).y - v.y };
      const a0 = Math.atan2(d1.y, d1.x);
      let sweep = Math.atan2(d2.y, d2.x) - a0;
      while (sweep <= 0) sweep += 2 * Math.PI;
      const c = nextPen();
      const isRight = Math.abs(sweep - Math.PI / 2) < 1e-3;
      if (isRight) {
        if (!(rightCorner && order[i] === model.vertices[0])) out.push(squareMark(`angleMark${i}`, v, d1, d2, frame));
      } else {
        out.push(arc(`angleArc${i}`, v, 16, a0, a0 + sweep, frame, { color: c, width: 2 }));
      }
      const bisector = a0 + sweep / 2;
      const reach = (isRight ? 30 : 34) * u;
      say(`angle${i}`, { x: v.x + Math.cos(bisector) * reach, y: v.y + Math.sin(bisector) * reach }, text, "center", c, 1.15);
    });

    // The height: dashed from the top corner down to the base line.
    if (input.heightLabel) {
      const base = Math.min(order[0].y, order[1].y);
      const left = Math.min(order[0].x, order[1].x);
      const right = Math.max(order[0].x, order[1].x);
      const tops = order.slice(2);
      const inside = tops.filter((p) => p.x > left + 1e-9 && p.x < right - 1e-9);
      const apex = (inside.length ? inside : tops).reduce((best, p) => (p.y > best.y ? p : best));
      const foot = { x: apex.x, y: base };
      const c = nextPen();
      const onEdge = order.some((p, i) => {
        const q = order[(i + 1) % order.length];
        return close(p.x, apex.x) && close(q.x, apex.x) && Math.abs(p.y - q.y) > 1e-9;
      });
      if (!onEdge) {
        out.push(polyline("height", [apex, foot], { color: c, width: 2, style: "DASHED" }));
        const inward = apex.x - left > right - apex.x ? -1 : 1;
        out.push(squareMark("heightMark", foot, { x: inward, y: 0 }, { x: 0, y: 1 }, frame, 10));
        if (apex.x < left || apex.x > right) {
          const from = apex.x < left ? left : right;
          out.push(polyline("baseExtension", [{ x: from, y: base }, foot], { color: c, width: 1.5, style: "DOTTED" }));
        }
      }
      // Beside the dashed line, low down where the shape is widest, on the roomier side.
      const side = apex.x - left > (right - left) / 2 ? -1 : 1;
      say("heightLabel", { x: apex.x + side * 5 * u, y: base + (apex.y - base) * 0.3 }, input.heightLabel, side > 0 ? "right" : "left", c);
    }
  }

  const grid = Boolean(input.grid);
  const step = grid ? (pxPerUnit >= 14 ? 1 : niceAxisStep(bw, bw * pxPerUnit, 14)) : 0;
  const spec: GraphSpec = {
    v: 2,
    kind: "figure",
    size,
    bounds,
    settings: {
      ...DEFAULT_GRAPH_SETTINGS,
      showGrid: grid,
      showXAxis: false,
      showYAxis: false,
      xAxisNumbers: false,
      yAxisNumbers: false,
      ...(grid ? { xAxisStep: step, yAxisStep: step, xAxisMinorSubdivisions: 1, yAxisMinorSubdivisions: 1 } : {}),
    },
    expressions: out,
    markers,
    source: { kind: "figure", drawing: figureDrawingOf(input) },
  };
  return { spec, model };
}

function fmtLatex(v: number): string {
  return String(Math.round(v * 1e6) / 1e6);
}

function figureDrawingOf(d: FigureInput): FigureDrawing {
  return {
    figure: d.figure,
    sideLabels: d.sideLabels,
    vertexLabels: d.vertexLabels,
    angleLabels: d.angleLabels,
    markRightAngle: d.markRightAngle,
    ...(d.radiusLabel ? { radiusLabel: d.radiusLabel } : {}),
    ...(d.diameterLabel ? { diameterLabel: d.diameterLabel } : {}),
    ...(d.heightLabel ? { heightLabel: d.heightLabel } : {}),
    ...(d.grid ? { grid: true } : {}),
    ...(d.label ? { label: d.label } : {}),
  };
}
