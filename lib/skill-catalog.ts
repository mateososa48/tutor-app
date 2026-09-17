export type SkillDomain = "arithmetic" | "fractions" | "decimals" | "percent" | "ratios" | "integers" | "algebra" | "equations" | "graphs";

export type SkillDefinition = {
  key: string;
  label: string;
  domain: SkillDomain;
  gradeBand: string;
  aliases: readonly string[];
};

export const SKILL_CATALOG: readonly SkillDefinition[] = [
  { key: "arithmetic.add", label: "Addition", domain: "arithmetic", gradeBand: "2-6", aliases: ["adding whole numbers", "whole number addition"] },
  { key: "arithmetic.subtract", label: "Subtraction", domain: "arithmetic", gradeBand: "2-6", aliases: ["subtracting whole numbers", "whole number subtraction"] },
  { key: "arithmetic.multiply", label: "Multiplication", domain: "arithmetic", gradeBand: "3-7", aliases: ["multiplying whole numbers", "times tables"] },
  { key: "arithmetic.divide", label: "Division", domain: "arithmetic", gradeBand: "3-7", aliases: ["dividing whole numbers", "long division"] },
  { key: "fractions.identify", label: "Understanding fractions", domain: "fractions", gradeBand: "3-6", aliases: ["identify fractions", "fraction meaning"] },
  { key: "fractions.equivalent", label: "Equivalent fractions", domain: "fractions", gradeBand: "3-7", aliases: ["finding equivalent fractions", "simplifying fractions"] },
  { key: "fractions.compare", label: "Comparing fractions", domain: "fractions", gradeBand: "3-7", aliases: ["order fractions", "ordering fractions"] },
  { key: "fractions.add-like", label: "Adding fractions with like denominators", domain: "fractions", gradeBand: "4-7", aliases: ["add fractions same denominator", "adding fractions same denominator"] },
  { key: "fractions.add-unlike", label: "Adding fractions with unlike denominators", domain: "fractions", gradeBand: "5-8", aliases: ["add fractions different denominators", "add fractions unlike denominators"] },
  { key: "fractions.subtract", label: "Subtracting fractions", domain: "fractions", gradeBand: "4-8", aliases: ["subtract fractions", "fraction subtraction"] },
  { key: "fractions.multiply", label: "Multiplying fractions", domain: "fractions", gradeBand: "5-8", aliases: ["multiply fractions", "fraction multiplication"] },
  { key: "fractions.divide", label: "Dividing fractions", domain: "fractions", gradeBand: "5-8", aliases: ["divide fractions", "fraction division"] },
  { key: "fractions.mixed-numbers", label: "Mixed numbers", domain: "fractions", gradeBand: "4-8", aliases: ["improper fractions and mixed numbers", "convert mixed numbers"] },
  { key: "decimals.operations", label: "Decimal operations", domain: "decimals", gradeBand: "4-8", aliases: ["operations with decimals", "decimal arithmetic"] },
  { key: "percent.of", label: "Percent of an amount", domain: "percent", gradeBand: "5-9", aliases: ["find a percent of a number", "percent of a number"] },
  { key: "percent.change", label: "Percent change", domain: "percent", gradeBand: "6-10", aliases: ["percent increase and decrease", "percentage change"] },
  { key: "ratios.proportions", label: "Ratios and proportions", domain: "ratios", gradeBand: "5-9", aliases: ["solve proportions", "proportional relationships"] },
  { key: "integers.operations", label: "Integer operations", domain: "integers", gradeBand: "6-9", aliases: ["operations with negative numbers", "negative number operations"] },
  { key: "algebra.evaluate", label: "Evaluating expressions", domain: "algebra", gradeBand: "6-9", aliases: ["evaluate an expression", "substitution in expressions"] },
  { key: "algebra.combine-like-terms", label: "Combining like terms", domain: "algebra", gradeBand: "6-10", aliases: ["combine like terms", "collect like terms"] },
  { key: "algebra.distribute", label: "The distributive property", domain: "algebra", gradeBand: "6-10", aliases: ["distributing expressions", "distributive property"] },
  { key: "algebra.simplify", label: "Simplifying expressions", domain: "algebra", gradeBand: "6-10", aliases: ["simplify algebraic expressions", "expression simplification"] },
  { key: "equations.one-step", label: "One-step equations", domain: "equations", gradeBand: "6-9", aliases: ["solving one step equations", "one step equation"] },
  { key: "equations.two-step", label: "Two-step equations", domain: "equations", gradeBand: "7-10", aliases: ["solving two step equations", "two step equations"] },
  { key: "equations.variables-both-sides", label: "Equations with variables on both sides", domain: "equations", gradeBand: "8-11", aliases: ["variables on both sides", "multi step equations"] },
  { key: "equations.quadratic-solutions", label: "Solving quadratic equations", domain: "equations", gradeBand: "9-12", aliases: ["quadratic solutions", "solve quadratics"] },
  { key: "graphs.slope", label: "Slope", domain: "graphs", gradeBand: "7-11", aliases: ["finding slope", "rate of change"] },
  { key: "graphs.intercepts", label: "Intercepts", domain: "graphs", gradeBand: "7-11", aliases: ["x intercept", "y intercept", "finding intercepts"] },
  { key: "graphs.linear-equations", label: "Graphing linear equations", domain: "graphs", gradeBand: "7-11", aliases: ["linear graphs", "slope intercept form"] },
  { key: "graphs.systems", label: "Systems of linear equations", domain: "graphs", gradeBand: "8-12", aliases: ["solving systems", "systems of equations"] },
] as const;

export function normalizeSkillLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[—–−]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const SKILL_LOOKUP = new Map<string, SkillDefinition>();
for (const skill of SKILL_CATALOG) {
  for (const candidate of [skill.key, skill.label, ...skill.aliases]) {
    SKILL_LOOKUP.set(normalizeSkillLabel(candidate), skill);
  }
}

/** Resolve only an explicit catalog key, label, or alias. Never fuzzy-create skills. */
export function resolveSkill(value: unknown): SkillDefinition | null {
  const normalized = normalizeSkillLabel(value);
  return normalized ? SKILL_LOOKUP.get(normalized) ?? null : null;
}

