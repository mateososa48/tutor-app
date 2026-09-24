import { test } from "node:test";
import assert from "node:assert/strict";
import { clockCue, clockLabel, clockPhase, lastWindow, wrapWindow } from "./session-clock";

const min = (m: number) => m * 60_000;

test("the heads-up and the wrap-up scale with the session, within bounds", () => {
  assert.deepEqual([10, 15, 20, 30, 45, 60].map(lastWindow), [3, 4, 5, 8, 10, 10]);
  assert.deepEqual([10, 15, 20, 30, 45, 60].map(wrapWindow), [2, 2, 2, 3, 5, 5]);
});

test("a 20-minute session: on, then the heads-up at 15, the wrap-up at 18, over at 20", () => {
  assert.equal(clockPhase(min(14), 20), "on");
  assert.equal(clockPhase(min(15), 20), "last");
  assert.equal(clockPhase(min(17.9), 20), "last");
  assert.equal(clockPhase(min(18), 20), "wrap");
  assert.equal(clockPhase(min(20), 20), "over");
});

test("with no length chosen there is no clock to keep", () => {
  assert.equal(clockPhase(min(90), null), "on");
  assert.equal(clockCue(min(90), null), null);
  assert.equal(clockLabel(min(12.4), null), "12 min in");
});

test("the label and the cues say what to do, not a countdown to read out", () => {
  assert.equal(clockLabel(min(12.4), 20), "12 of 20 min");
  assert.equal(clockCue(min(5), 20), null);
  assert.match(clockCue(min(15), 20)!, /nearly done, so the problem after this one is the last; say so once/);
  assert.match(clockCue(min(18.5), 20)!, /wrap up now, once this problem is done: one quick check with no help, today's rule/);
  assert.match(clockCue(min(21), 20)!, /past the 20 minutes they chose; close warmly unless they want to keep going/);
});
