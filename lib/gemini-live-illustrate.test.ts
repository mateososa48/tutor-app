// The tutor's own pictures and the planner's (Oct 23 2026): one path in the
// live client, lib/gemini-live.ts, driven here with a stubbed /api/illustrate
// and a fake board.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GeminiLiveSession } from "./gemini-live";
import { ILLUSTRATE_PENDING } from "./illustration/tool";

type Drawn = { scene: unknown; callId: string };
type Reply = { status?: number; body?: unknown; delayMs?: number };

function harness(reply: Reply | ((url: string, init: RequestInit) => Reply)) {
  const drawn: Drawn[] = [];
  const events: Array<{ message: string; payload?: Record<string, unknown> }> = [];
  const requests: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    const r = typeof reply === "function" ? reply(url, init) : reply;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, r.delayMs ?? 5);
      init.signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("aborted", "AbortError")); });
    });
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const session = new GeminiLiveSession(
    {
      onAudio: () => {}, onTranscript: () => {}, onToolCall: () => ({ success: true }), onConnected: () => {}, onDisconnected: () => {},
      onError: () => {}, onInterrupted: () => {}, onDebugEvent: (e) => events.push(e),
    },
    {
      systemInstruction: "",
      voiceName: "Puck",
      illustrator: {
        grade: () => "5th grade",
        board: () => "b1 heading \"Sharing\"",
        draw: async (scene, callId) => {
          drawn.push({ scene, callId });
          return `Drew the picture (item b2, parts: j1, j2, j3)\n[Board: b1 heading; b2 picture]`;
        },
      },
    },
  );
  // Private methods, called the way runToolCall calls them.
  const s = session as unknown as {
    illustrateTool: (id: string, args: Record<string, unknown>) => Promise<{ success: boolean; message?: string; error?: string }>;
    cancelToolCalls: (ids: string[]) => void;
    deliverOrder: (order: string | null) => void;
    pictures: Map<string, { what: string; notice: string; line: string }>;
    pictureOut: string | null;
    pendingTurnNote: string | null;
    illustrateWaitMs: number;
    newStudentInput: (kind: "text" | "voice") => void;
  };
  return { s, drawn, events, requests };
}

const SCENE = { root: { type: "row", children: [{ type: "container", shape: "jar", id: "j1" }] } };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("the tutor's illustrate call draws under its own id and answers with the parts", async () => {
  const h = harness({ body: { scene: SCENE, parts: ["j1"] } });
  const r = await h.s.illustrateTool("call-7", { what: "12 marbles shared into 3 jars", notice: "each jar gets the same" });
  assert.equal(r.success, true);
  assert.match(r.message ?? "", /parts: j1, j2, j3/);
  assert.equal(h.drawn.length, 1);
  assert.equal(h.drawn[0].callId, "call-7", "drawn under the asking call, so a cancel takes it back");
  assert.equal(h.requests[0].what, "12 marbles shared into 3 jars");
  assert.equal(h.requests[0].grade, "5th grade");
});

test("one picture a reply: a second ask is refused until the student's next line", async () => {
  const h = harness({ body: { scene: SCENE } });
  await h.s.illustrateTool("a", { what: "12 marbles shared into 3 jars" });
  const again = await h.s.illustrateTool("b", { what: "3 bags of 4 apples" });
  assert.equal(again.success, true);
  assert.match(again.message ?? "", /^Not drawn: the app is drawing the picture/);
  assert.equal(h.drawn.length, 1);
  h.s.newStudentInput("text");
  await h.s.illustrateTool("c", { what: "3 bags of 4 apples" });
  assert.equal(h.drawn.length, 2, "a new line, a new picture");
});

test("a call cancelled while its picture is asked for never draws", async () => {
  const h = harness({ body: { scene: SCENE }, delayMs: 200 });
  const job = h.s.illustrateTool("gone", { what: "12 marbles shared into 3 jars" });
  await wait(20);
  h.s.cancelToolCalls(["gone"]);
  const r = await job;
  assert.equal(r.success, false);
  assert.equal(h.drawn.length, 0);
  assert.equal(h.s.pictureOut, null, "the slot is free again");
  assert.equal(h.s.pendingTurnNote ?? "", "", "a cancel is not a broken promise");
});

test("a slow picture answers pending, then lands when it comes", async () => {
  const h = harness({ body: { scene: SCENE }, delayMs: 120 });
  h.s.illustrateWaitMs = 30;
  const r = await h.s.illustrateTool("slow", { what: "12 marbles shared into 3 jars" });
  assert.deepEqual(r, { success: true, message: ILLUSTRATE_PENDING });
  assert.equal(h.drawn.length, 0);
  await wait(200);
  assert.equal(h.drawn.length, 1);
  assert.equal(h.drawn[0].callId, "slow");
});

test("a picture that cannot be drawn says so and frees the slot", async () => {
  const h = harness({ body: { scene: null, failures: ["claude-haiku-5-5 unreadable"] } });
  const r = await h.s.illustrateTool("x", { what: "12 marbles shared into 3 jars" });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /could not be drawn \(claude-haiku-5-5 unreadable\)/);
  assert.equal(h.s.pictureOut, null);
  const limited = harness({ status: 429, body: { scene: null, error: "rate_limited" } });
  const r2 = await limited.s.illustrateTool("y", { what: "12 marbles shared into 3 jars" });
  assert.match(r2.error ?? "", /too many pictures in a minute/);
});

test("a call with nothing real to draw is refused before anything is asked", async () => {
  const h = harness({ body: { scene: SCENE } });
  const r = await h.s.illustrateTool("z", { what: "shapes" });
  assert.equal(r.success, false);
  assert.equal(h.requests.length, 0);
});

test("the planner's picture goes through the same path, and a failed one tells the next turn", async () => {
  const h = harness({ body: { scene: SCENE } });
  h.s.pictures.set("ORDER", { what: "2 cups of flour for 12 cookies", notice: "", line: "15 cuz you add 3" });
  h.s.deliverOrder("ORDER");
  await wait(40);
  assert.equal(h.drawn.length, 1);
  assert.match(h.drawn[0].callId, /^planner-picture-/);
  assert.equal(h.s.pictureOut, "2 cups of flour for 12 cookies", "the tutor's own picture tools wait");
  const bad = harness({ status: 500 });
  bad.s.pictures.set("ORDER", { what: "2 cups of flour", notice: "", line: "15" });
  bad.s.deliverOrder("ORDER");
  await wait(40);
  assert.match(bad.s.pendingTurnNote ?? "", /could not be drawn/);
  assert.equal(bad.s.pictureOut, null);
});
