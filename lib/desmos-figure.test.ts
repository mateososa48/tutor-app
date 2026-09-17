import { test } from "node:test";
import assert from "node:assert/strict";
import type { FigureDrawing } from "./board-diagrams";
import { angleMismatch, buildFigureGraph, figureModel, labelLength } from "./desmos-figure";
import { isGraphTable, type GraphExpression } from "./desmos-spec";

const draw = (over: Partial<FigureDrawing>): FigureDrawing => ({
  figure: "triangle",
  sideLabels: [],
  vertexLabels: [],
  angleLabels: [],
  markRightAngle: false,
  ...over,
});
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("the length a label gives", () => {
  assert.equal(labelLength("6"), 6);
  assert.equal(labelLength("6 cm"), 6);
  assert.equal(labelLength("r = 5 cm"), 5);
  assert.equal(labelLength("2.5 in"), 2.5);
  assert.equal(labelLength("1 1/2 ft"), 1.5);
  for (const t of ["x", "?", "2x", "", "h", "x + 1"]) assert.equal(labelLength(t), null, t);
});

test("a right triangle from any two sides, and a warning when three disagree", () => {
  const legs = figureModel(draw({ figure: "right_triangle", sideLabels: ["6", "8", "x"] }));
  assert.deepEqual(legs.vertices, [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 8 }]);
  assert.equal(legs.toScale, true);
  const legHyp = figureModel(draw({ figure: "right_triangle", sideLabels: ["6", "", "10"] }));
  assert.ok(legHyp.toScale && near(legHyp.vertices[2].y, 8));
  const bad = figureModel(draw({ figure: "right_triangle", sideLabels: ["6", "8", "11"] }));
  assert.match(bad.warning ?? "", /6² \+ 8² is not 11²/);
  const none = figureModel(draw({ figure: "right_triangle", sideLabels: ["a", "b", "c"] }));
  assert.equal(none.toScale, false);
});

test("triangles from three sides, or base and height; impossible sides are named", () => {
  const sss = figureModel(draw({ sideLabels: ["7", "5", "6"] }));
  const [a, b, c] = sss.vertices;
  assert.ok(near(Math.hypot(c.x - a.x, c.y - a.y), 6) && near(Math.hypot(c.x - b.x, c.y - b.y), 5) && near(b.x, 7));
  const bh = figureModel(draw({ sideLabels: ["8 cm"], heightLabel: "h = 5 cm" }));
  assert.ok(bh.toScale && near(bh.vertices[2].y, 5));
  const impossible = figureModel(draw({ sideLabels: ["10", "2", "3"] }));
  assert.equal(impossible.toScale, false);
  assert.match(impossible.warning ?? "", /cannot make a triangle/);
});

test("quadrilaterals, polygons and circles", () => {
  const rect = figureModel(draw({ figure: "rectangle", sideLabels: ["12 m", "5 m"] }));
  assert.deepEqual(rect.vertices[2], { x: 12, y: 5 });
  assert.equal(rect.toScale, true);
  const trap = figureModel(draw({ figure: "trapezoid", sideLabels: ["10", "", "6"], heightLabel: "h = 4" }));
  assert.ok(trap.toScale);
  assert.ok(near(trap.vertices[2].x - trap.vertices[3].x, 6) && near(trap.vertices[2].y, 4));
  const iso = figureModel(draw({ figure: "trapezoid", sideLabels: ["10", "5", "4"] }));
  assert.ok(iso.toScale && near(iso.vertices[2].y, 4), JSON.stringify(iso.vertices));
  const para = figureModel(draw({ figure: "parallelogram", sideLabels: ["8", "5"], heightLabel: "h = 4" }));
  assert.ok(para.toScale);
  const side = para.vertices[2];
  const foot = para.vertices[1];
  assert.ok(near(Math.hypot(side.x - foot.x, side.y - foot.y), 5));
  const hex = figureModel(draw({ figure: "hexagon", sideLabels: ["3 cm"] }));
  const [p, q] = hex.vertices;
  assert.ok(near(Math.hypot(q.x - p.x, q.y - p.y), 3) && near(p.y, q.y), "a flat bottom edge of 3");
  const circle = figureModel(draw({ figure: "circle", diameterLabel: "d = 10 cm" }));
  assert.equal(circle.circle?.r, 5);
  assert.equal(figureModel(draw({ figure: "circle" })).toScale, false);
});

test("the picture: equal units, labels outside the edges, a right-angle mark", () => {
  const { spec, model } = buildFigureGraph({ ...draw({ figure: "right_triangle", sideLabels: ["6", "8", "x"], vertexLabels: ["A", "B", "C"], markRightAngle: true }), colors: ["#111111", "#222222", "#333333", "#444444"] });
  assert.ok(model.toScale);
  const ux = (spec.bounds.right - spec.bounds.left) / spec.size.w;
  const uy = (spec.bounds.top - spec.bounds.bottom) / spec.size.h;
  assert.ok(Math.abs(ux - uy) < 1e-9);
  const items = spec.expressions.filter((e): e is GraphExpression => !isGraphTable(e));
  const side = (text: string) => items.find((e) => e.label === text);
  assert.equal(side("6")?.labelOrientation, "below");
  assert.equal(side("8")?.labelOrientation, "left");
  assert.equal(side("x")?.labelOrientation, "above_right");
  assert.ok(items.some((e) => e.id === "rightAngle" && e.lines));
  assert.equal(spec.settings.showGrid, false);
  assert.deepEqual(spec.markers.filter((m) => m.kind === "point").map((m) => m.label), ["A", "B", "C"]);
  const grid = buildFigureGraph({ ...draw({ figure: "rectangle", sideLabels: ["4", "3"] }), colors: ["#111111"], grid: true });
  assert.equal(grid.spec.settings.showGrid, true);
  assert.equal(grid.spec.settings.xAxisStep, 1);
  assert.ok(grid.spec.source?.kind === "figure");
});

test("angle labels that the sides contradict are named", () => {
  // Sides 7, 5, 6: the corners are about 44°, 57° and 78°.
  const wrong = figureModel(draw({ sideLabels: ["7", "5", "6"], angleLabels: ["?", "44°", "78°"], vertexLabels: ["A", "B", "C"] }));
  assert.equal(wrong.warning, "with these sides the angle at B is 57°, not 44°");
  const right = figureModel(draw({ sideLabels: ["7", "5", "6"], angleLabels: ["44°", "57°", "78°"], vertexLabels: ["A", "B", "C"] }));
  assert.equal(right.warning, undefined, "rounded labels pass");
  // Legs 6 and 8: 90° at the right angle, 53° and 37° at the others.
  const rt = figureModel(draw({ figure: "right_triangle", sideLabels: ["6", "8", "x"], angleLabels: ["90°", "37°", "53°"] }));
  assert.equal(rt.warning, "with these sides the angle at bottom right is 53°, not 37°, and the angle at top is 37°, not 53°");
  assert.equal(figureModel(draw({ figure: "right_triangle", sideLabels: ["6", "8", "x"], angleLabels: ["90", "53.13", "x"] })).warning, undefined);
  // Base and height leave the angles open, so they are not checked.
  assert.equal(figureModel(draw({ sideLabels: ["8"], heightLabel: "h = 5", angleLabels: ["10°", "", ""] })).warning, undefined);
  // Sides that cannot make the shape are reported once, without guessing angles.
  assert.doesNotMatch(figureModel(draw({ figure: "right_triangle", sideLabels: ["6", "8", "11"], angleLabels: ["90°", "5°", ""] })).warning ?? "", /the angle at/);
  assert.equal(angleMismatch([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], ["x", "", "45 degrees"], []), undefined);
});
