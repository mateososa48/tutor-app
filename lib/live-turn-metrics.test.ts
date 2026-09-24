import { test } from "node:test";
import assert from "node:assert/strict";
import { TurnTracker, estimateCostUsd, pcmBase64Ms, readUsage, type TurnSummary } from "./live-turn-metrics";

function tracker() {
  const out: TurnSummary[] = [];
  return { t: new TurnTracker("gemini-3.8-live", (s) => out.push(s)), out };
}

test("a typed turn: calls before speech, first audio, words and questions", () => {
  const { t, out } = tracker();
  t.noteInput("text", 1000);
  t.noteToolCall("check_answer", 1600);
  t.noteToolCall("draw_fraction", 1650);
  t.noteAudio(200, 2400);
  t.noteTutorText("Oh, interesting. ", true, 2400);
  t.noteAudio(200, 2500);
  t.noteTutorText("Which bar is bigger?", true, 2500);
  t.noteToolCall("point_at", 2600);
  assert.equal(t.finish("turn_complete", 5000), true);
  assert.equal(out.length, 0, "held until flushed");
  t.flush();
  const s = out[0];
  assert.equal(s.trigger, "text");
  assert.equal(s.inputAt, 1000);
  assert.equal(s.firstToolMs, 600);
  assert.equal(s.firstAudioMs, 1400);
  assert.equal(s.toolsBeforeAudio, 2);
  assert.deepEqual(s.tools, ["check_answer", "draw_fraction", "point_at"]);
  assert.equal(s.audioMs, 400);
  assert.equal(s.words, 6);
  assert.equal(s.questions, 1);
  assert.equal(s.silent, false);
  assert.equal(s.arrivalGaps, 0);
});

test("spoken input: the last fragment before the reply is the input time, and is used once", () => {
  const { t, out } = tracker();
  t.noteStudentVoice(1000);
  t.noteStudentVoice(1800);
  t.noteAudio(100, 3000);
  t.finish("turn_complete", 4000);
  t.noteAudio(100, 6000); // a second turn with no new input
  t.finish("turn_complete", 7000);
  t.flush();
  assert.equal(out[0].trigger, "voice");
  assert.equal(out[0].firstAudioMs, 1200);
  assert.equal(out[1].trigger, "unknown");
  assert.equal(out[1].inputAt, null);
  assert.equal(out[1].firstAudioMs, null);
});

test("audio gaps over 300 ms are counted after the first chunk", () => {
  const { t, out } = tracker();
  t.noteInput("text", 0);
  t.noteAudio(40, 100);
  t.noteAudio(40, 150);
  t.noteAudio(40, 900);
  t.noteAudio(40, 1000);
  t.finish("turn_complete", 1100);
  t.flush();
  assert.equal(out[0].arrivalGaps, 1);
  assert.equal(out[0].maxArrivalGapMs, 750);
});

test("a turn with calls and no words is silent; an interruption is marked", () => {
  const { t, out } = tracker();
  t.noteInput("text", 0);
  t.noteToolCall("write_step", 500);
  t.finish("turn_complete", 900);
  t.noteInput("text", 1000);
  t.noteAudio(100, 1500);
  t.finish("interrupted", 1600);
  t.flush();
  assert.equal(out[0].silent, true);
  assert.equal(out[0].toolsBeforeAudio, 1);
  assert.equal(out[1].interrupted, true);
  assert.equal(out[1].endedBy, "interrupted");
});

test("a sentence said twice, in one turn or across two, is a repeat; short ones are not", () => {
  const { t, out } = tracker();
  t.noteInput("text", 0);
  t.noteTutorText("That line separates the top number from the bottom one. Okay. Okay.", true, 10);
  t.finish("turn_complete", 20);
  t.noteInput("text", 30);
  t.noteTutorText("That line separates the top number from the bottom one.", true, 40);
  t.finish("turn_complete", 50);
  t.noteInput("text", 60);
  t.noteTutorText("Right. Now the next one, which is a new sentence entirely.", true, 70);
  t.finish("turn_complete", 80);
  t.flush();
  assert.equal(out[0].repeat, false, "'Okay.' twice is too short to count");
  assert.equal(out[1].repeat, true);
  assert.equal(out[2].repeat, false);
});

test("usage after turnComplete joins the held turn; usage between turns joins the next", () => {
  const { t, out } = tracker();
  t.noteInput("text", 0);
  t.noteAudio(100, 500);
  t.finish("turn_complete", 1000);
  t.noteUsage({ promptTokenCount: 10000, responseTokenCount: 500, promptTokensDetails: [{ modality: "TEXT", tokenCount: 10000 }] });
  t.flush();
  t.noteUsage({ promptTokenCount: 2000, responseTokenCount: 100 });
  t.noteInput("text", 2000);
  t.noteAudio(100, 2500);
  t.finish("turn_complete", 3000);
  t.flush();
  assert.equal(out.length, 2, "late usage never opens a turn of its own");
  assert.equal(out[0].usage?.prompt, 10000);
  assert.equal(out[0].usageMessages, 1);
  assert.ok(Math.abs((out[0].costUsd ?? 0) - (10000 * 0.75 + 500 * 12) / 1e6) < 1e-12);
  assert.equal(out[1].usage?.prompt, 2000);
  assert.equal(out[1].inputAt, 2000, "orphan usage does not steal the next turn's input");
});

test("cost: prompt by modality, the rest as text, tool results as text, reply as audio", () => {
  const usage = readUsage({
    promptTokenCount: 30000,
    promptTokensDetails: [{ modality: "TEXT", tokenCount: 20000 }, { modality: "AUDIO", tokenCount: 8000 }, { modality: "IMAGE", tokenCount: 1000 }],
    responseTokenCount: 600,
    responseTokensDetails: [{ modality: "AUDIO", tokenCount: 600 }],
    toolUsePromptTokenCount: 400,
  });
  // 20000*0.75 + 8000*3 + 1000*1 + 1000*0.75 (unbroken rest) + 400*0.75 + 600*12
  const expected = (15000 + 24000 + 1000 + 750 + 300 + 7200) / 1e6;
  assert.ok(Math.abs((estimateCostUsd(usage) ?? 0) - expected) < 1e-12);
  assert.equal(readUsage({}), null);
  assert.equal(estimateCostUsd(null), null);
});

test("pcm length: 24 kHz 16-bit, one second is 48000 bytes", () => {
  const oneSecond = Buffer.alloc(48000).toString("base64");
  assert.ok(Math.abs(pcmBase64Ms(oneSecond) - 1000) < 0.1);
});
