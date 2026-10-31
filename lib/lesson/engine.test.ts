import { test } from "node:test";
import assert from "node:assert/strict";
import { runTurn } from "./engine";
import { applyReceipts, createLesson } from "./state";
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
  assert.ok(fig.facts.includes("diagonal AC 13 cm"));
  assert.ok(fig.facts.includes("triangle ABC area 30 cm²"));
  assert.deepEqual(r.speech[0].needs, ["fig1.diagonal"]);
});
