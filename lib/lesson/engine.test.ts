import { test } from "node:test";
import assert from "node:assert/strict";
import { runTurn } from "./engine";
import { applyReceipts, boardForModel, createLesson, newProblem } from "./state";
import type { LessonState } from "./types";

// A scripted model: each call returns the next plan in the list.
function scripted(...plans: unknown[]) {
  let i = 0;
  return async () => ({ input: plans[Math.min(i++, plans.length - 1)], model: "scripted", ms: 1, toolUseId: "", reply: { role: "assistant" as const, content: "{}" } });
}
const input = (id: string, text: string) => ({ id, source: "typed" as const, text, at: Date.now() });
const applied = (s: LessonState, r: { turnId: string; ops: Array<{ opId: string }> }) => applyReceipts(s, r.turnId, r.ops.map((o, k) => ({ opId: o.opId, status: "applied" as const, itemId: `b${k + 1}`, at: 0 })));

// T01 (session 7wr9ea): a plan that repeats the false arithmetic never reaches the voice.
test("a plan asserting the student's false arithmetic is sent back, and the fixed plan says the true facts", async () => {
  const s = createLesson({ intake: "A bike rental costs $3 to start plus $5 per hour. My budget is $23. What is the most hours I can rent it?", grade: "7th grade" });
  const r = await runTurn(s, input("u1", "I got 4 hours because 5 times 4 plus 3 is 24, which is under 23. Is my reasoning right?"), {
    planner: scripted(
      { move: "confirm", speech: [{ say: "Yes! Five times four plus three is twenty-four, and that's under your budget." }], board: [] },
      { move: "repair", speech: [{ say: "Four hours is right. But five times four plus three is twenty-three, not twenty-four, and twenty-four is more than twenty-three." }, { say: "What would five hours cost?" }], board: [], verdict: { answer: "4", is: "correct", because: ["5*4+3 = 23", "23 <= 23", "5*5+3 = 28", "28 > 23"] }, question: { ask: "What would five hours cost?", kind: "value", expects: "28", check: "5*5+3" } },
    ),
  });
  assert.equal(r.log.calls, 2);
  assert.match(r.log.issues[0].join(" "), /false/);
  assert.match(r.speech.map((x) => x.text).join(" "), /twenty-three, not twenty-four/);
  assert.equal(r.log.fallback, false);
  assert.equal(r.state.questions.at(-1)?.expects, "28");
});

test("a stop is closed with no question, whatever the model planned", async () => {
  const s = createLesson({ intake: "3x + 7 = 22" });
  const r = await runTurn(s, input("u1", "ok bye, i'm done for today"), { planner: scripted({ move: "close", close: true, speech: [{ say: "Okay, see you next time." }], board: [], question: { ask: "Want one more?", kind: "choice" } }) });
  assert.equal(r.state.closing, true);
  assert.equal(r.state.questions.filter((q) => q.status === "open").length, 0);
});

// Session 6banh2: the steps of an equation go down one column, each under the line it acts on.
test("a step goes under the problem, a right answer fills its blank, and the final line is boxed", async () => {
  let s = createLesson({ intake: "3x + 7 = 22. I don't know how to solve equations." });
  let r = await runTurn(s, input("u1", "can you teach me"), {
    planner: scripted({ move: "explain", speech: [{ say: "Take seven from both sides to undo the plus seven.", needs: ["work.L1"] }, { say: "What does three x equal now?" }], board: [{ do: "work_step", left: "−7", right: "−7", note: "subtract 7", result: "3x = ?" }], question: { ask: "What does three x equal now?", kind: "step", expects: "3x = 15", fill: "work.L2" } }),
  });
  assert.deepEqual(r.ops.map((o) => o.type), ["heading", "draw", "edit"]);
  s = applied(r.state, r);
  r = await runTurn(s, input("u2", "3x = 15"), {
    planner: scripted({ move: "confirm", speech: [{ say: "Divide both sides by three." }, { say: "What is x?" }], board: [{ do: "work_step", left: "÷3", right: "÷3", note: "divide by 3", result: "x = ?" }], question: { ask: "What is x?", kind: "value", expects: "5", check: "3x + 7 = 22", fill: "work.L3" } }),
  });
  assert.equal(r.log.assessment.answer?.verdict, "correct");
  // Filled by the app (L2 in their hand), then the model's step under it.
  const work = r.state.board.find((b) => b.sid === "work:P1")!.spec as { lines: Array<{ id: string; text: string; by: string }>; moves: Array<{ after: string }> };
  assert.deepEqual(work.lines.map((l) => `${l.id} ${l.text} ${l.by}`), ["L1 3x + 7 = 22 given", "L2 3x = 15 student", "L3 x = ? tutor"]);
  assert.deepEqual(work.moves.map((m) => m.after), ["L1", "L2"]);
  s = applied(r.state, r);
  r = await runTurn(s, input("u3", "x = 5"), { planner: scripted({ move: "confirm", speech: [{ say: "Three times five plus seven is twenty-two, so it checks." }], board: [] }) });
  assert.ok(r.ops.some((o) => o.type === "mark" && o.how === "check" && o.ref === "work:P1.L3"), JSON.stringify(r.ops.map((o) => o.type)));
});

// Session jqw5pk (T05): they opened with the roots; asking for one of them again is refused.
test("asking for a value the student already gave is refused", async () => {
  const s = createLesson({ intake: "x^2-5x+6=0. I factored (x-2)(x-3) and found 2 and 3. Why can there be two answers?" });
  const r = await runTurn(s, input("u1", "I already know how to factor. Why are there two solutions?"), {
    planner: scripted(
      { move: "diagnose", speech: [{ say: "When x minus three is zero, what is x?" }], board: [], question: { ask: "When x minus three is zero, what is x?", kind: "value", expects: "3", check: "x - 3 = 0" } },
      { move: "explain", speech: [{ say: "A product is zero only when one of its factors is zero, so each factor gives its own answer." }], board: [{ do: "graph", id: "graph1", lines: "y = x^2 - 5x + 6", points: "(2, 0); (3, 0)" }] },
    ),
  });
  assert.match(r.log.issues[0].join(" "), /already answered/);
  assert.ok(r.ops.some((o) => o.type === "draw" && o.kind === "plane"));
});

// Session o8rpq1 (T02): a figure's sizes are the problem's own.
test("a figure with an invented size is refused; the given sizes draw the triangle with its diagonal", async () => {
  const s = createLesson({ intake: "Question 1: find the area of the triangle.", problems: [{ id: "P1", revision: 1, statement: "Find the area of the triangle", givens: [{ id: "F1", name: "base", value: 12, unit: "cm", source: { kind: "worksheet", file: "f1" } }, { id: "F2", name: "height", value: 5, unit: "cm", source: { kind: "worksheet", file: "f1" } }], source: { kind: "worksheet", file: "f1" }, status: "open" }] });
  const r = await runTurn(s, input("u1", "Can you draw the triangle inside its rectangle?"), {
    planner: scripted(
      { move: "explain", speech: [{ say: "Here it is." }], board: [{ do: "figure", id: "fig1", shape: "right_triangle", base: "12", height: "10", in_rectangle: true }] },
      { move: "explain", speech: [{ say: "Here is the triangle inside its rectangle.", needs: ["fig1.diagonal"] }], board: [{ do: "figure", id: "fig1", shape: "right_triangle", base: "F1", height: "F2", in_rectangle: true }] },
    ),
  });
  assert.match(r.log.issues[0].join(" "), /not one of the problem's givens/);
  const fig = r.state.board.find((b) => b.sid === "fig1")!;
  assert.ok(fig.facts.includes("diagonal AC 13 cm (no label on the board), from bottom left to top right"));
  assert.ok(fig.facts.some((f) => f.startsWith("triangle ABC area 30 cm²")));
  assert.deepEqual(r.speech[0].needs, ["fig1.diagonal"]);
});

test("a board line or a sentence that tells this turn's answer is withheld in code, not sent back", async () => {
  const s = createLesson({ intake: "Solve 3x + 7 = 22" });
  const plan = {
    move: "model_step" as const,
    speech: [{ id: "s1", text: "Take seven off both sides. That gives three x equals fifteen. What is the right side now?", needs: [] }],
    board: [{ do: "work_step" as const, left: "-7", right: "-7", result: "3x = 15" }],
    question: { text: "What is the right side now?", kind: "step" as const, expects: "3x = 15" },
    givesAnswer: false,
    close: false,
  };
  let calls = 0;
  const r = await runTurn(s, { id: "u1", source: "typed", text: "can you show me the first step", at: 1 }, {
    planner: async () => {
      calls++;
      return { input: { move: plan.move, speech: plan.speech.map((x) => ({ say: x.text, needs: [] })), board: [{ do: "work_step", left: "-7", right: "-7", result: "3x = 15" }], question: { ask: plan.question.text, kind: "step", expects: "3x = 15" }, gives_answer: false, close: false }, model: "fake", ms: 1, toolUseId: "x", reply: { role: "assistant", content: [] } };
    },
  });
  assert.equal(calls, 1);
  assert.ok(!/fifteen/.test(r.speech.map((x) => x.text).join(" ")), r.speech.map((x) => x.text).join(" "));
  assert.ok(/\?/.test(r.speech.map((x) => x.text).join(" ")));
  const work = r.ops.filter((o) => o.type === "edit" || o.type === "draw").pop() as { spec: { lines: Array<{ text: string }> } };
  assert.ok(work.spec.lines.some((l) => /3x\s*=\s*\?/.test(l.text)), JSON.stringify(work.spec.lines));
});

test("T01 with a model that never repairs: the code says the right answer and the true facts itself", async () => {
  let s = createLesson({ intake: "A bike rental costs $3 to start plus $5 per hour. My budget is $23. What is the most hours I can rent it?" });
  s = { ...s, problems: s.problems.map((p) => ({ ...p, solution: { answer: "4", work: "(23-3)/5" } })) };
  const lazy = async () => ({ input: { move: "confirm", speech: [{ say: "Your method is good. Let's look at the cost again. What does one hour cost?" }], board: [] }, model: "fake", ms: 1, toolUseId: "x", reply: { role: "assistant" as const, content: [] } });
  const r = await runTurn(s, { id: "u1", source: "typed", text: "I got 4 hours because 5 times 4 plus 3 is 24, which is under 23. Is my reasoning right?", at: 1 }, { planner: lazy });
  const said = r.speech.map((x) => x.text).join(" ");
  assert.equal(r.log.assessment.final?.verdict, "correct");
  assert.match(said, /four, is right/);
  assert.match(said, /five times four plus three is twenty-three/i);
  assert.match(said, /twenty-four is more than twenty-three/i);
  assert.ok(!r.log.fallback);
});

test("the first sentence goes out early and is not said twice", async () => {
  const s = createLesson({ intake: "A bike rental costs $3 to start plus $5 per hour. My budget is $23. What is the most hours I can rent it?" });
  const said: string[] = [];
  const plan = { move: "repair", question: { ask: "What would five hours cost?", kind: "value", expects: "28", check: "5*5+3" }, solution: { answer: "4", work: "(23-3)/5" }, speech: [{ say: "Four hours is right." }, { say: "But five times four plus three is twenty-three, not twenty-four, and twenty-four is more than twenty-three." }, { say: "What would five hours cost?" }], board: [] };
  const json = JSON.stringify(plan);
  const r = await runTurn(s, { id: "u1", source: "typed", text: "I got 4 hours because 5 times 4 plus 3 is 24, which is under 23. Is my reasoning right?", at: 1 }, {
    onEarly: (t) => said.push(t),
    planner: async (_sys, _msgs, onPartial) => {
      for (let k = 20; k <= json.length; k += 20) onPartial?.(json.slice(0, k));
      return { input: plan, model: "fake", ms: 1, toolUseId: "x", reply: { role: "assistant", content: [] } };
    },
  });
  assert.deepEqual(said, ["Four hours is right."]);
  assert.equal(r.speech[0].early, true);
  assert.equal(r.speech.filter((x) => /Four hours is right/.test(x.text)).length, 1);
  assert.ok(r.speech.some((x) => /twenty-three, not twenty-four/.test(x.text)));
});

test("fractions on one whole and pictures of real things compile to the board's own tools", async () => {
  const { compileBoard } = await import("./compile");
  const s = createLesson({ intake: "1/2 + 1/3 = 2/5 because I add tops and bottoms." });
  const c = compileBoard(s, [{ do: "fractions", fractions: "1/2, 1/3", common: 6 }, { do: "picture", what: "2 tens rods and 3 unit cubes", notice: "a ten is ten ones" }], "t1");
  assert.deepEqual(c.issues, []);
  const tool = c.ops.find((o) => o.type === "tool") as { name: string; args: Record<string, unknown> };
  assert.deepEqual(tool.args, { fraction: "1/2", model: "bar", second_fraction: "1/3", common_denominator: 6 });
  assert.ok(c.objects.find((o) => o.kind === "fraction")!.facts[0].includes("1/2 = 3/6"));
  assert.ok(c.ops.some((o) => o.type === "illustrate" && o.what.includes("tens rods")));
  // A common cut that does not fit both is refused.
  assert.ok(compileBoard(s, [{ do: "fractions", fractions: "1/2, 1/3", common: 4 }], "t1").issues.length);
});

// S-worksheet (Oct 31): #2 was talked through before it became current; when it
// did, its heading turned the page and filed the number line away the turn its ring was due.
test("a problem that opens keeps the drawings made before any problem was chosen, and its page", async () => {
  const sheet = [newProblem("P1", "1. -5 + 8 =", { kind: "worksheet", file: "File 1", question: "1" }), newProblem("P2", "2. -7 - 4 =", { kind: "worksheet", file: "File 1", question: "2" })];
  let s = createLesson({ intake: "can you check my worksheet", problems: sheet, current: null });
  const r1 = await runTurn(s, input("u1", "number 2 i got 11"), { planner: scripted({ move: "explain", speech: [{ say: "Let's put the steps in a table." }, { say: "Where do you start?" }], board: [{ do: "table", id: "steps", columns: "step | value", rows: "start | -7" }], question: { ask: "Where do you start?", kind: "value" } }) });
  s = applied(r1.state, r1);
  s = { ...s, current: "P2" };
  const r2 = await runTurn(s, input("u2", "at -7"), { planner: scripted({ move: "confirm", speech: [{ say: "Yes, you start at negative seven." }, { say: "Which way does minus four move?" }], board: [{ do: "mark", ref: "steps", how: "ring" }], question: { ask: "Which way does minus four move?", kind: "choice" } }) });
  assert.equal(r2.ops.filter((o) => o.type === "heading").length, 0);
  assert.ok(r2.ops.some((o) => o.type === "mark" && o.ref === "steps"));
  assert.equal(r2.state.board.find((b) => b.sid === "steps")?.problemId, "P2");
});

test("a drawing on a page that was turned is never marked, and the planner sees it as filed away", async () => {
  let s = createLesson({ intake: "1/2 + 1/3" });
  const r1 = await runTurn(s, input("u1", "idk"), { planner: scripted({ move: "explain", speech: [{ say: "Here are the parts." }, { say: "What do you notice?" }], board: [{ do: "table", id: "old", columns: "a | b", rows: "1 | 2" }], question: { ask: "What do you notice?", kind: "open" } }) });
  s = applied(r1.state, r1);
  // Another problem's heading turns the page.
  s = { ...s, board: [...s.board, { sid: "heading:P9", kind: "heading", problemId: "P9", parts: [], facts: ["next"], status: "applied", page: 2 }] };
  assert.match(boardForModel(s), /Earlier pages, filed away[^\n]*old/);
  const r2 = await runTurn(s, input("u2", "what"), { planner: scripted({ move: "explain", speech: [{ say: "Look here." }, { say: "What is one half plus one third?" }], board: [{ do: "mark", ref: "old", how: "ring" }], question: { ask: "What is one half plus one third?", kind: "value" } }) });
  assert.ok(!r2.ops.some((o) => o.type === "mark" && o.ref === "old"));
});

// S-graph-novice (Oct 31): "Look at the y column: negative one, one, three, five" over a three-row table.
test("numbers read off a table must be on it", async () => {
  let s = createLesson({ intake: "graph y = 2x - 1" });
  const r1 = await runTurn(s, input("u1", "i dont get graphs"), { planner: scripted({ move: "explain", speech: [{ say: "Here's a table of the rule." }, { say: "What do you notice?" }], board: [{ do: "table", id: "t1", columns: "x | y", rows: "0 | -1; 1 | 1; 2 | 3" }], question: { ask: "What do you notice?", kind: "open" } }) });
  s = applied(r1.state, r1);
  const r2 = await runTurn(s, input("u2", "they go up"), {
    planner: scripted(
      { move: "explain", speech: [{ say: "Look at the y column: negative one, one, three, five." }, { say: "How much does y grow each time?" }], board: [], question: { ask: "How much does y grow each time?", kind: "value", expects: "2" } },
      { move: "explain", speech: [{ say: "Look at the y column: negative one, one, three." }, { say: "How much does y grow each time?" }], board: [], question: { ask: "How much does y grow each time?", kind: "value", expects: "2" } },
    ),
  });
  assert.equal(r2.log.calls, 2);
  assert.match(r2.log.issues[0].join(" "), /reads 5 off the table/);
});

test("a ring with a sentence lands on the point the sentence names", async () => {
  let s = createLesson({ intake: "graph y = 2x - 1" });
  const r1 = await runTurn(s, input("u1", "ok"), { planner: scripted({ move: "explain", speech: [{ say: "Here are the points." }, { say: "What do you notice?" }], board: [{ do: "graph", id: "g", points: "(0, -1); (1, 1); (2, 3); (3, 5)" }], question: { ask: "What do you notice?", kind: "open" } }) });
  s = applied(r1.state, r1);
  const r2 = await runTurn(s, input("u2", "they line up"), {
    planner: scripted(
      { move: "confirm", speech: [{ say: "The new point is three, five, on the line.", needs: ["g.P3"] }, { say: "What does y do each step?" }], board: [{ do: "mark", ref: "g.P3", how: "ring" }], question: { ask: "What does y do each step?", kind: "open" } },
      { move: "confirm", speech: [{ say: "The new point is three, five, on the line.", needs: ["g.P4"] }, { say: "What does y do each step?" }], board: [{ do: "mark", ref: "g.P4", how: "ring" }], question: { ask: "What does y do each step?", kind: "open" } },
    ),
  });
  assert.equal(r2.log.calls, 2);
  assert.match(r2.log.issues[0].join(" "), /names \(3, 5\)/);
});

test("a turn that ends on a statement goes back for something to do", async () => {
  const s = createLesson({ intake: "f(x) = 2x + 1, what goes in to get 11?" });
  const r = await runTurn(s, input("u1", "wait so backwards?"), {
    planner: scripted(
      { move: "explain", speech: [{ say: "Yes, eleven came out, and we want the number that went in." }], board: [] },
      { move: "explain", speech: [{ say: "Yes, eleven came out, and we want the number that went in." }, { say: "What number doubled and plus one makes eleven?" }], board: [], question: { ask: "What number doubled and plus one makes eleven?", kind: "value", expects: "5" } },
    ),
  });
  assert.equal(r.log.calls, 2);
  assert.match(r.log.issues[0].join(" "), /nothing for them to do/);
});

// S-factor-novice (Oct 31): a new problem handed over under move "confirm", only spoken.
test("a new problem said aloud must be written, whatever the move", async () => {
  const s = createLesson({ intake: "factor x^2 + 7x + 12" });
  const r = await runTurn(s, input("u1", "3 and 4"), {
    planner: scripted(
      { move: "confirm", speech: [{ say: "Three and four do both jobs." }, { say: "Now try a new one: x squared plus five x plus four. Which two numbers work?" }], board: [], question: { ask: "Which two numbers work?", kind: "open" } },
      { move: "confirm", speech: [{ say: "Three and four do both jobs." }, { say: "Now try a new one: x squared plus five x plus four. Which two numbers work?" }], board: [{ do: "work_line", text: "x^2 + 5x + 4" }], question: { ask: "Which two numbers work?", kind: "open" } },
    ),
  });
  assert.equal(r.log.calls, 2);
  assert.match(r.log.issues[0].join(" "), /only spoken/);
});

test("a sentence said twice in a turn is said once, the asking one kept", async () => {
  const s = createLesson({ intake: "help with my ratio homework" });
  const r = await runTurn(s, input("u1", "ok"), {
    planner: scripted({ move: "clarify", speech: [{ say: "Sure." }, { say: "Pick one problem and tell me the numbers in it." }, { say: "Can you pick one problem and tell me the numbers in it?" }], board: [], question: { ask: "Can you pick one problem and tell me the numbers in it?", kind: "open" } }),
  });
  const said = r.speech.map((x) => x.text).join(" ");
  assert.equal((said.match(/pick one problem/gi) ?? []).length, 1);
  assert.match(said, /\?/);
});

// S-function (Oct 31): the tutor said it was not sure which blue circle was meant, about rings it drew.
test("the planner's board list names the marks still on the board", async () => {
  let s = createLesson({ intake: "f(x) = x + 3" });
  const r1 = await runTurn(s, input("u1", "ok"), { planner: scripted({ move: "explain", speech: [{ say: "Here is a table." }, { say: "What comes out for two?" }], board: [{ do: "table", id: "t1", columns: "in | out", rows: "2 | ?" }], question: { ask: "What comes out for two?", kind: "value", expects: "5" } }) });
  s = applied(r1.state, r1);
  const r2 = await runTurn(s, input("u2", "5"), { planner: scripted({ move: "confirm", speech: [{ say: "Yes, two in gives five out.", needs: ["t1.r1c2"] }, { say: "What comes out for ten?" }], board: [{ do: "mark", ref: "t1.r1c2", how: "ring" }], question: { ask: "What comes out for ten?", kind: "value", expects: "13" } }) });
  assert.match(boardForModel(r2.state), /Marks you put on the board, still there: ring on t1\.r1c2/);
});

// S-algebra-sheet (Oct 31): ÷3 under "3x + 14 = 29" gave "x = 5" on the board, checked.
test("a step's result is the line above with what is written under each side done to it", async () => {
  const s = createLesson({ intake: "3x + 14 = 29" });
  const r = await runTurn(s, input("u1", "idk how"), {
    planner: scripted(
      { move: "model_step", speech: [{ say: "Divide both sides by three." }, { say: "Does that work?" }], board: [{ do: "work_step", left: "÷3", right: "÷3", note: "divide by 3", result: "x = 5" }], question: { ask: "Does that work?", kind: "open" }, gives_answer: true },
      { move: "model_step", speech: [{ say: "Take fourteen from both sides first." }, { say: "What is three x now?" }], board: [{ do: "work_step", left: "−14", right: "−14", note: "subtract 14", result: "3x = 15" }], question: { ask: "What is three x now?", kind: "step", expects: "3x = 15" }, gives_answer: true },
    ),
  });
  assert.equal(r.log.calls, 2);
  assert.match(r.log.issues[0].join(" "), /does not give "x = 5"/);
});
