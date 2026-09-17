// Bar charts drawn by Desmos (Sept 17 2026), from draw_bar_chart's drawing.
// Everything is our own pieces on a picture with no Desmos axes: the axes and
// their numbers, the unit word, light gridlines, the bars, their values and
// the category names, each word a marker. Categories sit at x = 0.5, 1.5, …;
// a negative value hangs below the zero line. Pure; tested in
// desmos-bar-chart.test.ts.

import { labelLanes, niceMax, type BarChartDrawing } from "./board-diagrams";
import { boundsAround, frameOf, hLines, INK_HEX, label, labelMarker, labelSizePx, num, PENCIL_HEX, polygon, polyline, type Frame, type XY } from "./desmos-primitives";
import { DEFAULT_GRAPH_SETTINGS, niceAxisStep, type GraphExpression, type GraphMarker, type GraphSpec } from "./desmos-spec";

const BAR = 0.6;
const PLOT_H = 220;

export type BarChartInput = BarChartDrawing & { colors: string[] };

function valueText(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

/**
 * A chart's own axes (Desmos's run past the plot, and its numbers leave
 * pictures under 260px tall): the zero line across x = 0..n, the value axis
 * from `bottom` to `top`, a number beside each step, and the unit word over
 * the axis. `skipZero` leaves "0" out where a label below would crowd it.
 */
export function chartAxes(opts: {
  n: number;
  bottom: number;
  top: number;
  step: number;
  frame: Frame;
  unit?: string;
  skipZero?: boolean;
}): { expressions: GraphExpression[]; markers: GraphMarker[] } {
  const { n, bottom, top, step, frame } = opts;
  const out: GraphExpression[] = [];
  const markers: GraphMarker[] = [];
  out.push(polyline("valueAxis", [{ x: 0, y: bottom }, { x: 0, y: top + 6 * frame.uy }], { color: INK_HEX, width: 2 }));
  out.push(polyline("zeroLine", [{ x: 0, y: 0 }, { x: n, y: 0 }], { color: INK_HEX, width: 2 }));
  const values: number[] = [];
  for (let v = bottom; v <= top + step * 1e-6; v += step) values.push(Math.round(v / step) * step);
  const shown = values.filter((v) => !(opts.skipZero && Math.abs(v) < step * 1e-6));
  out.push(hTicks("valueTicks", shown, frame));
  shown.forEach((v, i) => {
    const at: XY = { x: -8 * frame.ux, y: v };
    const text = valueText(v);
    out.push(label(`valueNumber${i}`, at, text, "left", { color: INK_HEX }));
    markers.push(labelMarker(at, text, "left"));
  });
  if (opts.unit) {
    const at: XY = { x: 0, y: top + 14 * frame.uy };
    out.push(label("unitWord", at, opts.unit, "above", { color: PENCIL_HEX }));
    markers.push(labelMarker(at, opts.unit, "above"));
  }
  return { expressions: out, markers };
}

/** Short ticks left of the value axis at each value. */
function hTicks(id: string, ys: number[], frame: Frame): GraphExpression {
  const w = 5 * frame.ux;
  return { id, latex: `y=[${ys.map(num).join(",")}]\\left\\{${num(-w)}\\le x\\le 0\\right\\}`, color: INK_HEX, lineWidth: 2 };
}

export function buildBarChartGraph(input: BarChartInput): GraphSpec {
  const n = Math.max(1, input.categories.length);
  const values = input.categories.map((_, i) => input.values[i] ?? 0);
  const colors = input.colors.length > 0 ? input.colors : ["#4465e9"];
  const top = niceMax(Math.max(0, ...values));
  const low = Math.min(0, ...values);
  const bottomValue = low < 0 ? -niceMax(-low) : 0;
  const w = Math.max(360, Math.min(600, 96 + n * 72));
  const step = niceAxisStep(top - bottomValue, PLOT_H, 36);

  // Category names: a second row when neighbours would touch.
  const slotPx = (w - 64 - 16) / n;
  const nameLanes = labelLanes(input.categories.map((c, i) => ({ x: (i + 0.5) * slotPx, w: labelSizePx(c).w })), 16);
  const nameRows = input.categories.length ? Math.max(...nameLanes) + 1 : 1;
  const unit = input.unit?.trim() ?? "";
  const numberW = Math.max(...[top, bottomValue].map((v) => labelSizePx(valueText(v)).w));
  const margin = { top: unit ? 50 : 34, right: 16, bottom: 14 + nameRows * 24, left: Math.max(40, numberW + 22) };
  const size = { w, h: PLOT_H + margin.top + margin.bottom };
  const box = { left: 0, right: n, bottom: bottomValue, top };
  const bounds = boundsAround(box, size, margin, false);
  const frame = frameOf(bounds, size);

  const out: GraphExpression[] = [];
  const markers: GraphMarker[] = [];
  const lines: number[] = [];
  for (let v = bottomValue; v <= top + step * 1e-6; v += step) {
    const r = Math.round(v / step) * step;
    if (Math.abs(r) > step * 1e-6) lines.push(Number(r.toFixed(10)));
  }
  if (lines.length) out.push(hLines("grid", lines, 0, n, { color: PENCIL_HEX, width: 1, opacity: 0.3 }));

  values.forEach((v, i) => {
    const a = i + (1 - BAR) / 2;
    const b = i + (1 + BAR) / 2;
    const color = colors[i % colors.length];
    if (v !== 0) {
      out.push(polygon(`bar${i}`, [{ x: a, y: 0 }, { x: b, y: 0 }, { x: b, y: v }, { x: a, y: v }], { color, fill: 0.75, width: 1.5 }));
    }
    const text = valueText(v);
    const at: XY = { x: i + 0.5, y: v };
    const side = v < 0 ? "below" : "above";
    out.push(label(`value${i}`, at, text, side, { color: INK_HEX }));
    markers.push(labelMarker(at, text, side));
  });

  input.categories.forEach((name, i) => {
    // Under the zero line, or under the lowest bar when bars hang below it.
    const base = bottomValue < 0 ? bottomValue : 0;
    const at: XY = { x: i + 0.5, y: base - nameLanes[i] * 24 * frame.uy };
    out.push(label(`name${i}`, at, name, "below", { color: INK_HEX }));
    markers.push(labelMarker(at, name, "below"));
  });

  const axes = chartAxes({ n, bottom: bottomValue, top, step, frame, unit });
  return {
    v: 2,
    kind: "bar_chart",
    size,
    bounds,
    settings: { ...DEFAULT_GRAPH_SETTINGS, showGrid: false, showXAxis: false, showYAxis: false },
    expressions: [...out, ...axes.expressions],
    markers: [...markers, ...axes.markers],
    source: {
      kind: "bar_chart",
      drawing: { categories: input.categories, values: input.values, ...(unit ? { unit } : {}), ...(input.label ? { label: input.label } : {}) },
    },
  };
}
