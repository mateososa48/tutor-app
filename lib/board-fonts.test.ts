import { test } from "node:test";
import assert from "node:assert/strict";
import { boardFontsSettled, loadBoardFonts } from "./board-fonts";

test("with no document (the server, a test) the fonts count as settled at once", async () => {
  assert.equal(boardFontsSettled(), false);
  const first = loadBoardFonts();
  // One load, however many callers wait on it.
  assert.equal(loadBoardFonts(), first);
  await first;
  assert.equal(boardFontsSettled(), true);
});
