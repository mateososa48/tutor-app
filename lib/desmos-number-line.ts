// Number lines drawn by Desmos (Sept 17 2026), from the same drawing the
// vector renderer takes (add_number_line's arguments). The line, its ticks
// and arrowheads are our own pieces on a picture with no grid and no axes;
// across, one unit is a number on the line, and up and down one unit is one
// picture pixel, so heights are laid out in pixels. Every value a dot sits on
// is written (off-tick values under the line, in the dot's colour), fraction
// ticks are stacked fractions, labels that would collide move to the next
// lane, and every word on the line is a marker the tutor can highlight. Pure;
// tested in desmos-number-line.test.ts.

import {
  autoTickStyle,
  formatNumber,
  formatTick,
  labelLanes,
  niceStep,
  tickValues,
  type NumberLineDrawing,
} from "./board-diagrams";
import {
  arrowhead,
  dotStack,
  dot,
  frameOf,
  hop,
  INK_HEX,
  label,
  labelMarker,
  labelSizePx,
  PENCIL_HEX,
  polyline,
  tickText,
  ticks,
  type XY,
} from "./desmos-primitives";
import { DEFAULT_GRAPH_SETTINGS, type GraphExpression, type GraphMarker, type GraphSpec } from "./desmos-spec";

export const NUMBER_LINE_W = 560;
const PAD = 30;
const TICK_HALF = 7;
const DOT_SIZE = 12;
const STACK_GAP = 16;
const HOP_H = 30;
const HOP_STEP = 18;
const LANE_H = 24;
const LABEL_GAP = 6;
const RAY_END = 1e308;

export type NumberLineInput = NumberLineDrawing & {
  /** Pens (hex): the intervals' first, then the marks', then the jumps', as the vector drawing takes them. */
  colors: string[];
  width?: number;
  /** A word after the line's right end (what the numbers count: "goals"). */
  unitLabel?: string;
  /** Pixels kept free above the line for a picture drawn on it (a box plot's box). */
  reserveAbove?: number;
  /** How high the first dot of a stack sits (0: on the line; a dot plot's dots stand above it). */
  stackBase?: number;
};

/** Ticks to label: every k-th, k a round 1, 2, 5, 10 …, so the widest label fits between them. */
export function tickLabelEvery(spacingPx: number, widestPx: number): number {
  if (!(spacingPx > 0)) return 1;
  const need = Math.max(1, Math.ceil((widestPx + 8) / spacingPx));
  return [1, 2, 5, 10, 20, 50, 100].find((k) => k >= need) ?? need;
}

const same = (a: number, b: number, step: number) => Math.abs(a - b) <= Math.abs(step) * 1e-6;

/** The drawing as JSON can hold it: endless rays become ±1e308 (still past either end). */
function storable(d: NumberLineInput): NumberLineDrawing {
  const cap = (v: number) => (v === Infinity ? RAY_END : v === -Infinity ? -RAY_END : v);
  return {
    min: d.min,
    max: d.max,
    ...(d.step !== undefined ? { step: d.step } : {}),
    marks: d.marks,
    intervals: d.intervals.map((iv) => ({ ...iv, from: cap(iv.from), to: cap(iv.to) })),
    jumps: d.jumps,
    ...(d.label ? { label: d.label } : {}),
    ...(d.labelStyle ? { labelStyle: d.labelStyle } : {}),
    ...(d.secondMin !== undefined ? { secondMin: d.secondMin } : {}),
    ...(d.secondMax !== undefined ? { secondMax: d.secondMax } : {}),
    ...(d.secondLabel ? { secondLabel: d.secondLabel } : {}),
    ...(d.unitLabel ? { label: [d.label, d.unitLabel].filter(Boolean).join(", ") } : {}),
  };
}

export function buildNumberLineGraph(input: NumberLineInput): GraphSpec {
  const { min, max } = input;
  const step = input.step ?? niceStep(min, max);
  const style = input.labelStyle ?? autoTickStyle(step);
  const colors = input.colors.length > 0 ? input.colors : ["#4465e9"];
  const pen = (i: number) => colors[i % colors.length];
  const intervalPen = (i: number) => pen(i);
  // A dot plot (a value repeated) is one colour; separate dots take their own pens.
  const dotPlot = new Set(input.marks.map((m) => m.value)).size < input.marks.length;
  const markPen = (i: number) => pen(input.intervals.length + (dotPlot ? 0 : i));
  const jumpPen = (i: number) => pen(input.intervals.length + input.marks.length + i);
  const w = input.width ?? NUMBER_LINE_W;
  const second = input.secondMin !== undefined && input.secondMax !== undefined && input.secondMax !== input.secondMin;
  const secondText = second && input.secondLabel ? input.secondLabel : "";
  const unitText = input.unitLabel?.trim() ?? "";
  const padLeft = PAD;
  // Room after the line for its unit word: the arrowhead, a gap, the word.
  const wordRoom = Math.max(unitText ? labelSizePx(unitText).w : 0, secondText ? labelSizePx(secondText).w : 0);
  const padRight = wordRoom ? PAD + LABEL_GAP + wordRoom + 8 : PAD;
  const ux = (max - min) / (w - padLeft - padRight);
  const pxOf = (v: number) => padLeft + (v - min) / ux;

  // Below the line: tick labels (thinned so they fit), then the values of
  // dots between ticks, each in the first lane where it does not collide.
  const tickList = tickValues(min, max, step);
  const tickTexts = tickList.map((v) => tickText(formatTick(v, step, style)));
  const widest = Math.max(0, ...tickTexts.map((t) => labelSizePx(t).w));
  const every = tickLabelEvery(tickList.length > 1 ? pxOf(tickList[1]) - pxOf(tickList[0]) : w, widest);
  const zeroAt = tickList.findIndex((v) => same(v, 0, step));
  const anchor = zeroAt >= 0 ? zeroAt % every : 0;
  const shownTicks = tickList.map((v, i) => ({ v, text: tickTexts[i] })).filter((_, i) => (i - anchor) % every === 0);
  const onTick = (v: number) => shownTicks.some((t) => same(t.v, v, step));
  const markValues = [...new Set(input.marks.map((m) => m.value))];
  const offTick = markValues.filter((v) => !onTick(v));
  const below = [
    ...shownTicks.map((t) => ({ v: t.v, text: t.text, kind: "tick" as const, color: INK_HEX })),
    ...offTick.map((v) => {
      const first = input.marks.findIndex((m) => m.value === v);
      return { v, text: tickText(formatTick(v, step, style)), kind: "value" as const, color: markPen(first) };
    }),
  ];
  const belowLanes = labelLanes(below.map((b) => ({ x: pxOf(b.v), w: labelSizePx(b.text).w })), 8);
  const belowRowH = below.some((b) => b.text.startsWith("`")) ? 40 : LANE_H;
  const belowRows = below.length ? Math.max(...belowLanes) + 1 : 1;
  const firstBottom = TICK_HALF + 2 + LABEL_GAP + belowRows * belowRowH;

  // Above the line: stacked dots and hops, then their words in lanes.
  const stackCount = new Map<number, number>();
  for (const m of input.marks) stackCount.set(m.value, (stackCount.get(m.value) ?? 0) + 1);
  const tallestStack = Math.max(0, ...stackCount.values());
  const stackBase = input.stackBase ?? 0;
  const stackTop = tallestStack > 0 ? stackBase + (tallestStack - 1) * STACK_GAP + DOT_SIZE / 2 : 0;
  // Hops whose spans overlap arch at different heights.
  const hopLanes: number[] = [];
  const hopSpans: Array<Array<[number, number]>> = [];
  for (const j of input.jumps) {
    const span: [number, number] = [Math.min(j.from, j.to), Math.max(j.from, j.to)];
    let lane = 0;
    while (hopSpans[lane]?.some(([a, b]) => span[0] < b && a < span[1])) lane++;
    (hopSpans[lane] ??= []).push(span);
    hopLanes.push(lane);
  }
  const hopHeight = (i: number) => HOP_H + hopLanes[i] * HOP_STEP;
  const hopTop = input.jumps.length > 0 ? Math.max(...input.jumps.map((_, i) => hopHeight(i))) : 0;
  type Above = { at: number; text: string; color: string };
  const above: Above[] = [];
  input.intervals.forEach((iv, i) => {
    if (!iv.label) return;
    const from = Math.max(min, iv.from);
    const to = Math.min(max, iv.to);
    const a = iv.from < min ? min - (padLeft - 8) * ux : from;
    const b = iv.to > max ? max + (padRight - 8) * ux : to;
    above.push({ at: (a + b) / 2, text: iv.label, color: intervalPen(i) });
  });
  const labelled = new Set<number>();
  input.marks.forEach((m, i) => {
    if (!m.label || labelled.has(m.value)) return;
    labelled.add(m.value);
    const first = input.marks.findIndex((mm) => mm.value === m.value);
    above.push({ at: m.value, text: m.label, color: markPen(first === -1 ? i : first) });
  });
  input.jumps.forEach((j, i) => {
    if (j.label) above.push({ at: (j.from + j.to) / 2, text: j.label, color: jumpPen(i) });
  });
  const aboveLanes = labelLanes(above.map((a) => ({ x: pxOf(a.at), w: labelSizePx(a.text).w })), 10);
  const aboveRows = above.length ? Math.max(...aboveLanes) + 1 : 0;
  const reserved = input.reserveAbove ?? 0;
  const aboveBase = Math.max(stackTop, hopTop, TICK_HALF, reserved) + 4;
  const top = aboveRows ? aboveBase + LABEL_GAP + aboveRows * LANE_H + 6 : Math.max(stackTop, hopTop, TICK_HALF, reserved) + 12;

  // A second scale under the first (a double number line).
  const secondY = -(firstBottom + 26);
  const bottom = second ? -secondY + TICK_HALF + 2 + LABEL_GAP + LANE_H + 8 : firstBottom + 8;

  const size = { w, h: Math.round(top + bottom) };
  const bounds = { left: min - padLeft * ux, right: max + padRight * ux, bottom: -bottom, top };
  const frame = frameOf(bounds, size);
  const lineLeft = bounds.left + 3 * ux;
  // The line stops at the usual margin; a second scale's unit sits after it.
  const lineRight = max + (PAD - 3) * ux;
  const out: GraphExpression[] = [];
  const markers: GraphMarker[] = [];

  const drawLine = (id: string, y: number) => {
    out.push(polyline(`${id}Axis`, [{ x: lineLeft + 8 * ux, y }, { x: lineRight - 8 * ux, y }], { color: INK_HEX, width: 2.5 }));
    out.push(arrowhead(`${id}Left`, { x: lineLeft, y }, Math.PI, frame, { color: INK_HEX }));
    out.push(arrowhead(`${id}Right`, { x: lineRight, y }, 0, frame, { color: INK_HEX }));
    out.push(ticks(`${id}Ticks`, tickList, y, TICK_HALF, frame, { color: INK_HEX, width: 2 }));
  };

  // Shaded ranges sit on the line, over it; their ends are dots.
  drawLine("line", 0);
  if (unitText) {
    const at: XY = { x: lineRight + 4 * ux, y: 0 };
    out.push(label("unit", at, unitText, "right", { color: PENCIL_HEX }));
    markers.push(labelMarker(at, unitText, "right"));
  }
  input.intervals.forEach((iv, i) => {
    const from = Math.max(min, iv.from);
    const to = Math.min(max, iv.to);
    if (!(to > from)) return;
    const color = intervalPen(i);
    const a = iv.from < min ? lineLeft + 9 * ux : from;
    const b = iv.to > max ? lineRight - 9 * ux : to;
    out.push(polyline(`range${i}`, [{ x: a, y: 0 }, { x: b, y: 0 }], { color, width: 6 }));
    if (iv.from < min) out.push(arrowhead(`range${i}Left`, { x: lineLeft, y: 0 }, Math.PI, frame, { color, length: 13, width: 7 }));
    if (iv.to > max) out.push(arrowhead(`range${i}Right`, { x: lineRight, y: 0 }, 0, frame, { color, length: 13, width: 7 }));
    if (iv.from >= min && iv.from <= max) out.push(dot(`range${i}From`, { x: iv.from, y: 0 }, { color, open: iv.openFrom, size: DOT_SIZE }));
    if (iv.to >= min && iv.to <= max) out.push(dot(`range${i}To`, { x: iv.to, y: 0 }, { color, open: iv.openTo, size: DOT_SIZE }));
  });

  // Dots: a repeated value stacks upward (a dot plot).
  markValues.forEach((v, k) => {
    const first = input.marks.findIndex((m) => m.value === v);
    const count = stackCount.get(v) ?? 1;
    const ys = Array.from({ length: count }, (_, j) => stackBase + j * STACK_GAP);
    out.push(dotStack(`dots${k}`, v, ys, { color: markPen(first), size: DOT_SIZE }));
    markers.push({ x: v, y: stackBase, label: formatTick(v, step, style), kind: "point" });
  });

  // Hops arch over the line.
  input.jumps.forEach((j, i) => {
    out.push(...hop(`hop${i}`, j.from, j.to, 0, hopHeight(i), frame, jumpPen(i)).parts);
  });

  // Words above.
  above.forEach((a, i) => {
    const at: XY = { x: a.at, y: aboveBase + aboveLanes[i] * LANE_H };
    out.push(label(`above${i}`, at, a.text, "above", { color: a.color }));
    markers.push(labelMarker(at, a.text, "above"));
  });

  // Words below: tick labels and dot values.
  below.forEach((b, i) => {
    const at: XY = { x: b.v, y: -(TICK_HALF + 2) - belowLanes[i] * belowRowH };
    out.push(label(`${b.kind}${i}`, at, b.text, "below", { color: b.color }));
    markers.push(labelMarker(at, b.text, "below"));
  });

  if (second) {
    drawLine("second", secondY);
    const sMin = input.secondMin as number;
    const sMax = input.secondMax as number;
    shownTicks.forEach((t, i) => {
      const value = sMin + ((t.v - min) / (max - min)) * (sMax - sMin);
      const text = formatNumber(value);
      const at: XY = { x: t.v, y: secondY - (TICK_HALF + 2) };
      out.push(label(`secondTick${i}`, at, text, "below", { color: INK_HEX }));
      markers.push(labelMarker(at, text, "below"));
    });
    if (secondText) {
      const at: XY = { x: lineRight + 4 * ux, y: secondY };
      out.push(label("secondUnit", at, secondText, "right", { color: PENCIL_HEX }));
      markers.push(labelMarker(at, secondText, "right"));
    }
  }

  // Marks first, so highlighting "3" finds the dot's own words before a tick's.
  markers.sort((a, b) => Number(a.kind !== "point") - Number(b.kind !== "point"));
  return {
    v: 2,
    kind: "number_line",
    size,
    bounds,
    settings: { ...DEFAULT_GRAPH_SETTINGS, showGrid: false, showXAxis: false, showYAxis: false },
    expressions: out,
    markers,
    source: { kind: "number_line", drawing: storable(input) },
  };
}
