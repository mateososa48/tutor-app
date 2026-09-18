import { test } from "node:test";
import assert from "node:assert/strict";
import { GeminiLiveSession } from "./gemini-live";
import { LiveTutorSession, type LiveTutorCallbacks } from "./live-tutor";
import { TutorRuntime } from "./tutor-runtime";

const liveCallbacks: LiveTutorCallbacks = {
  onTranscript: () => undefined,
  onCaption: () => undefined,
  onToolCall: async () => ({ success: true }),
  onConnected: () => undefined,
  onReconnecting: () => undefined,
  onDisconnected: () => undefined,
  onError: () => undefined,
  onSpeakingChange: () => undefined,
  onActivity: () => undefined,
};

test("OpenAI and Gemini transports can share the exact tutoring runtime", () => {
  const runtime = new TutorRuntime({ startedAt: 0 });
  const openai = new LiveTutorSession(liveCallbacks, runtime);
  const gemini = new GeminiLiveSession({
    onAudio: () => undefined,
    onTranscript: () => undefined,
    onToolCall: async () => ({ success: true }),
    onConnected: () => undefined,
    onDisconnected: () => undefined,
    onError: () => undefined,
    onInterrupted: () => undefined,
  }, { systemInstruction: "test", voiceName: "test", runtime });

  assert.equal(openai.tutorRuntime, runtime);
  assert.equal(gemini.tutorRuntime, runtime);
  gemini.sendText("I don't understand this");
  assert.equal(runtime.policy.studentTurns, 1);
});

