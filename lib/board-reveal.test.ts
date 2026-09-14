import { test } from "node:test";
import assert from "node:assert/strict";
import { planReveal, pointsShown, polylineLength, stepDuration, typedPrefix, REVEAL_CAP_MS } from "./board-reveal";

test("reveal order is rows top to bottom, left to right within a row", () => {
  const steps = planReveal([
    { id: "c", kind: "text", x: 300, y: 100, chars: 10 },
    { id: "a", kind: "box", x: 0, y: 4 },
    { id: "b", kind: "text", x: 200, y: 8, chars: 5 },
    { id: "d", kind: "stroke", x: 0, y: 100, length: 100 },
  ]);
  assert.deepEqual(steps.map((s) => s.id), ["a", "b", "d", "c"]);
});

test("a busy call is squeezed under the cap", () => {
  const inputs = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, kind: "text" as const, x: 0, y: i * 40, chars: 60 }));
  const steps = planReveal(inputs);
  const total = steps.reduce((s, x) => s + x.duration, 0);
  assert.ok(total <= REVEAL_CAP_MS, `total ${total}`);
  assert.ok(steps.every((s) => s.duration >= 30));
});

test("durations scale with content and stay bounded", () => {
  assert.equal(stepDuration({ id: "x", kind: "text", x: 0, y: 0, chars: 0 }), 90);
  assert.equal(stepDuration({ id: "x", kind: "text", x: 0, y: 0, chars: 1000 }), 1600);
  assert.equal(stepDuration({ id: "x", kind: "stroke", x: 0, y: 0, length: 100 }), 290);
  assert.equal(stepDuration({ id: "x", kind: "box", x: 0, y: 0 }), 170);
});

test("typing and stroke progress helpers", () => {
  assert.equal(typedPrefix("hello world", 0), "");
  assert.equal(typedPrefix("hello world", 1), "hello world");
  assert.equal(typedPrefix("hello world", 0.5), "hello");
  assert.equal(pointsShown(10, 0), 2);
  assert.equal(pointsShown(10, 0.5), 5);
  assert.equal(pointsShown(10, 1), 10);
  assert.equal(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 0 }]), 9);
});
