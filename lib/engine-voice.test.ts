import { test } from "node:test";
import assert from "node:assert/strict";
import { faithfulness, sayWords, scriptMessage } from "./engine-voice";

test("number words and digits are the same words said", () => {
  assert.deepEqual(sayWords("Five times four plus three is twenty-three"), ["5", "times", "4", "plus", "3", "is", "23"]);
  assert.equal(faithfulness("Five times four plus three is twenty-three.", "5 times 4 plus 3 is 23"), 1);
  assert.equal(faithfulness("Okay, let's stop here.", "Okay, let's stop here."), 1);
  assert.ok(faithfulness("Okay, let's stop here. Nice work today.", "I agree, you did a great job today. See you next time.") < 0.3);
});

test("a script is quoted, with its own quotes softened", () => {
  assert.equal(scriptMessage('Say "half".'), `Next line: "Say 'half'."`);
});
