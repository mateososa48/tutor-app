import { test } from "node:test";
import assert from "node:assert/strict";
import { isBackchannel } from "./backchannel";

test("reactions are backchannels; answers and requests are not", () => {
  for (const t of ["ok", "Okay.", "ah", "ahh", "oh", "mhm", "hmm", "got it", "i see", "yeah!"]) assert.equal(isBackchannel(t), true, t);
  for (const t of ["yes", "no", "right", "1", "ok so 15?", "lets do the last question", "ok lets do the last question", "idk"]) assert.equal(isBackchannel(t), false, t);
});
