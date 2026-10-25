import { test } from "node:test";
import assert from "node:assert/strict";
import { drawWindow, localProgress } from "./draw-in";

test("every piece is drawn inside the reveal, overlapping its neighbours", () => {
  for (const n of [1, 3, 12, 300]) {
    for (let i = 0; i < n; i++) {
      const { start, span } = drawWindow(i, n);
      assert.ok(start >= 0 && start + span <= 1 + 1e-9, `piece ${i} of ${n} ends by 1`);
    }
  }
  assert.equal(drawWindow(0, 300).start, 0);
  const last = drawWindow(299, 300);
  assert.ok(Math.abs(last.start + last.span - 1) < 1e-9, "the last piece finishes as the reveal does");
  assert.ok(drawWindow(1, 300).start < drawWindow(0, 300).span, "pieces overlap");
});

test("a piece starts quick and settles", () => {
  assert.equal(localProgress(0.1, 0.2, 0.2), 0);
  assert.equal(localProgress(0.5, 0.2, 0.2), 1);
  const mid = localProgress(0.3, 0.2, 0.2);
  assert.ok(mid > 0.5 && mid < 1, `ease-out: halfway in time is past halfway drawn (${mid})`);
});
