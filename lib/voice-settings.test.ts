import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TUTOR_SPEED,
  normalizeTutorSpeed,
  TUTOR_SPEEDS,
  tutorSpeedAt,
  tutorSpeedIndex,
  tutorSpeedLabel,
  tutorSpeedRate,
} from "./voice-settings";

test("five named speeds from slowest to very fast, rates rising", () => {
  assert.deepEqual(TUTOR_SPEEDS.map((s) => s.label), ["Slowest", "Slow", "Normal", "Fast", "Very fast"]);
  for (let i = 1; i < TUTOR_SPEEDS.length; i++) assert.ok(TUTOR_SPEEDS[i].rate > TUTOR_SPEEDS[i - 1].rate);
  assert.equal(tutorSpeedRate("normal"), 1);
});

test("the default is Slow, slower than the old 0.9x default", () => {
  assert.equal(DEFAULT_TUTOR_SPEED, "slow");
  assert.equal(tutorSpeedLabel(DEFAULT_TUTOR_SPEED), "Slow");
  assert.ok(tutorSpeedRate(DEFAULT_TUTOR_SPEED) < 0.9);
});

test("stored values are validated and fall back to the default", () => {
  assert.equal(normalizeTutorSpeed("fast"), "fast");
  assert.equal(normalizeTutorSpeed("very-fast"), "very-fast");
  assert.equal(normalizeTutorSpeed("0.9"), DEFAULT_TUTOR_SPEED);
  assert.equal(normalizeTutorSpeed(null), DEFAULT_TUTOR_SPEED);
  assert.equal(normalizeTutorSpeed("ludicrous"), DEFAULT_TUTOR_SPEED);
});

test("slider positions map to the nearest stop", () => {
  assert.equal(tutorSpeedAt(0), "slowest");
  assert.equal(tutorSpeedAt(2.4), "normal");
  assert.equal(tutorSpeedAt(4), "very-fast");
  assert.equal(tutorSpeedAt(9), "very-fast");
  assert.equal(tutorSpeedAt(-3), "slowest");
  assert.equal(tutorSpeedAt(Number.NaN), DEFAULT_TUTOR_SPEED);
  assert.equal(tutorSpeedIndex("normal"), 2);
});
