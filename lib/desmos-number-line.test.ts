import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLineIntervals, parseLineJumps, parseLineMarks } from "./board-diagrams";
import { buildNumberLineGraph, tickLabelEvery, type NumberLineInput } from "./desmos-number-line";
import { isGraphTable, parseGraphSpec, type GraphExpression, type GraphSpec } from "./desmos-spec";

const PENS = ["#111111", "#222222", "#333333", "#444444"];
const line = (over: Partial<NumberLineInput>): GraphSpec =>
  buildNumberLineGraph({ min: 0, max: 10, marks: [], intervals: [], jumps: [], colors: PENS, ...over });
const exprs = (spec: GraphSpec): GraphExpression[] => spec.expressions.filter((e): e is GraphExpression => !isGraphTable(e));
const labels = (spec: GraphSpec) => exprs(spec).filter((e) => e.label).map((e) => e.label as string);
const inside = (spec: GraphSpec, x: number) => x >= spec.bounds.left && x <= spec.bounds.right;

test("every dot's value is written, in the dot's colour", () => {
  const spec = line({ min: 0, max: 12, step: 2, marks: parseLineMarks("3:P1, 11:P2") });
  const values = exprs(spec).filter((e) => e.id.startsWith("value"));
  assert.deepEqual(values.map((e) => e.label), ["3", "11"]);
  assert.deepEqual(values.map((e) => e.color), [PENS[0], PENS[1]]);
  assert.ok(labels(spec).includes("P1") && labels(spec).includes("P2"));
  assert.equal(spec.kind, "number_line");
  assert.equal(spec.settings.showXAxis, false);
});

test("fractions stack, crowded ticks thin out, and tenths read as decimals", () => {
  const quarters = line({ min: 0, max: 2, step: 0.25 });
  assert.ok(labels(quarters).includes("`\\frac{3}{4}`"));
  const tenths = line({ min: 0, max: 1, step: 0.1 });
  assert.ok(labels(tenths).includes("0.3"));
  assert.equal(tickLabelEvery(20, 30), 2);
  assert.equal(tickLabelEvery(50, 20), 1);
  assert.equal(tickLabelEvery(20, 45), 5, "round steps only: never every third tick");
  const big = line({ min: -1000, max: 1000, step: 100 });
  const ticks = labels(big).filter((l) => /^-?\d+$/.test(l));
  assert.ok(ticks.includes("0") && ticks.includes("-1000") && !ticks.includes("-900"), ticks.join(" "));
});

test("rays reach the ends and survive the trip through JSON", () => {
  const spec = line({ min: -5, max: 5, step: 1, intervals: parseLineIntervals("(2..inf:x > 2; -inf..-1]:x ≤ -1") });
  const heads = exprs(spec).filter((e) => /^range\d(Left|Right)$/.test(e.id));
  assert.equal(heads.length, 2);
  const ends = exprs(spec).filter((e) => /^range\d(From|To)$/.test(e.id));
  assert.deepEqual(ends.map((e) => e.pointStyle ?? "POINT"), ["OPEN", "POINT"]);
  const back = parseGraphSpec(JSON.stringify(spec));
  assert.ok(back?.source?.kind === "number_line");
  assert.equal(back.source.drawing.intervals[0].to, 1e308);
  assert.equal(back.source.drawing.intervals[1].from, -1e308);
});

test("a dot plot is one colour and can stand above the line", () => {
  const spec = line({ min: 0, max: 6, step: 1, marks: parseLineMarks("2, 2, 2, 3, 5"), stackBase: 14 });
  const stacks = exprs(spec).filter((e) => e.id.startsWith("dots"));
  assert.equal(new Set(stacks.map((e) => e.color)).size, 1);
  assert.equal(stacks[0].latex, "(2,[14,30,46])");
  assert.ok(spec.bounds.top > 46);
});

test("overlapping hops arch at different heights", () => {
  const spec = line({ min: -1, max: 8, step: 1, jumps: parseLineJumps("0>3:+3; 3>5:+2; 5>1:-4") });
  const arches = exprs(spec).filter((e) => /^hop\d$/.test(e.id));
  const heights = arches.map((e) => Number(/\+([\d.]+)\\sin/.exec(e.latex)?.[1]));
  assert.equal(heights[0], heights[1], "side by side, the same height");
  assert.ok(heights[2] > heights[0], `over both, higher: ${heights.join(", ")}`);
});

test("a second scale and a unit word fit inside the picture", () => {
  const spec = line({ min: 0, max: 100, step: 25, secondMin: 0, secondMax: 80, secondLabel: "marbles", unitLabel: "percent" });
  const unit = exprs(spec).find((e) => e.id === "secondUnit");
  const x = Number(/^\((-?[\d.]+),/.exec(unit?.latex ?? "")?.[1]);
  // The word starts right of its point; its point plus the word's width is inside.
  assert.ok(inside(spec, x) && x + ((7 * 6.8 * 1.25 + 6) * (spec.bounds.right - spec.bounds.left)) / spec.size.w <= spec.bounds.right, unit?.latex);
  assert.ok(labels(spec).includes("80"));
  assert.ok(spec.markers.some((m) => m.label === "percent"));
});

test("room kept above for a box, and markers for every word", () => {
  const plain = line({ min: 0, max: 4, step: 1 });
  const reserved = line({ min: 0, max: 4, step: 1, reserveAbove: 60 });
  assert.ok(reserved.bounds.top >= 60 && reserved.bounds.top > plain.bounds.top);
  assert.deepEqual(plain.markers.map((m) => m.label), ["0", "1", "2", "3", "4"]);
  assert.ok(plain.markers.every((m) => m.kind === "label" && m.orientation === "below"));
});
