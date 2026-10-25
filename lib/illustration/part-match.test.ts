import { test } from "node:test";
import assert from "node:assert/strict";
import { matchPart } from "./part-match";

test("a part is found by its id or by the words for it", () => {
  const session = ["scale", "bags", "l", "r", "eq"];
  assert.equal(matchPart(session, "right pan"), "r");
  assert.equal(matchPart(session, "the bags"), "bags");
  assert.equal(matchPart(session, "equation"), "eq");
  assert.equal(matchPart(["left_pan", "right_pan", "loose_blocks"], "right pan"), "right_pan");
  assert.equal(matchPart(["left_pan", "right_pan", "loose_blocks"], "loose blocks"), "loose_blocks");
  assert.equal(matchPart(["jar1", "jar2", "total"], "jar 2"), "jar2");
  assert.equal(matchPart(["jar1", "jar2"], "plate"), null);
});
