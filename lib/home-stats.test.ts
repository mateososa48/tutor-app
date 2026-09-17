import { strict as assert } from "node:assert";
import { test } from "node:test";
import { formatWeekTotal, sessionHeadline, sessionMeta, shortDay, weekStats } from "./home-stats";

// Wednesday, Sept 16 2026, 3 pm local.
const NOW = new Date(2026, 8, 16, 15, 0).getTime();
const at = (daysBack: number, hour = 10) => new Date(2026, 8, 16 - daysBack, hour).getTime();

test("the week runs seven days, oldest first, ending today", () => {
  const stats = weekStats(
    [
      { startedAt: at(0), durationSec: 20 * 60 },
      { startedAt: at(0, 12), durationSec: 5 * 60 },
      { startedAt: at(1), durationSec: 18 * 60 },
      { startedAt: at(6), durationSec: 30 },
      { startedAt: at(7), durationSec: 60 * 60 },
    ],
    NOW,
  );
  assert.equal(stats.days.length, 7);
  assert.equal(stats.days[6].today, true);
  assert.equal(stats.days[6].label, "W");
  assert.equal(stats.days[0].label, "T");
  assert.equal(stats.days[6].seconds, 25 * 60);
  assert.equal(stats.days[5].seconds, 18 * 60);
  assert.equal(stats.totalSec, 43 * 60 + 30, "the session eight days ago is outside the week");
  assert.equal(stats.activeDays, 2, "a 30-second day does not count as active");
});

test("week totals read like the mockup", () => {
  assert.equal(formatWeekTotal(0), "0 min");
  assert.equal(formatWeekTotal(45 * 60), "45 min");
  assert.equal(formatWeekTotal(84 * 60), "1 h 24 min");
  assert.equal(formatWeekTotal(120 * 60), "2 h");
});

test("short days: today, yesterday, weekday, then a date", () => {
  assert.equal(shortDay(at(0), NOW), "Today");
  assert.equal(shortDay(at(1), NOW), "Yesterday");
  assert.equal(shortDay(at(3), NOW), "Sunday");
  assert.equal(shortDay(at(8), NOW), "Sep 8");
  assert.equal(shortDay(new Date(2025, 11, 30).getTime(), NOW), "Dec 30, 2025");
});

test("the meta line adds minutes only when the session ran", () => {
  assert.equal(sessionMeta({ startedAt: at(1), durationSec: 18 * 60 }, NOW), "Yesterday, 18 min");
  assert.equal(sessionMeta({ startedAt: at(1), durationSec: 5 }, NOW), "Yesterday");
});

test("untitled sessions take their name from the student's ask", () => {
  const { title, recap } = sessionHeadline({
    title: "Session",
    transcript: [
      { id: "1", role: "student", text: "I need help with: solving 3(x - 2) = 12 I uploaded a picture of it. Please teach me in English." },
      { id: "2", role: "tutor", text: "Let's look at it together." },
      { id: "3", role: "tutor", text: "Distribute first, then undo the subtraction. Nice work today!" },
    ],
  });
  assert.equal(title, "solving 3(x - 2) = 12");
  assert.equal(recap, "Distribute first, then undo the subtraction.");
});

test("named sessions keep their title, and an empty transcript gives no recap", () => {
  assert.deepEqual(sessionHeadline({ title: "Slope from two points", transcript: [] }), { title: "Slope from two points", recap: "" });
  assert.deepEqual(sessionHeadline({ title: "Session", transcript: [] }), { title: "Untitled session", recap: "" });
});

test("long lines are trimmed with an ellipsis", () => {
  const { recap } = sessionHeadline({ title: "Fractions", transcript: [{ id: "1", role: "tutor", text: "x".repeat(120) }] });
  assert.ok(recap.length <= 80);
  assert.ok(recap.endsWith("…"));
});
