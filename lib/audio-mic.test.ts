import test from "node:test";
import assert from "node:assert/strict";
import { micProblem } from "./audio";

const ok = { chunks: 150, peak: 0.02, context: "running", track: "live" };

test("a working mic, loud or quiet, is no problem", () => {
  assert.equal(micProblem(ok), null);
  assert.equal(micProblem({ ...ok, peak: 0.0004 }), null);
});

test("a suspended context or no chunks means nothing reaches the tutor", () => {
  assert.match(micProblem({ ...ok, context: "suspended" }) ?? "", /Click anywhere/);
  assert.match(micProblem({ ...ok, chunks: 0 }) ?? "", /Can't hear your mic/);
});

test("exact digital zero is never a problem: noise suppression flattens a quiet room", () => {
  assert.equal(micProblem({ ...ok, peak: 0 }), null);
});

test("a muted or ended track says so", () => {
  assert.match(micProblem({ ...ok, track: "live muted" }) ?? "", /muted/);
  assert.match(micProblem({ ...ok, track: "ended" }) ?? "", /stopped/);
  assert.match(micProblem({ ...ok, track: "none" }) ?? "", /stopped/);
});
