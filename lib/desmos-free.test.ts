import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFreeGraph,
  classifyDesmosLatex,
  itemLetters,
  parseFreeSettings,
  parseSliders,
  parseTable,
  type FreeInput,
} from "./desmos-free";
import { isGraphTable, type GraphExpression } from "./desmos-spec";

const box = { w: 420, h: 315 };
const build = (over: Partial<FreeInput>) => buildFreeGraph({ colors: ["#111111", "#222222", "#333333"], box, ...over });

test("items are told apart without forcing y =", () => {
  const cases: Array<[string, string]> = [
    ["y=2x+1", "relation"],
    ["x^{2}+y^{2}\\le 9", "relation"],
    ["f(x)=x^{2}", "relation"],
    ["x^{2}-4", "expression"],
    ["(1,2)", "points"],
    ["[(1,2),(3,4)]", "points"],
    ["\\operatorname{polygon}((0,0),(4,0),(4,3))", "polygon"],
    ["(\\cos t,\\sin t)", "parametric"],
    ["a=3", "assignment"],
    ["L=[1,2,3]", "assignment"],
    ["y_{1}\\sim mx_{1}+b", "regression"],
    ["\\operatorname{histogram}([1,2,2],1)", "stats"],
  ];
  for (const [latex, kind] of cases) assert.equal(classifyDesmosLatex(latex), kind, latex);
});

test("the letters an item needs values for", () => {
  assert.deepEqual(itemLetters("y=mx+b").sort(), ["b", "m"]);
  assert.deepEqual(itemLetters("y=\\sin\\left(x\\right)+e^{x}"), []);
  assert.deepEqual(itemLetters("y_{1}\\sim mx_{1}+b").sort(), ["b", "m", "x1", "y1"]);
  assert.deepEqual(itemLetters("r=2\\cos(\\theta)"), []);
  assert.deepEqual(itemLetters("y=\\operatorname{floor}(x)"), []);
});

test("sliders, tables and settings are read strictly", () => {
  assert.deepEqual(parseSliders("m=1:-5..5; b=0; k=2:0..10:0.5"), [
    { name: "m", value: 1, min: -5, max: 5 },
    { name: "b", value: 0, min: -10, max: 10 },
    { name: "k", value: 2, min: 0, max: 10, step: 0.5 },
  ]);
  assert.ok("error" in (parseSliders("x=1") as object));
  assert.ok("error" in (parseSliders("m=1:5..-5") as object));
  assert.deepEqual(parseTable("hours | dollars; 1 | 2.1; 2 | 3.9"), { headers: ["hours", "dollars"], rows: [[1, 2.1], [2, 3.9]] });
  assert.ok("error" in (parseTable("x | y; 1 | two") as object));
  assert.deepEqual(parseFreeSettings("no grid | square | x step=2 | y label=distance (m)"), {
    settings: { showGrid: false, xAxisStep: 2, yAxisLabel: "distance (m)" },
    square: true,
  });
  assert.match((parseFreeSettings("blue") as { error: string }).error, /Unknown setting "blue"/);
});

test("letters with no value become sliders, and the result says so", () => {
  const g = build({ expressions: "y=a(x-h)^2+k" });
  assert.ok(!("error" in g));
  assert.deepEqual(g.spec.sliders?.map((s) => [s.name, s.value]), [["a", 1], ["h", 1], ["k", 1]]);
  assert.ok(g.described.some((d) => /a, h, k had no value/.test(d)));
  const items = g.spec.expressions.filter((e): e is GraphExpression => !isGraphTable(e));
  assert.ok(items.some((e) => e.id === "slider_a" && e.latex === "a=1" && e.sliderBounds?.min === "-10"));
  assert.ok(g.spec.markers.some((m) => m.label === "a = 1,  h = 1,  k = 1"));
  // The vector version gets the values filled in.
  assert.ok(g.spec.source?.kind === "free");
  assert.match(g.spec.source.expressions[0], /\(1\)\(x-\(1\)\)\^\{2\}\+\(1\)/);
});

test("the view: Desmos's own, the asked x range, or the data", () => {
  const plain = build({ expressions: "y=\\frac{1}{2}x-3" });
  assert.ok(!("error" in plain));
  assert.deepEqual(plain.spec.bounds, { left: -10, right: 10, bottom: -7.5, top: 7.5 });
  const far = build({ expressions: "y=x^2+100" });
  assert.ok(!("error" in far) && far.spec.bounds.bottom > 50, "a curve out of the default view is fitted");
  const ranged = build({ expressions: "y=2^x; y=2x+1", xMin: -1, xMax: 5 });
  assert.ok(!("error" in ranged) && ranged.spec.bounds.top > 20);
  const circle = build({ expressions: "x^2+y^2=9", settings: "square" });
  assert.ok(!("error" in circle));
  const b = circle.spec.bounds;
  assert.ok(b.right < 6 && b.right >= 3 && b.top >= 3, JSON.stringify(b));
});

test("tables fit, points label, and bad items are refused with a fix", () => {
  const fit = build({ table: "x | y; 1 | 3; 2 | 5; 3 | 7", expressions: "y~mx+b" });
  assert.ok(!("error" in fit));
  assert.ok(fit.spec.expressions.some((e) => isGraphTable(e)));
  const reg = fit.spec.expressions.find((e): e is GraphExpression => !isGraphTable(e) && e.id === "item1");
  assert.equal(reg?.latex, "y_{1}\\sim mx_{1}+b");
  assert.ok(fit.described.some((d) => /m = 2, b = 1 \(r = 1\)/.test(d)));
  assert.ok(!fit.spec.sliders, "regression parameters are not sliders");

  const pts = build({ points: "(0,0):A, (4,3):B", expressions: "polygon((0,0),(4,0),(4,3))" });
  assert.ok(!("error" in pts));
  assert.deepEqual(pts.spec.markers.map((m) => m.label), ["A", "B"]);

  assert.match((build({ expressions: "y~mx+b" }) as { error: string }).error, /add a table/);
  assert.match((build({ expressions: "y=\\frac{1}{x" }) as { error: string }).error, /never closed/);
  assert.match((build({ expressions: "3+4" }) as { error: string }).error, /nothing to draw/);
  assert.match((build({}) as { error: string }).error, /something to draw/);
  assert.match((build({ expressions: "y=x", xMin: 5, xMax: 1 }) as { error: string }).error, /x_max/);
  assert.match((build({ expressions: Array.from({ length: 9 }, (_, i) => `y=${i}x`).join(";") }) as { error: string }).error, /At most 8/);
});
