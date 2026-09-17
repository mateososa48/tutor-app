import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPolicy,
  currentState,
  cues,
  detectSignals,
  formatMemory,
  formatTutorState,
  looksLikeAnswer,
  noteStudentUtterance,
  parseHelpLevel,
  recordAttempt,
  rememberNote,
  spokenMath,
  suggestHelp,
  takeStateUpdate,
  boardResultExtras,
  cancelAttempt,
  noteAnswerChecked,
  noteTutorTurn,
  setSessionFiles,
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

test("answer-like student lines are told apart from questions, steps and idk", () => {
  // Lines from the Sept 15 recordings and the eval scenarios.
  for (const yes of ["7", "10", "3?", "um, 2/5?", "ok thats 100", "so x = 16?", "oh wait, divide by 2. x = 4", "x = 9", "is it 20? probably wrong", "negative 8", "a half?", "18 divided by 3?", "3x - 5 = 7, so x is 4", "I think 7", "vielleicht 7?", "322"]) {
    assert.ok(looksLikeAnswer(yes), `should be an answer: ${yes}`);
  }
  for (const no of ["i dont know", "idk", "what?", "wait what", "ok", "yes", "subtract 3?", "add 10?", "divide by 2", "lets do part c", "can we do number 8", "can you help me with 2x + 3 = 11", "what is 25% of 80", "I have a right triangle with legs 6 and 8, what's the hypotenuse", "how do I add 1/2 and 1/3", "why is negative times negative positive", "for every 2 red marbles there are 3 blue ones and if I have 6 red how many blue are there", "a right triangle has legs 6 and 8 cm, find the hypotenuse", "hours studied and test scores: (1, 60), (2, 65). is there a trend", "the slope is 3 and it crosses at 1. whats the equation", ""]) {
    assert.ok(!looksLikeAnswer(no), `should not be an answer: ${no}`);
  }
});

test("spoken arithmetic is found; ordinary speech with numbers is not", () => {
  assert.equal(spokenMath("First, six squared is thirty six, and then eight squared."), "six squared is thirty six");
  assert.equal(spokenMath("because three times six is eighteen."), "three times six is eighteen");
  assert.equal(spokenMath("What's eighteen divided by three?"), "eighteen divided by three");
  assert.equal(spokenMath("so 11 - 3 is not it, 11 − 3 = 8"), "11 − 3 = 8");
  assert.equal(spokenMath("negative three plus five"), "negative three plus five");
  assert.equal(spokenMath("Let's start with problem number one."), null);
  assert.equal(spokenMath("Which one is bigger, two or three?"), null);
  assert.equal(spokenMath("One more thing: for every one unit across, we go up two."), null);
  assert.equal(spokenMath("So the equation is y equals mx plus b."), null);
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

test("'I don't know' on a skill counts as stuck without any tool call", () => {
  const p = createPolicy(0);
  noteStudentUtterance(p, "i dont know", 0);
  assert.equal(p.attempts.length, 0, "no skill yet, nothing to record");
  recordAttempt(p, { skill: "slope", result: "partial", help: 2 }, 0);
  noteStudentUtterance(p, "idk", 1000);
  assert.deepEqual(p.attempts.map((a) => [a.result, a.help, a.auto]), [["partial", 2, undefined], ["stuck", 2, true]]);
  noteStudentUtterance(p, "I don't know if it's 4", 2000);
  assert.equal(p.attempts.length, 2, "an answer with doubt is not stuck");
});

test("a cancelled tool call takes its attempt back", () => {
  const p = createPolicy(0);
  recordAttempt(p, { skill: "slope", result: "correct", help: 1, callId: "a" }, 0);
  recordAttempt(p, { skill: "slope", result: "slip", help: 1, callId: "b" }, 0);
  assert.equal(p.missesInRow, 1);
  assert.equal(cancelAttempt(p, "b"), true);
  assert.equal(p.missesInRow, 0);
  assert.equal(p.quickCorrect, 1);
  assert.deepEqual(p.attempts.map((a) => a.callId), ["a"]);
  assert.equal(cancelAttempt(p, "zzz"), false);
});

test("each nudge rides on one board result", () => {
  const p = createPolicy(0);
  noteStudentUtterance(p, "x = 16", 0);
  const first = boardResultExtras(p, 0);
  assert.match(first, /\[Unchecked answer: the student said "x = 16"\. Call check_answer/);
  assert.doesNotMatch(boardResultExtras(p, 0), /Unchecked answer/, "once");
  noteStudentUtterance(p, "so 4?", 0);
  noteAnswerChecked(p);
  assert.doesNotMatch(boardResultExtras(p, 0), /Unchecked answer/, "checked answers are not nudged");

  noteTutorTurn(p, "Six squared is thirty six, and eight squared is sixty four.", false);
  assert.match(boardResultExtras(p, 0), /\[Said, not written: you said "Six squared is thirty six/);
  assert.doesNotMatch(boardResultExtras(p, 0), /Said, not written/);
  noteTutorTurn(p, "Six squared is thirty six.", true);
  assert.doesNotMatch(boardResultExtras(p, 0), /Said, not written/, "a turn that drew is fine");

  recordAttempt(p, { skill: "adding fractions", result: "misconception", help: 1, note: "adds tops and bottoms" }, 0);
  assert.match(boardResultExtras(p, 0), /\[Memory: a wrong idea came up \(adds tops and bottoms\)\. .*remember_about_student/);
  noteStudentUtterance(p, "ok bye, gotta go", 0);
  assert.match(boardResultExtras(p, 0), /\[Memory: they are leaving and nothing was saved/);
  rememberNote(p, "adds tops and bottoms");
  noteStudentUtterance(p, "bye", 0);
  assert.doesNotMatch(boardResultExtras(p, 0), /\[Memory: they are leaving/, "a saved note answers it");
});

test("uploaded files are brought up every few results", () => {
  const p = createPolicy(0);
  setSessionFiles(p, [{ label: "File 1", name: "sheet.pdf", pages: 3 }], 0);
  const lines = Array.from({ length: 6 }, () => boardResultExtras(p, 1000));
  assert.equal(lines.filter((l) => l.includes("[Files:")).length, 1);
  assert.match(lines[5], /File 1 "sheet\.pdf" \(3 pages\)\. When the student names a problem or a part, call look_at_worksheet/);
  assert.match(boardResultExtras(p, 1000 + 3 * 60_000), /\[Files:/, "or every three minutes");
});
