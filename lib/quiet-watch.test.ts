import { test } from "node:test";
import assert from "node:assert/strict";
import { asksToWait, quietStep, QUIET_CHECKIN_AFTER_MS, QUIET_HINT_AFTER_MS, type QuietInput } from "./quiet-watch";

const base: QuietInput = { now: 0, active: true, tutorBusy: false, tutorQuietSince: 1000, lastStudentAt: 500, askedToWait: false, checkedInFor: 0 };

test("nothing before 20 s, a quiet hint at 20 s, one check-in at 45 s", () => {
  assert.deepEqual(quietStep({ ...base, now: 1000 + QUIET_HINT_AFTER_MS - 1 }), { hint: false, checkIn: false, sinceMs: QUIET_HINT_AFTER_MS - 1 });
  assert.equal(quietStep({ ...base, now: 1000 + QUIET_HINT_AFTER_MS }).hint, true);
  const due = quietStep({ ...base, now: 1000 + QUIET_CHECKIN_AFTER_MS });
  assert.equal(due.hint, true);
  assert.equal(due.checkIn, true);
  assert.equal(quietStep({ ...base, now: 1000 + QUIET_CHECKIN_AFTER_MS + 5000, checkedInFor: 1000 }).checkIn, false, "once a turn");
});

test("the student's own activity, a busy tutor, or an inactive session stops it", () => {
  const late = 1000 + QUIET_CHECKIN_AFTER_MS;
  assert.equal(quietStep({ ...base, now: late, lastStudentAt: 1200 }).hint, false);
  assert.equal(quietStep({ ...base, now: late, tutorBusy: true }).hint, false);
  assert.equal(quietStep({ ...base, now: late, active: false }).hint, false);
  assert.equal(quietStep({ ...base, now: late, tutorQuietSince: 0 }).hint, false, "the tutor has not spoken yet");
});

test("asking for time skips the check-in but keeps the hint", () => {
  const s = quietStep({ ...base, now: 1000 + QUIET_CHECKIN_AFTER_MS, askedToWait: true });
  assert.equal(s.hint, true);
  assert.equal(s.checkIn, false);
  assert.equal(s.skipped, "asked to wait");
});

test("what counts as asking for time", () => {
  for (const yes of ["wait", "hold on a sec", "let me think", "hang on", "give me a minute", "um I'm thinking"]) assert.equal(asksToWait(yes), true, yes);
  for (const no of ["5/12", "i dont know", "the second one", "waiter"]) assert.equal(asksToWait(no), false, no);
});
