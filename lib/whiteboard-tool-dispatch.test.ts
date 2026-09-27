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
  assert.match(msg(r), /The plan is up \(First what fractions are, then adding them, then practice\); step 1 is What fractions are/);
  assert.doesNotMatch(msg(r), /Say:/, "a result reports; it never scripts what to say (a second wake re-planned out loud)");
  assert.match(msg(r), /Plan: 1 What fractions are \(now\) · 2 Adding them · 3 Practice/);
  const on2 = dispatchWhiteboardTool("set_plan", { step: 2 }, { whiteboard: f.board });
  assert.equal(on2.success, true, msg(on2));
  assert.match(msg(on2), /On step 2 now: Adding them/);
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
  const items: Array<{ id: string; tool: string; label: string; owner: "tutor" | "student"; createdAt: number; shapeIds: string[]; eqItemIds: string[] }> = [];
  const board = {
    beginItem: (tool: string) => ({ tool, shapes: new Set<string>(), eqs: new Set<string>() }),
    endItem: () => `b${++n}`,
    withDirectMeta: <T,>(_meta: unknown, fn: () => T) => fn(),
    takeNotes: () => [],
    itemsSnapshot: () => items,
    startNewProblem: (title: string) => log.push(`title:${title}`),
    drawEquationStep: (latex: string) => log.push(`eq:${latex}`),
    addCallout: (text: string) => log.push(`callout:${text}`),
    addTextNote: (text: string) => log.push(`note:${text}`),
    drawGrid: (o: { shaded: number; shadeRows?: number; shadeColumns?: number }) => log.push(`grid:${o.shaded}/${o.shadeRows}/${o.shadeColumns}`),
    addStudentAttempt: (text: string) => log.push(`attempt:${text}`),
    startBoardSection: (title: string) => log.push(`section:${title}`),
    setPens: () => {},
    setPlacement: () => {},
  };
  return { board: board as unknown as WhiteboardHandle, log, items };
}

test("start_new_problem writes the problem, typeset, and the first question in one call", () => {
  const f = fakeWritingBoard();
  const r = dispatchWhiteboardTool("start_new_problem", { title: "Area of a region", problem: "f(x) = 2x^2 - 6x + 4 | g(x) = 4\\cos(\\pi x/4)", ask: "What do you already know about this kind?" }, { whiteboard: f.board });
  assert.equal(r.success, true, msg(r));
  assert.deepEqual(f.log.map((l) => l.split(":")[0]), ["title", "eq", "eq", "callout"]);
  assert.match(f.log[1], /2x\^\{?2\}?/);
  assert.match(msg(r), /The problem is up, typeset/);
  assert.match(msg(r), /Next: ask what they already know about this kind of problem/);
  const bare = dispatchWhiteboardTool("start_new_problem", { title: "Fractions" }, { whiteboard: f.board });
  assert.match(msg(bare), /Write the problem exactly as given \(problem=, typeset\), then ask what they already know/);
});

// Sept 25 2026: 3.8 passed the topic as the problem ("Decimals") and the
// board got a fake problem line.
test("a topic passed as the problem is not written as one", () => {
  const f = fakeWritingBoard();
  const r = dispatchWhiteboardTool("start_new_problem", { title: "Decimals", problem: "Decimals" }, { whiteboard: f.board });
  assert.equal(r.success, true, msg(r));
  assert.deepEqual(f.log.map((l) => l.split(":")[0]), ["title"]);
  assert.match(msg(r), /is the topic, not a problem/);
  assert.match(msg(r), /Next: write the problem exactly as given/);
  const words = dispatchWhiteboardTool("start_new_problem", { title: "Integer Operations", problem: "Integer Operations", ask: "Which one first?" }, { whiteboard: f.board });
  assert.deepEqual(f.log.map((l) => l.split(":")[0]), ["title", "title", "callout"]);
  assert.equal(words.success, true);
  const real = dispatchWhiteboardTool("start_new_problem", { title: "Decimals", problem: "0.35 or 0.5" }, { whiteboard: f.board });
  assert.match(msg(real), /The problem is up, typeset/);
});

test("set_plan reports the plan, and a re-sent plan only moves the step", () => {
  const f = fakeBoard();
  const first = dispatchWhiteboardTool("set_plan", { steps: "Compare | Add | Practice" }, { whiteboard: f.board });
  assert.match(msg(first), /The plan is up \(First compare, then add, then practice\); step 1 is Compare/);
  const again = dispatchWhiteboardTool("set_plan", { steps: "Compare | Add | Practice" }, { whiteboard: f.board });
  assert.equal(again.success, true, msg(again));
  assert.match(msg(again), /already on the board, on step 1/);
  assert.equal(f.calls.length, 1, "the box was not rewritten");
  const move = dispatchWhiteboardTool("set_plan", { steps: "compare | add | practice", step: 2 }, { whiteboard: f.board });
  assert.match(msg(move), /On step 2 now: Add/);
  assert.equal(f.plan()!.current, 2);
  assert.deepEqual(f.calls.at(-1), { steps: undefined, step: 2 });
});

test("a grid with a shaded count keeps the count and drops the bands", () => {
  const f = fakeWritingBoard();
  const r = dispatchWhiteboardTool("draw_grid", { rows: 10, columns: 10, shaded: 35, shade_columns: 5 }, { whiteboard: f.board });
  assert.equal(r.success, true, msg(r));
  assert.equal(f.log.at(-1), "grid:35/undefined/undefined");
  assert.match(msg(r), /35 shaded/);
  assert.match(msg(r), /shade_rows\/shade_columns were ignored/);
  const bands = dispatchWhiteboardTool("draw_grid", { rows: 2, columns: 3, shade_rows: 1, shade_columns: 2 }, { whiteboard: f.board });
  assert.equal(f.log.at(-1), "grid:0/1/2");
  assert.match(msg(bands), /1 of 2 rows tinted, 2 of 3 columns hatched/);
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

// Sept 25 2026, from the Phase 1 and 3 runs.
test("an attempt with LaTeX in it is typeset as their line, not handwritten backslashes", () => {
  const f = fakeWritingBoard();
  const r = dispatchWhiteboardTool("add_student_attempt", { text: "x = \\frac{-(-3) \\pm \\sqrt{(-3)^2 - 4(2)(1)}}{2(2)}" }, { whiteboard: f.board });
  assert.equal(r.success, true, msg(r));
  assert.match(f.log.at(-1) ?? "", /^eq:/);
  assert.match(msg(r), /typeset as their line/);
  const plain = dispatchWhiteboardTool("add_student_attempt", { text: "-7 - 4 = 11" }, { whiteboard: f.board });
  assert.equal(plain.success, true);
  assert.equal(f.log.at(-1), "attempt:-7 - 4 = 11", "plain math stays in their hand");
});

test("a new heading seconds after a drawing keeps the drawing and opens a section", () => {
  const f = fakeWritingBoard();
  f.items.push({ id: "b1", tool: "start_new_problem", label: "Ratios", owner: "tutor", createdAt: Date.now() - 60_000, shapeIds: [], eqItemIds: [] });
  f.items.push({ id: "b2", tool: "draw_icons", label: "12 cookies", owner: "tutor", createdAt: Date.now() - 5_000, shapeIds: [], eqItemIds: [] });
  const r = dispatchWhiteboardTool("start_new_problem", { title: "Your turn", problem: "3 cups = ?", ask: "How many cookies?" }, { whiteboard: f.board });
  assert.equal(r.success, true, msg(r));
  assert.match(msg(r), /Kept the board: what you drew 5 s ago is still up, and "Your turn" opened as a section beside it/);
  assert.match(msg(r), /erase_items first/);
  assert.deepEqual(f.log.map((l) => l.split(":")[0]), ["section", "eq", "callout"]);
  const old = fakeWritingBoard();
  old.items.push({ id: "b1", tool: "draw_icons", label: "12 cookies", owner: "tutor", createdAt: Date.now() - 120_000, shapeIds: [], eqItemIds: [] });
  const cleared = dispatchWhiteboardTool("start_new_problem", { title: "Next problem" }, { whiteboard: old.board });
  assert.equal(old.log.at(-1), "title:Next problem", "old work is cleared as before");
  assert.match(msg(cleared), /Cleared the board/);
});

test("a new problem kept beside fresh work is headed by the problem when its title is already up", () => {
  const f = fakeWritingBoard();
  f.items.push({ id: "b1", tool: "start_new_problem", label: "Comparing Decimals", owner: "tutor", createdAt: Date.now() - 60_000, shapeIds: [], eqItemIds: [] });
  f.items.push({ id: "b2", tool: "draw_grid", label: "0.35", owner: "tutor", createdAt: Date.now() - 5_000, shapeIds: [], eqItemIds: [] });
  const r = dispatchWhiteboardTool("start_new_problem", { title: "Comparing Decimals", problem: "0.6 vs 0.45", ask: "Which is bigger?" }, { whiteboard: f.board });
  assert.equal(r.success, true, msg(r));
  assert.match(msg(r), /"0.6 vs 0.45" opened as a section/);
  assert.deepEqual(f.log.map((l) => l.split(":")[0]), ["section", "callout"], "the problem is the heading, not a second line");
});
