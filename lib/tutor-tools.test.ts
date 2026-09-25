import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGACY_TUTOR_TOOL_DECLARATIONS, TUTOR_FUNCTION_TOOLS, TUTOR_TOOL_DECLARATIONS, TUTOR_TOOL_NAMES, attemptFromVerdict, runTutorTool, autoCheck, takeAutoCheckNote } from "./tutor-tools";
import { SESSION_TOOL_NAMES } from "./session-tools";
import { WHITEBOARD_TOOL_DECLARATIONS } from "./whiteboard-tools";
import { buildBackendInstructions, buildGeminiInstructions } from "./tutor-prompts";
import { createPolicy, noteStudentUtterance, noteBoardWrite } from "./tutor-policy";

test("tutor tools do not collide with whiteboard tools and convert for Responses", () => {
  const board = new Set(WHITEBOARD_TOOL_DECLARATIONS.map((d) => d.name));
  for (const name of TUTOR_TOOL_NAMES) assert.ok(!board.has(name), `${name} collides with a whiteboard tool`);
  assert.equal(TUTOR_FUNCTION_TOOLS.length, TUTOR_TOOL_DECLARATIONS.length);
  assert.ok(TUTOR_FUNCTION_TOOLS.every((t) => t.type === "function" && t.strict === false));
});

test("learning tools require an honest help level and a structured teaching move", () => {
  const check = TUTOR_TOOL_DECLARATIONS.find((tool) => tool.name === "check_answer");
  assert.ok(check);
  assert.ok(check.parameters.required.includes("help_level"));
  // The help given travels with check_answer now (Sept 24 2026); the old tool
  // is kept only for recordings and scripts, and the model is not offered it.
  assert.equal(TUTOR_TOOL_DECLARATIONS.find((tool) => tool.name === "record_teaching_move"), undefined);
  const checkProps = check.parameters.properties as unknown as Record<string, { type?: string; items?: { enum?: readonly string[] } }>;
  assert.ok(checkProps.moves?.items?.enum?.includes("worked_example"));
  assert.equal(checkProps.misconception?.type, "string");
  assert.equal(checkProps.working?.type, "array");
  const move = LEGACY_TUTOR_TOOL_DECLARATIONS.find((tool) => tool.name === "record_teaching_move");
  assert.ok(move);
  assert.deepEqual(move.parameters.required, ["skill", "help_level", "move"]);
  assert.deepEqual(move.parameters.properties.help_level.enum, ["H0", "H1", "H2", "H3", "H4", "H5"]);
  const properties = move.parameters.properties as unknown as Record<string, { enum?: readonly string[] }>;
  assert.ok(properties.move?.enum?.includes("worked_example"));
  assert.ok(properties.strategy?.enum?.includes("counterexample"));
});

test("check_answer returns a verdict and validates its arguments", () => {
  const p = createPolicy(0);
  const r = runTutorTool("check_answer", { problem: "1/2 + 1/3", student_answer: "2/5" }, p, 0);
  assert.ok(r && r.success);
  assert.match(r.message ?? "", /^Verdict: incorrect\./);
  const bad = runTutorTool("check_answer", { problem: 3 }, p, 0);
  assert.ok(bad && !bad.success);
});

test("check_answer records the attempt and answers with the state line", () => {
  const p = createPolicy(0);
  const r = runTutorTool("check_answer", { problem: "1/2 + 1/3", student_answer: "2/5", skill: "adding fractions", help_level: "H1", kind: "misconception" }, p, 0, "call-1");
  assert.ok(r && r.success);
  assert.match(r.message ?? "", /\[Tutor state: .*skill "adding fractions": 0 of 1 right/);
  assert.deepEqual(p.attempts.map((a) => [a.result, a.help, a.callId]), [["misconception", 1, "call-1"]]);
  // A right answer: the tutor writes it and rings it, and the flow's next order rides in the state line.
  const right = runTutorTool("check_answer", { problem: "2x + 3 = 11", student_answer: "x = 4", skill: "two-step equations" }, p, 0);
  assert.match(right && right.success ? right.message ?? "" : "", /Verdict: correct\. .*step ALONE · next: one of the same kind with new numbers/);
  assert.doesNotMatch(right && right.success ? right.message ?? "" : "", /no hints/);
  assert.match(right && right.success ? right.message ?? "" : "", /add_student_attempt with their exact words, then circle_item on it with keep=true/);
  // What the checker cannot judge counts neither way.
  const misses = p.missesInRow;
  runTutorTool("check_answer", { problem: "x + y = 5", student_answer: "3", skill: "two-step equations" }, p, 0);
  assert.equal(p.attempts.at(-1)?.result, "unchecked");
  assert.equal(p.missesInRow, misses);
  assert.equal(runTutorTool("record_attempt", { skill: "x", result: "correct", help_level: "H1" }, p, 0), null, "record_attempt is gone");
  assert.equal(runTutorTool("draw_fraction", {}, p, 0), null);
});

test("wrong answers keep the kind the tutor saw", () => {
  assert.equal(attemptFromVerdict("incorrect"), "incorrect");
  assert.equal(attemptFromVerdict("incorrect", "slip"), "slip");
  assert.equal(attemptFromVerdict("incorrect", "nonsense"), "incorrect");
  assert.equal(attemptFromVerdict("correct", "slip"), "correct");
  assert.equal(attemptFromVerdict("cannot_check"), "unchecked");
});

test("every tool named in the prompt examples is declared", () => {
  const declared = new Set([...WHITEBOARD_TOOL_DECLARATIONS.map((d) => d.name), ...TUTOR_TOOL_NAMES, ...SESSION_TOOL_NAMES]);
  for (const text of [buildBackendInstructions(null, []), buildGeminiInstructions(null, [])]) {
    const lines = text.split("\n").filter((l) => l.startsWith("Tool calls:"));
    assert.ok(lines.length >= 8, `expected example tool-call lines, got ${lines.length}`);
    for (const line of lines) {
      for (const m of line.matchAll(/\b([a-z]+(?:_[a-z]+)+)\(/g)) assert.ok(declared.has(m[1]), `undeclared tool in an example: ${m[1]}`);
    }
  }
});

test("the flow says what comes next: alone, then why, then harder now", () => {
  const p = createPolicy(0);
  const msg = (r: ReturnType<typeof runTutorTool>) => (r && r.success ? r.message ?? "" : "");
  const check = (problem: string, answer: string, help = "H0") =>
    msg(runTutorTool("check_answer", { problem, student_answer: answer, skill: "two-step equations", help_level: help }, p, 0));
  // Solved with a lot of help: a similar one together first (Sept 23 2026:
  // "no hints" straight after heavy help left the student with "I don't know").
  const together = check("2x + 3 = 11", "4", "H3");
  assert.match(together, /step TOGETHER · next: that one needed help: another of the same kind together/);
  // A new problem goes on the board, not just into the air.
  assert.match(together, /start_new_problem, write it, and ask/);
  // A light nudge: next is a fresh one alone.
  assert.match(check("4x + 2 = 14", "3", "H1"), /step ALONE/);
  // First right alone, no reason heard yet: ask why.
  assert.match(check("3x + 1 = 10", "3"), /step WHY · next: ask how they know/);
  noteStudentUtterance(p, "because you undo the plus first, then the times");
  // Second right alone on a different problem, with a reason: go harder now.
  const up = check("5x - 4 = 21", "5");
  assert.match(up, /step UP · next: they've shown it/);
  assert.match(up, /Go harder now: start_new_problem/);
  // The same problem twice is not two problems.
  const q = createPolicy(0);
  const again = (help = "H0") => runTutorTool("check_answer", { problem: "3x + 1 = 10", student_answer: "3", skill: "eq", help_level: help }, q, 0);
  again();
  noteStudentUtterance(q, "because 3 times 3 is 9 plus 1 is 10");
  assert.doesNotMatch(msg(again()), /step UP/);
  // Two misses: show it a different way.
  const r = createPolicy(0);
  runTutorTool("check_answer", { problem: "2x = 8", student_answer: "6", skill: "eq", help_level: "H1" }, r, 0);
  assert.match(msg(runTutorTool("check_answer", { problem: "2x = 8", student_answer: "2", skill: "eq", help_level: "H1" }, r, 0)), /step SHOW · next: draw this problem as a picture/);
});

import { stepOfPage } from "./tutor-tools";

test("a checked step inside the problem on the board is not a finished problem", () => {
  const eq = "$3x + 7 = 25$";
  assert.equal(stepOfPage(eq, "25 - 7", "18"), true);
  assert.equal(stepOfPage(eq, "18/3", "6"), false, "6 is the problem's answer, whatever line it was asked on");
  assert.equal(stepOfPage(eq, "3x + 7 = 25", "6"), false);
  assert.equal(stepOfPage("Solve $5(x - 2) = 20$", "20/5", "4"), true);
  assert.equal(stepOfPage("Solve $5(x - 2) = 20$", "x - 2 = 4", "5"), true, "a wrong answer to a line of the working is still a step");
  assert.equal(stepOfPage("What is 25% of 80?", "10% of 80", "8"), false, "quick practice said out loud is a problem of its own");
  assert.equal(stepOfPage(null, "25 - 7", "18"), false);
  // A word problem the checker cannot read: its arithmetic is steps (Sept 23 2026:
  // each one was ringed green and counted as the problem solved).
  const words = "For every $3$ cats there are $5$ dogs. There are $40$ animals in total. How many dogs are there?";
  assert.equal(stepOfPage(words, "3 + 5", "8"), true);
  assert.equal(stepOfPage(words, "40 / 8", "5"), true);
  assert.equal(stepOfPage(words, "How many dogs?", "25"), false, "the question itself is not arithmetic");
  // A box on the board is the page's working: "1/2 = ?/6" while adding 1/2 + 1/3.
  assert.equal(stepOfPage("$\\frac{1}{2} + \\frac{1}{3}$", "1/2 = ?/6", "3"), true);
  assert.equal(stepOfPage("$\\frac{1}{2} + \\frac{1}{3}$", "3/6 + 2/6 = ?", "5/6"), false, "the answer that solves the page is final");
});

test("the recorded session's flow: steps keep them on the problem; solved with help means the same kind again", () => {
  const p = createPolicy(0);
  const msg = (r: ReturnType<typeof runTutorTool>) => (r && r.success ? r.message ?? "" : "");
  const check = (problem: string, answer: string, help: string, skill = "two-step equations") =>
    msg(runTutorTool("check_answer", { problem, student_answer: answer, skill, help_level: help }, p, 0));
  noteBoardWrite(p, "start_new_problem", { problem: "$3x + 7 = 25$" });
  const step = check("25 - 7", "18", "H3", "subtraction");
  assert.match(step, /that step is done, not the problem/);
  assert.doesNotMatch(step, /start_new_problem/, "a step never sends it to a new problem");
  assert.match(step, /add_student_attempt with their exact words; no mark on it yet/, "a step is written, not ringed");
  const solved = check("18/3", "6", "H4", "division");
  assert.match(solved, /step TOGETHER/);
  assert.match(solved, /another of the same kind together/);
  // A number for the answer is fine.
  assert.match(msg(runTutorTool("check_answer", { problem: "20/5", student_answer: 4, skill: "division" }, p, 0)), /Verdict: correct/);
});

test("two misses in a row: draw this problem as a picture", () => {
  const p = createPolicy(0);
  noteBoardWrite(p, "start_new_problem", { problem: "Solve $5(x - 2) = 20$" });
  runTutorTool("check_answer", { problem: "5(x - 2) = 20", student_answer: "2", skill: "equations", help_level: "H1" }, p, 0);
  const r = runTutorTool("check_answer", { problem: "5(x - 2) = 20", student_answer: "3", skill: "equations", help_level: "H1" }, p, 0);
  assert.match(r && r.success ? r.message ?? "" : "", /draw this problem as a picture/);
});

test("check_answer reads a box on the way through the page's equation", () => {
  const p = createPolicy(0);
  noteBoardWrite(p, "start_new_problem", { problem: "Solve $4(x - 2) = 20$" });
  const r = runTutorTool("check_answer", { problem: "x - 2 = ?", student_answer: "5", skill: "two-step equations", help_level: "H1" }, p, 0);
  assert.match(r && r.success ? r.message ?? "" : "", /Verdict: correct/);
  assert.equal(p.attempts.at(-1)?.step, true, "a box of the working is a step");
});

test("check_answer counts the board's help, asks for spoken working, and keeps a move a step", () => {
  const p = createPolicy(0);
  noteBoardWrite(p, "start_new_problem", { problem: "$\\frac{3}{10} + \\frac{1}{9}$" });
  noteBoardWrite(p, "draw_fraction", { fraction: "3/10", second_fraction: "1/9", common_denominator: 90 });
  noteStudentUtterance(p, "so first I make both 90ths, so 27/90 and 10/90");
  const move = runTutorTool("check_answer", { problem: "3/10 + 1/9", student_answer: "27/90 + 10/90", skill: "adding fractions", help_level: "H1" }, p, 0);
  const msg = move && move.success ? move.message ?? "" : "";
  assert.doesNotMatch(msg, /circle_item/, "a first move is not the answer");
  assert.match(msg, /Their working \("so first I make both 90ths/);
  assert.equal(p.attempts.at(-1)?.step, true);
  assert.equal(p.attempts.at(-1)?.help, 4, "the recut picture was H4 help, whatever the tutor declared");
  noteStudentUtterance(p, "37/90");
  const final = runTutorTool("check_answer", { problem: "3/10 + 1/9", student_answer: "37/90", skill: "adding fractions", help_level: "H0" }, p, 0);
  assert.match(final && final.success ? final.message ?? "" : "", /circle_item on it with keep=true/);
  assert.equal(p.boardHelp, 0, "a finished problem clears the board's help");
  noteStudentUtterance(p, "show it on the board");
  const shown = runTutorTool("check_answer", { problem: "1/2 + 1/4", student_answer: "3/4", skill: "adding fractions" }, p, 0);
  assert.match(shown && shown.success ? shown.message ?? "" : "", /They asked to see it on the board/);
});

// The auto-check (Sept 25 2026): an answer to what the board asked is checked
// by the code, handed to the model as a note, and not recorded twice.
test("auto-check: a typed answer to the board's question is checked once and reused by check_answer", () => {
  const p = createPolicy(0);
  noteBoardWrite(p, "start_new_problem", { title: "Percent", problem: "15% of 100", ask: "What is 15% of 100?" });
  assert.equal(p.lastAsked, "What is 15% of 100?");
  noteStudentUtterance(p, "15", 1000);
  const note = autoCheck(p, "15", 1000);
  assert.ok(note && /Answer check, not from the student: "15" → correct/.test(note), note ?? "no note");
  assert.match(note!, /add_student_attempt/);
  assert.match(note!, /circle_item keep=true/);
  assert.equal(p.attempts.length, 1);
  assert.equal(p.attempts[0].auto, true);
  assert.equal(p.pendingAnswer, null, "the unchecked-answer nudge is off");
  assert.equal(takeAutoCheckNote(p), note);
  assert.equal(takeAutoCheckNote(p), null, "the note goes out once");
  const r = runTutorTool("check_answer", { problem: "15% of 100", student_answer: "15", skill: "percent", help_level: "H1" }, p, 2000);
  assert.ok(r && r.success);
  assert.match(r!.success ? r!.message ?? "" : "", /Verdict: correct/);
  assert.equal(p.attempts.length, 1, "the same answer is recorded once");
  const wrong = createPolicy(0);
  noteBoardWrite(wrong, "add_callout", { text: "What is 5 × 6?" });
  const w = autoCheck(wrong, "35", 0);
  assert.ok(w && /→ incorrect/.test(w) && /don't say the answer/i.test(w));
  assert.equal(autoCheck(createPolicy(0), "35", 0), null, "nothing asked, nothing checked");
  const chat = createPolicy(0);
  noteBoardWrite(chat, "add_callout", { text: "What is 5 × 6?" });
  assert.equal(autoCheck(chat, "i dont know", 0), null);
  assert.equal(autoCheck(chat, "can we do the next one", 0), null);
});
