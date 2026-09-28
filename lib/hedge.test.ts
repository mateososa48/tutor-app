import { test } from "node:test";
import assert from "node:assert/strict";
import { hedged } from "./hedge";

const after = <T>(ms: number, value: T, signal: AbortSignal, log?: string[], name?: string) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => resolve(value), ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      log?.push(`abort ${name}`);
      reject(new Error("aborted"));
    });
  });

test("a fast first model answers alone", async () => {
  const asked: string[] = [];
  const r = await hedged(["a", "b"], (m, s) => (asked.push(m), after(10, `from ${m}`, s)), { hedgeMs: 100, deadlineMs: 500 });
  assert.deepEqual(r, { value: "from a", model: "a" });
  assert.deepEqual(asked, ["a"]);
});

test("a slow first model is hedged, and the faster answer wins", async () => {
  const log: string[] = [];
  const t0 = Date.now();
  const r = await hedged(["a", "b"], (m, s) => after(m === "a" ? 400 : 20, m, s, log, m), { hedgeMs: 50, deadlineMs: 1000 });
  assert.deepEqual(r, { value: "b", model: "b" });
  assert.ok(Date.now() - t0 < 200);
  assert.deepEqual(log, ["abort a"]);
});

test("a failure hands over at once, without waiting for the hedge", async () => {
  const t0 = Date.now();
  const r = await hedged(["a", "b"], (m, s) => (m === "a" ? Promise.reject(new Error("429")) : after(10, m, s)), { hedgeMs: 500, deadlineMs: 1000 });
  assert.deepEqual(r, { value: "b", model: "b" });
  assert.ok(Date.now() - t0 < 200);
});

test("an unusable answer (null) counts as a failure", async () => {
  const r = await hedged(["a", "b"], (m, s) => after(10, m === "a" ? null : "ok", s), { hedgeMs: 500, deadlineMs: 1000 });
  assert.deepEqual(r, { value: "ok", model: "b" });
});

test("nothing usable, or nothing in time, is null", async () => {
  assert.equal(await hedged(["a", "b"], (_m, s) => after(5, null, s), { hedgeMs: 50, deadlineMs: 500 }), null);
  assert.equal(await hedged(["a", "b"], (m, s) => after(300, m, s), { hedgeMs: 20, deadlineMs: 100 }), null);
  assert.equal(await hedged([], async () => "x", { hedgeMs: 20, deadlineMs: 100 }), null);
});
