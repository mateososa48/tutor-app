import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LAB, labFromQuery, labFromRequest, labParams, labSummary, normalizeLab } from "./voice-lab";
import { resolveTutorProvider } from "./tutor-provider";

test("a stored lab is made whole and safe", () => {
  assert.deepEqual(normalizeLab(null), DEFAULT_LAB);
  assert.equal(normalizeLab({ engine: "gemini", live: "9.9" }).live, "3.8");
  assert.equal(normalizeLab({ brain: "gpt-realtime" }).brain, DEFAULT_LAB.brain);
});

test("the lab's parameters pick the engine the session page reads", () => {
  const g = labParams({ ...DEFAULT_LAB, engine: "gemini", live: "3.1", planner: false });
  assert.equal(resolveTutorProvider(new URLSearchParams(Object.entries(g).filter(([, v]) => v) as [string, string][])), "gemini");
  assert.equal(g.plan, "0");
  assert.equal(g.voice, null);
  const l = labParams(DEFAULT_LAB);
  assert.equal(resolveTutorProvider(new URLSearchParams(Object.entries(l).filter(([, v]) => v) as [string, string][])), "livekit");
  assert.equal(l.stt, "assemblyai");
  // AssemblyAI's own turn ending needs AssemblyAI's hearing.
  assert.equal(labParams({ ...DEFAULT_LAB, stt: "gemini", turns: "assemblyai" }).turns, "livekit");
});

test("a lab in the URL wins over the saved one", () => {
  const q = new URLSearchParams("voice=livekit&stt=assemblyai&turns=assemblyai&tts=fish-audio/s2.1-pro");
  const lab = labFromQuery(q, DEFAULT_LAB);
  assert.equal(lab.turns, "assemblyai");
  assert.equal(lab.tts, "fish-audio/s2.1-pro");
  assert.deepEqual(labFromQuery(new URLSearchParams("ready=1"), DEFAULT_LAB), DEFAULT_LAB);
});

test("the summary names the stack", () => {
  assert.equal(labSummary(DEFAULT_LAB), "LiveKit · AssemblyAI · Haiku 5.5 · Grok TTS");
  assert.equal(labSummary({ ...DEFAULT_LAB, engine: "gemini" }), "Gemini Live 3.8 + planner");
});

test("the token route keeps only known values", () => {
  assert.deepEqual(labFromRequest({ stt: "assemblyai", turns: "x", brain: "claude-opus-9", tts: "spacexai/grok-tts" }), { stt: "assemblyai", turns: null, wait: null, brain: null, tts: "spacexai/grok-tts" });
});
