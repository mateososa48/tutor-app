import { test } from "node:test";
import assert from "node:assert/strict";
import { contradicts, judges, runBrainTurn, saidIn, verdictOf } from "./turn";

test("a checked answer must be one the student said", () => {
  assert.equal(saidIn("5", "cool, can we do the temperature one now? it's number 8."), false);
  assert.equal(saidIn("30", "so five cups is 30"), true);
  assert.equal(saidIn("30", "so five cups is thirty"), true);
  assert.equal(saidIn("2/9", "one batch is two ninths of a cup?"), true);
  assert.equal(saidIn("72.25", "72.25. so its 45 right?"), true);
  assert.equal(saidIn("-11", "it lands on -11"), true);
  assert.equal(saidIn("0.5", "0.5 is bigger"), true);
});

test("a sentence's judgement and a verdict's polarity", () => {
  assert.equal(judges("Yes, six cookies a cup."), "affirm");
  assert.equal(judges("That's right, it lands on negative eleven."), "affirm");
  assert.equal(judges("Not quite, look at the bars."), "deny");
  assert.equal(judges("How'd you get fifteen?"), null);
  assert.equal(verdictOf("Verdict: correct. 12 / 2 = 6"), "correct");
  assert.equal(verdictOf('[Answer check, not from the student: "15" → incorrect.'), "wrong");
  assert.equal(verdictOf("Verdict: cannot_check."), "unknown");
  assert.equal(contradicts("affirm", "wrong"), true);
  assert.equal(contradicts("affirm", "unknown"), false);
});

// A fake Messages API: a forced check returns a check_answer call; a reply streams the given text.
function sse(events: unknown[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200 });
}
function fakeApi(replies: string[], checkDelayMs = 0) {
  let n = 0;
  return (async (_url: unknown, init: { body: string }) => {
    const body = JSON.parse(init.body);
    const usage = { message: { usage: { input_tokens: 10 } } };
    if (body.tool_choice) {
      await new Promise((r) => setTimeout(r, checkDelayMs));
      return sse([{ type: "message_start", ...usage }, { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "c1", name: "check_answer" } }, { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"problem":"12/2","student_answer":"6"}' } }, { type: "content_block_stop", index: 0 }, { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 20 } }]);
    }
    const text = replies[Math.min(n++, replies.length - 1)];
    return sse([{ type: "message_start", ...usage }, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, ...text.split(/(?<= )/).map((t) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } })), { type: "content_block_stop", index: 0 }, { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 30 } }]);
  }) as unknown as typeof fetch;
}
const base = { system: "s", tools: [], messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "6?" }] }], apiKey: "k" };

test("a reply that agrees with the verdict is spoken after the check", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = fakeApi(["Yes, six cookies a cup. What do five cups make?"], 30);
  try {
    let heard = "";
    const r = await runBrainTurn(base, { allowed: new Set(), forceCheck: true, onText: (t) => (heard += t), onBoard: () => undefined, check: () => ({ success: true, message: "Verdict: correct." }) });
    assert.equal(heard, "Yes, six cookies a cup. What do five cups make?");
    assert.equal(r.redone, false);
    assert.equal(r.steps, 2);
  } finally {
    globalThis.fetch = real;
  }
});

test("a reply that contradicts the checker is never heard; the brain answers again", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = fakeApi(["Yes, that's right. Next one.", "Hm, how did you get that?"], 30);
  try {
    let heard = "";
    const r = await runBrainTurn(base, { allowed: new Set(), forceCheck: true, onText: (t) => (heard += t), onBoard: () => undefined, check: () => ({ success: true, message: "Verdict: incorrect." }) });
    assert.equal(heard, "Hm, how did you get that?");
    assert.equal(r.redone, true);
  } finally {
    globalThis.fetch = real;
  }
});

test("the check never writes working in the student's hand", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: unknown, init: { body: string }) => {
    const body = JSON.parse(init.body);
    const ev = body.tool_choice
      ? [{ type: "message_start", message: { usage: {} } }, { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "c1", name: "check_answer" } }, { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"problem":"6*5","student_answer":"30","working":["6 * 5 = 30"]}' } }, { type: "content_block_stop", index: 0 }]
      : [{ type: "message_start", message: { usage: {} } }, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "How'd you get it?" } }, { type: "content_block_stop", index: 0 }];
    return sse(ev);
  }) as unknown as typeof fetch;
  try {
    let seen: Record<string, unknown> = {};
    await runBrainTurn(base, { allowed: new Set(), forceCheck: true, onText: () => undefined, onBoard: () => undefined, check: (args) => { seen = args; return { success: true, message: "Verdict: correct." }; } });
    assert.equal(seen.working, undefined);
    assert.equal(seen.student_answer, "30");
  } finally {
    globalThis.fetch = real;
  }
});

test("a reply that does not judge goes out without waiting for the check", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = fakeApi(["How'd you get six?"], 400);
  try {
    let firstAt = 0;
    const t0 = Date.now();
    await runBrainTurn(base, { allowed: new Set(), forceCheck: true, onText: () => (firstAt ||= Date.now() - t0), onBoard: () => undefined, check: () => ({ success: true, message: "Verdict: correct." }) });
    assert.ok(firstAt < 300, `first words at ${firstAt} ms`);
  } finally {
    globalThis.fetch = real;
  }
});
