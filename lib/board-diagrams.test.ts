import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arcPolyline,
  describeFractionModel,
  figureSideLabels,
  labelLanes,
  placeSketchLabels,
  dividerAngles,
  edgeLabelPoint,
  figureVertices,
  formatTick,
  fractionLatex,
  niceMax,
  barScale,
  niceStep,
  parseFraction,
  parseLineIntervals,
  parseLineJumps,
  parseLineMarks,
  parseNumber,
  parseSketchLabels,
  parseSketchStrokes,
  sectorPolygon,
  tickValues,
  wholesNeeded,
} from "./board-diagrams";

test("parseNumber reads integers, decimals, fractions and mixed numbers", () => {
  assert.equal(parseNumber("3"), 3);
  assert.equal(parseNumber("-1.5"), -1.5);
  assert.equal(parseNumber("3/4"), 0.75);
  assert.equal(parseNumber("-1/2"), -0.5);
  assert.equal(parseNumber("1 1/2"), 1.5);
  assert.equal(parseNumber("inf"), Infinity);
  assert.equal(parseNumber("-inf"), -Infinity);
  assert.equal(parseNumber("1/0"), null);
  assert.equal(parseNumber("abc"), null);
});

test("parseFraction handles proper, improper, whole and mixed forms", () => {
  assert.deepEqual(parseFraction("3/4"), { n: 3, d: 4 });
  assert.deepEqual(parseFraction(" 5 / 4 "), { n: 5, d: 4 });
  assert.deepEqual(parseFraction("2"), { n: 2, d: 1 });
  assert.deepEqual(parseFraction("1 1/2"), { n: 3, d: 2 });
  assert.equal(parseFraction("3/0"), null);
  assert.equal(parseFraction("1/40"), null, "denominators above 24 are refused");
  assert.equal(parseFraction("x/4"), null);
  assert.equal(wholesNeeded({ n: 3, d: 4 }), 1);
  assert.equal(wholesNeeded({ n: 5, d: 4 }), 2);
  assert.equal(wholesNeeded({ n: 8, d: 4 }), 2);
  assert.equal(fractionLatex({ n: 3, d: 4 }), "\\dfrac{3}{4}");
  assert.equal(fractionLatex({ n: 2, d: 1 }), "2");
  assert.match(describeFractionModel({ n: 1, d: 2 }, "circle"), /1 circle cut into 2 equal parts, 1 shaded \(1\/2\)/);
  assert.match(describeFractionModel({ n: 5, d: 4 }, "bar"), /2 bars/);
});

test("pie geometry starts at the top and closes back at the centre", () => {
  assert.deepEqual(dividerAngles(1), []);
  assert.deepEqual(dividerAngles(4), [-90, 0, 90, 180]);
  const arc = arcPolyline(0, 0, 10, -90, 0);
  assert.ok(Math.abs(arc[0].x) < 1e-9 && Math.abs(arc[0].y + 10) < 1e-9, "arc starts at the top");
  const last = arc[arc.length - 1];
  assert.ok(Math.abs(last.x - 10) < 1e-9 && Math.abs(last.y) < 1e-9, "arc ends at the right");
  const sector = sectorPolygon(5, 5, 10, -90, 90);
  assert.deepEqual(sector[0], { x: 5, y: 5 });
  assert.deepEqual(sector[sector.length - 1], { x: 5, y: 5 });
  assert.ok(sector.length > 20, "half circle is sampled finely enough to look round");
});

test("number line ticks pick a readable step and label fractions", () => {
  assert.equal(niceStep(0, 10), 1);
  assert.equal(niceStep(0, 100), 10);
  assert.equal(niceStep(-5, 5), 1);
  assert.equal(niceStep(0, 2, 8), 0.25);
  assert.deepEqual(tickValues(0, 2, 0.5), [0, 0.5, 1, 1.5, 2]);
  assert.deepEqual(tickValues(-2, 2, 1), [-2, -1, 0, 1, 2]);
  assert.equal(tickValues(0, 2, 0).length, 0);
  assert.equal(formatTick(0.75, 0.25), "3/4");
  assert.equal(formatTick(0.5, 0.25), "1/2");
  assert.equal(formatTick(1, 0.25), "1");
  assert.equal(formatTick(2.5, 0.5), "5/2");
  assert.equal(formatTick(2.5, 2.5), "2.5");
  assert.equal(formatTick(-3, 1), "-3");
});

test("number line marks, intervals and jumps parse their compact syntax", () => {
  assert.deepEqual(parseLineMarks("0, 2:x ≥ 2, 1/2:half"), [
    { value: 0 },
    { value: 2, label: "x ≥ 2" },
    { value: 0.5, label: "half" },
  ]);
  assert.deepEqual(parseLineMarks("nope"), []);

  const intervals = parseLineIntervals("2..5; (1..3); [0..1); 2..inf:x > 2; -inf..3");
  assert.equal(intervals.length, 5);
  assert.deepEqual(intervals[0], { from: 2, to: 5, openFrom: false, openTo: false });
  assert.deepEqual(intervals[1], { from: 1, to: 3, openFrom: true, openTo: true });
  assert.deepEqual(intervals[2], { from: 0, to: 1, openFrom: false, openTo: true });
  assert.equal(intervals[3].to, Infinity);
  assert.equal(intervals[3].openTo, true);
  assert.equal(intervals[3].label, "x > 2");
  assert.equal(intervals[4].from, -Infinity);
  assert.deepEqual(parseLineIntervals("5..2"), [], "reversed intervals are dropped");
  assert.deepEqual(parseLineIntervals("1 to 4")[0], { from: 1, to: 4, openFrom: false, openTo: false });

  assert.deepEqual(parseLineJumps("0>3:+3; 3->5:+2; 5>2"), [
    { from: 0, to: 3, label: "+3" },
    { from: 3, to: 5, label: "+2" },
    { from: 5, to: 2 },
  ]);
});

test("figures list vertices with the base first and label points outside", () => {
  const tri = figureVertices("right_triangle", 100, 80);
  assert.deepEqual(tri[0], { x: 0, y: 80 });
  assert.deepEqual(tri[2], { x: 0, y: 0 });
  const base = edgeLabelPoint(tri, 0, 10);
  assert.ok(base.y > 80, "base label sits below the base");
  const rect = figureVertices("rectangle", 200, 100);
  assert.equal(rect.length, 4);
  const right = edgeLabelPoint(rect, 1, 10);
  assert.ok(right.x > 200, "right side label sits to the right");
});

test("sketch strokes and labels live in a 0-100 box", () => {
  const strokes = parseSketchStrokes("closed 10,90 90,90 50,20; 0,0 120,-5");
  assert.equal(strokes.length, 2);
  assert.equal(strokes[0].closed, true);
  assert.equal(strokes[0].points.length, 3);
  assert.equal(strokes[1].closed, false);
  assert.deepEqual(strokes[1].points[1], { x: 100, y: 0 }, "points clamp to the box");
  assert.deepEqual(parseSketchStrokes("closed 1,1 2,2"), [{ points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], closed: false }]);
  assert.deepEqual(parseSketchLabels("50,10:ramp; 80,60: the box "), [
    { x: 50, y: 10, text: "ramp" },
    { x: 80, y: 60, text: "the box" },
  ]);
});

test("niceMax rounds a chart ceiling up to a friendly number", () => {
  assert.equal(niceMax(7), 10);
  assert.equal(niceMax(23), 25);
  assert.equal(niceMax(100), 100);
  assert.equal(niceMax(0), 1);
});

test("densifyPolyline keeps endpoints and fills long segments", async () => {
  const { densifyPolyline } = await import("./board-diagrams");
  const pts = densifyPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10);
  assert.equal(pts.length, 11);
  assert.deepEqual(pts[0], { x: 0, y: 0 });
  assert.deepEqual(pts[10], { x: 100, y: 0 });
  assert.equal(densifyPolyline([{ x: 0, y: 0 }]).length, 1);
});

test("tape rows parse names, shaded segments, and totals", async () => {
  const { parseTapeRows } = await import("./board-diagrams");
  const rows = parseTapeRows("Red: *2 | *2 | 2 = 6; Blue: 3 | 3; 4 | 4 | 4");
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, "Red");
  assert.deepEqual(rows[0].segments.map((s) => s.shaded), [true, true, false]);
  assert.equal(rows[0].total, "6");
  assert.equal(rows[1].name, "Blue");
  assert.equal(rows[2].name, undefined);
  assert.equal(rows[2].segments.length, 3);
});

test("math helpers: operations, marks, points, runs, altitude", async () => {
  const { parseOperation, parseAngleMarks, parseXYPoints, parseSlopeRun, altitude, figureVertices, regularPolygon } = await import("./board-diagrams");
  assert.equal(parseOperation("times"), "×");
  assert.equal(parseOperation("−"), "-");
  assert.equal(parseOperation("plus"), "+");
  assert.equal(parseOperation("divide"), null);
  assert.deepEqual(parseAngleMarks("1|5, 9, 5"), [1, 5]);
  assert.deepEqual(parseXYPoints("(1,2):A, (3,6), -2 4:C"), [{ x: 1, y: 2, label: "A" }, { x: 3, y: 6, label: undefined }, { x: -2, y: 4, label: "C" }]);
  assert.deepEqual(parseSlopeRun("1..3"), { x1: 1, x2: 3 });
  assert.deepEqual(parseSlopeRun("-1 to 2"), { x1: -1, x2: 2 });
  assert.equal(parseSlopeRun("2..2"), null);
  const tri = figureVertices("triangle", 100, 60);
  assert.deepEqual(altitude(tri), { apex: { x: 38, y: 0 }, foot: { x: 38, y: 60 } });
  const para = figureVertices("parallelogram", 100, 50);
  assert.deepEqual(altitude(para), { apex: { x: 72, y: 0 }, foot: { x: 72, y: 50 } });
  const hex = regularPolygon(6, 100, 100);
  assert.equal(hex.length, 6);
  assert.ok(Math.abs(hex[0].y - hex[1].y) < 1e-9, "base edge is horizontal");
  assert.ok(hex[0].x < hex[1].x, "vertex 0 is bottom-left");
});

test("tape rows keep empty boxes and only read totals from the last box", async () => {
  const { parseTapeRows } = await import("./board-diagrams");
  const rows = parseTapeRows("Red: | ; Blue: | | ");
  assert.equal(rows[0].segments.length, 2);
  assert.equal(rows[1].segments.length, 3);
  const wild = parseTapeRows(`100% = 100 pieces ${"| ".repeat(40)}`);
  assert.equal(wild[0].segments.length, 12);
  assert.equal(wild[0].total, undefined);
  const totals = parseTapeRows("3 | 3 | 3 | 3 = 12");
  assert.equal(totals[0].segments.length, 4);
  assert.equal(totals[0].total, "12");
});

test("a right triangle's labels are the two legs, then the hypotenuse", () => {
  // Edges: 0 bottom leg, 1 hypotenuse, 2 upright leg.
  assert.deepEqual(figureSideLabels("right_triangle", ["6", "8", "x"]), { edges: ["6", "x", "8"], description: "legs 6 and 8, hypotenuse x" });
  assert.deepEqual(figureSideLabels("right_triangle", ["3", "4", "?"]).edges, ["3", "?", "4"]);
  // Numbers that only fit Pythagoras with 10 as the hypotenuse go where they fit.
  assert.deepEqual(figureSideLabels("right_triangle", ["6", "10", "8"]), { edges: ["6", "10", "8"], description: "legs 6 and 8, hypotenuse 10" });
  assert.deepEqual(figureSideLabels("right_triangle", ["13", "5", "12"]).description, "legs 12 and 5, hypotenuse 13");
  assert.deepEqual(figureSideLabels("right_triangle", ["", "5"]), { edges: ["", "", "5"], description: "leg 5" });
  // Other figures keep their order.
  assert.deepEqual(figureSideLabels("rectangle", ["8 cm", "3 cm"]), { edges: ["8 cm", "3 cm"], description: "sides 8 cm, 3 cm" });
  assert.equal(figureSideLabels("cube", ["2", "2", "2"]).description, "dimensions 2, 2, 2");
});

test("sketch labels name the right strokes and stay off them", () => {
  // The recorded rise-over-run sketch: base, slope, upright side.
  const strokes = parseSketchStrokes("10,80 90,80;10,80 90,20;90,20 90,80");
  const labels = parseSketchLabels("60,20:rise = height;30,60:run = width");
  const measure = (t: string) => ({ w: t.length * 8, h: 18 });
  const [rise, run] = placeSketchLabels(strokes, labels, 320, 220, measure);
  const cx = (l: { x: number; w: number }) => l.x + l.w / 2;
  const cy = (l: { y: number; h: number }) => l.y + l.h / 2;
  // Rise sits beside the upright stroke (x = 288), halfway up it.
  assert.ok(rise.x >= 288, `rise starts right of the upright side, got ${rise.x}`);
  assert.ok(Math.abs(cy(rise) - 110) < 12, `rise is level with the middle of the side, got ${cy(rise)}`);
  // Run sits under the base (y = 176), centred on it.
  assert.ok(run.y >= 176, `run is under the base, got ${run.y}`);
  assert.ok(Math.abs(cx(run) - 160) < 12, `run is centred on the base, got ${cx(run)}`);
  // A label dropped on a stroke is pushed off it.
  const onLine = placeSketchLabels(parseSketchStrokes("0,50 100,50"), parseSketchLabels("50,50:road"), 300, 200, measure)[0];
  assert.ok(onLine.y + onLine.h < 100 || onLine.y > 100, `the label no longer crosses y = 100: ${JSON.stringify(onLine)}`);
  // Two labels in the same spot are separated.
  const twins = placeSketchLabels([], parseSketchLabels("50,50:first; 50,50:second"), 300, 200, measure);
  assert.ok(twins[1].y >= twins[0].y + twins[0].h, JSON.stringify(twins));
});

test("labels that would overlap climb into lanes", () => {
  assert.deepEqual(labelLanes([{ x: 0, w: 40 }, { x: 30, w: 40 }, { x: 100, w: 40 }, { x: 10, w: 20 }]), [0, 1, 0, 2]);
});

test("a bar chart's scale reaches below zero for negative values", () => {
  assert.deepEqual(barScale([3, 5, 2, 6, 4]), { top: 10, bottom: 0, ticks: [0, 5, 10] });
  assert.deepEqual(barScale([4, -3, 2.5]), { top: 4, bottom: -4, ticks: [-4, -2, 0, 2, 4] });
  assert.deepEqual(barScale([-2, -7]), { top: 0, bottom: -10, ticks: [-10, -5, 0] });
  assert.deepEqual(barScale([0, 0]), { top: 1, bottom: 0, ticks: [0, 0.5, 1] });
  assert.deepEqual(barScale([12, 15, 9, 22, 30, 28]), { top: 40, bottom: 0, ticks: [0, 20, 40] });
});
