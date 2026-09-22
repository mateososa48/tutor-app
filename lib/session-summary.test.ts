import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSummaryPrompt,
  EMPTY_STATS,
  LIMITS,
  parseSummary,
  readSummary,
  statsLine,
  SUMMARY_SYSTEM,
  SUMMARY_VERSION,
  type SessionStats,
} from "./session-summary";

const stats: SessionStats = {
  durationSec: 1440,
  checked: 5,
  correct: 4,
  independent: 2,
  skills: ["fractions.add-unlike"],
  pictures: 7,
};

const good = {
  headline: "Adding fractions with different bottoms",
  recap: "You started by adding the bottoms, then spotted it yourself once the pieces were drawn.",
  wins: ["You caught that 2/6 was wrong before I said anything.", "You found sixths for 1/2 and 1/3 on your own."],
  stuck: ["Finding a common denominator when neither number divides the other."],
  next: "Try 3/4 + 5/6 and draw it before you work it out.",
};

test("a good answer becomes a summary, with our stats and not the model's", () => {
  const summary = parseSummary(good, stats, { model: "test-model", now: 1_000 });
  assert.ok(summary);
  assert.equal(summary.v, SUMMARY_VERSION);
  assert.equal(summary.headline, good.headline);
  assert.equal(summary.wins.length, 2);
  assert.equal(summary.stuck.length, 1);
  assert.deepEqual(summary.stats, stats);
  assert.equal(summary.generatedAt, 1_000);
  assert.equal(summary.model, "test-model");
});

test("without a headline or a recap there is no summary to show", () => {
  assert.equal(parseSummary({ ...good, headline: "  " }, stats, { model: "m" }), null);
  assert.equal(parseSummary({ ...good, recap: undefined }, stats, { model: "m" }), null);
  assert.equal(parseSummary(null, stats, { model: "m" }), null);
  assert.equal(parseSummary("done", stats, { model: "m" }), null);
  assert.equal(parseSummary([], stats, { model: "m" }), null);
});

test("long, messy and over-long answers are trimmed rather than thrown away", () => {
  const summary = parseSummary(
    {
      headline: "x".repeat(200),
      recap: "line one\n\nline   two",
      wins: ["a".repeat(400), "  ", "b", "b", "c", "d", "e"],
      stuck: ["one", "two", "three"],
      next: "n".repeat(500),
      somethingElse: "ignored",
    },
    stats,
    { model: "m" },
  );
  assert.ok(summary);
  assert.equal(summary.headline.length, LIMITS.headline);
  assert.equal(summary.recap, "line one line two");
  // Blanks dropped, duplicates dropped, capped at three.
  assert.deepEqual(summary.wins, ["a".repeat(LIMITS.win), "b", "c"]);
  assert.equal(summary.stuck.length, LIMITS.stucks);
  assert.equal(summary.next.length, LIMITS.next);
  assert.equal("somethingElse" in summary, false);
});

test("an empty shaky list is a real answer, not a missing one", () => {
  const summary = parseSummary({ ...good, stuck: [], wins: [] }, stats, { model: "m" });
  assert.ok(summary);
  assert.deepEqual(summary.stuck, []);
  assert.deepEqual(summary.wins, []);
});

test("a stored summary reads back, and junk in the column reads as nothing", () => {
  const stored = parseSummary(good, stats, { model: "m", now: 42 });
  assert.equal(readSummary(stored)?.headline, good.headline);
  assert.equal(readSummary(stored)?.generatedAt, 42);
  assert.equal(readSummary({}), null);
  assert.equal(readSummary(null), null);
  assert.equal(readSummary({ headline: "only a headline" }), null);
  // A summary written before stats existed still reads.
  assert.deepEqual(readSummary({ ...good, model: "m" })?.stats, EMPTY_STATS);
});

test("the counts we computed are stated once, by us", () => {
  const line = statsLine(stats);
  assert.match(line, /24 minutes/);
  assert.match(line, /4 of 5 answers right/);
  assert.match(line, /2 with no help first/);
  assert.match(line, /7 board pictures/);
  assert.match(line, /fractions\.add-unlike/);
  // A session with nothing checked says only what it can.
  const quiet = statsLine({ ...EMPTY_STATS, durationSec: 40 });
  assert.equal(quiet, "1 minute");
});

test("the prompt carries the counts and the session, and keeps both ends when it has to cut", () => {
  const prompt = buildSummaryPrompt({ stats, transcript: "SHORT SESSION" });
  assert.match(prompt, /do not restate them/);
  assert.match(prompt, /4 of 5 answers right/);
  assert.match(prompt, /SHORT SESSION/);

  const long = `HEAD${"x".repeat(5000)}TAIL`;
  const cut = buildSummaryPrompt({ stats, transcript: long, maxChars: 1000 });
  assert.ok(cut.includes("HEAD"), "keeps the opening");
  assert.ok(cut.includes("TAIL"), "keeps the close, where the last attempts are");
  assert.match(cut, /left out to fit/);
  assert.ok(cut.length < long.length);
});

test("the instructions forbid the things that make a summary generic or wrong", () => {
  assert.match(SUMMARY_SYSTEM, /Never state a number/);
  assert.match(SUMMARY_SYSTEM, /Do not invent/);
  assert.match(SUMMARY_SYSTEM, /never for what is wrong with them/);
  assert.match(SUMMARY_SYSTEM, /great job/);
});
