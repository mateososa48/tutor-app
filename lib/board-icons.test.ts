import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveIconName } from "./board-icons";

test("icon names resolve from plurals, phrases, and aliases", () => {
  assert.equal(resolveIconName("apple"), "apple");
  assert.equal(resolveIconName("apples"), "apple");
  assert.equal(resolveIconName("Ice cream"), "ice_cream");
  assert.equal(resolveIconName("soccer ball"), "soccer_ball");
  assert.equal(resolveIconName("cookies"), "cookie");
  assert.equal(resolveIconName("cherries"), "cherries");
  assert.equal(resolveIconName("boxes"), "box");
  assert.equal(resolveIconName("money"), "coin");
  assert.equal(resolveIconName("kids"), "boy");
  assert.equal(resolveIconName("red apples"), "apple");
  assert.equal(resolveIconName("chocolate chip cookie"), "cookie");
  assert.equal(resolveIconName("a balloon"), "balloon");
  // The set grew to 380 on Sept 15, so the old "not an icon" example (zebra) is one now.
  assert.equal(resolveIconName("zebra"), "zebra");
  assert.equal(resolveIconName("red squares"), "red_square");
  assert.equal(resolveIconName("clock 3"), "clock_3");
  assert.equal(resolveIconName("windmill"), null);
  assert.equal(resolveIconName(""), null);
});
