import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFETTI_COLORS, makeConfetti } from "./confetti";

function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

test("a burst is short and small: under a second, a couple of dozen pieces", () => {
  const pieces = makeConfetti({}, seeded());
  assert.equal(pieces.length, 26);
  for (const p of pieces) assert.ok(p.duration < 1);
});

test("every piece starts on the check, flies up, and is gone at the end", () => {
  for (const p of makeConfetti({}, seeded(3))) {
    assert.match(p.transform[0], /^translate\(0\.0px, 0\.0px\)/);
    assert.equal(p.opacity[p.opacity.length - 1], 0);
    const peak = Math.min(...p.transform.map((t) => Number(/translate\([^,]+, (-?[\d.]+)px/.exec(t)![1])));
    assert.ok(peak < -10, "rises before it falls");
  }
});

test("only the board's sky and green", () => {
  for (const p of makeConfetti({ count: 200 }, seeded(11))) assert.ok((CONFETTI_COLORS as readonly string[]).includes(p.color));
});
