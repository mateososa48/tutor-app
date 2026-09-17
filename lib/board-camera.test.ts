import { test } from "node:test";
import assert from "node:assert/strict";
import { cameraView, planCamera, type Rect } from "./board-camera";

const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 1e-6 && inner.y >= outer.y - 1e-6 && inner.x + inner.w <= outer.x + outer.w + 1e-6 && inner.y + inner.h <= outer.y + outer.h + 1e-6;

test("a page that fits is shown whole and centred, at most at zoom 1", () => {
  const page = { x: 0, y: 0, w: 1200, h: 700 };
  const cam = planCamera(page, { w: 1454, h: 818 });
  assert.equal(cam.z, 1);
  const seen = cameraView(cam, { w: 1454, h: 818 });
  assert.ok(contains(seen, page));
  assert.ok(Math.abs(seen.x + seen.w / 2 - 600) < 1e-6, "centred horizontally");
});

test("a small item is framed with its inset, never zoomed past 1", () => {
  const item = { x: 3400, y: 300, w: 200, h: 80 };
  const cam = planCamera(item, { w: 1454, h: 818 }, { inset: 48 });
  assert.equal(cam.z, 1);
  assert.ok(contains(cameraView(cam, { w: 1454, h: 818 }), item), "an item on another page is brought into view");
});

test("on a phone the zoom stops at the readable minimum in one step, keeping the row's start", () => {
  const row = { x: 36, y: 400, w: 1100, h: 120 };
  const view = { w: 390, h: 844 };
  const cam = planCamera(row, view, { inset: 24, minZoom: 0.8 });
  assert.equal(cam.z, 0.8, "not the 0.33 a plain fit would give");
  const seen = cameraView(cam, view);
  assert.ok(seen.x <= row.x && seen.x + 24 / 0.8 >= row.x - 1e-6, "the row's left edge is just inside the view");
  assert.ok(seen.y <= row.y && seen.y + seen.h >= row.y + row.h, "the row is fully visible top to bottom");
});

test("min zoom never exceeds max zoom", () => {
  const cam = planCamera({ x: 0, y: 0, w: 5000, h: 5000 }, { w: 500, h: 500 }, { minZoom: 2, maxZoom: 1 });
  assert.equal(cam.z, 1);
});
