import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DEFAULT_PREFS, PACE_FACTOR, parsePrefs } from "./app-prefs";

test("an empty or broken blob reads as the defaults", () => {
  assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs("nonsense"), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs({ sessionMinutes: 25, language: "xx", writingPace: "warp", transcriptOpen: "yes" }), DEFAULT_PREFS);
});

test("good values are kept field by field", () => {
  const prefs = parsePrefs({ sessionMinutes: 45, language: "es", transcriptOpen: true, startMuted: true, writingPace: "calm", micDeviceId: "abc" });
  assert.equal(prefs.sessionMinutes, 45);
  assert.equal(prefs.language, "es");
  assert.equal(prefs.transcriptOpen, true);
  assert.equal(prefs.startMuted, true);
  assert.equal(prefs.writingPace, "calm");
  assert.equal(prefs.micDeviceId, "abc");
});

test("calm writes slower and quick writes faster than normal", () => {
  assert.ok(PACE_FACTOR.calm > PACE_FACTOR.normal && PACE_FACTOR.quick < PACE_FACTOR.normal);
});
