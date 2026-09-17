import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arrowhead,
  boundsAround,
  frameOf,
  hop,
  labelSizePx,
  num,
  orientationFor,
  plainLabel,
  polyline,
  tickText,
} from "./desmos-primitives";

test("numbers are written the way Desmos reads them", () => {
  assert.equal(num(-0), "0");
  assert.equal(num(1e-9), "0");
  assert.equal(num(2.5000001), "2.5");
  assert.equal(num(1e21), "1000000000000000000000");
  assert.ok(!/e/.test(num(123456789012345678901234)));
});

test("a view with margins keeps units equal when asked", () => {
  const size = { w: 400, h: 300 };
  const b = boundsAround({ left: 0, right: 6, bottom: 0, top: 8 }, size, { top: 50, right: 50, bottom: 50, left: 50 }, true);
  const f = frameOf(b, size);
  assert.ok(Math.abs(f.ux - f.uy) < 1e-12, JSON.stringify(f));
  // The box itself is inside, with at least the margins around it.
  assert.ok(b.left <= -50 * f.ux + 1e-9 && b.bottom <= -50 * f.uy + 1e-9 && b.top >= 8 + 50 * f.uy - 1e-9);
});

test("labels: fractions stack, sizes and orientations are known", () => {
  assert.equal(tickText("3/4"), "`\\frac{3}{4}`");
  assert.equal(tickText("-1/2"), "`-\\frac{1}{2}`");
  assert.equal(tickText("0.25"), "0.25");
  assert.equal(plainLabel(tickText("-1/2")), "-1/2");
  assert.ok(labelSizePx(tickText("3/4")).h > labelSizePx("3").h);
  assert.equal(orientationFor(0), "right");
  assert.equal(orientationFor(Math.PI / 2), "above");
  assert.equal(orientationFor(-Math.PI / 2), "below");
  assert.equal(orientationFor((3 * Math.PI) / 4), "above_left");
  assert.equal(orientationFor(-Math.PI / 4), "below_right");
});

test("pieces: a polyline is a joined point list, arrowheads are pixel-true", () => {
  const line = polyline("l", [{ x: 0, y: 0 }, { x: 1, y: 2 }], { color: "#000" });
  assert.equal(line.latex, "[(0,0),(1,2)]");
  assert.equal(line.lines, true);
  assert.equal(line.points, false);
  // 10 units across 100px, 1 unit up per px: an 11px arrowhead is 1.1 units long.
  const frame = frameOf({ left: 0, right: 10, bottom: 0, top: 100 }, { w: 100, h: 100 });
  const head = arrowhead("h", { x: 5, y: 50 }, 0, frame, { color: "#000" });
  const corners = [...head.latex.matchAll(/\((-?[\d.]+),(-?[\d.]+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(corners[0], [5, 50]);
  assert.ok(Math.abs(corners[1][0] - 3.9) < 1e-6 && Math.abs(corners[1][1] - 55.5) < 1e-6, JSON.stringify(corners));
  const arch = hop("j", 0, 3, 0, 30, frame, "#000");
  assert.equal(arch.parts.length, 2);
  assert.deepEqual(arch.top, { x: 1.5, y: 30 });
  assert.match(arch.parts[0].latex, /\\sin\(\\pi t\)/);
});
