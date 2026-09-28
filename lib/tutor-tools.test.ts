import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGACY_TUTOR_TOOL_DECLARATIONS, TUTOR_FUNCTION_TOOLS, TUTOR_TOOL_DECLARATIONS, TUTOR_TOOL_NAMES, attemptFromVerdict, runTutorTool, autoCheck, takeAutoCheckNote, answerLine, applyVerdictMarks, withholdResult } from "./tutor-tools";
import { SESSION_TOOL_NAMES } from "./session-tools";
import { WHITEBOARD_TOOL_DECLARATIONS } from "./whiteboard-tools";
import { buildBackendInstructions, buildGeminiInstructions } from "./tutor-prompts";
import { createPolicy, noteStudentUtterance, noteBoardWrite, noteTutorTurn } from "./tutor-policy";

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

// Sept 25 2026: a wrong attempt stayed on the board uncrossed after the right
// answer went up beside it; the right answer's result now says to strike it.
test("a right answer after a wrong one orders the wrong one crossed out", () => {
  const p = createPolicy(0);
  noteBoardWrite(p, "start_new_problem", { title: "Integers", problem: "-7 - 4" });
  const wrong = runTutorTool("check_answer", { problem: "-7 - 4", student_answer: "11", skill: "integers", help_level: "H0" }, p, 0);
  assert.match(wrong && wrong.success ? wrong.message ?? "" : "", /no mark on it yet/);
  const right = runTutorTool("check_answer", { problem: "-7 - 4", student_answer: "-11", skill: "integers", help_level: "H2" }, p, 5000);
  const msg = right && right.success ? right.message ?? "" : "";
  assert.match(msg, /circle_item on it with keep=true/);
  assert.match(msg, /Then cross_out_step their earlier "11"/);
  assert.equal(p.lastWrongAttempt, null);
  const again = runTutorTool("check_answer", { problem: "6 - (-2)", student_answer: "8", skill: "integers", help_level: "H1" }, p, 9000);
  assert.doesNotMatch(again && again.success ? again.message ?? "" : "", /cross_out_step/);
});

test("auto-check reads the tutor's spoken question when nothing was asked on the board", () => {
  const p = createPolicy(0);
  noteBoardWrite(p, "start_new_problem", { title: "Decimals" });
  noteTutorTurn(p, "Okay. Which is bigger, 0.35 or 0.5?", true);
  const note = autoCheck(p, "0.5", 1000);
  assert.ok(note && /→ correct/.test(note), note ?? "no note");
  const q = createPolicy(0);
  noteBoardWrite(q, "start_new_problem", { title: "Decimals" });
  assert.equal(autoCheck(q, "0.5", 0), null, "a topic heading is not a problem to check against");
});

// Sept 25 2026, from Priya's Phase 4 session: the code checks what a student asserts.
test("the student's own arithmetic claim is auto-checked without a question on the board", () => {
  const p = createPolicy(0);
  const right = autoCheck(p, "oh wait so 9 minus 8 is 1?", 0);
  assert.ok(right && /"oh wait so 9 minus 8 is 1\?" → correct/.test(right), right ?? "no note");
  const wrong = autoCheck(createPolicy(0), "wait 2 times 3 is 7", 0);
  assert.ok(wrong && /→ incorrect/.test(wrong), wrong ?? "no note");
  assert.equal(autoCheck(createPolicy(0), "so 3 plus 1 is 4 over 4 which is 1", 0), null, "a chained claim is ambiguous");
  assert.equal(autoCheck(createPolicy(0), "so 0.2 is like 20 cents", 0), null, "no operation, no claim");
});

test("a spoken question with number words is kept for the auto-check", () => {
  const p = createPolicy(0);
  noteTutorTurn(p, "Careful there. What is negative three squared?", false);
  assert.equal(p.lastSpokenQuestion, "What is negative three squared?");
  const note = autoCheck(p, "um... 9?", 1000);
  assert.ok(note && /→ correct/.test(note), note ?? "no note");
});

// Sept 26 2026: code-owned marks.
test("a checked answer goes up as a short line in their hand, not their whole sentence", () => {
  assert.equal(answerLine("f(3) where f(x) = 2x + 1", "so f(3) is just put 3 in, so 7?"), "f(3) = 7");
  assert.equal(answerLine("9 - 8", "oh wait so 9 minus 8 is 1?"), "9 − 8 = 1");
  assert.equal(answerLine("Which is bigger: 0.35 or 0.5?", "fifty cents is bigger so 0.5 is bigger"), "0.5 > 0.35");
  assert.equal(answerLine("0.8 vs 0.75", "0.8 is bigger than 0.75?"), "0.8 > 0.75");
  assert.equal(answerLine("0.35 \\text{ vs } 0.5", "0.35 is bigger"), "0.35 > 0.5");
  assert.equal(answerLine("What is negative three squared?", "um... 9?"), "(-3)^2 = 9");
  assert.equal(answerLine("2 cups make 12 cookies. How many for 5 cups?", "wait 5 cups would be 30 not 15"), "5 cups would be 30 not 15");
  assert.equal(answerLine("What is 12 / 2?", "is it 6?"), "12 / 2 = 6");
  assert.equal(answerLine("How much is it worth after a year?", "idk 85?"), "85");
});

test("with code-owned marks the verdict plans the board move and says it is done", () => {
  const p = createPolicy(0);
  p.codeMarks = true;
  noteBoardWrite(p, "add_callout", { text: "What is 5 × 6?" });
  const wrong = autoCheck(p, "35", 0);
  assert.ok(wrong && /"5 × 6 = 35" is on the board in their hand\. Don't say right or yes\. Ask how they got it/.test(wrong), wrong ?? "");
  assert.deepEqual(p.pendingMarks, { line: "5 × 6 = 35", ring: false, strike: null });
  p.pendingMarks = null;
  const right = autoCheck(p, "oh 30", 1000);
  assert.ok(right && /"5 × 6 = 30" is on the board in their hand and ringed; their earlier "5 × 6 = 35" is crossed out/.test(right), right ?? "");
  assert.deepEqual(p.pendingMarks, { line: "5 × 6 = 30", ring: true, strike: "5 × 6 = 35" });
  assert.ok(!/add_student_attempt|circle_item/.test(right!), "no board order for the model");
  p.pendingMarks = null;
  const r = runTutorTool("check_answer", { problem: "5 * 6", student_answer: "30", skill: "multiplication" }, p, 2000);
  assert.ok(r && r.success && /already on the board in their hand, ringed/.test(r.message ?? ""), r && r.success ? r.message : "");
  assert.equal(p.pendingMarks, null, "not written twice");
});

test("a finished right answer to the next problem strikes the wrong line left from the last one", () => {
  // Maya: "0.35 > 0.5" was wrong; her fix was "the blue one", which nothing can
  // check; her next checked answer, 0.8 > 0.75, is right. Her old line is struck.
  const p = createPolicy(0);
  p.codeMarks = true;
  const wrong = runTutorTool("check_answer", { problem: "which is bigger, 0.35 or 0.5", student_answer: "0.35", skill: "comparing decimals" }, p, 0);
  assert.ok(wrong && wrong.success, "checked");
  assert.deepEqual(p.pendingMarks, { line: "0.35 > 0.5", ring: false, strike: null });
  p.pendingMarks = null;
  const right = runTutorTool("check_answer", { problem: "which is bigger, 0.8 or 0.75", student_answer: "0.8", skill: "comparing decimals" }, p, 60_000);
  assert.ok(right && right.success && /their earlier "0\.35 > 0\.5" is crossed out/.test(right.message ?? ""), right && right.success ? right.message : "");
  assert.deepEqual(p.pendingMarks, { line: "0.8 > 0.75", ring: true, strike: "0.35 > 0.5" });
});

test("the marks run through the board: line, then ring by id, then the strike by the wrong line's id", () => {
  const calls: string[] = [];
  let n = 0;
  const dispatch = (name: string, args: Record<string, unknown>) => {
    calls.push(`${name} ${JSON.stringify(args)}`);
    return name === "add_student_attempt" ? { success: true as const, message: `Student's attempt written in their hand (item b${++n})` } : { success: true as const, message: "ok" };
  };
  const ids = new Map<string, string>();
  applyVerdictMarks({ line: "5 × 6 = 35", ring: false, strike: null }, dispatch, ids);
  applyVerdictMarks({ line: "5 × 6 = 30", ring: true, strike: "5 × 6 = 35" }, dispatch, ids);
  assert.deepEqual(calls, [
    'add_student_attempt {"text":"5 × 6 = 35"}',
    'add_student_attempt {"text":"5 × 6 = 30"}',
    'circle_item {"target":"b2","keep":true}',
    'cross_out_step {"step_label":"b1"}',
  ]);
});

test("a result the student has not said goes up as = ?, and becomes the question", () => {
  const p = createPolicy(0);
  noteStudentUtterance(p, "it was 2 cups for 12 cookies and 5 cups, i put 15", 0);
  noteBoardWrite(p, "start_new_problem", { title: "Cookies", problem: "2 cups make 12 cookies. How many from 5 cups?" });
  const r = withholdResult(p, "draw_equation_step", { latex: "12 \\div 2 = 6" });
  assert.equal(r.args.latex, "12 \\div 2 = ?");
  assert.match(r.note ?? "", /the result is theirs to say/);
  assert.equal(p.lastAsked, "12 \\div 2 = ?");
  assert.equal(withholdResult(p, "draw_equation_step", { latex: "2 \\times 6 = 12" }).note, null, "12 is given in the problem");
  noteStudentUtterance(p, "oh 6 for each cup", 1000);
  assert.equal(withholdResult(p, "draw_equation_step", { latex: "12 \\div 2 = 6" }).note, null, "they said 6");
  assert.equal(withholdResult(p, "draw_equation_step", { latex: "y = 2x + 1" }).note, null, "not arithmetic");
  assert.equal(withholdResult(p, "draw_equation_step", { latex: "5 \\times 6 = 30" }).args.latex, "5 \\times 6 = ?");
  const q = createPolicy(0);
  noteStudentUtterance(q, "b squared is -9", 0);
  assert.equal(withholdResult(q, "draw_equation_step", { latex: "(-3)^2 = 9" }).args.latex, "(-3)^2 = ?", "saying -9 is not saying 9");
  q.boardHelp = 5;
  assert.equal(withholdResult(q, "draw_equation_step", { latex: "(-3)^2 = 9" }).note, null, "a worked example shows its results");
});

test("a caption that states a result they have not said says ? instead", () => {
  const p = createPolicy(0);
  noteBoardWrite(p, "start_new_problem", { title: "Cookies", problem: "2 cups make 12 cookies. How many from 5 cups?" });
  const r = withholdResult(p, "draw_icons", { icon: "cookie", count: 12, group_size: 6, label: "1 cup makes 6 cookies" });
  assert.equal(r.args.label, "1 cup makes ? cookies");
  assert.equal(r.args.count, 12, "the picture itself is untouched");
  assert.equal(withholdResult(p, "draw_icons", { icon: "cookie", count: 12, label: "12 cookies" }).note, null);
  assert.equal(withholdResult(p, "draw_icons", { icon: "cup", count: 2, label: "2 cups make 12 cookies" }).note, null, "given in the problem");
});

test("a page headed by its topic has no problem to be a step of", () => {
  assert.equal(stepOfPage("Ratios and rates", "5 * 6", "30"), false);
});

test("the same answer checked twice goes up once", () => {
  const p = createPolicy(0);
  p.codeMarks = true;
  noteBoardWrite(p, "add_callout", { text: "What is 12 / 2?" });
  autoCheck(p, "is it 6?", 0);
  assert.ok(p.pendingMarks);
  p.pendingMarks = null;
  const r = runTutorTool("check_answer", { problem: "12 / 2", student_answer: "6", skill: "division" }, p, 1000);
  assert.ok(r && r.success && /already on the board/.test(r.message ?? ""), r && r.success ? r.message : "");
  assert.equal(p.pendingMarks, null);
});

test("a reported answer is checked against the problem in the same line", () => {
  const p = createPolicy(0);
  p.codeMarks = true;
  const n = autoCheck(p, "it was which is bigger, 0.35 or 0.5, and i put 0.35", 0);
  assert.ok(n && /→ incorrect/.test(n) && /Ask how they got it/.test(n), n ?? "");
  assert.deepEqual(p.pendingMarks, { line: "0.35 > 0.5", ring: false, strike: null });
  const q = createPolicy(0);
  const m = autoCheck(q, "2 cups make 12 cookies how many for 5 cups and i got 15 cuz you add 3", 0);
  assert.equal(m, null, "a word problem the checker cannot read is left alone");
});

test("every right answer is ringed; a wrong line is struck only by a right answer to the same question", () => {
  const p = createPolicy(0);
  p.codeMarks = true;
  noteBoardWrite(p, "start_new_problem", { title: "Cookies", problem: "2 cups make 12 cookies. How many from 5 cups?" });
  noteBoardWrite(p, "add_callout", { text: "What is 12 / 2?" });
  autoCheck(p, "5", 0);
  assert.deepEqual(p.pendingMarks, { line: "12 / 2 = 5", ring: false, strike: null });
  p.pendingMarks = null;
  noteBoardWrite(p, "add_callout", { text: "What is 5 * 6?" });
  autoCheck(p, "30", 1000);
  assert.deepEqual(p.pendingMarks, { line: "5 × 6 = 30", ring: true, strike: null }, "a right step is ringed; the other question's miss stays");
  p.pendingMarks = null;
  noteBoardWrite(p, "add_callout", { text: "What is 12 / 2?" });
  autoCheck(p, "oh 6", 2000);
  assert.deepEqual(p.pendingMarks, { line: "12 / 2 = 6", ring: true, strike: "12 / 2 = 5" });
});

test("the app never rings an existing line that says something else", () => {
  const calls: string[] = [];
  const dispatch = (name: string, args: Record<string, unknown>) => {
    calls.push(name);
    return name === "add_student_attempt" ? { success: true as const, message: 'Already on the board as b5 ("0.35"), so it was not written again; pointing at it instead.' } : { success: true as const, message: "ok" };
  };
  applyVerdictMarks({ line: "0.5 > 0.35", ring: true, strike: null }, dispatch, new Map());
  assert.deepEqual(calls, ["add_student_attempt"]);
  calls.length = 0;
  const same = (name: string) => (calls.push(name), name === "add_student_attempt" ? { success: true as const, message: 'Already on the board as b2 ("7"), so it was not written again.' } : { success: true as const, message: "ok" });
  applyVerdictMarks({ line: "f(3) = 7", ring: true, strike: null }, same, new Map());
  assert.deepEqual(calls, ["add_student_attempt", "circle_item"], "the model's own copy of the same answer is ringed");
});

test("a stale question is never checked: the student answers what the tutor just asked", () => {
  // Sofia (Sept 27 2026): the page's first problem is -5 + 8; the tutor has moved
  // on to -7 - 4 and asks "where do you land?"; "negative eleven" is not an
  // answer to -5 + 8, and nothing may write "-5 + 8 = -11" in her hand.
  const p = createPolicy(0);
  p.codeMarks = true;
  p.pageProblem = "-5 + 8";
  noteTutorTurn(p, "If you start at negative seven and go four more to the left, where do you land?", false);
  assert.equal(autoCheck(p, "negative eleven", 0), null);
  assert.equal(p.pendingMarks, null);
  // The model's own check of the right problem is a fresh check.
  const r = runTutorTool("check_answer", { problem: "-7 - 4", student_answer: "-11", skill: "subtracting integers" }, p, 1000);
  assert.ok(r && r.success && /Verdict: correct/.test(r.message ?? ""), r && r.success ? r.message : "");
});

test("a spoken question with words in front reads: so what would six minus negative two equal?", () => {
  const p = createPolicy(0);
  p.codeMarks = true;
  p.pageProblem = "-5 + 8";
  noteTutorTurn(p, "If you're subtracting a negative, it's the same as adding, so what would six minus negative two equal?", false);
  const note = autoCheck(p, "is it 8?", 0);
  assert.ok(note && /→ correct/.test(note), note ?? "");
  assert.equal(p.pendingMarks?.line, "6 − (-2) = 8");
});

test("a checked answer is reused only for the same problem", () => {
  const p = createPolicy(0);
  p.codeMarks = true;
  noteTutorTurn(p, "What is 5 plus 8?", false);
  const auto = autoCheck(p, "13", 0);
  assert.ok(auto && /→ correct/.test(auto));
  const other = runTutorTool("check_answer", { problem: "20 - 7", student_answer: "13", skill: "subtraction" }, p, 500);
  assert.ok(other && other.success && /Verdict: correct/.test(other.message ?? "") && !/already on the board/.test(other.message ?? ""), "a different problem is checked afresh");
});

test("an answer with its reason is checked, and the board's question holds for a turn", () => {
  const p = createPolicy(0);
  p.codeMarks = true;
  noteTutorTurn(p, "Let's check that b squared part. What is negative 3 times negative 3?", false);
  const note = autoCheck(p, "um, 9? cuz a negative times a negative is positive?", 0);
  assert.ok(note && /→ correct/.test(note), note ?? "");
  const q = createPolicy(0);
  q.codeMarks = true;
  noteBoardWrite(q, "add_callout", { text: "85 - 12.75 = ?" });
  noteTutorTurn(q, "Now subtract that. What does that give you?", false);
  const n2 = autoCheck(q, "72.25", 0);
  assert.ok(n2 && /→ correct/.test(n2), n2 ?? "");
});
