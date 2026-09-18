import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILL_CATALOG, normalizeSkillLabel, resolveSkill } from "./skill-catalog";

test("catalog keys and aliases are unique after normalization", () => {
  const keys = new Set<string>();
  const labels = new Map<string, string>();
  for (const skill of SKILL_CATALOG) {
    assert.ok(!keys.has(skill.key), `duplicate key: ${skill.key}`);
    keys.add(skill.key);
    for (const candidate of [skill.key, skill.label, ...skill.aliases]) {
      const normalized = normalizeSkillLabel(candidate);
      const owner = labels.get(normalized);
      assert.ok(!owner || owner === skill.key, `ambiguous alias "${candidate}" for ${owner} and ${skill.key}`);
      labels.set(normalized, skill.key);
    }
  }
});

test("resolves canonical keys, labels, punctuation, and explicit aliases", () => {
  assert.equal(resolveSkill("fractions.add-unlike")?.key, "fractions.add-unlike");
  assert.equal(resolveSkill("Adding fractions with unlike denominators")?.key, "fractions.add-unlike");
  assert.equal(resolveSkill(" add fractions — different denominators ")?.key, "fractions.add-unlike");
  assert.equal(resolveSkill("two step equations")?.key, "equations.two-step");
  assert.equal(resolveSkill("Y-INTERCEPT")?.key, "graphs.intercepts");
});

test("does not guess at unknown or overly broad model-written labels", () => {
  assert.equal(resolveSkill("fractions"), null);
  assert.equal(resolveSkill("word problem about a train"), null);
  assert.equal(resolveSkill(""), null);
  assert.equal(resolveSkill(null), null);
});

