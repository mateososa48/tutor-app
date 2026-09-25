import { after, test } from "node:test";
import assert from "node:assert/strict";
import type { WhiteboardHandle } from "@/components/TldrawCore";
import { dispatchWhiteboardTool } from "./whiteboard-tool-dispatch";
import { planAfterStart, type BoardPlan } from "./board-plan";

const msg = (r: ReturnType<typeof dispatchWhiteboardTool>) => (r.success ? r.message ?? "" : r.error);

// A board that keeps the plan the way TldrawCore does (lib/board-plan.ts).
function fakeBoard() {
  let plan: BoardPlan | null = null;
  const calls: Array<{ steps?: string[] | null; step?: number }> = [];
  const board = {
    beginItem: (tool: string) => ({ tool, shapes: new Set<string>(), eqs: new Set<string>() }),
    endItem: () => "b1",
    withDirectMeta: <T,>(_meta: unknown, fn: () => T) => fn(),
    takeNotes: () => [],
    itemsSnapshot: () => [],
    setPlan: (steps?: string[] | null, step?: number) => {
      calls.push({ steps, step });
      const next = planAfterStart(plan, steps, step);
      plan = next.plan;
      return next;
    },
    plan: () => plan,
  };
  return { board: board as unknown as WhiteboardHandle, calls, plan: () => plan };
}

test("set_plan writes the plan once and says it back; step moves it on", () => {
  const f = fakeBoard();
  const r = dispatchWhiteboardTool("set_plan", { steps: "What fractions are | Adding them | Practice" }, { whiteboard: f.board });
  assert.equal(r.success, true, msg(r));
  assert.match(msg(r), /The plan is in its box on the board\. Say it in one breath/);
  assert.match(msg(r), /Plan: 1 What fractions are \(now\) · 2 Adding them · 3 Practice/);
  const on2 = dispatchWhiteboardTool("set_plan", { step: 2 }, { whiteboard: f.board });
  assert.equal(on2.success, true, msg(on2));
  assert.match(msg(on2), /Moved on to step 2/);
  assert.deepEqual(f.plan()!.steps.map((s) => s.done), [true, false, false]);
  assert.equal(f.plan()!.current, 2);
});

test("set_plan refuses an empty plan and a step with no plan, and keeps four steps at most", () => {
  const f = fakeBoard();
  assert.equal(dispatchWhiteboardTool("set_plan", { steps: " | | " }, { whiteboard: f.board }).success, false);
  const noPlan = dispatchWhiteboardTool("set_plan", { step: 2 }, { whiteboard: f.board });
  assert.equal(noPlan.success, false);
  assert.equal(dispatchWhiteboardTool("set_plan", {}, { whiteboard: f.board }).success, false);
  const five = dispatchWhiteboardTool("set_plan", { steps: "a | b | c | d | e" }, { whiteboard: f.board });
  assert.equal(five.success, true, msg(five));
  assert.match(msg(five), /kept the first 4 steps/);
  assert.equal(f.plan()!.steps.length, 4);
});

// The dispatcher reaches tldraw (through the board's colours), whose React
// scheduler holds a MessagePort open: let it go, or the run never exits.
after(() => {
  const handles = (process as unknown as { _getActiveHandles?: () => Array<{ constructor: { name: string }; unref?: () => void }> })._getActiveHandles?.() ?? [];
  for (const h of handles) if (h.constructor.name === "MessagePort") h.unref?.();
});

// A board that records what start_new_problem, the equation lines and the
// callout were given, the way the old board's methods take them.
function fakeWritingBoard() {
  let n = 0;
  const log: string[] = [];
  const board = {
    beginItem: (tool: string) => ({ tool, shapes: new Set<string>(), eqs: new Set<string>() }),
    endItem: () => `b${++n}`,
    withDirectMeta: <T,>(_meta: unknown, fn: () => T) => fn(),
    takeNotes: () => [],
    itemsSnapshot: () => [],
    startNewProblem: (title: string) => log.push(`title:${title}`),
    drawEquationStep: (latex: string) => log.push(`eq:${latex}`),
    addCallout: (text: string) => log.push(`callout:${text}`),
    addTextNote: (text: string) => log.push(`note:${text}`),
    setPens: () => {},
    setPlacement: () => {},
  };
  return { board: board as unknown as WhiteboardHandle, log };
}

test("start_new_problem writes the problem, typeset, and the first question in one call", () => {
  const f = fakeWritingBoard();
  const r = dispatchWhiteboardTool("start_new_problem", { title: "Area of a region", problem: "f(x) = 2x^2 - 6x + 4 | g(x) = 4\\cos(\\pi x/4)", ask: "What do you already know about this kind?" }, { whiteboard: f.board });
  assert.equal(r.success, true, msg(r));
  assert.deepEqual(f.log.map((l) => l.split(":")[0]), ["title", "eq", "eq", "callout"]);
  assert.match(f.log[1], /2x\^\{?2\}?/);
  assert.match(msg(r), /The problem is up, typeset/);
  assert.match(msg(r), /Before any first move, ask what they already know/);
  const bare = dispatchWhiteboardTool("start_new_problem", { title: "Fractions" }, { whiteboard: f.board });
  assert.match(msg(bare), /write the problem itself exactly as given \(problem=…, typeset\)/);
});

test("a note that is really math goes up as typeset lines", () => {
  const f = fakeWritingBoard();
  const r = dispatchWhiteboardTool("add_text_note", { text: "f(x) = 2x^2 - 6x + 4 | g(x) = 4cos(1/4 \\pi x)" }, { whiteboard: f.board });
  assert.equal(r.success, true, msg(r));
  assert.deepEqual(f.log.map((l) => l.split(":")[0]), ["eq", "eq"]);
  assert.match(msg(r), /That was math, so it went up typeset as lines \(b1, b2\)/);
  const words = dispatchWhiteboardTool("add_text_note", { text: "Same size pieces first" }, { whiteboard: f.board });
  assert.equal(words.success, true, msg(words));
  assert.equal(f.log.at(-1), "note:Same size pieces first");
});
