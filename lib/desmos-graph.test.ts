import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoYRange,
  buildAxesGraph,
  buildFunctionGraph,
  buildPointsGraph,
  curveCrossings,
  ensureRelation,
  fitBounds,
  graphFunction,
  graphLatexProblem,
  graphPointBox,
  graphSpecText,
  toDesmosLatex,
  vectorExtra,
  type GraphExpression,
  type GraphSpec,
} from "./desmos-graph";

const squash = (s: string) => s.replace(/\s+/g, "");
const box = { w: 480, h: 360 };
// The Desmos expressions of a spec (tables left out).
const exprs = (spec: GraphSpec): GraphExpression[] => spec.expressions.filter((e): e is GraphExpression => e.type !== "table");

test("plain math becomes LaTeX Desmos can read", () => {
  const cases: Array<[string, string]> = [
    ["sqrt(x)", "\\sqrt{x}"],
    ["abs(x-2)", "\\left|x-2\\right|"],
    ["|x|", "\\left|x\\right|"],
    ["sin(x)", "\\sin\\left(x\\right)"],
    ["sin x", "\\sin x"],
    ["x²", "x^{2}"],
    ["−x+5", "-x+5"],
    ["e^(-x^2)", "e^{-x^{2}}"],
    ["x^-2", "x^{-2}"],
    ["x^12", "x^{12}"],
    ["2*x+1", "2\\cdot x+1"],
    ["pi*x", "\\pi\\cdot x"],
    ["y >= 2x - 1", "y\\ge2x-1"],
    ["√x", "\\sqrt{x}"],
    ["floor(x)", "\\operatorname{floor}\\left(x\\right)"],
  ];
  for (const [input, want] of cases) assert.equal(squash(toDesmosLatex(input)), squash(want), input);
  // LaTeX that is already right passes through.
  for (const latex of ["\\frac{1}{x}", "\\sqrt{x}", "\\left|x\\right|", "y=x^{2}", "\\sin\\left(x\\right)"]) {
    assert.equal(squash(toDesmosLatex(latex)), squash(latex), latex);
  }
});

test("a bare expression is graphed as y = …", () => {
  assert.equal(ensureRelation("x^{2}-4"), "y=x^{2}-4");
  assert.equal(ensureRelation("y>2x-1"), "y>2x-1");
  assert.equal(ensureRelation("x=3"), "x=3");
  assert.equal(ensureRelation("\\left|x\\right|"), "y=\\left|x\\right|");
  assert.equal(ensureRelation("2x+1\\left\\{0<x<3\\right\\}"), "y=2x+1\\left\\{0<x<3\\right\\}");
  assert.equal(ensureRelation("(2,3)"), "(2,3)");
});

test("broken expressions are caught before they reach the board", () => {
  assert.ok(graphLatexProblem("y=\\frac{1}{x"));
  assert.equal(graphLatexProblem("y=x^{2}-4x+3"), null);
  assert.equal(graphLatexProblem("x^{2}+y^{2}=9"), null);
  assert.equal(graphLatexProblem("y\\ge 2x-1"), null);
});

test("the view keeps an asymptote from flattening the curve", () => {
  const f = graphFunction("y=\\frac{1}{x}");
  assert.ok(f);
  const range = autoYRange([f], -4, 4);
  assert.ok(range && range.top < 12 && range.bottom > -12, JSON.stringify(range));
  assert.equal(graphFunction("x^{2}+y^{2}=9"), null);
  assert.equal(graphFunction("x=3"), null);
});

test("two lines cross where they should, and an asymptote is not a crossing", () => {
  const f = graphFunction("y=2x-1");
  const g = graphFunction("y=-x+5");
  assert.ok(f && g);
  const [p] = curveCrossings(f, g, -2, 6);
  assert.ok(p && Math.abs(p.x - 2) < 1e-6 && Math.abs(p.y - 3) < 1e-6, JSON.stringify(p));
  const inverse = graphFunction("y=\\frac{1}{x}");
  const zero = graphFunction("y=0");
  assert.ok(inverse && zero);
  assert.equal(curveCrossings(inverse, zero, -4, 4).length, 0);
});

test("units are square unless the ranges are far apart", () => {
  const b = fitBounds({ left: -4, right: 4, bottom: -4, top: 4 }, 480, 360);
  assert.ok(Math.abs((b.right - b.left) / 480 - (b.top - b.bottom) / 360) < 1e-9, JSON.stringify(b));
  const tall = { left: -10, right: 10, bottom: 0, top: 1000 };
  assert.deepEqual(fitBounds(tall, 480, 360), tall);
  assert.deepEqual(graphPointBox({ x: 2, y: -1 }, { left: -2, right: 6, bottom: -2, top: 4 }, 480, 360), { x: 240, y: 300 });
});

test("a function graph carries its curves, crossing, marks and slope triangle", () => {
  const { spec, problems } = buildFunctionGraph({
    expression: "2x-1",
    second: "-x+5",
    xMin: -2,
    xMax: 6,
    markPoints: [{ x: 0, y: -1, label: "y-intercept" }],
    slopeRun: { x1: 1, x2: 3 },
    colors: ["#111111", "#222222", "#333333"],
    box,
  });
  assert.deepEqual(problems, []);
  assert.equal(exprs(spec)[0].latex, "y=2x-1");
  assert.ok(spec.markers.some((m) => m.label === "(2, 3)"), JSON.stringify(spec.markers));
  assert.ok(exprs(spec).some((e) => e.lineStyle === "DASHED" && e.latex.startsWith("y=1\\left\\{")));
  assert.ok(exprs(spec).some((e) => e.label === "rise 4"));
  // Slope labels ride on near-zero dots, never on invisible ones (that hides the text).
  const slopeLabels = exprs(spec).filter((e) => e.label === "rise 4" || e.label === "run 2");
  assert.equal(slopeLabels.length, 2);
  assert.ok(slopeLabels.every((e) => e.pointOpacity === undefined && (e.pointSize ?? 1) < 0.1));
  assert.ok(spec.bounds.bottom <= -1 && spec.bounds.top >= 5, JSON.stringify(spec.bounds));
  assert.match(graphSpecText(spec), /y-intercept/);
  const broken = buildFunctionGraph({ expression: "\\frac{1}{x", xMin: -2, xMax: 2, colors: ["#111111"], box });
  assert.equal(broken.problems.length, 1);
});

test("joined points become a polygon, and empty axes are just a view", () => {
  const spec = buildPointsGraph({ points: [{ x: 1, y: 1, label: "A" }, { x: 4, y: 1 }, { x: 4, y: 3 }], connect: true, xMin: -1, xMax: 6, yMin: -1, yMax: 5, colors: ["#4465e9"], box });
  assert.ok(exprs(spec)[0].latex.startsWith("\\operatorname{polygon}((1,1),(4,1),(4,3))"), exprs(spec)[0].latex);
  assert.equal(spec.markers[0].label, "A");
  const axes = buildAxesGraph({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, box });
  assert.equal(axes.expressions.length, 0);
});

test("lines keep the x range asked for; a circle gets square units from it", () => {
  const lines = buildFunctionGraph({ expression: "2x-1", second: "-x+5", xMin: -2, xMax: 6, colors: ["#111111"], box });
  assert.equal(lines.spec.bounds.left, -2);
  assert.equal(lines.spec.bounds.right, 6);
  const circle = buildFunctionGraph({ expression: "2x-1", extras: ["x^2+y^2=9"], xMin: -5, xMax: 5, colors: ["#111111"], box });
  const b = circle.spec.bounds;
  assert.ok(Math.abs((b.right - b.left) / box.w - (b.top - b.bottom) / box.h) < 1e-9, JSON.stringify(b));
  assert.ok(b.right - b.left <= 10.0001 && b.top >= 3 && b.bottom <= -3, JSON.stringify(b));
});

test("built specs are version 2 with their size, numbered axes and source", () => {
  const { spec } = buildFunctionGraph({ expression: "2x-1", xMin: -2, xMax: 6, yMin: -3, slopeRun: { x1: 1, x2: 3 }, colors: ["#111111", "#222222"], box });
  assert.equal(spec.v, 2);
  assert.equal(spec.kind, "function");
  assert.deepEqual(spec.size, box);
  assert.ok(spec.settings.xAxisStep > 0 && spec.settings.yAxisStep > 0, JSON.stringify(spec.settings));
  assert.equal(spec.settings.showGrid, true);
  // Rise and run are markers the tutor can highlight, placed where Desmos sets them.
  assert.deepEqual(
    spec.markers.filter((m) => m.kind === "label").map((m) => [m.label, m.orientation]),
    [["run 2", "below"], ["rise 4", "right"]],
  );
  // The vector renderer can redraw it from what was asked.
  assert.deepEqual(spec.source, { kind: "function", expression: "2x-1", xMin: -2, xMax: 6, extras: { markPoints: [], slopeRun: { x1: 1, x2: 3 }, yMin: -3 } });
  // Label markers get no dot of their own.
  assert.equal(exprs(spec).filter((e) => /^point\d+$/.test(e.id)).length, 2);
  const points = buildPointsGraph({ points: [{ x: 1, y: 2, label: "A" }], connect: false, xMin: 0, xMax: 4, yMin: 0, yMax: 4, colors: ["#4465e9"], box });
  assert.equal(points.kind, "points");
  assert.deepEqual(points.source, { kind: "points", points: [{ x: 1, y: 2, label: "A" }], connect: false, xMin: 0, xMax: 4, yMin: 0, yMax: 4 });
  const axes = buildAxesGraph({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, box });
  assert.equal(axes.kind, "axes");
  assert.deepEqual(axes.source, { kind: "axes", xMin: -5, xMax: 5, yMin: -5, yMax: 5 });
});

test("without Desmos, extra lines are read into what vectors can draw", () => {
  const above = vectorExtra("y>2x-1");
  assert.ok(above?.line?.kind === "curve");
  assert.equal(above.line.fn(2), 3);
  assert.equal(above.dashed, true);
  assert.equal(above.shade, "above");
  const below = vectorExtra("y \\le -x + 5");
  assert.equal(below?.shade, "below");
  assert.equal(below?.dashed, false);
  // Linear in y, written the other way round.
  const standard = vectorExtra("2x+3y<6");
  assert.ok(standard?.line?.kind === "curve");
  assert.ok(Math.abs(standard.line.fn(0) - 2) < 1e-9);
  assert.equal(standard.shade, "below");
  const flipped = vectorExtra("2x-1<y");
  assert.equal(flipped?.shade, "above");
  // Vertical lines, whole or as a segment.
  assert.deepEqual(vectorExtra("x=3"), { line: { kind: "vertical", x: 3, from: null, to: null }, dashed: false, shade: null });
  assert.equal(vectorExtra("x>=-1")?.shade, "right");
  assert.deepEqual(vectorExtra("x=3\\left\\{0\\le y\\le 4\\right\\}")?.line, { kind: "vertical", x: 3, from: 0, to: 4 });
  // Circles, expanded or not.
  const circle = vectorExtra("x^2+y^2=9");
  assert.deepEqual(circle, { line: { kind: "circle", cx: 0, cy: 0, r: 3 }, dashed: false, shade: null });
  const shifted = vectorExtra("(x-1)^2+(y+2)^2<4");
  assert.ok(shifted?.line?.kind === "circle");
  assert.ok(Math.abs(shifted.line.cx - 1) < 1e-9 && Math.abs(shifted.line.cy + 2) < 1e-9 && Math.abs(shifted.line.r - 2) < 1e-9);
  assert.equal(shifted.shade, "inside");
  assert.equal(vectorExtra("x^2+y^2>=1")?.shade, "outside");
  // A restricted piece keeps its range; anything else is left out.
  const piece = vectorExtra("2x+1\\left\\{0<x<3\\right\\}");
  assert.ok(piece?.line?.kind === "curve" && piece.line.from === 0 && piece.line.to === 3);
  assert.equal(piece.shade, null);
  assert.equal(vectorExtra("x^2+2y^2=4"), null);
  assert.equal(vectorExtra("1<x<3"), null);
  assert.equal(vectorExtra("\\sin(xy)=0.5"), null);
});
