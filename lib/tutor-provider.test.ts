import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLiveModel, resolveTutorProvider } from "./tutor-provider";
import { DEFAULT_LIVE_MODEL } from "./gemini-live";

const search = (map: Record<string, string>) => ({ get: (name: string) => map[name] ?? null });

test("the provider comes from the URL, then the environment", () => {
  assert.equal(resolveTutorProvider(search({ provider: "openai" })), "openai");
  assert.equal(resolveTutorProvider(search({ provider: "gemini" })), "gemini");
  assert.equal(resolveTutorProvider(search({ provider: "nonsense" })), "gemini");
  assert.equal(resolveTutorProvider(null), "gemini");
});

test("?live picks the Live model by short name or full id", () => {
  assert.equal(resolveLiveModel(search({ live: "3.8" })), "gemini-3.8-live");
  assert.equal(resolveLiveModel(search({ live: "3.8-thinking" })), "gemini-3.8-live-extended-thinking");
  assert.equal(resolveLiveModel(search({ live: "3.1" })), "gemini-3.1-flash-live-preview");
  // A model released after this code still works by its full name.
  assert.equal(resolveLiveModel(search({ live: "gemini-4.0-live" })), "gemini-4.0-live");
  assert.equal(resolveLiveModel(search({ live: "nonsense" })), DEFAULT_LIVE_MODEL);
  assert.equal(resolveLiveModel(null), DEFAULT_LIVE_MODEL);
});
