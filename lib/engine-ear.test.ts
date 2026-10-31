import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkRms } from "./engine-ear";

const pcm = (amp: number, n = 640) => {
  const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(amp * Math.sin(i / 3)), i * 2);
  return b.toString("base64");
};

test("a voiced chunk is louder than a quiet room by far", () => {
  assert.ok(chunkRms(pcm(10)) < 20);
  assert.ok(chunkRms(pcm(4000)) > 2000);
});
