import { SKILL_CATALOG, type SkillDefinition } from "./skill-catalog";

// Starter topics: something to work on when the student has nothing in mind,
// or a parent wants to see how the tutor teaches. Four real problems picked
// for the grade from the skill catalog, phrased as problems ("Solve 3x + 7 =
// 19") rather than skill names, because a problem is something to start on.
// Letting students pick from a few written examples beat tailored
// personalisation in the largest study on the question (Høgheim & Reber
// 2017, N = 713), and a starter names the skill, which is where the
// in-lesson diagnosis begins.

export type StarterTopic = { skillKey: string; label: string; problem: string };

// One problem per catalog skill. The test fails if a skill has none.
const STARTERS: Record<string, string> = {
  "arithmetic.add": "What's 347 + 289?",
  "arithmetic.subtract": "What's 502 − 178?",
  "arithmetic.multiply": "What's 24 × 17?",
  "arithmetic.divide": "What's 391 ÷ 17?",
  "fractions.identify": "3 slices of a pizza cut in 8: what fraction?",
  "fractions.equivalent": "Is 6/8 the same as 3/4?",
  "fractions.compare": "Which is bigger, 3/5 or 5/8?",
  "fractions.add-like": "What's 3/8 + 2/8?",
  "fractions.add-unlike": "What's 2/3 + 1/4?",
  "fractions.subtract": "What's 5/6 − 1/3?",
  "fractions.multiply": "What's 2/3 × 3/5?",
  "fractions.divide": "What's 3/4 ÷ 1/2?",
  "fractions.mixed-numbers": "Turn 11/4 into a mixed number",
  "decimals.operations": "What's 3.6 × 2.5?",
  "percent.of": "What's 15% of 80?",
  "percent.change": "A $40 shirt is 25% off. New price?",
  "ratios.proportions": "3 pens cost $2. What do 12 cost?",
  "integers.operations": "What's −7 + 12?",
  "algebra.evaluate": "If x = 4, what's 3x − 5?",
  "algebra.combine-like-terms": "Simplify 4x + 3 + 2x − 7",
  "algebra.distribute": "Expand 3(x + 4)",
  "algebra.simplify": "Simplify 2(x + 3) + 4x",
  "equations.one-step": "Solve x + 9 = 15",
  "equations.two-step": "Solve 3x + 7 = 19",
  "equations.variables-both-sides": "Solve 5x − 4 = 2x + 11",
  "equations.quadratic-solutions": "Solve x² − 5x + 6 = 0",
  "graphs.slope": "Slope between (1, 2) and (4, 8)?",
  "graphs.intercepts": "Where does y = 2x − 6 cross the axes?",
  "graphs.linear-equations": "Graph y = 2x + 1",
  "graphs.systems": "Solve y = x + 1 and y = 3 − x",
};

export function starterFor(skillKey: string): string | undefined {
  return STARTERS[skillKey];
}

/** The grade a stored level means, 5–12; college reads as 12; unknown as null. */
export function gradeNumber(value: string | null | undefined): number | null {
  const text = (value ?? "").trim().toLowerCase();
  if (!text) return null;
  const ordinal = /^(\d{1,2})(st|nd|rd|th)\b/.exec(text);
  if (ordinal) return Math.min(12, Math.max(1, Number(ordinal[1])));
  if (/^\d{1,2}$/.test(text)) return Math.min(12, Math.max(1, Number(text)));
  if (/college|university/.test(text)) return 12;
  if (/middle/.test(text)) return 7;
  if (/high/.test(text)) return 10;
  if (/element/.test(text)) return 5;
  return null;
}

function band(skill: SkillDefinition): [number, number] {
  const [lo, hi] = skill.gradeBand.split("-").map(Number);
  return [lo, hi];
}

/**
 * Four problems for a grade. Skills whose band holds the grade come first,
 * nearest the band's centre, the more advanced skill winning a tie; skills
 * outside the band follow by how far the band is from the grade, so the top
 * of the catalog (few skills reach 12th grade) still fills four. One skill
 * per domain while that is possible. Unknown grades get a middle-school
 * spread.
 */
export function starterTopics(grade: string | null | undefined, count = 4): StarterTopic[] {
  const g = gradeNumber(grade) ?? 8;
  const scored = SKILL_CATALOG.map((skill, order) => {
    const [lo, hi] = band(skill);
    const inside = g >= lo && g <= hi;
    // In band: distance to the centre. Out of band: past every in-band
    // skill, then distance to the nearer edge.
    const score = inside ? Math.abs((lo + hi) / 2 - g) : 100 + Math.min(Math.abs(lo - g), Math.abs(hi - g));
    return { skill, order, score, max: hi };
  }).sort((a, b) => a.score - b.score || b.max - a.max || a.order - b.order);

  const picked: typeof scored = [];
  const domains = new Set<string>();
  for (const s of scored) {
    if (picked.length >= count) break;
    if (domains.has(s.skill.domain)) continue;
    domains.add(s.skill.domain);
    picked.push(s);
  }
  // Fewer domains than slots: fill by score.
  for (const s of scored) {
    if (picked.length >= count) break;
    if (!picked.includes(s)) picked.push(s);
  }

  return picked.map(({ skill }) => ({ skillKey: skill.key, label: skill.label, problem: STARTERS[skill.key] ?? skill.label }));
}
