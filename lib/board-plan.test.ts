import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutPlanRow, parsePlan, planAfterCorrect, planAfterStart, planNote, planSummary, readPlan, PLAN_LABEL_MAX, type BoardPlan } from "./board-plan";

test("a plan string splits on | into trimmed labels", () => {
  assert.deepEqual(parsePlan("What fractions are | Adding them | Practice"), { steps: ["What fractions are", "Adding them", "Practice"], dropped: 0 });
  assert.deepEqual(parsePlan("what fractions are|adding them"), { steps: ["What fractions are", "Adding them"], dropped: 0 });
  assert.deepEqual(parsePlan(["Warm-up", " Two-step equations "]), { steps: ["Warm-up", "Two-step equations"], dropped: 0 });
});

test("numbering and bullets the model adds are dropped", () => {
  assert.deepEqual(parsePlan("1. What slope is | 2) Finding it | Step 3: Practice")?.steps, ["What slope is", "Finding it", "Practice"]);
  assert.deepEqual(parsePlan("- Idea | - Practice.")?.steps, ["Idea", "Practice"]);
});

test("steps past four are dropped and counted; one step is kept", () => {
  assert.deepEqual(parsePlan("a | b | c | d | e | f"), { steps: ["A", "B", "C", "D"], dropped: 2 });
  assert.deepEqual(parsePlan("Just practice"), { steps: ["Just practice"], dropped: 0 });
});

test("an empty plan is nonsense", () => {
  assert.equal(parsePlan(""), null);
  assert.equal(parsePlan(" | | "), null);
  assert.equal(parsePlan(42), null);
  assert.equal(parsePlan("... | --"), null);
});

test("a long label is cut at a word, with an ellipsis", () => {
  const [label] = parsePlan("Adding fractions whose bottoms are different numbers")!.steps;
  assert.ok(label.length <= PLAN_LABEL_MAX, label);
  assert.ok(label.endsWith("…"));
  assert.ok(!/\s…$/.test(label));
  assert.ok("Adding fractions whose bottoms are different numbers".startsWith(label.slice(0, -1)));
});

test("a new plan starts on step 1; step N checks the steps before it", () => {
  const { plan } = planAfterStart(null, ["What fractions are", "Adding them", "Practice"]);
  assert.deepEqual(plan, { steps: [{ label: "What fractions are", done: false }, { label: "Adding them", done: false }, { label: "Practice", done: false }], current: 1 });
  const next = planAfterStart(plan, undefined, 3);
  assert.equal(next.ignoredStep, false);
  assert.equal(next.plan!.current, 3);
  assert.deepEqual(next.plan!.steps.map((s) => s.done), [true, true, false]);
});

test("a later page with no plan keeps it", () => {
  const { plan } = planAfterStart(null, ["A", "B"]);
  assert.equal(planAfterStart(plan, undefined).plan, plan);
});

test("a step out of range is ignored", () => {
  const { plan } = planAfterStart(null, ["A", "B"]);
  for (const bad of [0, 3, 1.5, -1]) {
    const r = planAfterStart(plan, undefined, bad);
    assert.equal(r.ignoredStep, true, String(bad));
    assert.equal(r.plan, plan);
  }
  assert.equal(planAfterStart(null, undefined, 1).ignoredStep, true);
});

test("a step given with a new plan applies to it", () => {
  const r = planAfterStart(null, ["A", "B", "C"], 2);
  assert.equal(r.plan!.current, 2);
  assert.deepEqual(r.plan!.steps.map((s) => s.done), [true, false, false]);
});

test("a replaced plan keeps the checks of steps with the same words", () => {
  let plan: BoardPlan | null = planAfterStart(null, ["What fractions are", "Adding"]).plan;
  plan = planAfterCorrect(plan).plan;
  const r = planAfterStart(plan, ["What fractions are", "Adding them", "Practice"]);
  assert.deepEqual(r.plan!.steps.map((s) => s.done), [true, false, false]);
  assert.equal(r.plan!.current, 2);
});

test("a right answer checks the current step once", () => {
  const start = planAfterStart(null, ["A", "B", "C"]).plan;
  const once = planAfterCorrect(start);
  assert.equal(once.changed, true);
  assert.deepEqual(once.plan!.steps.map((s) => s.done), [true, false, false]);
  const twice = planAfterCorrect(once.plan);
  assert.equal(twice.changed, false);
  assert.equal(planAfterCorrect(null).changed, false);
  // The last step can be checked.
  const last = planAfterCorrect(planAfterStart(once.plan, undefined, 3).plan);
  assert.deepEqual(last.plan!.steps.map((s) => s.done), [true, true, true]);
});

test("the tutor reads the plan back in one short line", () => {
  let plan = planAfterStart(null, ["What fractions are", "Adding", "Practice"]).plan;
  assert.equal(planSummary(plan), "Plan: 1 What fractions are (now) · 2 Adding · 3 Practice");
  plan = planAfterStart(plan, undefined, 2).plan;
  assert.equal(planSummary(plan), "Plan: ✓1 What fractions are · 2 Adding (now) · 3 Practice");
  plan = planAfterCorrect(plan).plan;
  assert.equal(planSummary(plan), "Plan: ✓1 What fractions are · ✓2 Adding · 3 Practice");
  assert.equal(planSummary(null), "");
  assert.equal(planNote(plan), "Plan: 3 steps, now on 2.");
});

test("a saved plan reads back; anything else is null", () => {
  const plan = planAfterStart(null, ["A", "B"], 2).plan;
  assert.deepEqual(readPlan(JSON.parse(JSON.stringify(plan))), plan);
  assert.equal(readPlan(undefined), null);
  assert.equal(readPlan({ steps: [] }), null);
  assert.equal(readPlan({ steps: "a|b" }), null);
  assert.equal(readPlan({ steps: [{ label: "A" }], current: 9 })!.current, 1);
});

const ROW = { lead: 40, leadGap: 14, gap: 30, lineH: 24, lineGap: 6 };

test("the row fits on one line after the lead, with a dot between steps", () => {
  const l = layoutPlanRow([150, 100, 80], { ...ROW, maxW: 1000 });
  assert.equal(l.lines, 1);
  assert.deepEqual(l.pos, [{ x: 54, y: 0 }, { x: 234, y: 0 }, { x: 364, y: 0 }]);
  assert.deepEqual(l.dots, [{ x: 219, y: 0 }, { x: 349, y: 0 }]);
  assert.equal(l.w, 444);
  assert.equal(l.h, 24);
});

test("a row too wide wraps under the first step, never shrinking", () => {
  const l = layoutPlanRow([150, 100, 80], { ...ROW, maxW: 340 });
  assert.equal(l.lines, 2);
  assert.deepEqual(l.pos, [{ x: 54, y: 0 }, { x: 234, y: 0 }, { x: 54, y: 30 }]);
  // No dot at the end of a line or the start of the next.
  assert.deepEqual(l.dots, [{ x: 219, y: 0 }]);
  assert.equal(l.h, 24 + 6 + 24);
  for (const [i, p] of l.pos.entries()) assert.ok(p.x + [150, 100, 80][i] <= 340);
});

test("on a narrow page a step too wide beside the lead starts at the left edge", () => {
  const l = layoutPlanRow([300, 120], { ...ROW, maxW: 320 });
  assert.deepEqual(l.pos, [{ x: 0, y: 30 }, { x: 0, y: 60 }]);
  assert.equal(l.lines, 3);
});

test("no lead: steps start at the left", () => {
  const l = layoutPlanRow([100, 100], { ...ROW, lead: 0, maxW: 500 });
  assert.deepEqual(l.pos, [{ x: 0, y: 0 }, { x: 130, y: 0 }]);
});
