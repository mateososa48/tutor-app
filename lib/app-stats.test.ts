import { strict as assert } from "node:assert";
import { test } from "node:test";
import { groupByTime, practiceStreak, practiceTotals, timeGroupLabel, weeklyPractice } from "./app-stats";

// Saturday, Oct 24 2026, 3 pm local.
const NOW = new Date(2026, 9, 24, 15, 0).getTime();
const at = (daysBack: number, hour = 10) => new Date(2026, 9, 24 - daysBack, hour).getTime();

test("groups: this week, last week, then months with a year when it differs", () => {
  assert.equal(timeGroupLabel(at(0), NOW), "This week");
  assert.equal(timeGroupLabel(at(6), NOW), "This week");
  assert.equal(timeGroupLabel(at(7), NOW), "Last week");
  assert.equal(timeGroupLabel(at(13), NOW), "Last week");
  assert.equal(timeGroupLabel(at(14), NOW), "October");
  assert.equal(timeGroupLabel(new Date(2026, 8, 3).getTime(), NOW), "September");
  assert.equal(timeGroupLabel(new Date(2025, 11, 3).getTime(), NOW), "December 2025");
});

test("groupByTime keeps the order and folds neighbours together", () => {
  const items = [at(0), at(2), at(8), at(20), at(40)].map((startedAt) => ({ startedAt }));
  assert.deepEqual(
    groupByTime(items, NOW).map((g) => [g.label, g.items.length]),
    [["This week", 2], ["Last week", 1], ["October", 1], ["September", 1]],
  );
});

test("weekly practice: twelve seven-day stretches ending today, oldest first", () => {
  const weeks = weeklyPractice(
    [
      { startedAt: at(0), durationSec: 600 },
      { startedAt: at(6), durationSec: 300 },
      { startedAt: at(7), durationSec: 120 },
      { startedAt: at(90), durationSec: 999 },
    ],
    12,
    NOW,
  );
  assert.equal(weeks.length, 12);
  assert.equal(weeks[11].current, true);
  assert.equal(weeks[11].seconds, 900);
  assert.equal(weeks[10].seconds, 120);
  assert.equal(weeks.reduce((s, w) => s + w.seconds, 0), 1020);
  assert.equal(weeks[11].label, "Oct 18");
});

test("a streak runs back from today, or from yesterday if today is still empty", () => {
  const day = (back: number) => ({ startedAt: at(back), durationSec: 300 });
  assert.equal(practiceStreak([day(0), day(1), day(2), day(4)], NOW), 3);
  assert.equal(practiceStreak([day(1), day(2)], NOW), 2);
  assert.equal(practiceStreak([day(2)], NOW), 0);
  assert.equal(practiceStreak([{ startedAt: at(0), durationSec: 20 }], NOW), 0);
});

test("totals count only sessions that ran a minute, and distinct days", () => {
  assert.deepEqual(
    practiceTotals([
      { startedAt: at(0), durationSec: 600 },
      { startedAt: at(0, 14), durationSec: 120 },
      { startedAt: at(3), durationSec: 10 },
    ]),
    { seconds: 720, sessions: 2, days: 1 },
  );
});

test("skills fall into their groups, revisits first, empty groups dropped", async () => {
  const { groupSkills, practiceQueue } = await import("./app-stats");
  const s = (status: Parameters<typeof groupSkills>[0][number]["status"], latestAttemptAt: number) => ({ status, latestAttemptAt });
  const states = [s("retained", 1), s("supported", 5), s("needs_revisit", 2), s("building", 9), s("review_due", 3)];
  assert.deepEqual(
    groupSkills(states).map((g) => [g.key, g.items.map((i) => i.latestAttemptAt)]),
    [["revisit", [2]], ["due", [3]], ["growing", [9, 5]], ["solid", [1]]],
  );
  assert.deepEqual(practiceQueue(states).map((i) => i.status), ["needs_revisit", "review_due", "building", "supported"]);
  assert.deepEqual(groupSkills([]), []);
});
