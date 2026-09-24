import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAnswer } from "./answer-check";
import { SKILL_CATALOG } from "./skill-catalog";
import { STAGED_LESSONS, lessonTopic } from "./staged-lessons";
import { SKILL_PREREQUISITES, SKILL_PROBES, rootsOf, showMeProbes, skillsForTopic, topicBrief } from "./skill-map";

const KEYS = SKILL_CATALOG.map((s) => s.key);

test("every catalog skill has prerequisites, all of them catalog keys", () => {
  assert.deepEqual(Object.keys(SKILL_PREREQUISITES).sort(), [...KEYS].sort());
  for (const [key, pre] of Object.entries(SKILL_PREREQUISITES)) {
    assert.ok(pre.length <= 3, `${key} lists at most three`);
    assert.equal(new Set(pre).size, pre.length, `${key} has no duplicates`);
    for (const p of pre) {
      assert.ok(KEYS.includes(p), `${key} → ${p} is in the catalog`);
      assert.notEqual(p, key);
    }
  }
});

test("the prerequisite map is acyclic", () => {
  const state = new Map<string, "visiting" | "done">();
  const visit = (k: string, path: string[]) => {
    if (state.get(k) === "done") return;
    assert.notEqual(state.get(k), "visiting", `cycle: ${[...path, k].join(" → ")}`);
    state.set(k, "visiting");
    for (const p of SKILL_PREREQUISITES[k]) visit(p, [...path, k]);
    state.set(k, "done");
  };
  for (const k of KEYS) visit(k, []);
});

test("the orderings the plan names", () => {
  assert.deepEqual(SKILL_PREREQUISITES["fractions.add-unlike"], ["fractions.equivalent", "fractions.add-like"]);
  assert.deepEqual(SKILL_PREREQUISITES["fractions.equivalent"], ["fractions.identify", "arithmetic.multiply"]);
  assert.deepEqual(SKILL_PREREQUISITES["equations.two-step"], ["equations.one-step", "integers.operations"]);
  assert.deepEqual(SKILL_PREREQUISITES["graphs.slope"], ["integers.operations", "fractions.identify"]);
  assert.ok(SKILL_PREREQUISITES["graphs.linear-equations"].includes("graphs.slope"), "slope comes before graphing lines");
  assert.ok(!SKILL_PREREQUISITES["graphs.slope"].includes("graphs.linear-equations"));
});

test("rootsOf walks back nearest first, each once", () => {
  assert.deepEqual(rootsOf("fractions.add-unlike", 1), ["fractions.equivalent", "fractions.add-like"]);
  assert.deepEqual(rootsOf("fractions.add-unlike"), ["fractions.equivalent", "fractions.add-like", "fractions.identify", "arithmetic.multiply", "arithmetic.add"]);
  assert.deepEqual(rootsOf("arithmetic.add"), []);
  assert.deepEqual(rootsOf("unknown.key"), []);
  assert.equal(rootsOf("graphs.systems", 0).length, 0);
  const deep = rootsOf("graphs.systems", 10);
  assert.equal(new Set(deep).size, deep.length);
  assert.ok(deep.includes("arithmetic.add"), "everything leads back to adding");
  assert.ok(!deep.includes("graphs.systems"));
});

test("every skill has one or two probes, short asks, easiest first", () => {
  assert.deepEqual(Object.keys(SKILL_PROBES).sort(), [...KEYS].sort());
  for (const [key, probes] of Object.entries(SKILL_PROBES)) {
    assert.ok(probes.length >= 1 && probes.length <= 2, key);
    for (const p of probes) {
      assert.ok(p.ask.length <= 60, `${key}: "${p.ask}" is ${p.ask.length} chars`);
      assert.ok(p.problem.includes("$"), `${key}: the math sits in $…$`);
      assert.ok(Boolean(p.open) !== Boolean(p.solution), `${key}: a probe is open or has a solution, not both`);
      if (p.answer) assert.match(p.answer, /\?$/);
    }
  }
});

test("every probe with one answer is one the checker can judge", () => {
  let checked = 0;
  for (const [key, probes] of Object.entries(SKILL_PROBES)) {
    for (const p of probes) {
      if (p.open) continue;
      const problem = p.problem.replace(/\$/g, "");
      const r = checkAnswer(problem, p.solution!);
      assert.equal(r.verdict, "correct", `${key}: ${problem} with "${p.solution}" → ${r.message}`);
      checked++;
    }
  }
  assert.ok(checked >= 50, `checked ${checked}`);
});

test("a probe also catches a wrong answer", () => {
  assert.equal(checkAnswer("Which is bigger, \\frac{1}{3} or \\frac{1}{4}?", "a fourth").verdict, "incorrect");
  assert.equal(checkAnswer("-3 + 5", "-8").verdict, "incorrect");
  assert.equal(checkAnswer("\\frac{1}{2} + \\frac{1}{4}", "2/6").verdict, "incorrect", "the add-the-bottoms slip");
  assert.equal(checkAnswer("Which is greater, -3 or -7?", "-7").verdict, "incorrect");
});

test("skillsForTopic reads what students actually say", () => {
  const cases: [string, string[]][] = [
    ["adding fractions", ["fractions.add-unlike", "fractions.add-like"]],
    ["adding fractions with different denominators", ["fractions.add-unlike", "fractions.add-like"]],
    ["I don't get fractions at all", ["fractions.identify", "fractions.equivalent", "fractions.add-like"]],
    ["fractions", ["fractions.identify", "fractions.equivalent", "fractions.add-like"]],
    ["two step equations", ["equations.two-step"]],
    ["2-step equations", ["equations.two-step"]],
    ["solve for x", ["equations.one-step", "equations.two-step"]],
    ["slope", ["graphs.slope"]],
    ["percent", ["percent.of"]],
    ["percentages", ["percent.of"]],
    ["how do I do 15% of something", ["percent.of"]],
    ["negative numbers", ["integers.operations"]],
    ["simplifying fractions", ["fractions.equivalent"]],
    ["multiplying fractions", ["fractions.multiply"]],
    ["dividing fractions keep change flip", ["fractions.divide"]],
    ["comparing fractions", ["fractions.compare"]],
    ["mixed numbers", ["fractions.mixed-numbers"]],
    ["long division", ["arithmetic.divide"]],
    ["my times tables", ["arithmetic.multiply"]],
    ["multiplying decimals", ["decimals.operations"]],
    ["ratios and proportions homework", ["ratios.proportions"]],
    ["rate of change", ["graphs.slope"]],
    ["y = mx + b", ["graphs.linear-equations", "graphs.slope"]],
    ["systems of equations", ["graphs.systems"]],
    ["quadratics", ["equations.quadratic-solutions"]],
    ["combining like terms", ["algebra.combine-like-terms"]],
    ["the distributive property", ["algebra.distribute"]],
    ["percent increase and decrease", ["percent.change", "percent.of"]],
    ["finding the x intercept", ["graphs.intercepts"]],
    ["Fractions: 1/2 + 1/4", ["fractions.add-unlike"]],
    ["can you help me with 3x + 7 = 19", ["equations.two-step"]],
    ["x + 5 = 12", ["equations.one-step"]],
    ["adding fractions like 1/5 + 2/5", ["fractions.add-like", "fractions.add-unlike"]],
  ];
  for (const [said, want] of cases) assert.deepEqual(skillsForTopic(said), want, said);
});

test("skillsForTopic stays quiet when it doesn't know", () => {
  for (const said of ["", "   ", "my essay on the civil war", "hi", "can you help me", "chemistry balancing", "I have a test tomorrow"]) {
    assert.deepEqual(skillsForTopic(said), [], said);
  }
  for (const said of ["fractions and percent and slope and ratios", "adding and subtracting fractions"]) {
    assert.ok(skillsForTopic(said).length <= 3, said);
  }
});

test("every staged lesson's topic leads with its own skill", () => {
  for (const lesson of STAGED_LESSONS) {
    assert.equal(skillsForTopic(lessonTopic(lesson))[0], lesson.skillKey, lessonTopic(lesson));
  }
});

test("the show-me ladder: roots first, then the skill, at most three", () => {
  const ladder = showMeProbes("fractions.add-unlike").map((p) => p.problem);
  assert.deepEqual(ladder, [
    "Which is bigger, $\\frac{1}{3}$ or $\\frac{1}{4}$?",
    "$\\frac{1}{2} = \\frac{?}{6}$",
    "$\\frac{1}{2} + \\frac{1}{4}$",
  ]);
  const add = showMeProbes("arithmetic.add");
  assert.deepEqual(add, SKILL_PROBES["arithmetic.add"], "no roots: its own probes");
  for (const key of KEYS) {
    const probes = showMeProbes(key);
    assert.ok(probes.length >= 1 && probes.length <= 3, key);
    assert.equal(probes[probes.length - 1] === SKILL_PROBES[key][0] || probes.includes(SKILL_PROBES[key][0]), true, `${key} ends on its own probe`);
  }
});

test("topicBrief: one short paragraph, or nothing", () => {
  const brief = topicBrief("adding fractions");
  assert.equal(
    brief,
    'Likely skill: Adding fractions with unlike denominators. Comes before it: Equivalent fractions, Adding fractions with like denominators. Show-me problems, easiest first: "Which is bigger, $\\frac{1}{3}$ or $\\frac{1}{4}$?" · "$\\frac{1}{2} = \\frac{?}{6}$" · "$\\frac{1}{2} + \\frac{1}{4}$"',
  );
  assert.equal(topicBrief("my essay"), "");
  assert.match(topicBrief("two step equations"), /"\$2x \+ 3 = 11\$" \(Don't solve it: what's your first move\?\)/);
  assert.doesNotMatch(topicBrief("addition"), /Comes before it/, "a skill with no roots says nothing about roots");
  for (const skill of SKILL_CATALOG) {
    const b = topicBrief(skill.label);
    assert.ok(b.startsWith(`Likely skill: ${skill.label}.`), `${skill.label}: ${b}`);
    assert.ok(b.length <= 320, `${skill.key}: ${b.length} chars`);
  }
  assert.match(topicBrief("slope"), /"\$\\frac\{6\}\{2\}\$" \(Up 6, over 2\. What's the slope\?\)/, "bare math keeps its question when there is room");
  {
  }
});
