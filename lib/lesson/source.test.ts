import { test } from "node:test";
import assert from "node:assert/strict";
import { sniffImageType } from "./source";

test("an image's type comes from its bytes, not its name", () => {
  assert.equal(sniffImageType("iVBORw0KGgoAAAANSUhEUg", "image/jpeg"), "image/png");
  assert.equal(sniffImageType("/9j/4AAQSkZJRgABAQ", "image/png"), "image/jpeg");
  assert.equal(sniffImageType("R0lGODlhAQABAIAAAA", "image/png"), "image/gif");
  assert.equal(sniffImageType("UklGRiQAAABXRUJQ", "image/png"), "image/webp");
  assert.equal(sniffImageType("AAAA", "image/jpg"), "image/jpeg");
});
