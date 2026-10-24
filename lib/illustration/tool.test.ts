import { test } from "node:test";
import assert from "node:assert/strict";
import { ILLUSTRATE_DECLARATION, illustrateRequest } from "./tool";
import { firstSentence } from "../whiteboard-tools";

test("a call names real things to draw, or nothing is asked for", () => {
  assert.deepEqual(illustrateRequest({ what: "  12 marbles shared into 3 jars,\n one jar per friend ", notice: "each jar gets the same" }), {
    what: "12 marbles shared into 3 jars, one jar per friend",
    notice: "each jar gets the same",
  });
  assert.deepEqual(illustrateRequest({ what: "3 quarters marked 25 cents" }), { what: "3 quarters marked 25 cents", notice: "" });
  assert.equal(illustrateRequest({ what: "shapes" }), null);
  assert.equal(illustrateRequest({}), null);
  assert.equal(illustrateRequest({ what: 12 }), null);
  assert.equal(illustrateRequest({ what: "x".repeat(900) })!.what.length, 300);
});

test("a Live session's one sentence says what illustrate is for; the rules ride on the parameters", () => {
  const first = firstSentence(ILLUSTRATE_DECLARATION.description);
  assert.equal(first, ILLUSTRATE_DECLARATION.description, "one sentence: a Live session gets only the first");
  assert.match(first, /real things/);
  const what = (ILLUSTRATE_DECLARATION.parameters.properties as Record<string, { description: string }>).what.description;
  assert.match(what, /exact counts/);
  assert.match(what, /Never the answer/);
  assert.deepEqual(ILLUSTRATE_DECLARATION.parameters.required, ["what"]);
});
