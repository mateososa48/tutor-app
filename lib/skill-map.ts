// What comes before what, and a tiny "show me" problem for each skill, so an
// opening can find where a student actually is instead of starting where the
// topic says. Ordering follows the Common Core progressions (the Learning
// Commons knowledge graph is the plan's eventual seed); only direct
// prerequisites are listed, and rootsOf walks further.
//
// This only picks probes and roots for a session's instructions. It never
// records evidence: that stays with check_answer and lib/learning-evidence.ts.

import { SKILL_CATALOG, resolveSkill } from "./skill-catalog";

export const SKILL_PREREQUISITES: Record<string, string[]> = {
  "arithmetic.add": [],
  "arithmetic.subtract": ["arithmetic.add"],
  "arithmetic.multiply": ["arithmetic.add"],
  "arithmetic.divide": ["arithmetic.multiply", "arithmetic.subtract"],
  // Fractions start from equal parts of a whole (grade 3), not from division:
  // a student lost on fractions was shown "56 ÷ 7" first.
  "fractions.identify": [],
  "fractions.equivalent": ["fractions.identify", "arithmetic.multiply"],
  "fractions.compare": ["fractions.equivalent"],
  "fractions.add-like": ["fractions.identify", "arithmetic.add"],
  "fractions.add-unlike": ["fractions.equivalent", "fractions.add-like"],
  "fractions.subtract": ["fractions.add-like", "fractions.equivalent", "arithmetic.subtract"],
  "fractions.multiply": ["fractions.identify", "arithmetic.multiply"],
  "fractions.divide": ["fractions.multiply", "arithmetic.divide"],
  "fractions.mixed-numbers": ["fractions.identify", "arithmetic.divide"],
  // Tenths and hundredths are fractions first (4.NF.5-6).
  "decimals.operations": ["fractions.equivalent", "arithmetic.add", "arithmetic.multiply"],
  "percent.of": ["fractions.identify", "decimals.operations"],
  "percent.change": ["percent.of", "arithmetic.subtract"],
  "ratios.proportions": ["fractions.equivalent", "arithmetic.divide"],
  "integers.operations": ["arithmetic.add", "arithmetic.subtract"],
  "algebra.evaluate": ["arithmetic.multiply", "integers.operations"],
  "algebra.combine-like-terms": ["integers.operations", "algebra.evaluate"],
  "algebra.distribute": ["arithmetic.multiply", "integers.operations"],
  "algebra.simplify": ["algebra.combine-like-terms", "algebra.distribute"],
  "equations.one-step": ["integers.operations", "algebra.evaluate"],
  "equations.two-step": ["equations.one-step", "integers.operations"],
  "equations.variables-both-sides": ["equations.two-step", "algebra.combine-like-terms", "algebra.distribute"],
  "equations.quadratic-solutions": ["equations.two-step", "algebra.distribute"],
  // Slope is a rate before it is a line (8.EE.6 builds on 7.RP).
  "graphs.slope": ["integers.operations", "fractions.identify"],
  "graphs.intercepts": ["equations.one-step", "algebra.evaluate"],
  "graphs.linear-equations": ["graphs.slope", "graphs.intercepts"],
  "graphs.systems": ["graphs.linear-equations", "equations.variables-both-sides"],
};

/** Prerequisites up to `depth` levels back, nearest first, each once. */
export function rootsOf(key: string, depth = 2): string[] {
  const seen = new Set<string>([key]);
  const out: string[] = [];
  let level = [key];
  for (let d = 0; d < depth && level.length; d++) {
    const next: string[] = [];
    for (const k of level) {
      for (const p of SKILL_PREREQUISITES[k] ?? []) {
        if (seen.has(p)) continue;
        seen.add(p);
        out.push(p);
        next.push(p);
      }
    }
    level = next;
  }
  return out;
}

/**
 * A "show me" problem. `problem` is the math as start_problem takes it and the
 * checker reads it ($ removed); `ask` is what the tutor says; `answer` the line
 * the student completes, when it helps. `solution` is the right answer as a
 * student would say it (the tests run it through checkAnswer); `open` marks a
 * probe with no single answer ("what's your first move?").
 */
export type SkillProbe = { problem: string; ask: string; answer?: string; solution?: string; open?: true };

// Easiest first. Picture-only questions ("what fraction is shaded?") are left
// out: the checker can't read a picture.
export const SKILL_PROBES: Record<string, SkillProbe[]> = {
  "arithmetic.add": [
    { problem: "$38 + 45$", ask: "What's 38 plus 45?", solution: "83" },
    { problem: "$276 + 158$", ask: "Add these two for me.", solution: "434" },
  ],
  "arithmetic.subtract": [
    { problem: "$52 - 17$", ask: "What's 52 take away 17?", solution: "35" },
    { problem: "$403 - 168$", ask: "Try this one. Watch the zero.", solution: "235" },
  ],
  "arithmetic.multiply": [
    { problem: "$7 \\times 8$", ask: "What's 7 times 8?", solution: "56" },
    { problem: "$23 \\times 4$", ask: "What's 23 times 4?", solution: "92" },
  ],
  "arithmetic.divide": [
    { problem: "$56 \\div 7$", ask: "What's 56 divided by 7?", solution: "8" },
    { problem: "$144 \\div 12$", ask: "And 144 divided by 12?", solution: "12" },
  ],
  "fractions.identify": [
    { problem: "Which is bigger, $\\frac{1}{3}$ or $\\frac{1}{4}$?", ask: "Which piece is bigger: a third or a fourth?", solution: "a third" },
    { problem: "How many fourths make $1$ whole?", ask: "How many fourths make one whole?", solution: "four" },
  ],
  "fractions.equivalent": [
    { problem: "$\\frac{1}{2} = \\frac{?}{6}$", ask: "How many sixths make one half?", solution: "3" },
    { problem: "How many twelfths make $\\frac{3}{4}$?", ask: "How many twelfths make three fourths?", solution: "9" },
  ],
  "fractions.compare": [
    { problem: "Which is bigger, $\\frac{2}{3}$ or $\\frac{3}{5}$?", ask: "Which is bigger: two thirds or three fifths?", solution: "2/3" },
    { problem: "Which is smaller, $\\frac{3}{8}$ or $\\frac{1}{3}$?", ask: "Which is smaller: three eighths or a third?", solution: "1/3" },
  ],
  "fractions.add-like": [
    { problem: "$\\frac{2}{7} + \\frac{3}{7}$", ask: "What's two sevenths plus three sevenths?", solution: "5/7" },
    { problem: "$\\frac{5}{8} + \\frac{7}{8}$", ask: "And five eighths plus seven eighths?", solution: "12/8" },
  ],
  "fractions.add-unlike": [
    { problem: "$\\frac{1}{2} + \\frac{1}{4}$", ask: "What's a half plus a quarter?", solution: "3/4" },
    { problem: "$\\frac{1}{3} + \\frac{1}{4}$", ask: "What's a third plus a fourth?", solution: "7/12" },
  ],
  "fractions.subtract": [
    { problem: "$\\frac{5}{8} - \\frac{3}{8}$", ask: "What's five eighths minus three eighths?", solution: "2/8" },
    { problem: "$\\frac{3}{4} - \\frac{1}{3}$", ask: "Now three fourths minus a third.", solution: "5/12" },
  ],
  "fractions.multiply": [
    { problem: "$\\frac{1}{2}$ of $12$", ask: "What's half of 12?", solution: "6" },
    { problem: "$\\frac{1}{2} \\times \\frac{1}{3}$", ask: "What's a half of a third?", solution: "1/6" },
  ],
  "fractions.divide": [
    { problem: "$3 \\div \\frac{1}{2}$", ask: "How many halves fit in 3?", solution: "6" },
    { problem: "$\\frac{3}{4} \\div \\frac{1}{8}$", ask: "How many eighths fit in three fourths?", solution: "6" },
  ],
  "fractions.mixed-numbers": [
    { problem: "$\\frac{7}{2}$", ask: "Write seven halves as a mixed number.", solution: "3 1/2" },
    { problem: "$\\frac{11}{4}$", ask: "And eleven fourths?", solution: "two and three quarters" },
  ],
  "decimals.operations": [
    { problem: "$0.5 + 0.25$", ask: "What's 0.5 plus 0.25?", solution: "0.75" },
    { problem: "$1.2 \\times 3$", ask: "What's 1.2 times 3?", solution: "3.6" },
  ],
  "percent.of": [
    { problem: "$50\\%$ of $40$", ask: "What's 50% of 40?", solution: "20" },
    { problem: "$10\\%$ of $70$", ask: "And 10% of 70?", solution: "7" },
  ],
  "percent.change": [
    { problem: "$\\frac{5}{20} = \\frac{?}{100}$", ask: "5 out of 20: what percent is that?", solution: "25" },
    { problem: "$80 - 25\\%$ of $80$", ask: "An $80 jacket is 25% off. What do you pay?", solution: "60" },
  ],
  "ratios.proportions": [
    { problem: "$\\frac{2}{3} = \\frac{?}{12}$", ask: "2 cups for 3 people. How many for 12?", solution: "8" },
    { problem: "$\\frac{3}{5} = \\frac{12}{?}$", ask: "3 out of 5 is 12 out of what?", solution: "20" },
  ],
  "integers.operations": [
    { problem: "$-3 + 5$", ask: "Start at −3 and go up 5. Where are you?", solution: "2" },
    { problem: "Which is greater, $-3$ or $-7$?", ask: "Which is greater: −3 or −7?", solution: "negative three" },
  ],
  "algebra.evaluate": [
    { problem: "$2(4) + 3$", ask: "What's 2x + 3 when x is 4?", solution: "11" },
    { problem: "$(-2)^2 + 1$", ask: "What's x² + 1 when x is −2?", solution: "5" },
  ],
  "algebra.combine-like-terms": [
    { problem: "$3x + 5x$", ask: "Put 3x + 5x together.", solution: "8x" },
    { problem: "$4x + 2 - x + 5$", ask: "Make this one shorter.", solution: "3x + 7" },
  ],
  "algebra.distribute": [
    { problem: "$3(x + 4)$", ask: "Multiply this out for me.", solution: "3x + 12" },
    { problem: "$-2(x - 5)$", ask: "And this one. Watch the signs.", solution: "-2x + 10" },
  ],
  "algebra.simplify": [
    { problem: "$2(x + 3) + 4x$", ask: "Make this as short as you can.", solution: "6x + 6" },
    { problem: "$5x - 2(x - 1)$", ask: "Now this one.", solution: "3x + 2" },
  ],
  "equations.one-step": [
    { problem: "$x + 7 = 12$", ask: "What's x?", answer: "x = ?", solution: "5" },
    { problem: "$3x = 21$", ask: "And here?", answer: "x = ?", solution: "7" },
  ],
  "equations.two-step": [
    { problem: "$2x + 3 = 11$", ask: "Don't solve it: what's your first move?", open: true },
    { problem: "$3x - 4 = 11$", ask: "Solve this one.", answer: "x = ?", solution: "5" },
  ],
  "equations.variables-both-sides": [
    { problem: "$4x = x + 9$", ask: "What's x?", answer: "x = ?", solution: "3" },
    { problem: "$5x + 2 = 3x + 10$", ask: "Don't solve it: what would you do first?", open: true },
  ],
  "equations.quadratic-solutions": [
    { problem: "$x^2 = 9$", ask: "What could x be?", answer: "x = ?", solution: "x = 3 or x = -3" },
    { problem: "$x^2 - 5x + 6 = 0$", ask: "Which numbers make this true?", answer: "x = ?", solution: "2 or 3" },
  ],
  "graphs.slope": [
    { problem: "$\\frac{6}{2}$", ask: "Up 6, over 2. What's the slope?", solution: "3" },
    { problem: "$\\frac{-4}{2}$", ask: "Down 4, over 2. What's the slope?", solution: "negative two" },
  ],
  "graphs.intercepts": [
    { problem: "$2(0) + 6$", ask: "Where does y = 2x + 6 cross the y-axis?", solution: "6" },
    { problem: "$2x + 6 = 0$", ask: "And where does it cross the x-axis?", answer: "x = ?", solution: "-3" },
  ],
  "graphs.linear-equations": [
    { problem: "$2(3) + 1$", ask: "On y = 2x + 1, what's y when x is 3?", solution: "7" },
    { problem: "$y = 2x + 1$", ask: "Where would you put your first point?", open: true },
  ],
  "graphs.systems": [
    { problem: "$x + 1 = 2x - 1$", ask: "Where do y = x + 1 and y = 2x − 1 meet?", answer: "x = ?", solution: "2" },
  ],
};

// Topic words, most specific first. `group` lets a vague word ("fractions")
// step aside when a precise one in the same area already matched; the
// arithmetic words only count when nothing else did ("multiplying decimals"
// is decimals, not multiplication).
type TopicRule = { when: RegExp; keys: string[]; group: string; tier: "specific" | "generic" | "fallback" };

const FRACTION = String.raw`fractions?`;
const TOPIC_RULES: TopicRule[] = [
  { when: /\b(systems?|simultaneous|two equations)\b/, keys: ["graphs.systems"], group: "equations", tier: "specific" }, // "systems of equations" is not a one-step topic
  { when: /\b(quadratics?|parabolas?|factoring|quadratic formula|x squared)\b|x\s*(\^\s*2|²)/, keys: ["equations.quadratic-solutions"], group: "equations", tier: "specific" },
  { when: /\b(variables? on both sides|both sides|multi ?step)\b/, keys: ["equations.variables-both-sides"], group: "equations", tier: "specific" },
  { when: /\b(two|2) step\b/, keys: ["equations.two-step"], group: "equations", tier: "specific" },
  { when: /\b(one|1) step\b/, keys: ["equations.one-step"], group: "equations", tier: "specific" },
  { when: /\b(y ?= ?mx ?\+ ?b|slope intercept|graph(ing)? (a |the )?lines?|linear (equations?|functions?|graphs?)|lines? on a graph)\b/, keys: ["graphs.linear-equations", "graphs.slope"], group: "graphs", tier: "specific" },
  { when: /\b(slopes?|rate of change|rise over run|steep(ness)?)\b/, keys: ["graphs.slope"], group: "graphs", tier: "specific" },
  { when: /\bintercepts?\b/, keys: ["graphs.intercepts"], group: "graphs", tier: "specific" },
  { when: /\blike terms\b/, keys: ["algebra.combine-like-terms"], group: "algebra", tier: "specific" },
  { when: /\b(distribut\w*|expand\w*|brackets|parenthes[ie]s)\b/, keys: ["algebra.distribute"], group: "algebra", tier: "specific" },
  { when: /\bsimplif\w*\b(?!.*\bfractions?\b)|\bsimplifying expressions?\b/, keys: ["algebra.simplify"], group: "algebra", tier: "specific" },
  { when: /\b(evaluat\w*|substitut\w*|plug(ging)? in)\b/, keys: ["algebra.evaluate"], group: "algebra", tier: "specific" },
  { when: /\b(percent(age)? (change|increase|decrease)|discounts?|markups?|sale price|on sale|percent off)\b|\b(increase|decrease|went up|went down|goes up|goes down)\b.*%|% off\b/, keys: ["percent.change", "percent.of"], group: "percent", tier: "specific" },
  { when: /\b(ratios?|proportions?|proportional|unit rates?|rates?(?! of change)|scale factor|scaling)\b/, keys: ["ratios.proportions"], group: "ratios", tier: "specific" },
  { when: /\b(negative numbers?|negatives|integers?|positive and negative|below zero|minus numbers?)\b/, keys: ["integers.operations"], group: "integers", tier: "specific" },
  { when: /\bdecimals?\b/, keys: ["decimals.operations"], group: "decimals", tier: "specific" },
  { when: new RegExp(String.raw`\b(different|unlike|not the same) denominators?\b`), keys: ["fractions.add-unlike"], group: "fractions", tier: "specific" },
  { when: new RegExp(String.raw`\b(same|like) denominators?\b`), keys: ["fractions.add-like"], group: "fractions", tier: "specific" },
  { when: new RegExp(String.raw`\b(add|adding|addition|sum|plus)\b.*\b${FRACTION}\b|\b${FRACTION}\b.*\b(add|adding|addition|plus)\b`), keys: ["fractions.add-unlike", "fractions.add-like"], group: "fractions", tier: "specific" },
  { when: new RegExp(String.raw`\b(subtract\w*|minus|take away)\b.*\b${FRACTION}\b|\b${FRACTION}\b.*\b(subtract\w*|minus)\b`), keys: ["fractions.subtract"], group: "fractions", tier: "specific" },
  { when: new RegExp(String.raw`\b(multipl\w*|times)\b.*\b${FRACTION}\b|\b${FRACTION}\b.*\b(multipl\w*|times)\b`), keys: ["fractions.multiply"], group: "fractions", tier: "specific" },
  { when: new RegExp(String.raw`\b(divid\w*|division)\b.*\b${FRACTION}\b|\b${FRACTION}\b.*\b(divid\w*|division)\b|\breciprocals?\b|keep change flip`), keys: ["fractions.divide"], group: "fractions", tier: "specific" },
  { when: new RegExp(String.raw`\bequivalent ${FRACTION}\b|\b(simplif\w*|reduc\w*) ${FRACTION}\b|\blowest terms\b|\bsimplest form\b|\bcommon denominators?\b`), keys: ["fractions.equivalent"], group: "fractions", tier: "specific" },
  { when: new RegExp(String.raw`\b(compar\w*|order\w*|bigger|larger|greater|smaller)\b.*\b${FRACTION}\b|\b${FRACTION}\b.*\b(compar\w*|order\w*|bigger|larger|greater|smaller)\b`), keys: ["fractions.compare"], group: "fractions", tier: "specific" },
  { when: /\b(mixed numbers?|improper fractions?)\b/, keys: ["fractions.mixed-numbers"], group: "fractions", tier: "specific" },
  { when: /\b(equations?|solv\w* for [a-z]|find(ing)? [xy])\b/, keys: ["equations.one-step", "equations.two-step"], group: "equations", tier: "generic" },
  { when: /\b(graphs?|graphing|coordinate plane)\b/, keys: ["graphs.linear-equations"], group: "graphs", tier: "generic" },
  { when: /\b(algebra|expressions?|variables?)\b/, keys: ["algebra.evaluate", "algebra.combine-like-terms", "equations.one-step"], group: "algebra", tier: "generic" },
  { when: /\b(percent(age)?s?|per cent)\b|%/, keys: ["percent.of"], group: "percent", tier: "generic" },
  { when: /\b(fractions?|numerators?|denominators?|halves|thirds|quarters)\b/, keys: ["fractions.identify", "fractions.equivalent", "fractions.add-like"], group: "fractions", tier: "generic" },
  { when: /\b(long division|divid\w*|division)\b/, keys: ["arithmetic.divide"], group: "arithmetic", tier: "fallback" },
  { when: /\b(times tables?|multipl\w*)\b/, keys: ["arithmetic.multiply"], group: "arithmetic", tier: "fallback" },
  { when: /\b(subtract\w*|borrowing|regrouping)\b/, keys: ["arithmetic.subtract"], group: "arithmetic", tier: "fallback" },
  { when: /\b(add|adding|addition|carrying)\b/, keys: ["arithmetic.add"], group: "arithmetic", tier: "fallback" },
];

// The math in a topic says more than its words: "Fractions: 1/2 + 1/4" is
// unlike denominators, "3x + 7 = 19" is two steps.
function skillsFromMath(t: string): string[] {
  const frac = /(\d+)\s*\/\s*(\d+)\s*([+\-×*÷]|times)\s*(\d+)\s*\/\s*(\d+)/.exec(t);
  if (frac) {
    const [, , d1, op, , d2] = frac;
    if (op === "+") return [d1 === d2 ? "fractions.add-like" : "fractions.add-unlike"];
    if (op === "-") return ["fractions.subtract"];
    if (op === "÷") return ["fractions.divide"];
    return ["fractions.multiply"];
  }
  const eq = /^([^=]*)=([^=]*)$/.exec(t.replace(/[^0-9a-z+\-*/^().=²\s]/g, " "));
  if (eq && /(^|[^a-z])x([^a-z]|$)/.test(t)) {
    if (/x\s*(\^\s*2|²)/.test(t)) return ["equations.quadratic-solutions"];
    const [left, right] = [eq[1], eq[2]];
    const hasX = (side: string) => /(^|[^a-z])x([^a-z]|$)/.test(side);
    if (hasX(left) && hasX(right)) return ["equations.variables-both-sides"];
    const side = hasX(left) ? left : right;
    const scaled = /\d\s*x|x\s*\/\s*\d|\(/.test(side);
    const shifted = /x[^+-]*[+-]\s*\d|\d\s*[+-][^=]*x/.test(side);
    if (scaled && shifted) return ["equations.two-step"];
    if (scaled || shifted) return ["equations.one-step"];
  }
  if (/\d\s*%/.test(t)) return ["percent.of"];
  // A minus that starts a number, not one between two: "−7 + 12", "(−3)".
  if (/(^|[(:+×*÷=,])\s*-\s*\d/.test(t.trim())) return ["integers.operations"];
  if (/\d\.\d/.test(t)) return ["decimals.operations"];
  if (/\d\s*[×*]\s*\d/.test(t)) return ["arithmetic.multiply"];
  if (/\d\s*÷\s*\d/.test(t)) return ["arithmetic.divide"];
  return [];
}

/**
 * The catalog skills a free-text intake topic is about, best first, at most
 * three. Conservative: an unknown topic gives nothing.
 */
export function skillsForTopic(text: string): string[] {
  const t = ` ${(text ?? "").toLowerCase().replace(/[−–—]/g, "-")} `
    .replace(/(\w)-(?=[a-z])/g, "$1 ")
    .replace(/\s+/g, " ");
  if (!t.trim()) return [];
  const direct = resolveSkill(text);
  const out: string[] = direct ? [direct.key] : [];
  const add = (keys: string[]) => {
    for (const k of keys) if (!out.includes(k)) out.push(k);
  };
  const matched = new Set<string>();
  for (const rule of TOPIC_RULES) {
    if (rule.tier === "specific" && rule.when.test(t)) {
      add(rule.keys);
      matched.add(rule.group);
    }
  }
  const math = skillsFromMath(t);
  // Words name the topic; the math can only sharpen it ("Fractions: 1/2 + 1/4").
  if (math.length) {
    const words = out.slice();
    out.length = 0;
    if (words.length && !words.some((k) => DOMAIN.get(k) === DOMAIN.get(math[0]))) {
      add(words);
      add(math);
    } else {
      add(math);
      add(words);
    }
    for (const k of math) matched.add(k.split(".")[0]);
  }
  for (const rule of TOPIC_RULES) {
    if (rule.tier === "generic" && !matched.has(rule.group) && rule.when.test(t)) {
      add(rule.keys);
      matched.add(rule.group);
    }
  }
  if (out.length === 0) {
    for (const rule of TOPIC_RULES) if (rule.tier === "fallback" && rule.when.test(t)) add(rule.keys);
  }
  return out.slice(0, 3);
}

const LABEL = new Map(SKILL_CATALOG.map((s) => [s.key, s.label]));
const GRADE_FROM = new Map(SKILL_CATALOG.map((s) => [s.key, Number(s.gradeBand.split("-")[0])]));
const DOMAIN = new Map(SKILL_CATALOG.map((s) => [s.key, s.domain]));

/**
 * The show-me ladder for a skill, easiest first, at most three: one probe from
 * each nearby root (direct prerequisites, and roots two back in the same
 * area), then the skill's own. Roots two back in another area ("7 × 8" under
 * fractions) are too far down to be worth an opening's time.
 */
export function showMeProbes(key: string): SkillProbe[] {
  const own = SKILL_PROBES[key] ?? [];
  const direct = SKILL_PREREQUISITES[key] ?? [];
  const pool = rootsOf(key, 2)
    .filter((k) => direct.includes(k) || DOMAIN.get(k) === DOMAIN.get(key))
    .map((k, i) => ({ k, i, deep: direct.includes(k) ? 0 : 1 }))
    .sort((a, b) => b.deep - a.deep || (GRADE_FROM.get(a.k) ?? 0) - (GRADE_FROM.get(b.k) ?? 0) || a.i - b.i)
    .map(({ k }) => SKILL_PROBES[k]?.[0])
    .filter((p): p is SkillProbe => Boolean(p));
  const rootSlots = Math.min(pool.length, own.length ? 2 : 3);
  return [...pool.slice(0, rootSlots), ...own.slice(0, 3 - rootSlots)];
}

/**
 * One or two short lines for the session's instructions: the likely skill,
 * what comes before it, and show-me problems. "" when nothing matched.
 */
export function topicBrief(text: string): string {
  const key = skillsForTopic(text)[0];
  if (!key) return "";
  const before = (SKILL_PREREQUISITES[key] ?? []).map((k) => LABEL.get(k)).filter(Boolean);
  // Bare math ("$\\frac{6}{2}$") means nothing without its question; a
  // problem that is already a question in words stands alone.
  const worded = (p: SkillProbe) => /[a-z]{3,}/i.test(p.problem.replace(/\\[a-z]+/gi, ""));
  const head = `Likely skill: ${LABEL.get(key)}.${before.length ? ` Comes before it: ${before.join(", ")}.` : ""}`;
  const ladder = showMeProbes(key);
  if (!ladder.length) return head;
  const brief = (asks: boolean) =>
    `${head} Show-me problems, easiest first: ${ladder.map((p) => `"${p.problem}"${(asks && !worded(p)) || p.open ? ` (${p.ask})` : ""}`).join(" · ")}`;
  // Asks help, but the brief stays short: past 300 characters only an open
  // probe keeps its question.
  const full = brief(true);
  return full.length <= 300 ? full : brief(false);
}
