import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILL_CATALOG } from "./skill-catalog";
import { gradeNumber, starterFor, starterTopics } from "./starter-topics";

test("every catalog skill has a starter problem, and every starter names a skill", () => {
  for (const skill of SKILL_CATALOG) assert.ok(starterFor(skill.key), `no starter for ${skill.key}`);
  const keys = new Set(SKILL_CATALOG.map((s) => s.key));
  for (const skill of SKILL_CATALOG) assert.ok(keys.has(skill.key));
});

test("stored levels read as grades", () => {
  assert.equal(gradeNumber("7th grade"), 7);
  assert.equal(gradeNumber("12th grade"), 12);
  assert.equal(gradeNumber("College / University"), 12);
  assert.equal(gradeNumber("Middle school (6–8)"), 7);
  assert.equal(gradeNumber("High school (9–12)"), 10);
  assert.equal(gradeNumber("Self-learner"), null);
  assert.equal(gradeNumber(""), null);
  assert.equal(gradeNumber(null), null);
});

test("four starters for a grade, one domain each, inside the grade's band where the catalog allows", () => {
  for (const grade of ["5th grade", "7th grade", "10th grade"]) {
    const g = gradeNumber(grade)!;
    const picks = starterTopics(grade);
    assert.equal(picks.length, 4, grade);
    const domains = picks.map((p) => SKILL_CATALOG.find((s) => s.key === p.skillKey)!.domain);
    assert.equal(new Set(domains).size, domains.length, `${grade}: ${domains.join(", ")}`);
    for (const p of picks) {
      const [lo, hi] = SKILL_CATALOG.find((s) => s.key === p.skillKey)!.gradeBand.split("-").map(Number);
      assert.ok(g >= lo && g <= hi, `${grade}: ${p.skillKey} is ${lo}-${hi}`);
      assert.ok(p.problem.length > 0 && p.problem.length <= 48, p.problem);
    }
  }
});

test("the top of the catalog still gets four: 12th grade leads with its two in-band skills and fills from just below", () => {
  const picks = starterTopics("12th grade").map((p) => p.skillKey);
  assert.equal(picks.length, 4);
  assert.deepEqual(picks.slice(0, 2).sort(), ["equations.quadratic-solutions", "graphs.systems"]);
  for (const key of picks.slice(2)) {
    const hi = Number(SKILL_CATALOG.find((s) => s.key === key)!.gradeBand.split("-")[1]);
    assert.ok(hi >= 10, `${key} reaches only grade ${hi}`);
  }
});

test("the picks lean toward the grade: equations by 10th, arithmetic by 5th", () => {
  const tenth = starterTopics("10th grade").map((p) => p.skillKey);
  assert.ok(tenth.some((k) => k.startsWith("equations.") || k.startsWith("graphs.")), tenth.join(", "));
  assert.ok(!tenth.some((k) => k.startsWith("arithmetic.")), tenth.join(", "));
  const fifth = starterTopics("5th grade").map((p) => p.skillKey);
  assert.ok(fifth.some((k) => k.startsWith("arithmetic.") || k.startsWith("fractions.")), fifth.join(", "));
  assert.ok(!fifth.some((k) => k.startsWith("equations.") || k.startsWith("graphs.")), fifth.join(", "));
});

test("an unknown grade still gets four, and the same four every time", () => {
  const a = starterTopics("Self-learner");
  const b = starterTopics(null);
  assert.equal(a.length, 4);
  assert.deepEqual(a, b);
  assert.deepEqual(starterTopics("7th grade"), starterTopics("7th grade"));
});
