import { test } from "node:test";
import assert from "node:assert/strict";
import { BackendTurnTracker, TranscriptAssembler, hasBoundarySpace, joinTranscript } from "./live-events";
import type { TutorActivity } from "./live-types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("joinTranscript keeps the model's spacing and adds one only where it is missing", () => {
  assert.equal(joinTranscript("That's", " okay,"), "That's okay,");
  assert.equal(joinTranscript("That's ", "okay"), "That's okay");
  assert.equal(joinTranscript("That's", "okay"), "That's okay");
  assert.equal(joinTranscript("a ", " b"), "a b");
  assert.equal(joinTranscript("tricky", "."), "tricky.");
  assert.equal(joinTranscript("say", "’s"), "say’s");
  assert.equal(joinTranscript("twenty-", "five"), "twenty-five");
  assert.equal(joinTranscript("", "  Hello"), "Hello");
  assert.equal(joinTranscript("x", ""), "x");
  // A spaced stream rebuilds the sentence exactly, words split mid-way included.
  const raw = ["That's", " okay,", " this", " kind", " of", " problem", " can", " be", " tri", "cky", "."];
  assert.ok(raw.some(hasBoundarySpace));
  assert.equal(raw.reduce((a, b) => joinTranscript(a, b, true), ""), "That's okay, this kind of problem can be tricky.");
  // Trimmed pieces (older recordings) get their spaces back.
  const trimmed = ["That's", "okay,", "this", "kind", "of", "problem", "can", "be", "tricky", "."];
  assert.ok(!trimmed.some(hasBoundarySpace));
  assert.equal(trimmed.reduce((a, b) => joinTranscript(a, b), ""), "That's okay, this kind of problem can be tricky.");
});

test("TranscriptAssembler joins fragments and flushes after a pause", async () => {
  const flushed: { role: string; text: string }[] = [];
  const a = new TranscriptAssembler({
    gapMs: 20,
    onFlush: (role, text) => flushed.push({ role, text }),
  });
  a.push("student", "What is");
  a.push("student", " two plus");
  a.push("student", " two?");
  assert.equal(flushed.length, 0);
  await sleep(45);
  assert.deepEqual(flushed, [{ role: "student", text: "What is two plus two?" }]);
});

test("TranscriptAssembler closes the other speaker's buffer when a new speaker starts", async () => {
  const flushed: { role: string; text: string }[] = [];
  const a = new TranscriptAssembler({
    gapMs: 1000,
    onFlush: (role, text) => flushed.push({ role, text }),
  });
  a.push("tutor", "Tell me what you know.");
  a.push("student", "Not much.");
  assert.deepEqual(flushed, [{ role: "tutor", text: "Tell me what you know." }]);
  a.flushAll();
  assert.deepEqual(flushed[1], { role: "student", text: "Not much." });
});

test("TranscriptAssembler reports partial text for live captions", () => {
  const partials: string[] = [];
  const a = new TranscriptAssembler({
    gapMs: 1000,
    onFlush: () => {},
    onPartial: (role, text) => { if (role === "tutor") partials.push(text); },
  });
  a.push("tutor", "Okay, ");
  a.push("tutor", "one sec.");
  assert.deepEqual(partials, ["Okay,", "Okay, one sec."]);
  a.flushAll();
});

function makeTracker() {
  const sent: Record<string, unknown>[] = [];
  const activity: TutorActivity[] = [];
  const executed: { name: string; args: Record<string, unknown> }[] = [];
  const tracker = new BackendTurnTracker({
    execute: (name, args) => {
      executed.push({ name, args });
      if (name === "explode") throw new Error("boom");
      return { success: true, message: `${name} ok` };
    },
    send: (event) => { sent.push(event as Record<string, unknown>); return true; },
    onActivity: (a) => activity.push(a),
  });
  return { tracker, sent, activity, executed };
}

test("BackendTurnTracker runs a function call, returns its output, then continues the response", async () => {
  const { tracker, sent, activity, executed } = makeTracker();
  await tracker.handleResponseEvent({ type: "response.created" });
  await tracker.handleResponseEvent({
    type: "response.output_item.done",
    item: { type: "function_call", call_id: "call_1", name: "draw_equation_step", arguments: '{"latex":"2x=8"}' },
  });
  await tracker.handleResponseEvent({ type: "response.completed", response: {} });

  assert.deepEqual(executed, [{ name: "draw_equation_step", args: { latex: "2x=8" } }]);
  assert.equal(sent.length, 2);
  const out = sent[0] as { type: string; item: { type: string; call_id: string; output: string } };
  assert.equal(out.type, "response.item.create");
  assert.equal(out.item.type, "function_call_output");
  assert.equal(out.item.call_id, "call_1");
  assert.deepEqual(JSON.parse(out.item.output), { success: true, message: "draw_equation_step ok" });
  assert.equal(sent[1].type, "response.create");
  assert.deepEqual(activity, ["thinking", "writing", "thinking"]);

  // The continuation response has only text: activity returns to idle.
  await tracker.handleResponseEvent({ type: "response.created" });
  await tracker.handleResponseEvent({ type: "response.output_text.done", text: "Now what?" });
  await tracker.handleResponseEvent({ type: "response.completed", response: {} });
  assert.equal(sent.length, 2, "no extra response.create without function calls");
  assert.equal(activity[activity.length - 1], "idle");
});

test("BackendTurnTracker waits for the response to complete before continuing", async () => {
  const { tracker, sent } = makeTracker();
  await tracker.handleResponseEvent({ type: "response.created" });
  await tracker.handleResponseEvent({
    type: "response.output_item.done",
    item: { type: "function_call", call_id: "c1", name: "add_text_note", arguments: '{"text":"hi"}' },
  });
  assert.equal(sent.length, 1, "output sent immediately");
  assert.equal(sent[0].type, "response.item.create");
  await tracker.handleResponseEvent({
    type: "response.output_item.done",
    item: { type: "function_call", call_id: "c2", name: "add_text_note", arguments: '{"text":"there"}' },
  });
  assert.equal(sent.length, 2, "second output, still no continue");
  await tracker.handleResponseEvent({ type: "response.completed", response: {} });
  assert.equal(sent.length, 3);
  assert.equal(sent[2].type, "response.create");
});

test("BackendTurnTracker reports tool failures instead of throwing", async () => {
  const { tracker, sent } = makeTracker();
  await tracker.handleResponseEvent({ type: "response.created" });
  await tracker.handleResponseEvent({
    type: "response.output_item.done",
    item: { type: "function_call", call_id: "c1", name: "explode", arguments: "{}" },
  });
  const out = sent[0] as { item: { output: string } };
  assert.deepEqual(JSON.parse(out.item.output), { success: false, error: "boom" });

  await tracker.handleResponseEvent({ type: "response.created" });
  await tracker.handleResponseEvent({
    type: "response.output_item.done",
    item: { type: "function_call", call_id: "c2", name: "add_text_note", arguments: "not json" },
  });
  const out2 = sent[sent.length - 1] as { item: { output: string } };
  assert.equal(JSON.parse(out2.item.output).success, false);
});

test("BackendTurnTracker ignores non-function output items and failed responses cleanly", async () => {
  const { tracker, sent, activity } = makeTracker();
  await tracker.handleResponseEvent({ type: "response.created" });
  await tracker.handleResponseEvent({ type: "response.output_item.done", item: { type: "message" } });
  await tracker.handleResponseEvent({ type: "response.failed", response: { error: "x" } });
  assert.equal(sent.length, 0);
  assert.equal(activity[activity.length - 1], "idle");
});
