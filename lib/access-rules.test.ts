import { test } from "node:test";
import assert from "node:assert/strict";
import { refusalStatus, sessionVerdict, soloActor, type Actor } from "./access-rules";

const ana = soloActor("ana");

test("a learner reads and writes their own session", () => {
  assert.equal(sessionVerdict("ana", ana, "own"), "ok");
  assert.equal(sessionVerdict("ana", ana, "write"), "ok");
});

test("someone else's session is refused, a missing one is missing", () => {
  assert.equal(sessionVerdict("leo", ana, "own"), "forbidden");
  assert.equal(sessionVerdict("leo", ana, "write"), "forbidden");
  assert.equal(sessionVerdict(undefined, ana, "own"), "missing");
  assert.equal(sessionVerdict(null, ana, "write"), "missing");
  assert.equal(sessionVerdict("", ana, "write"), "missing");
});

test("a running session keeps taking writes after the device switches profile", () => {
  // The family login may use Ana and Leo; the device is on Leo now.
  const switched: Actor = { learnerId: "leo", accountId: "parent", actsAs: ["ana", "leo"] };
  assert.equal(sessionVerdict("ana", switched, "write"), "ok", "Ana's recorder still lands on Ana's session");
  assert.equal(sessionVerdict("ana", switched, "own"), "forbidden", "but Leo cannot open or change Ana's session");
  assert.equal(sessionVerdict("stranger", switched, "write"), "forbidden", "and never a session outside the family");
});

test("reads hide what they refuse, writes say which", () => {
  assert.equal(refusalStatus("missing", false), 404);
  assert.equal(refusalStatus("missing", true), 404);
  assert.equal(refusalStatus("forbidden", false), 403);
  assert.equal(refusalStatus("forbidden", true), 404);
});

test("a plain login is its own learner", () => {
  assert.deepEqual(soloActor("u1"), { learnerId: "u1", accountId: "u1", actsAs: ["u1"] });
});
