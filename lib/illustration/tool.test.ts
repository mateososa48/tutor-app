import { test } from "node:test";
import assert from "node:assert/strict";
import { ILLUSTRATE_DECLARATION, PictureMemory, alreadyDrawn, illustrateRequest, samePicture } from "./tool";
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

test("the same picture is recognised by its counts and things, and is pointed at while it is up", () => {
  assert.ok(samePicture("3 dimes marked 10 cents and 4 nickels marked 5 cents", "3 dimes (10 cents) and 4 nickels (5 cents)"));
  assert.ok(samePicture("4 bags with 6 apples in each bag", "4 bags, each containing 6 apples"));
  assert.ok(!samePicture("5 brownies shared between 2 kids", "7 brownies shared between 2 kids"), "other counts, another picture");
  assert.ok(!samePicture("3 dimes and 4 nickels", "2 quarters and 5 dimes"));
  assert.ok(!samePicture("one brownie cut into two equal halves", "5 brownies shared among 2 kids"));
  const memory = new PictureMemory();
  memory.remember("3 dimes marked 10 cents and 4 nickels marked 5 cents", 'Drew "3 dimes and 4 nickels" (parts: dimes, nickels) (item b4)');
  const board = 'b3 attempt "4"; b4 illustration ""3 dimes and 4 nickels" (parts: dimes, nickels)"';
  assert.equal(memory.find("3 dimes (10 cents) and 4 nickels (5 cents)", board)?.item, "b4");
  assert.equal(memory.find("3 dimes and 4 nickels", 'b3 attempt "4"'), null, "erased, or on a turned board: drawn again");
  assert.equal(memory.find("2 quarters and 5 dimes", board), null);
  assert.match(alreadyDrawn("b4", 'Drew "x" (parts: dimes, nickels) (item b4)'), /already on the board as b4 \(parts: dimes, nickels\)/);
});

test("the same picture asked for in other words, number words included, is the same picture", () => {
  assert.equal(samePicture(
    "a balance scale with three bags of x and seven loose blocks on the left pan, and twenty-two loose blocks on the right pan, with the equation 3x + 7 = 22 typed underneath.",
    "a balance: left pan with three bags of x and seven loose blocks, right pan with twenty-two blocks",
  ), true);
  assert.equal(samePicture("5 brownies on 2 plates", "7 brownies on 2 plates"), false);
});
