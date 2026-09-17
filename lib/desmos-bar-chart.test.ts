import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBarChartGraph } from "./desmos-bar-chart";
import { isGraphTable, type GraphExpression, type GraphSpec } from "./desmos-spec";

const exprs = (spec: GraphSpec): GraphExpression[] => spec.expressions.filter((e): e is GraphExpression => !isGraphTable(e));

test("bars, their values, names, own axes and the unit", () => {
  const spec = buildBarChartGraph({ categories: ["Mon", "Tue", "Wed"], values: [3, 5, 0], unit: "hours", colors: ["#111111", "#222222"] });
  const bars = exprs(spec).filter((e) => e.id.startsWith("bar"));
  assert.equal(bars.length, 2, "a zero bar draws nothing");
  assert.equal(bars[0].latex, "\\operatorname{polygon}((0.2,0),(0.8,0),(0.8,3),(0.2,3))");
  assert.deepEqual(bars.map((b) => b.color), ["#111111", "#222222"]);
  const words = exprs(spec).filter((e) => e.label).map((e) => e.label);
  for (const w of ["3", "5", "0", "Mon", "Tue", "Wed", "hours"]) assert.ok(words.includes(w), w);
  assert.equal(spec.settings.showXAxis, false);
  assert.equal(spec.settings.showYAxis, false);
  // The value axis is numbered by our own labels, up to a round top.
  assert.ok(words.includes("6") || words.includes("5"), words.join(" "));
  assert.ok(spec.size.h >= 260);
  assert.deepEqual(spec.source, { kind: "bar_chart", drawing: { categories: ["Mon", "Tue", "Wed"], values: [3, 5, 0], unit: "hours" } });
  assert.ok(spec.markers.some((m) => m.label === "Tue" && m.orientation === "below"));
});

test("negative values hang below zero with their value under them", () => {
  const spec = buildBarChartGraph({ categories: ["A", "B"], values: [4, -3], colors: ["#111111"] });
  const minus = exprs(spec).find((e) => e.id === "value1");
  assert.equal(minus?.labelOrientation, "below");
  assert.ok(spec.bounds.bottom < -3);
});

test("names that would touch take a second row", () => {
  const long = ["January", "February", "March", "April", "May", "June", "July", "August"];
  const one = buildBarChartGraph({ categories: ["A", "B", "C"], values: [1, 2, 3], colors: ["#111111"] });
  const two = buildBarChartGraph({ categories: long.map((m) => `${m} ${m}`), values: long.map((_, i) => i + 1), colors: ["#111111"] });
  assert.ok(two.size.h > one.size.h);
});
