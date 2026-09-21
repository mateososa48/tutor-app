import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILL_CATALOG } from "./skill-catalog";
import { gradeNumber, lessonByKey, lessonPlan, lessonTopic, lessonsForGrade, STAGED_LESSONS } from "./staged-lessons";
import { WHITEBOARD_TOOL_DECLARATIONS } from "./whiteboard-tools";

test("every lesson is staged: a skill in the catalog, three problems, a mistake and a board move", () => {
  const keys = new Set(SKILL_CATALOG.map((s) => s.key));
  const seen = new Set<string>();
  for (const lesson of STAGED_LESSONS) {
    assert.ok(!seen.has(lesson.key), `duplicate lesson ${lesson.key}`);
    seen.add(lesson.key);
    assert.ok(keys.has(lesson.skillKey), `${lesson.key}: ${lesson.skillKey} is not in the catalog`);
    assert.equal(lesson.problems.length, 3, lesson.key);
    for (const p of lesson.problems) assert.ok(p.trim().length > 0 && p.length <= 60, `${lesson.key}: "${p}"`);
    assert.ok(lesson.emoji.length > 0 && lesson.emoji.length <= 4, lesson.key);
    assert.ok(lesson.label.length <= 18, `${lesson.key}: label "${lesson.label}"`);
    assert.ok(lesson.blurb.length <= 40, `${lesson.key}: blurb "${lesson.blurb}"`);
    assert.ok(lesson.opening.length > 20, lesson.key);
    assert.ok(lesson.watchFor.length > 20, lesson.key);
  }
  assert.equal(STAGED_LESSONS.length, 10);
});

test("every lesson's board move names a real tool, and names no tool that does not exist", () => {
  const declared = new Set(WHITEBOARD_TOOL_DECLARATIONS.map((t) => t.name));
  for (const lesson of STAGED_LESSONS) {
    // Anything shaped like one of our tool names has to be one. Parameter
    // names (common_denominator) do not start with a tool's verb.
    const named = lesson.board.match(/\b(?:draw|add|write|plot)_[a-z_]+\b/g) ?? [];
    assert.ok(named.length > 0, `${lesson.key} names no tool: "${lesson.board}"`);
    for (const tool of named) {
      assert.ok(declared.has(tool), `${lesson.key} names ${tool}, which is not a declared tool`);
    }
  }
});

test("lessons are found by key, and an unknown key is null rather than a throw", () => {
  assert.equal(lessonByKey("fractions")?.label, "Fractions");
  assert.equal(lessonByKey("nope"), null);
  assert.equal(lessonByKey(null), null);
  assert.equal(lessonByKey(""), null);
});

test("stored levels read as grades", () => {
  assert.equal(gradeNumber("7th grade"), 7);
  assert.equal(gradeNumber("12th grade"), 12);
  assert.equal(gradeNumber("College / University"), 12);
  assert.equal(gradeNumber("Middle school (6–8)"), 7);
  assert.equal(gradeNumber("Self-learner"), null);
  assert.equal(gradeNumber(null), null);
});

test("a grade always gets six lessons, leaning to that grade, the same six every time", () => {
  for (const grade of ["5th grade", "7th grade", "10th grade", "12th grade", "Self-learner", null]) {
    const picks = lessonsForGrade(grade);
    assert.equal(picks.length, 6, String(grade));
    assert.equal(new Set(picks.map((p) => p.key)).size, 6, String(grade));
  }
  assert.deepEqual(lessonsForGrade("7th grade"), lessonsForGrade("7th grade"));
  // A 5th grader is not opened on quadratics; an 11th grader is not opened on times tables.
  assert.ok(!lessonsForGrade("5th grade").slice(0, 4).some((l) => l.key === "quadratics"));
  assert.ok(!lessonsForGrade("11th grade").slice(0, 4).some((l) => l.key === "multiplying"));
  assert.ok(lessonsForGrade("11th grade").slice(0, 4).some((l) => ["quadratics", "slope"].includes(l.key)));
});

test("the picked topic names the lesson and its first problem", () => {
  const lesson = lessonByKey("equations")!;
  assert.equal(lessonTopic(lesson), "Solving equations: 3x + 7 = 19");
});

test("the plan tells the tutor how to run it, and to drop it for the student's own work", () => {
  const plan = lessonPlan(lessonByKey("fractions")!);
  assert.match(plan, /fractions\.add-unlike/);
  assert.match(plan, /1\/2 \+ 1\/4/);
  assert.match(plan, /2\/3 \+ 1\/5/);
  assert.match(plan, /adding the bottoms/);
  assert.match(plan, /draw_fraction/);
  assert.match(plan, /never hand over an answer/);
  assert.match(plan, /drop this plan and work on theirs/);
  // Order matters: the warm-up is named before the stretch.
  assert.ok(plan.indexOf("1/2 + 1/4") < plan.indexOf("3/4 + 5/6"));
});
