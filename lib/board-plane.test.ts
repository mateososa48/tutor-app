import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlane, chooseView, describePlane, findPart, parseArrows, parseLine, parsePoints, renderPlane, type PlaneSpec } from "./board-plane";

test("points are read once each, with their names, from the forms the tutor writes", () => {
  assert.deepEqual(parsePoints("(0,-1): (0, -1), (1,1): (1, 1), A(2, 3)"), [{ x: 0, y: -1 }, { x: 1, y: 1 }, { x: 2, y: 3, name: "A" }]);
  assert.deepEqual(parsePoints("through (0, −1) and (2, 3)"), [{ x: 0, y: -1 }, { x: 2, y: 3 }]);
});

test("a line is y = …, x = c, or the line through two points", () => {
  assert.equal((parseLine("y = 2x - 1") as { text: string }).text, "y = 2x − 1");
  assert.deepEqual(parseLine("x = 3"), { text: "x = 3", vertical: 3 });
  assert.equal((parseLine("through (0, -1) and (2, 3)") as { text: string }).text, "y = 2x − 1");
  assert.ok("error" in (parseLine("hello") as object));
  assert.deepEqual(parseArrows("(0, -1) to (1, -1): right 1; (1, -1) to (1, 1): up 2"), [
    { from: [0, -1], to: [1, -1], label: "right 1" },
    { from: [1, -1], to: [1, 1], label: "up 2" },
  ]);
});

test("the view holds the origin and every point with room, and its units stay square", () => {
  const v = chooseView([{ x: 0, y: -1 }, { x: 1, y: 1 }, { x: 2, y: 3 }]);
  assert.ok(v.x[0] < 0 && v.x[1] > 2 && v.y[0] < -1 && v.y[1] > 3);
  const ratio = (v.y[1] - v.y[0]) / (v.x[1] - v.x[0]);
  assert.ok(ratio >= 0.7 && ratio <= 1.25, `ratio ${ratio}`);
});

// Oct 25 2026, session nbrkrj: the three points went up fitted to x 0..2, the
// line on its own graph at −10..10, and the same line looked twice as steep.
test("the line added later goes on the same plane, at the same scale, and only it is new", () => {
  const a = buildPlane(null, { points: "(0, -1); (1, 1); (2, 3)" });
  assert.ok(!("error" in a));
  const b = buildPlane(a.spec, { lines: "y = 2x - 1" });
  assert.ok(!("error" in b));
  assert.deepEqual(b.spec.x, a.spec.x);
  assert.deepEqual(b.spec.y, a.spec.y);
  assert.deepEqual([...b.fresh], ["L1"]);
  assert.equal(b.rescaled, false);
  assert.equal(b.spec.points.length, 3);
  // The same point again is not a second point.
  const c = buildPlane(b.spec, { points: "(1, 1)" });
  assert.ok(!("error" in c) && c.spec.points.length === 3 && c.fresh.size === 0);
  // A point outside widens the view.
  const d = buildPlane(b.spec, { points: "(6, 11)" });
  assert.ok(!("error" in d) && d.rescaled && d.spec.y[1] > 11);
});

test("an empty plane is a plane, and the drawing names every part", () => {
  const e = buildPlane(null, {});
  assert.ok(!("error" in e));
  assert.equal(describePlane(e.spec).startsWith("empty"), true);
  const g = buildPlane(null, { points: "(0, -1); A(1, 1)", lines: "y = 2x - 1", arrows: "(0, -1) to (1, -1): right 1" }) as { spec: PlaneSpec; fresh: Set<string> };
  const out = renderPlane(g.spec, g.fresh);
  for (const id of ["P1", "P2", "L1", "A1", "x-axis", "origin"]) assert.ok(out.parts[id], id);
  assert.equal(findPart(out.parts, out.aliases, "(1, 1)"), "P2");
  assert.equal(findPart(out.parts, out.aliases, "a"), "P2");
  assert.equal(findPart(out.parts, out.aliases, "y = 2x - 1"), "L1");
  assert.equal(findPart(out.parts, out.aliases, "right 1"), "A1");
  assert.match(out.svg, /data-fresh="1"/);
  // Square units: one unit is as tall as it is wide.
  const ux = (out.w - 20) / (g.spec.x[1] - g.spec.x[0]);
  const uy = (out.h - 20) / (g.spec.y[1] - g.spec.y[0]);
  assert.ok(Math.abs(ux - uy) < 0.5);
});
