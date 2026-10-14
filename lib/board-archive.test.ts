import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCHIVE_GAP, ARCHIVE_TOTAL_MS, archiveFrameAt, archiveRect, slideDistance } from "./board-archive";

test("the card wraps everything on the board with a margin", () => {
  const r = archiveRect([{ x: 40, y: 100, w: 300, h: 50 }, { x: 600, y: 300, w: 200, h: 100 }], 20);
  assert.deepEqual(r, { x: 20, y: 80, w: 800, h: 340 });
  assert.equal(archiveRect([]), null);
});

test("a framed board slides until its right edge is a gap left of the page", () => {
  const card = { x: 12, y: 0, w: 1400, h: 800 };
  const d = slideDistance(card);
  assert.equal(card.x + card.w - d, -ARCHIVE_GAP);
});

test("the frame fades in first, then holds, then the board slides", () => {
  assert.equal(archiveFrameAt(0).opacity, 0);
  assert.equal(archiveFrameAt(0).slide, 0);
  assert.ok(archiveFrameAt(260).opacity > 0.99);
  assert.equal(archiveFrameAt(300).slide, 0, "no slide during the hold");
  const mid = archiveFrameAt(260 + 140 + 280);
  assert.ok(mid.slide > 0.4 && mid.slide < 0.6);
  assert.equal(archiveFrameAt(260 + 140 + 560).slide, 1);
  assert.ok(archiveFrameAt(260 + 140 + 560).done);
  assert.ok(ARCHIVE_TOTAL_MS < 1200, "the whole turn stays under a second and a bit");
});
