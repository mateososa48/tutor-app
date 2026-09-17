import { test } from "node:test";
import assert from "node:assert/strict";
import {
  axisSteps,
  DEFAULT_GRAPH_SETTINGS,
  DEFAULT_GRAPH_SIZE,
  findMarker,
  graphSettings,
  graphSpecText,
  markerBox,
  minorSubdivisions,
  niceAxisStep,
  parseGraphSpec,
  pointOfLatex,
  prefixIds,
  pxPerUnit,
  toMath,
  toPx,
  type GraphItem,
} from "./desmos-spec";
import { buildAxesGraph, buildFunctionGraph, buildPointsGraph } from "./desmos-graph";

const size = DEFAULT_GRAPH_SIZE;
const view = { left: -5, right: 5, bottom: -4, top: 4 };

test("axis steps are 1, 2 or 5 × 10ⁿ with room for every number", () => {
  assert.equal(niceAxisStep(10, 420, 32), 1);
  assert.equal(niceAxisStep(20, 420, 32), 2);
  assert.equal(niceAxisStep(1000, 315, 28), 100);
  assert.equal(niceAxisStep(0.5, 420, 32), 0.05);
  assert.equal(niceAxisStep(0, 420, 32), 0);
  const steps = (b: typeof view) => {
    const grid = axisSteps(b, size);
    return [grid.xAxisStep, grid.yAxisStep];
  };
  // The board's usual view numbers every unit (the probe's finding).
  assert.deepEqual(steps(view), [1, 1]);
  // Wider ranges step by 2 or 5, with room for "-10" (and 20px rows would be too tight for y).
  assert.deepEqual(steps({ left: -10, right: 10, bottom: -8, top: 8 }), [2, 2]);
  assert.deepEqual(steps({ left: -20, right: 20, bottom: -4, top: 4 }), [5, 1]);
  // Minor lines stay at least 15px apart: half units at 42px a unit; none at 10.5px a unit.
  assert.deepEqual(axisSteps(view, size), { xAxisStep: 1, yAxisStep: 1, xAxisMinorSubdivisions: 2, yAxisMinorSubdivisions: 2 });
  assert.equal(axisSteps({ left: -20, right: 20, bottom: -4, top: 4 }, size).xAxisMinorSubdivisions, 1);
  assert.equal(minorSubdivisions(5, 84), 5);
  assert.equal(minorSubdivisions(2, 39.4), 2);
  assert.equal(minorSubdivisions(2, 80), 4);
  assert.equal(minorSubdivisions(100, 31.5), 2);
  assert.equal(minorSubdivisions(100, 25), 1);
  // Empty -10..10 axes keep a unit grid.
  assert.equal(axisSteps({ left: -13.33, right: 13.33, bottom: -10, top: 10 }, size).yAxisMinorSubdivisions, 5);
  assert.equal(minorSubdivisions(0.5, 45), 1);
  const big = axisSteps({ left: 0, right: 2000, bottom: 0, top: 1000 }, size);
  assert.ok(big.xAxisStep >= 200 && big.yAxisStep === 100, JSON.stringify(big));
  // Square units share one step.
  const square = axisSteps({ left: -5, right: 5, bottom: -3.75, top: 3.75 }, size);
  assert.equal(square.xAxisStep, square.yAxisStep);
  const settings = graphSettings(view, size, { showGrid: false });
  assert.equal(settings.showGrid, false);
  assert.equal(settings.xAxisStep, 1);
  assert.equal(settings.xAxisArrowMode, "NONE");
});

test("math and picture coordinates convert both ways", () => {
  assert.deepEqual(toPx({ x: 0, y: 0 }, view, size), { x: 210, y: 157.5 });
  assert.deepEqual(toMath({ x: 210, y: 157.5 }, view, size), { x: 0, y: 0 });
  const p = toMath(toPx({ x: 2.5, y: -1.25 }, view, size), view, size);
  assert.ok(Math.abs(p.x - 2.5) < 1e-9 && Math.abs(p.y + 1.25) < 1e-9);
  assert.deepEqual(pxPerUnit(view, size), { x: 42, y: 39.375 });
  assert.deepEqual(pointOfLatex("(1.5,-2)"), { x: 1.5, y: -2 });
  assert.equal(pointOfLatex("y=2x"), null);
});

test("a highlight dabs the point, or the words set beside it", () => {
  const point = markerBox({ x: 0, y: 0, label: "vertex", kind: "point" }, view, size);
  assert.deepEqual(point, { x: 194, y: 144.5, w: 32, h: 26 });
  const right = markerBox({ x: 0, y: 0, label: "rise 4", kind: "label", orientation: "right" }, view, size);
  assert.ok(right.x >= 210 && right.y < 157.5 && right.y + right.h > 157.5, JSON.stringify(right));
  // It covers where Desmos drew "rise 4" (37 × 17 at 342, 121 beside a point at 336, 130).
  const slope = { left: -1, right: 4, bottom: -1.6833333333333333, top: 9.683333333333334 };
  const rise = markerBox({ x: 3, y: 5, label: "rise 4", kind: "label", orientation: "right" }, slope, size);
  assert.ok(rise.x <= 342 && rise.x + rise.w >= 379 && rise.y <= 121 && rise.y + rise.h >= 138, JSON.stringify(rise));
  const run = markerBox({ x: 2, y: 3, label: "run 2", kind: "label", orientation: "below" }, slope, size);
  assert.ok(run.x <= 235 && run.x + run.w >= 270 && run.y <= 190 && run.y + run.h >= 207, JSON.stringify(run));
  const below = markerBox({ x: 0, y: 0, label: "run 2", kind: "label", orientation: "below" }, view, size);
  assert.ok(below.y >= 157.5 && below.x < 210 && below.x + below.w > 210, JSON.stringify(below));
  const above = markerBox({ x: 0, y: 0, label: "run 2", kind: "label", orientation: "above" }, view, size);
  assert.ok(above.y + above.h <= 157.5, JSON.stringify(above));
  // Near an edge the dab stays inside the picture.
  const edge = markerBox({ x: 5, y: 4, label: "a long label here", kind: "label", orientation: "right" }, view, size);
  assert.ok(edge.x >= 0 && edge.x + edge.w <= size.w && edge.y >= 0, JSON.stringify(edge));
});

test("every render can take fresh ids without touching the spec", () => {
  const items: GraphItem[] = [
    { id: "curve1", latex: "y=x" },
    { type: "table", id: "data", columns: [{ latex: "x_1", values: ["1"] }] },
  ];
  const out = prefixIds(items, "g7_");
  assert.deepEqual(out.map((i) => i.id), ["g7_curve1", "g7_data"]);
  assert.equal(items[0].id, "curve1");
});

test("a built spec survives the trip through the shape's JSON", () => {
  const { spec } = buildFunctionGraph({
    expression: "2x-1",
    second: "-x+5",
    xMin: -2,
    xMax: 6,
    slopeRun: { x1: 1, x2: 3 },
    markPoints: [{ x: 0, y: -1, label: "y-intercept" }],
    colors: ["#4465e9", "#ae3ec9", "#099268"],
    box: size,
  });
  assert.deepEqual(parseGraphSpec(JSON.stringify(spec)), spec);
  const points = buildPointsGraph({ points: [{ x: 1, y: 1, label: "A" }], connect: false, xMin: -1, xMax: 6, yMin: -1, yMax: 5, colors: ["#4465e9"], box: size });
  assert.deepEqual(parseGraphSpec(JSON.stringify(points)), points);
  const axes = buildAxesGraph({ xMin: -5, xMax: 5, yMin: -4, yMax: 4, box: size });
  assert.deepEqual(parseGraphSpec(axes), axes);
  assert.equal(findMarker(spec, (label) => label.includes("rise"))?.kind, "label");
  assert.match(graphSpecText(spec), /\(2, 3\) · y-intercept · run 2 · rise 4/);
});

test("version 1 specs are upgraded, and broken ones refused", () => {
  // A slope graph as the Sept 15 builder saved it.
  const v1 = {
    bounds: { left: -1.2, right: 4.2, bottom: -0.5, top: 9.5 },
    expressions: [
      { id: "curve1", latex: "y=2\\cdot x+1", color: "#4465e9", lineWidth: 3 },
      { id: "run", latex: "y=3\\left\\{1\\le x\\le 3\\right\\}", color: "#ae3ec9", lineStyle: "DASHED", lineWidth: 2.5 },
      { id: "runLabel", latex: "(2,3)", color: "#ae3ec9", pointSize: 0.01, label: "run 2", showLabel: true, labelOrientation: "below" },
      { id: "riseLabel", latex: "(3,5)", color: "#ae3ec9", pointSize: 0.01, label: "rise 4", showLabel: true, labelOrientation: "right" },
      { id: "point1", latex: "(0,1)", color: "#121215", pointSize: 10, label: "y-intercept", showLabel: true },
    ],
    markers: [{ x: 0, y: 1, label: "y-intercept" }],
  };
  const up = parseGraphSpec(JSON.stringify(v1), { w: 480, h: 360 });
  assert.ok(up);
  assert.equal(up.v, 2);
  assert.equal(up.kind, "function");
  assert.deepEqual(up.size, { w: 480, h: 360 });
  assert.ok(up.settings.xAxisStep > 0 && up.settings.yAxisStep > 0);
  assert.deepEqual(up.markers.find((m) => m.label === "rise 4"), { x: 3, y: 5, label: "rise 4", kind: "label", orientation: "right" });
  assert.equal(up.markers.find((m) => m.label === "y-intercept")?.kind, "point");
  assert.equal(up.source?.kind, "function");
  assert.equal(up.source?.kind === "function" && up.source.expression, "2\\cdot x+1");

  const joined = parseGraphSpec({
    bounds: { left: -1, right: 6, bottom: -1, top: 5 },
    expressions: [
      { id: "shape", latex: "\\operatorname{polygon}((1,1),(4,1),(4,3))" },
      { id: "point1", latex: "(1,1)", label: "A", showLabel: true },
    ],
    markers: [{ x: 1, y: 1, label: "A" }],
  });
  assert.equal(joined?.kind, "points");
  assert.deepEqual(joined?.source, { kind: "points", points: [{ x: 1, y: 1, label: "A" }], connect: true, xMin: -1, xMax: 6, yMin: -1, yMax: 5 });

  const empty = parseGraphSpec({ bounds: { left: -5, right: 5, bottom: -5, top: 5 }, expressions: [], markers: [] });
  assert.equal(empty?.kind, "axes");
  assert.equal(empty?.source?.kind, "axes");

  assert.equal(parseGraphSpec(""), null);
  assert.equal(parseGraphSpec("{not json"), null);
  assert.equal(parseGraphSpec({ bounds: { left: 1, right: 0, bottom: 0, top: 1 }, expressions: [] }), null);
  assert.equal(parseGraphSpec({ expressions: [] }), null);
});

test("saved settings are read strictly", () => {
  const spec = parseGraphSpec({
    v: 2,
    kind: "nonsense",
    size: { w: -1, h: 10 },
    bounds: view,
    settings: { showGrid: false, xAxisArrowMode: "SIDEWAYS", yAxisStep: "2", xAxisStep: Number.NaN, xAxisLabel: "time (s)" },
    expressions: [{ id: "a", latex: "y=x" }, { id: 3, latex: "y=2" }, { latex: "no id" }],
    markers: [{ x: 1, y: 2, label: "P" }, { x: "1", y: 2 }],
  });
  assert.ok(spec);
  assert.equal(spec.kind, "free");
  assert.deepEqual(spec.size, DEFAULT_GRAPH_SIZE);
  assert.equal(spec.settings.showGrid, false);
  assert.equal(spec.settings.xAxisArrowMode, DEFAULT_GRAPH_SETTINGS.xAxisArrowMode);
  assert.equal(spec.settings.yAxisStep, 0);
  assert.equal(spec.settings.xAxisStep, 0);
  assert.equal(spec.settings.xAxisLabel, "time (s)");
  assert.equal(spec.expressions.length, 1);
  assert.equal(spec.markers.length, 1);
});
