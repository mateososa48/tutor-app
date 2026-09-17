import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionRecorder } from "./session-recorder";

type Sent = { cseqs: number[]; kinds: string[] };

// A server whose responses come back in scrambled time: the first request is
// the slowest. The recorder must still send one request at a time, in order.
function slowServer(delays: number[], fail: number[] = []) {
  const sent: Sent[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let call = 0;
  const fetchImpl = async (_url: string, init?: RequestInit) => {
    const n = call++;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const body = JSON.parse(String(init?.body)) as { events: Array<{ cseq: number; kind: string }> };
    await new Promise((r) => setTimeout(r, delays[n] ?? 0));
    inFlight -= 1;
    if (fail.includes(n)) return { ok: false, json: async () => ({}) };
    sent.push({ cseqs: body.events.map((e) => e.cseq), kinds: body.events.map((e) => e.kind) });
    return { ok: true, json: async () => ({}) };
  };
  return { fetchImpl, sent, maxInFlight: () => maxInFlight };
}

test("batches go out one at a time and in order, whatever the server's timing", async () => {
  const server = slowServer([40, 0, 0]);
  const rec = new SessionRecorder("s1", () => 1000, server.fetchImpl);
  rec.record("transcript.entry", "tutor", { text: "That's" }, 1001);
  rec.record("transcript.entry", "tutor", { text: " okay," }, 1001);
  const first = rec.flush();
  rec.record("transcript.entry", "tutor", { text: " this" }, 1001);
  const second = rec.flush();
  await Promise.all([first, second]);
  assert.equal(server.maxInFlight(), 1);
  assert.deepEqual(server.sent.flatMap((s) => s.cseqs), [1, 2, 3]);
});

test("a board snapshot travels alone, and an unchanged one is skipped", async () => {
  const server = slowServer([]);
  const rec = new SessionRecorder("s1", () => 1000, server.fetchImpl);
  rec.record("tutor.speaking", "tutor", { speaking: true });
  rec.recordLarge("whiteboard.snapshot", "system", { store: { big: "x".repeat(5000) } });
  rec.recordLarge("whiteboard.snapshot", "system", { store: { big: "x".repeat(5000) } });
  rec.record("tutor.speaking", "tutor", { speaking: false });
  await rec.flush();
  assert.deepEqual(server.sent.map((s) => s.kinds), [["tutor.speaking"], ["whiteboard.snapshot"], ["tutor.speaking"]]);
  assert.deepEqual(server.sent.map((s) => s.cseqs), [[1], [2], [3]]);
});

test("a failed batch is retried in its place before anything after it", async () => {
  const server = slowServer([], [0]);
  const rec = new SessionRecorder("s1", () => 1000, server.fetchImpl);
  rec.record("transcript.entry", "student", { text: "7" });
  await rec.flush();
  assert.equal(server.sent.length, 0, "the first attempt failed");
  rec.record("transcript.entry", "student", { text: "wait" });
  await rec.flush();
  assert.deepEqual(server.sent.flatMap((s) => s.cseqs), [1, 2]);
});

test("long strings are clamped in ordinary events but not in large ones", async () => {
  const bodies: string[] = [];
  const rec = new SessionRecorder("s1", () => 1000, async (_u, init) => {
    bodies.push(String(init?.body));
    return { ok: true, json: async () => ({}) };
  });
  rec.record("live.debug", "system", { message: "y".repeat(5000) });
  rec.recordLarge("whiteboard.snapshot", "system", { store: "z".repeat(5000) });
  await rec.flush();
  assert.match(bodies[0], /more characters/);
  assert.ok(bodies[1].includes("z".repeat(5000)));
});
