import { test } from "node:test";
import assert from "node:assert/strict";
import { describeBlocks, parseBlocks, renderBlocks, type BlocksSpec } from "./board-blocks";

test("blocks are read from words, checked, and said exactly as drawn", () => {
  const s = parseBlocks("42: 4 tens 2 ones | after the trade: 3 tens 12 ones (10 new) | take away 7: 3 tens 12 ones, cross 7 ones") as BlocksSpec;
  assert.deepEqual(s.rows.map((r) => [r.tens, r.ones, r.newOnes ?? 0, r.crossOnes ?? 0]), [[4, 2, 0, 0], [3, 12, 10, 0], [3, 12, 0, 7]]);
  assert.match(describeBlocks(s)[2], /7 ones crossed out \(35 left, not written\)/);
  const r = renderBlocks(s);
  for (const id of ["R1.tens", "R1.ones", "R2.new", "R3.crossed", "R3.t3", "R2.o12"]) assert.ok(r.parts[id], id);
  assert.equal(r.aliases["42"], "R1");
  // A row named by a number must show it; too many blocks are refused.
  assert.ok("error" in parseBlocks("42: 3 tens 2 ones"));
  assert.ok("error" in parseBlocks("4 tens 30 ones"));
  assert.ok("error" in parseBlocks("a b c"));
});
