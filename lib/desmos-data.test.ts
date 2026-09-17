import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDataPlot, exponentialFit, fiveNumbers, histogramBins, linearFit, type DataPlotInput } from "./desmos-data";

const input = (over: Partial<DataPlotInput>): DataPlotInput => ({ kind: "dot_plot", values: [], points: [], fit: "none", colors: ["#111111", "#222222"], ...over });

test("five numbers the grade-6 way", () => {
  assert.deepEqual(fiveNumbers([2, 4, 4, 5, 6, 7, 8, 9, 12]), { min: 2, q1: 4, median: 6, q3: 8.5, max: 12 });
  assert.deepEqual(fiveNumbers([1, 2, 3, 4, 5, 6]), { min: 1, q1: 2, median: 3.5, q3: 5, max: 6 });
  assert.equal(fiveNumbers([3]), null);
});

test("bins cover every value", () => {
  const bins = histogramBins([12, 15, 17, 21, 22, 22, 25, 28, 31, 33, 35, 38], 10);
  assert.deepEqual(bins, { start: 10, width: 10, counts: [3, 5, 4] });
  // A value on an edge starts the next bin; the last value stays in the last bin.
  assert.deepEqual(histogramBins([0, 10, 20], 10)?.counts, [1, 1, 1]);
  assert.equal(histogramBins([0, 1000], 1), null);
});

test("fits: a line through exact points, and an exponential", () => {
  const line = linearFit([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }]);
  assert.ok(line && Math.abs(line.m - 2) < 1e-9 && Math.abs(line.b - 1) < 1e-9 && Math.abs(line.r - 1) < 1e-9);
  const exp = exponentialFit([{ x: 0, y: 3 }, { x: 1, y: 6 }, { x: 2, y: 12 }]);
  assert.ok(exp && Math.abs(exp.a - 3) < 1e-9 && Math.abs(exp.b - 2) < 1e-9);
  assert.equal(exponentialFit([{ x: 0, y: 0 }, { x: 1, y: 2 }]), null);
  assert.equal(linearFit([{ x: 1, y: 1 }, { x: 1, y: 2 }]), null);
});

test("each plot says what it shows and keeps a vector version", () => {
  const dots = buildDataPlot(input({ values: [2, 3, 3, 4, 4, 4, 5, 7], xLabel: "goals" }));
  assert.ok(!("error" in dots));
  assert.match(dots.summary, /dot plot of 8 values \(mean 4, median 4, range 5\)/);
  assert.equal(dots.fallback?.tool, "number_line");
  assert.equal(dots.spec.source?.kind, "number_line");
  assert.ok(dots.spec.markers.some((m) => m.label === "goals"));

  const hist = buildDataPlot(input({ kind: "histogram", values: [12, 15, 17, 21, 22, 22, 25, 28, 31, 33, 35, 38], binWidth: 10 }));
  assert.ok(!("error" in hist));
  assert.match(hist.summary, /10–20: 3, 20–30: 5, 30–40: 4/);
  assert.ok(hist.spec.source?.kind === "bar_chart");
  assert.deepEqual(hist.spec.source.drawing.values, [3, 5, 4]);

  const box = buildDataPlot(input({ kind: "box_plot", values: [2, 4, 4, 5, 6, 7, 8, 9, 12] }));
  assert.ok(!("error" in box));
  assert.match(box.summary, /Q1 4, median 6, Q3 8.5, max 12 \(IQR 4.5\)/);
  assert.equal(box.spec.source, undefined, "no vector box plot: a failed drawing says so");
  assert.equal(box.fallback, null);
  assert.ok(box.spec.markers.some((m) => m.label === "median 6"));

  const scatter = buildDataPlot(input({ kind: "scatter", points: [{ x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }], fit: "linear" }));
  assert.ok(!("error" in scatter));
  assert.match(scatter.summary, /line of best fit y = 2x \+ 1 \(r = 1\)/);
  assert.equal(scatter.fallback?.tool, "function");
  assert.equal(scatter.spec.source?.kind, "function");
});

test("plots that cannot be drawn say why", () => {
  assert.match((buildDataPlot(input({ kind: "box_plot", values: [3] })) as { error: string }).error, /at least 2 values/);
  assert.match((buildDataPlot(input({ kind: "scatter", points: [{ x: 0, y: -1 }, { x: 1, y: 2 }], fit: "exponential" })) as { error: string }).error, /above 0/);
  assert.match((buildDataPlot(input({ kind: "histogram", values: [] })) as { error: string }).error, /needs values/);
});
