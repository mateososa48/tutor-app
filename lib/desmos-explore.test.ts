import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAxesGraph, buildFunctionGraph, buildPointsGraph } from "./desmos-graph";
import { buildFreeGraph } from "./desmos-free";
import { buildNumberLineGraph } from "./desmos-number-line";
import {
  applyExploreSnapshot,
  describeExploreChanges,
  diffExplore,
  exploreHint,
  exploreInvite,
  exploreItems,
  fitExploreBounds,
  hasExploreControls,
  initialSnapshot,
  isExplorable,
  snapshotOf,
} from "./desmos-explore";
import { isGraphTable, type GraphExpression, type GraphSpec } from "./desmos-spec";

const box = { w: 420, h: 315 };
const free = (over: Record<string, unknown>): GraphSpec => {
  const g = buildFreeGraph({ colors: ["#111111", "#222222"], box, ...over });
  assert.ok(!("error" in g));
  return g.spec;
};
const exprs = (items: ReturnType<typeof exploreItems>) => items.filter((i): i is GraphExpression => !isGraphTable(i));
const state = (spec: GraphSpec, patch: Record<string, string>) =>
  exprs(exploreItems(spec)).map((i) => ({ id: i.id, type: "expression", latex: patch[i.id] ?? i.latex }));

test("graphs on axes can be explored; pictures built from pieces cannot", () => {
  assert.ok(isExplorable(free({ expressions: "y=mx+b" })));
  assert.ok(isExplorable(buildAxesGraph({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, box })));
  assert.ok(isExplorable(buildFunctionGraph({ expression: "x^2", xMin: -3, xMax: 3, colors: ["#111111"], box }).spec));
  assert.equal(isExplorable(buildNumberLineGraph({ min: 0, max: 5, marks: [], intervals: [], jumps: [], colors: ["#111111"] })), false);
  assert.equal(isExplorable(null), false);
});

test("the live calculator keeps scaffolding out of the list and makes points draggable", () => {
  const slope = buildFunctionGraph({ expression: "2x+1", xMin: -1, xMax: 4, slopeRun: { x1: 1, x2: 3 }, colors: ["#111111", "#222222"], box }).spec;
  const items = exprs(exploreItems(slope));
  assert.equal(items.find((i) => i.id === "curve1")?.secret, undefined);
  assert.ok(items.filter((i) => i.id !== "curve1").every((i) => i.secret), "rise, run and their labels stay on the graph, out of the list");

  const tri = buildPointsGraph({ points: [{ x: 1, y: 1, label: "A" }, { x: 4, y: 1, label: "B" }, { x: 4, y: 3, label: "C" }], connect: true, xMin: -1, xMax: 6, yMin: -1, yMax: 5, colors: ["#333333"], box });
  const live = exprs(exploreItems(tri));
  assert.deepEqual(live.map((i) => i.latex), ["P_{1}=(1,1)", "P_{2}=(4,1)", "P_{3}=(4,3)", "\\operatorname{polygon}(P_{1},P_{2},P_{3})"]);
  assert.ok(live.slice(0, 3).every((i) => i.dragMode === "XY" && i.color === "#333333"));
  assert.equal(exploreHint(tri), "points A, B, C can be dragged");

  const sliders = free({ expressions: "y=mx+b", sliders: "m=1:-5..5; b=0" });
  assert.ok(!exprs(exploreItems(sliders)).some((i) => i.id === "sliderValues"), "the fixed caption is left out");
  assert.equal(exploreHint(sliders), "sliders m, b");
});

test("what the student changed, in words", () => {
  const spec = free({ expressions: "y=mx+b", sliders: "m=1:-5..5; b=0", points: "(1,2):A" });
  const before = initialSnapshot(spec);
  assert.deepEqual(before.sliders, { m: 1, b: 0 });
  assert.deepEqual(before.points.point1, { x: 1, y: 2, label: "A" });
  const list = [...state(spec, { slider_m: "m=3", point1: "(2,5)" }), { id: "7", type: "expression", latex: "y=3x" }];
  const after = snapshotOf(list, spec);
  const changes = diffExplore(before, after);
  assert.deepEqual(changes.map((c) => c.kind), ["slider", "point", "added"]);
  assert.equal(describeExploreChanges(changes), "moved m from 1 to 3; moved A from (1, 2) to (2, 5); added y=3x");
  assert.deepEqual(diffExplore(before, snapshotOf(state(spec, {}), spec)), [], "nothing moved, nothing to say");
  // Editing and removing the tutor's line.
  const edited = snapshotOf(state(spec, { item1: "y=mx+b+1" }), spec);
  assert.match(describeExploreChanges(diffExplore(before, edited)), /^changed y=mx\+b to y=mx\+b\+1$/);
  const removed = snapshotOf(state(spec, {}).filter((e) => e.id !== "item1"), spec);
  assert.match(describeExploreChanges(diffExplore(before, removed)), /^removed y=mx\+b$/);
});

test("the board takes the student's version", () => {
  const spec = free({ expressions: "y=mx+b", sliders: "m=1:-5..5; b=0" });
  const after = snapshotOf([...state(spec, { slider_m: "m=3" }), { id: "9", type: "expression", latex: "y=-x" }], spec);
  const next = applyExploreSnapshot(spec, after);
  const items = exprs(next.expressions);
  assert.equal(items.find((i) => i.id === "slider_m")?.latex, "m=3");
  assert.equal(items.find((i) => i.id === "student1")?.latex, "y=-x");
  assert.equal(items.find((i) => i.id === "sliderValues")?.label, "m = 3,  b = 0");
  assert.ok(next.markers.some((m) => m.label === "m = 3,  b = 0") && !next.markers.some((m) => m.label === "m = 1,  b = 0"));
  assert.equal(next.sliders?.find((s) => s.name === "m")?.value, 3);
  assert.match(next.studentState?.summary ?? "", /moved m from 1 to 3; added y=-x/);
  assert.equal(applyExploreSnapshot(spec, initialSnapshot(spec)), spec, "no change, the same spec");
  // A second visit keeps the first one's line and numbers the new one after it.
  const again = applyExploreSnapshot(next, snapshotOf([...state(next, {}), { id: "12", type: "expression", latex: "y=2" }], next));
  const lines = exprs(again.expressions).filter((i) => i.id.startsWith("student"));
  assert.deepEqual(lines.map((i) => [i.id, i.latex]), [["student1", "y=-x"], ["student2", "y=2"]]);
  assert.match(again.studentState?.summary ?? "", /moved m from 1 to 3; added y=-x; added y=2$/);

  const tri = buildPointsGraph({ points: [{ x: 1, y: 1, label: "A" }, { x: 4, y: 1, label: "B" }, { x: 4, y: 3, label: "C" }], connect: true, xMin: -1, xMax: 6, yMin: -1, yMax: 5, colors: ["#333333"], box });
  const moved = applyExploreSnapshot(tri, snapshotOf(state(tri, { pt3: "P_{3}=(5,4)" }), tri));
  assert.deepEqual(moved.markers.find((m) => m.label === "C"), { x: 5, y: 4, label: "C", kind: "point" });
  const shapes = exprs(moved.expressions);
  assert.equal(shapes.find((i) => i.id === "shape")?.latex, "\\operatorname{polygon}((1,1),(4,1),(5,4))");
  assert.equal(shapes.find((i) => i.id === "point3")?.latex, "(5,4)");
});

test("the panel says what this graph lets the student do", () => {
  assert.equal(exploreInvite(free({ expressions: "y=mx+b", sliders: "m=1:-5..5; b=0" })), "Drag the m and b sliders to see what they change.");
  assert.equal(exploreInvite(free({ expressions: "y=kx", sliders: "k=2" })), "Drag the k slider to see what it changes.");
  const tri = buildPointsGraph({ points: [{ x: 1, y: 1, label: "A" }, { x: 4, y: 1, label: "B" }, { x: 4, y: 3, label: "C" }], connect: true, xMin: -1, xMax: 6, yMin: -1, yMax: 5, colors: ["#333333"], box });
  assert.equal(exploreInvite(tri), "Drag A, B and C to move them.");
  assert.equal(exploreInvite(free({ points: "(1,2)" })), "Drag the point to move it.");
  assert.equal(exploreHint(free({ points: "(1,2); (3,4)" })), "2 points can be dragged");
  const plain = buildFunctionGraph({ expression: "x^2", xMin: -3, xMax: 3, colors: ["#111111"], box }).spec;
  assert.equal(exploreInvite(plain), "Zoom in and out, or type a line of your own.");
  assert.equal(hasExploreControls(plain), false);
  assert.equal(hasExploreControls(tri), true);
});

test("the live paper keeps the board's proportions and shows the whole range", () => {
  const bounds = { left: -5, right: 5, bottom: -5, top: 5 };
  const fit = fitExploreBounds(bounds, { w: 420, h: 315 }, { w: 400, h: 400 });
  assert.ok(fit.left <= -5 && fit.right >= 5 && fit.bottom <= -5 && fit.top >= 5, "nothing the board showed is cut off");
  const pxPerUnit = (b: typeof fit, w: number, h: number) => (w / (b.right - b.left)) / (h / (b.top - b.bottom));
  assert.ok(Math.abs(pxPerUnit(fit, 400, 400) - pxPerUnit(bounds, 420, 315)) < 1e-9, "a slope looks as steep as on the board");
  const near = (a: typeof fit, b: typeof fit) => (["left", "right", "bottom", "top"] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-9);
  assert.ok(near(fit, { left: -5, right: 5, bottom: -20 / 3, top: 20 / 3 }), JSON.stringify(fit));
  // A wide paper adds room left and right, around the same centre.
  const wide = fitExploreBounds({ left: 0, right: 8, bottom: 0, top: 6 }, { w: 420, h: 315 }, { w: 840, h: 315 });
  assert.ok(near(wide, { left: -4, right: 12, bottom: 0, top: 6 }), JSON.stringify(wide));
  assert.deepEqual(fitExploreBounds(bounds, { w: 420, h: 315 }, { w: 0, h: 300 }), bounds, "no paper yet: unchanged");
});
