import { test } from "node:test";
import assert from "node:assert/strict";
import { geometryFacts, polygon, polygonArea, rectangle, renderGeometry, rightTriangle, segmentLength, type GeometrySpec } from "./board-geometry";

// Oct 26 2026, session o8rpq1 (T02): the 12 by 5 triangle inside its rectangle.
test("the worksheet's triangle is drawn from its own dimensions, with the diagonal", () => {
  const g = rightTriangle(12, 5, { unit: "cm", inRectangle: true }) as GeometrySpec;
  const diag = g.segments.find((s) => s.id === "diagonal")!;
  assert.deepEqual([diag.from, diag.to], ["A", "C"]);
  assert.deepEqual(g.points.find((p) => p.id === "C"), { id: "C", x: 12, y: 5 });
  assert.equal(segmentLength(g, diag), 13);
  assert.equal(polygonArea(g, g.polygons[0]), 30);
  assert.ok(geometryFacts(g).includes("diagonal AC 13 cm, from bottom left to top right"));
  assert.ok(geometryFacts(g).includes("triangle ABC area 30 cm² (shaded sky)"));
  const out = renderGeometry(g);
  for (const id of ["diagonal", "triangle", "base", "height", "base.label", "A", "C"]) assert.ok(out.parts[id], id);
  // Drawn to scale: 12 across is 2.4 times 5 up.
  const base = out.parts.base, height = out.parts.height;
  assert.ok(Math.abs((base.w - 10) / (height.h - 10) - 12 / 5) < 0.05, `${base.w} ${height.h}`);
  assert.equal(out.aliases["12cm"], "base");
  assert.equal(out.aliases.ac, "diagonal");
});

test("rectangles and polygons, and nonsense refused", () => {
  const r = rectangle(8, 3, { unit: "cm" }) as GeometrySpec;
  assert.equal(polygonArea(r, r.polygons[0]), 24);
  assert.ok("error" in (rightTriangle(0, 5) as object));
  assert.ok("error" in (polygon([[0, 0], [1, 1]]) as object));
  const p = polygon([[0, 0], [4, 0], [0, 3]], { labels: ["4", "5", "3"] }) as GeometrySpec;
  assert.equal(segmentLength(p, p.segments[1]), 5);
});
