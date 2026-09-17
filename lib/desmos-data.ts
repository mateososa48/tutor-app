// Data plots drawn by Desmos (Sept 17 2026) for draw_data_plot: dot plots,
// histograms, box plots, and scatter plots with a line or curve of best fit.
// The statistics are computed here (not with Desmos's own stats functions),
// so the tool result can state them exactly and every number on the plot is
// a marker the tutor can point at. Quartiles are the grade-6 way: the medians
// of the lower and upper halves, leaving out the middle value when the count
// is odd. Pure; tested in desmos-data.test.ts.

import { formatNumber, labelLanes, niceMax, niceStep, type BarChartDrawing, type NumberLineDrawing, type XYPoint } from "./board-diagrams";
import { chartAxes } from "./desmos-bar-chart";
import { buildNumberLineGraph } from "./desmos-number-line";
import { boundsAround, frameOf, hLines, INK_HEX, label, labelMarker, labelSizePx, num, PENCIL_HEX, polygon, polyline, type XY } from "./desmos-primitives";
import { DEFAULT_GRAPH_SETTINGS, axisSteps, niceAxisStep, type GraphExpression, type GraphItem, type GraphMarker, type GraphSource, type GraphSpec } from "./desmos-spec";

export type DataKind = "dot_plot" | "histogram" | "box_plot" | "scatter";
export type FitKind = "none" | "linear" | "exponential";

const round = (v: number, digits = 2) => {
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

// ── Statistics ───────────────────────────────────────────────────────────────

function medianOf(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const m = Math.floor(n / 2);
  return n % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

export type FiveNumbers = { min: number; q1: number; median: number; q3: number; max: number };

export function fiveNumbers(values: number[]): FiveNumbers | null {
  if (values.length < 2) return null;
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  const lower = s.slice(0, Math.floor(n / 2));
  const upper = s.slice(Math.ceil(n / 2));
  return { min: s[0], q1: medianOf(lower), median: medianOf(s), q3: medianOf(upper), max: s[n - 1] };
}

export function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export type Bins = { start: number; width: number; counts: number[] };

/** Equal bins covering every value; a value on an edge counts in the bin it starts. */
export function histogramBins(values: number[], width?: number): Bins | null {
  if (values.length === 0) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const w = width && width > 0 ? width : niceStep(lo, hi === lo ? lo + 1 : hi, 6);
  const start = Math.floor(lo / w + 1e-9) * w;
  const count = Math.max(1, Math.floor((hi - start) / w + 1e-9) + 1);
  if (count > 40) return null;
  const counts = new Array<number>(count).fill(0);
  for (const v of values) counts[Math.min(count - 1, Math.floor((v - start) / w + 1e-9))]++;
  return { start: round(start, 6), width: w, counts };
}

export type LinearFit = { m: number; b: number; r: number };

export function linearFit(points: XYPoint[]): LinearFit | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0) return null;
  const m = sxy / sxx;
  return { m, b: my - m * mx, r: syy === 0 ? 1 : sxy / Math.sqrt(sxx * syy) };
}

export type ExponentialFit = { a: number; b: number; r: number };

/** y = a · bˣ, fitted on ln y (every y must be positive). */
export function exponentialFit(points: XYPoint[]): ExponentialFit | null {
  if (points.some((p) => !(p.y > 0))) return null;
  const fit = linearFit(points.map((p) => ({ x: p.x, y: Math.log(p.y) })));
  if (!fit) return null;
  return { a: Math.exp(fit.b), b: Math.exp(fit.m), r: fit.r };
}

// ── Pictures ────────────────────────────────────────────────────────────────

export type DataPlotInput = {
  kind: DataKind;
  values: number[];
  points: XYPoint[];
  fit: FitKind;
  binWidth?: number;
  xLabel?: string;
  yLabel?: string;
  colors: string[];
};

export type DataPlot = {
  spec: GraphSpec;
  /** What the plot shows, in words, for the tool result. */
  summary: string;
  /** The same data for the vector renderer, when it has a picture for it. */
  fallback:
    | { tool: "number_line"; drawing: NumberLineDrawing }
    | { tool: "bar_chart"; drawing: BarChartDrawing }
    | { tool: "function"; expression: string; xMin: number; xMax: number; points: XYPoint[] }
    | { tool: "points"; points: XYPoint[]; xMin: number; xMax: number; yMin: number; yMax: number }
    | null;
};

function padRange(lo: number, hi: number, frac = 0.08): [number, number] {
  const span = hi - lo || Math.max(1, Math.abs(hi));
  return [lo - span * frac, hi + span * frac];
}

// Desmos leaves axis numbers out of pictures under 260px tall, so dot plots
// and box plots stand on a number line that writes its own.
function lineFor(values: number[]): { min: number; max: number; step: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  let step = niceStep(lo, hi === lo ? lo + 1 : hi, 12);
  // Whole-number data gets whole-number ticks.
  if (values.every(Number.isInteger)) step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => s >= step) ?? Math.ceil(step);
  const min = Math.floor(lo / step + 1e-9) * step;
  const max = Math.max(min + step, Math.ceil(hi / step - 1e-9) * step);
  return { min: round(min, 6), max: round(max, 6), step };
}

function dotPlot(input: DataPlotInput): DataPlot {
  const values = input.values;
  const { min, max, step } = lineFor(values);
  const drawing: NumberLineDrawing = { min, max, step, marks: values.map((value) => ({ value })), intervals: [], jumps: [], labelStyle: "decimal" };
  const spec = buildNumberLineGraph({ ...drawing, colors: input.colors, unitLabel: input.xLabel, stackBase: 14 });
  return {
    spec: { ...spec, kind: "data" },
    summary: `a dot plot of ${values.length} values (${summarize(values)})`,
    fallback: { tool: "number_line", drawing: { ...drawing, ...(input.xLabel ? { label: input.xLabel } : {}) } },
  };
}

function summarize(values: number[]): string {
  const f = fiveNumbers(values);
  const parts = [`mean ${formatNumber(round(mean(values)))}`];
  if (f) parts.push(`median ${formatNumber(f.median)}`, `range ${formatNumber(round(f.max - f.min))}`);
  return parts.join(", ");
}

// Bins sit at x = 0, 1, 2, … like a bar chart's slots, so Desmos's own value
// axis stands at the first bin's left edge; the bin edges are our own words.
function histogram(input: DataPlotInput): DataPlot | { error: string } {
  const bins = histogramBins(input.values, input.binWidth);
  if (!bins) return { error: "Those bins would make more than 40 bars; give a wider bin_width." };
  const n = bins.counts.length;
  const topCount = niceMax(Math.max(...bins.counts));
  const plotH = 200;
  // Steps at least 48px apart, so no number shows under the zero line.
  const yStep = niceAxisStep(topCount, plotH, 48);
  const xWord = input.xLabel?.trim() ?? "";
  const size = { w: Math.max(360, Math.min(560, 110 + n * 56)), h: plotH + (xWord ? 106 : 82) };
  const yWord = input.yLabel?.trim() || "frequency";
  const margin = { top: 50, right: 22, bottom: xWord ? 78 : 54, left: 48 };
  const bounds = boundsAround({ left: 0, right: n, bottom: 0, top: topCount }, size, margin, false);
  const frame = frameOf(bounds, size);
  const color = input.colors[0] ?? "#4465e9";
  const out: GraphExpression[] = [];
  const markers: GraphMarker[] = [];
  const lines: number[] = [];
  for (let v = yStep; v <= topCount + yStep * 1e-6; v += yStep) lines.push(round(v, 6));
  out.push(hLines("grid", lines, 0, n, { color: PENCIL_HEX, width: 1, opacity: 0.3 }));
  const edge = (i: number) => round(bins.start + i * bins.width, 6);
  bins.counts.forEach((c, i) => {
    if (c > 0) out.push(polygon(`bin${i}`, [{ x: i, y: 0 }, { x: i + 1, y: 0 }, { x: i + 1, y: c }, { x: i, y: c }], { color, fill: 0.7, width: 1.5 }));
    const at: XY = { x: i + 0.5, y: c };
    out.push(label(`count${i}`, at, String(c), "above", { color: INK_HEX }));
    markers.push(labelMarker(at, String(c), "above"));
  });
  // Every edge is numbered when there is room, else every other one.
  const every = (size.w - margin.left - margin.right) / n < 34 ? 2 : 1;
  for (let i = 0; i <= n; i += every) {
    const text = formatNumber(edge(i));
    const at: XY = { x: i, y: 0 };
    out.push(label(`edge${i}`, at, text, "below", { color: INK_HEX }));
    markers.push(labelMarker(at, text, "below"));
  }
  const axes = chartAxes({ n, bottom: 0, top: topCount, step: yStep, frame, unit: yWord, skipZero: true });
  out.push(...axes.expressions);
  markers.push(...axes.markers);
  if (xWord) {
    const at: XY = { x: n / 2, y: -30 * frame.uy };
    out.push(label("xWord", at, xWord, "below", { color: PENCIL_HEX }));
    markers.push(labelMarker(at, xWord, "below"));
  }
  const ranges = bins.counts.map((_, i) => `${formatNumber(edge(i))}–${formatNumber(edge(i + 1))}`);
  return {
    spec: {
      v: 2,
      kind: "data",
      size,
      bounds,
      settings: {
        ...DEFAULT_GRAPH_SETTINGS,
        showGrid: false,
        showXAxis: false,
        showYAxis: false,
      },
      expressions: out,
      markers,
    },
    summary: `a histogram of ${input.values.length} values in bins of ${formatNumber(bins.width)} (${ranges.map((r, i) => `${r}: ${bins.counts[i]}`).join(", ")})`,
    fallback: { tool: "bar_chart", drawing: { categories: ranges, values: bins.counts, ...(input.xLabel ? { label: input.xLabel } : {}) } },
  };
}

function boxPlot(input: DataPlotInput): DataPlot | { error: string } {
  const f = fiveNumbers(input.values);
  if (!f) return { error: "A box plot needs at least 2 values." };
  const { min, max, step } = lineFor(input.values);
  // The box stands on the line, in pixels: from 20 to 52 above it.
  const low = 20;
  const high = 52;
  const mid = (low + high) / 2;
  const line = buildNumberLineGraph({ min, max, step, marks: [], intervals: [], jumps: [], labelStyle: "decimal", colors: input.colors, unitLabel: input.xLabel, reserveAbove: high });
  const color = input.colors[0] ?? "#4465e9";
  const uy = (line.bounds.top - line.bounds.bottom) / line.size.h;
  const y = (px: number) => px * uy;
  const out: GraphItem[] = [...line.expressions];
  const markers: GraphMarker[] = [];
  out.push(polygon("box", [{ x: f.q1, y: y(low) }, { x: f.q3, y: y(low) }, { x: f.q3, y: y(high) }, { x: f.q1, y: y(high) }], { color, fill: 0.18, width: 2.5 }));
  out.push(polyline("median", [{ x: f.median, y: y(low) }, { x: f.median, y: y(high) }], { color, width: 3 }));
  out.push(polyline("whiskerLow", [{ x: f.min, y: y(mid) }, { x: f.q1, y: y(mid) }], { color, width: 2.5 }));
  out.push(polyline("whiskerHigh", [{ x: f.q3, y: y(mid) }, { x: f.max, y: y(mid) }], { color, width: 2.5 }));
  out.push(polyline("capLow", [{ x: f.min, y: y(mid - 8) }, { x: f.min, y: y(mid + 8) }], { color, width: 2.5 }));
  out.push(polyline("capHigh", [{ x: f.max, y: y(mid - 8) }, { x: f.max, y: y(mid + 8) }], { color, width: 2.5 }));
  // The five numbers above the box, in lanes when they crowd; the picture grows to hold them.
  const names = [
    { name: "min", v: f.min },
    { name: "Q1", v: f.q1 },
    { name: "median", v: f.median },
    { name: "Q3", v: f.q3 },
    { name: "max", v: f.max },
  ];
  const pxPerUnit = line.size.w / (line.bounds.right - line.bounds.left);
  const texts = names.map((t) => `${t.name} ${formatNumber(round(t.v))}`);
  const lanes = labelLanes(names.map((t, i) => ({ x: (t.v - line.bounds.left) * pxPerUnit, w: labelSizePx(texts[i]).w })), 8);
  const rows = Math.max(...lanes) + 1;
  names.forEach((t, i) => {
    const at: XY = { x: t.v, y: y(high + 6 + lanes[i] * 24) };
    out.push(label(`five${i}`, at, texts[i], "above", { color: INK_HEX }));
    markers.push(labelMarker(at, texts[i], "above"));
  });
  const grow = Math.max(0, high + 6 + rows * 24 + 26 - line.bounds.top / uy);
  const iqr = round(f.q3 - f.q1);
  // No vector box plot exists: without its box, the line alone would mislead,
  // so a failed drawing shows as one that could not be drawn.
  const { source: _lineSource, ...lineSpec } = line;
  void _lineSource;
  return {
    spec: {
      ...lineSpec,
      kind: "data",
      size: { w: line.size.w, h: Math.round(line.size.h + grow) },
      bounds: { ...line.bounds, top: line.bounds.top + grow * uy },
      expressions: out,
      markers: [...markers, ...line.markers],
    },
    summary: `a box plot of ${input.values.length} values: min ${formatNumber(f.min)}, Q1 ${formatNumber(f.q1)}, median ${formatNumber(f.median)}, Q3 ${formatNumber(f.q3)}, max ${formatNumber(f.max)} (IQR ${formatNumber(iqr)})`,
    fallback: null,
  };
}

function scatter(input: DataPlotInput): DataPlot | { error: string } {
  const pts = input.points;
  if (pts.length < 2) return { error: "A scatter plot needs at least 2 points, as '(1,2), (2,3)'." };
  const color = input.colors[0] ?? "#4465e9";
  const fitColor = input.colors[1] ?? input.colors[0] ?? "#ae3ec9";
  const [x0, x1] = padRange(Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x)));
  let [y0, y1] = padRange(Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y)), 0.12);
  // The axes are worth seeing when they are close.
  // The y-axis keeps 40px beside it for its numbers.
  const left = x0 > 0 && x0 < (x1 - x0) * 0.4 ? -(x1 * 40) / (420 - 40) : x0;
  // The x-axis keeps 34px under it for its numbers (closer, Desmos greys them against the edge).
  if (y0 > 0 && y0 < (y1 - y0) * 0.4) y0 = -(y1 * 34) / (315 - 34);
  const out: GraphExpression[] = [];
  const markers: GraphMarker[] = [];
  let fitText = "";
  let fallbackExpression = "";
  if (input.fit === "linear") {
    const f = linearFit(pts);
    if (!f) return { error: "A line of best fit needs points with different x-values." };
    const m = round(f.m, 3);
    const b = round(f.b, 3);
    out.push({ id: "fit", latex: `y=${num(m)}x+${num(b)}`.replace("+-", "-"), color: fitColor, lineWidth: 2.5, lineStyle: "DASHED" });
    fitText = `; line of best fit y = ${formatNumber(round(f.m))}x ${f.b < 0 ? "−" : "+"} ${formatNumber(Math.abs(round(f.b)))} (r = ${formatNumber(round(f.r))})`;
    fallbackExpression = `${m}*x + ${b}`.replace("+ -", "- ");
    y1 = Math.max(y1, m * x1 + b, m * left + b);
    y0 = Math.min(y0, m * x1 + b, m * left + b);
  } else if (input.fit === "exponential") {
    const f = exponentialFit(pts);
    if (!f) return { error: "An exponential fit needs every y-value above 0." };
    const a = round(f.a, 3);
    const b = round(f.b, 3);
    out.push({ id: "fit", latex: `y=${num(a)}\\cdot${num(b)}^{x}`, color: fitColor, lineWidth: 2.5, lineStyle: "DASHED" });
    fitText = `; exponential fit y = ${formatNumber(round(f.a))} · ${formatNumber(round(f.b))}^x (r = ${formatNumber(round(f.r))} on log y)`;
    fallbackExpression = `${a}*${b}^x`;
  }
  pts.forEach((p, i) => {
    out.push({ id: `p${i}`, latex: `(${num(p.x)},${num(p.y)})`, color, pointSize: 10, ...(p.label ? { label: p.label, showLabel: true } : {}) });
    if (p.label) markers.push({ x: p.x, y: p.y, label: p.label, kind: "point" });
  });
  const size = { w: 420, h: 315 };
  const bounds = boundsAround({ left, right: x1, bottom: y0, top: y1 }, size, { top: 10, right: 10, bottom: input.xLabel ? 16 : 10, left: input.yLabel ? 16 : 10 }, false);
  return {
    spec: {
      v: 2,
      kind: "data",
      size,
      bounds,
      settings: { ...DEFAULT_GRAPH_SETTINGS, ...axisSteps(bounds, size), xAxisLabel: input.xLabel ?? "", yAxisLabel: input.yLabel ?? "" },
      expressions: out,
      markers,
    },
    summary: `a scatter plot of ${pts.length} points${fitText}`,
    fallback: fallbackExpression
      ? { tool: "function", expression: fallbackExpression, xMin: round(left, 6), xMax: round(x1, 6), points: pts }
      : { tool: "points", points: pts, xMin: round(left, 6), xMax: round(x1, 6), yMin: round(y0, 6), yMax: round(y1, 6) },
  };
}

/** The vector renderer's version of a plot, kept in the spec for a failed load. */
function sourceOf(fallback: DataPlot["fallback"]): GraphSource | undefined {
  if (!fallback) return undefined;
  if (fallback.tool === "number_line") return { kind: "number_line", drawing: fallback.drawing };
  if (fallback.tool === "bar_chart") return { kind: "bar_chart", drawing: fallback.drawing };
  if (fallback.tool === "function") {
    return { kind: "function", expression: fallback.expression, xMin: fallback.xMin, xMax: fallback.xMax, extras: { markPoints: fallback.points, slopeRun: null } };
  }
  return { kind: "points", points: fallback.points, connect: false, xMin: fallback.xMin, xMax: fallback.xMax, yMin: fallback.yMin, yMax: fallback.yMax };
}

export function buildDataPlot(input: DataPlotInput): DataPlot | { error: string } {
  let plot: DataPlot | { error: string };
  if (input.kind === "scatter") plot = scatter(input);
  else if (input.values.length === 0) return { error: `A ${input.kind.replace("_", " ")} needs values, as '3 | 5 | 5 | 8'.` };
  else if (input.kind === "dot_plot") plot = dotPlot(input);
  else if (input.kind === "histogram") plot = histogram(input);
  else plot = boxPlot(input);
  if ("error" in plot) return plot;
  const source = sourceOf(plot.fallback);
  return source ? { ...plot, spec: { ...plot.spec, source } } : plot;
}
