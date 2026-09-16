import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPolicy,
  currentState,
  cues,
  detectSignals,
  formatMemory,
  formatTutorState,
  noteStudentUtterance,
  parseHelpLevel,
  recordAttempt,
  rememberNote,
  suggestHelp,
  takeStateUpdate,
} from "./tutor-policy";

const T0 = 1_000_000;

test("detects what the student's words signal", () => {
  assert.deepEqual(detectSignals("I'm so bad at this"), ["frustrated"]);
  assert.ok(detectSignals("ugh I give up").includes("frustrated"));
  assert.ok(detectSignals("I don't get it").includes("confused"));
  assert.ok(detectSignals("wait, what?").includes("confused"));
  assert.ok(detectSignals("idk").includes("idk"));
  assert.ok(detectSignals("18. easy").includes("bored"));
  assert.ok(!detectSignals("this is not easy").includes("bored"));
  assert.ok(detectSignals("x is 4? I think").includes("unsure"));
  assert.ok(detectSignals("4?").includes("unsure"));
  assert.deepEqual(detectSignals("subtract 3 from both sides"), []);
  assert.deepEqual(detectSignals("okay that makes sense"), []);
});

test("no attempts and no signals means no state line", () => {
  const p = createPolicy(T0);
  assert.equal(formatTutorState(p, T0), "");
  assert.equal(suggestHelp(p), null);
});

test("misses in a row raise the suggested help", () => {
  const p = createPolicy(T0);
  recordAttempt(p, { skill: "Adding fractions", result: "slip", help: 2 }, T0);
  assert.equal(suggestHelp(p)?.level, 2);
  recordAttempt(p, { skill: "adding  fractions", result: "slip", help: 2 }, T0);
  assert.deepEqual(suggestHelp(p), { level: 3, why: "2 misses in a row" });
  recordAttempt(p, { skill: "adding fractions", result: "guess", help: 3 }, T0);
  assert.equal(suggestHelp(p)?.level, 4);
  const line = formatTutorState(p, T0 + 14 * 60_000);
  assert.match(line, /skill "adding fractions": 0 of 3 right/);
  assert.match(line, /3 misses in a row \(last: guess\)/);
  assert.match(line, /suggested help H4/);
  assert.match(line, /down: shrink the step/);
  assert.match(line, /14 min in/);
  assert.ok(line.length < 400, `line too long: ${line.length}`);
});

test("quick right answers lower help and cue a harder problem", () => {
  const p = createPolicy(T0);
  recordAttempt(p, { skill: "two-step equations", result: "correct", help: 1 }, T0);
  recordAttempt(p, { skill: "two-step equations", result: "correct", help: 1 }, T0);
  assert.equal(suggestHelp(p)?.level, 0);
  assert.ok(cues(p).some((c) => c.startsWith("up:")));
  recordAttempt(p, { skill: "two-step equations", result: "correct", help: 4 }, T0);
  assert.ok(!cues(p).some((c) => c.startsWith("up:")), "a right answer with lots of help resets the streak");
  assert.deepEqual(suggestHelp(p), { level: 3, why: "last answer right: fade one level" });
});

test("a wrong idea asks for a case where it breaks; switching skill resets misses", () => {
  const p = createPolicy(T0);
  recordAttempt(p, { skill: "adding fractions", result: "misconception", help: 1 }, T0);
  assert.equal(suggestHelp(p)?.level, 2);
  assert.match(suggestHelp(p)?.why ?? "", /wrong idea/);
  recordAttempt(p, { skill: "adding fractions", result: "slip", help: 2 }, T0);
  recordAttempt(p, { skill: "percent of an amount", result: "stuck", help: 1 }, T0);
  assert.equal(p.missesInRow, 1);
});

test("feelings come first: frustration cues down and blocks up", () => {
  const p = createPolicy(T0);
  recordAttempt(p, { skill: "negatives", result: "correct", help: 0 }, T0);
  recordAttempt(p, { skill: "negatives", result: "correct", help: 0 }, T0);
  noteStudentUtterance(p, "I'm so bad at math");
  const c = cues(p);
  assert.ok(c[0].startsWith('down: sounds frustrated ("I\'m so bad at math")'));
  assert.ok(!c.some((x) => x.startsWith("up:")));
  noteStudentUtterance(p, "ok");
  noteStudentUtterance(p, "ok");
  assert.ok(!cues(p).some((x) => x.startsWith("down: sounds frustrated")), "signals fade after two utterances");
});

test("unsure but right asks them to check; bored cues up; idk asks for smaller", () => {
  const p = createPolicy(T0);
  noteStudentUtterance(p, "x is 4? I think");
  recordAttempt(p, { skill: "two-step equations", result: "correct", help: 2 }, T0);
  assert.ok(cues(p).some((c) => c.startsWith("unsure but right")));
  noteStudentUtterance(p, "too easy");
  assert.ok(cues(p).some((c) => c.startsWith("up:")));
  const q = createPolicy(T0);
  noteStudentUtterance(q, "idk");
  assert.ok(cues(q).some((c) => c.startsWith("said they don't know")));
});

test("mixed review comes due after four solved on one skill", () => {
  const p = createPolicy(T0);
  for (let i = 0; i < 4; i++) recordAttempt(p, { skill: "slope", result: "correct", help: 3 }, T0);
  assert.ok(cues(p).some((c) => c.startsWith("mixed review due")));
  recordAttempt(p, { skill: "negatives", result: "correct", help: 1 }, T0);
  assert.ok(!cues(p).some((c) => c.startsWith("mixed review due")));
});

test("state updates are only re-sent when something changed", () => {
  const p = createPolicy(T0);
  assert.equal(takeStateUpdate(p, T0), "");
  recordAttempt(p, { skill: "slope", result: "slip", help: 1 }, T0);
  assert.match(takeStateUpdate(p, T0), /^\[Tutor state: /);
  assert.equal(takeStateUpdate(p, T0 + 5 * 60_000), "", "the clock alone is not a change");
  recordAttempt(p, { skill: "slope", result: "slip", help: 1 }, T0);
  assert.notEqual(takeStateUpdate(p, T0), "");
  assert.match(currentState(p, T0), /\[Tutor state: /);
  assert.equal(takeStateUpdate(p, T0), "", "currentState marks the line as seen");
});

test("help levels parse from H0–H5 or numbers", () => {
  assert.equal(parseHelpLevel("H3"), 3);
  assert.equal(parseHelpLevel("h0"), 0);
  assert.equal(parseHelpLevel(5), 5);
  assert.equal(parseHelpLevel("H6"), null);
  assert.equal(parseHelpLevel("lots"), null);
});

test("durable notes are deduplicated, capped, and formatted", () => {
  const p = createPolicy(T0);
  assert.equal(formatMemory(p), "");
  rememberNote(p, "adds tops and bottoms");
  rememberNote(p, "adds tops and bottoms");
  assert.equal(p.notes.length, 1);
  for (let i = 0; i < 15; i++) rememberNote(p, `note ${i}`);
  assert.equal(p.notes.length, 12);
  assert.match(formatMemory(p), /^\[Memory: note 3; /);
});
