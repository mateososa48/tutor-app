// Ten lessons we picked and staged, for a student with nothing of their own
// to work on, or a parent who wants to see how the tutor teaches.
//
// A topic alone would only get the tutor to the right subject. Each of these
// carries a rehearsed plan as well: where to open, three problems in order,
// the mistake to expect, and what to put on the board first. That plan is
// appended to the session's instructions (lib/session-intake.ts), so a picked
// lesson runs like something prepared rather than something improvised.
//
// The plan never outranks the student. If they bring their own problem the
// tutor drops it, and the teaching rules in tutor-prompts.ts still decide how
// much help to give and when.

import { SKILL_CATALOG } from "./skill-catalog";

export type StagedLesson = {
  key: string;
  emoji: string;
  /** Two or three words on a tile. */
  label: string;
  /** What you will actually do, in the student's words. */
  blurb: string;
  /** The catalog skill this sits on, so the session starts with a skill named. */
  skillKey: string;
  /** Where to open, before any rule. */
  opening: string;
  /** Warm-up, the real one, and one to stretch into. */
  problems: readonly [string, string, string];
  /** The mistake to expect, so it is recognised rather than discovered. */
  watchFor: string;
  /** The first picture, named as a tool. */
  board: string;
};

export const STAGED_LESSONS: readonly StagedLesson[] = [
  {
    key: "fractions",
    emoji: "🍕",
    label: "Fractions",
    blurb: "Adding ones with different bottoms",
    skillKey: "fractions.add-unlike",
    opening: "Draw both fractions before naming any rule, so the recut is something they see rather than something they are told.",
    problems: ["1/2 + 1/4", "2/3 + 1/5", "3/4 + 5/6"],
    watchFor: "adding the bottoms as well as the tops, so 1/2 + 1/4 comes out as 2/6.",
    board: "draw_fraction with common_denominator, both fractions recut into the same pieces.",
  },
  {
    key: "percents",
    emoji: "💯",
    label: "Percents",
    blurb: "Finding a percent of a number",
    skillKey: "percent.of",
    opening: "Start on a hundred grid, so a percent is a picture before it is a calculation.",
    problems: ["15% of 80", "40% of 65", "A 25% tip on an $18 bill"],
    watchFor: "using 15 instead of 0.15, or dividing where they should multiply.",
    board: "draw_grid 10 by 10 with the percent shaded, then add_number_line as a double line.",
  },
  {
    key: "negatives",
    emoji: "🌡️",
    label: "Negative numbers",
    blurb: "Adding and subtracting below zero",
    skillKey: "integers.operations",
    opening: "Every one of these is a move along the number line. Do the first one as a walk, not a rule.",
    problems: ["−7 + 12", "5 − 9", "−3 − 6"],
    watchFor: "reading −3 − 6 as −3 + 6, from half-remembering that two negatives make a positive.",
    board: "add_number_line from −10 to 10 with hop arrows for each move.",
  },
  {
    key: "equations",
    emoji: "⚖️",
    label: "Solving equations",
    blurb: "Getting x on its own, two steps",
    skillKey: "equations.two-step",
    opening: "Put it on a balance first, so undoing in the right order is obvious rather than memorised.",
    problems: ["3x + 7 = 19", "5x − 4 = 21", "x/2 + 6 = 10"],
    watchFor: "undoing the multiply before the add, or changing only one side.",
    board: "draw_balance for the first one, then draw_equation_step lines underneath.",
  },
  {
    key: "slope",
    emoji: "📈",
    label: "Slope",
    blurb: "How steep a line is, and why",
    skillKey: "graphs.slope",
    opening: "Plot the two points and draw the triangle between them before writing any formula.",
    problems: ["The slope between (1, 2) and (4, 8)", "The slope of y = −2x + 5", "The slope of the line through (0, 3) and (5, 3)"],
    watchFor: "run over rise instead of rise over run, and calling a flat line's slope undefined.",
    board: "draw_desmos with both points and a rise-over-run triangle between them.",
  },
  {
    key: "ratios",
    emoji: "🛒",
    label: "Ratios",
    blurb: "Scaling prices and recipes up",
    skillKey: "ratios.proportions",
    opening: "Write both quantities as a small table, then find what one row was multiplied by.",
    problems: ["3 pens cost $2. What do 12 cost?", "2 cups of flour makes 12 cookies. How much for 30?", "Scale 5 : 3 up to 20 : ?"],
    watchFor: "adding the difference instead of multiplying: treating 3 to 12 as plus 9 rather than times 4.",
    board: "add_table with the two rows, then draw_tape_diagram if the scaling is still not landing.",
  },
  {
    key: "decimals",
    emoji: "🔢",
    label: "Decimals",
    blurb: "Multiplying and dividing them",
    skillKey: "decimals.operations",
    opening: "Estimate first. About how big should the answer be? That is what catches a misplaced point.",
    problems: ["3.6 × 2.5", "0.4 × 0.7", "7.2 ÷ 0.9"],
    watchFor: "expecting multiplication to make it bigger, so 0.4 × 0.7 looks wrong when it is right.",
    board: "write_vertical for the first, then draw_grid to show why 0.4 × 0.7 shrinks.",
  },
  {
    key: "expressions",
    emoji: "🧩",
    label: "Simplifying",
    blurb: "Combining and expanding terms",
    skillKey: "algebra.simplify",
    opening: "Sort the terms by kind before touching any of them, so like goes with like.",
    problems: ["4x + 3 + 2x − 7", "3(x + 4)", "2(x + 3) + 4x"],
    watchFor: "combining unlike terms, so 4x + 3 becomes 7x.",
    board: "add_area_model for 3(x + 4), so distributing is an area rather than an arrow.",
  },
  {
    key: "quadratics",
    emoji: "🎢",
    label: "Quadratics",
    blurb: "Solving equations with x²",
    skillKey: "equations.quadratic-solutions",
    opening: "Graph it first. Seeing the curve cross twice is what makes two answers feel necessary.",
    problems: ["x² − 5x + 6 = 0", "x² − 9 = 0", "x² + 2x − 8 = 0"],
    watchFor: "giving one answer where there are two, and sign slips when factoring.",
    board: "draw_desmos of the parabola with both roots marked where it crosses.",
  },
  {
    key: "multiplying",
    emoji: "✖️",
    label: "Multiplying",
    blurb: "Bigger numbers, no calculator",
    skillKey: "arithmetic.multiply",
    opening: "Break it into an area model before the stacked method, so the partial products mean something.",
    problems: ["24 × 17", "6 × 48", "35 × 12"],
    watchFor: "losing the place value in the second partial product, so 24 × 17 comes out near 100 short.",
    board: "add_area_model split into tens and ones, then write_vertical beside it.",
  },
];

const BY_KEY = new Map(STAGED_LESSONS.map((lesson) => [lesson.key, lesson]));

export function lessonByKey(key: string | null | undefined): StagedLesson | null {
  return (key && BY_KEY.get(key)) || null;
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

function band(skillKey: string): [number, number] {
  const skill = SKILL_CATALOG.find((s) => s.key === skillKey);
  if (!skill) return [5, 12];
  const [lo, hi] = skill.gradeBand.split("-").map(Number);
  return [lo, hi];
}

/**
 * The lessons to offer a grade: the ones whose skill sits in that grade come
 * first, nearest the band's centre, then the rest by how far away they are, so
 * there is always something to pick. An unknown grade gets a middle spread.
 */
export function lessonsForGrade(grade: string | null | undefined, count = 6): StagedLesson[] {
  const g = gradeNumber(grade) ?? 8;
  return [...STAGED_LESSONS]
    .map((lesson, order) => {
      const [lo, hi] = band(lesson.skillKey);
      const inside = g >= lo && g <= hi;
      const score = inside ? Math.abs((lo + hi) / 2 - g) : 100 + Math.min(Math.abs(lo - g), Math.abs(hi - g));
      return { lesson, order, score, max: hi };
    })
    .sort((a, b) => a.score - b.score || b.max - a.max || a.order - b.order)
    .slice(0, count)
    .map((s) => s.lesson);
}

/** What the box is filled with when a lesson is picked: the real first problem. */
export function lessonTopic(lesson: StagedLesson): string {
  return `${lesson.label}: ${lesson.problems[0]}`;
}

/**
 * The rehearsed plan, appended to this session's instructions. It says how to
 * run a lesson nobody asked for by name, and hands control straight back if
 * the student turns out to have something of their own.
 */
export function lessonPlan(lesson: StagedLesson): string {
  return [
    `This session opens on a lesson they picked from a list, not a problem they brought, so it is yours to lead. The plan:`,
    `- Skill: ${lesson.skillKey}. Name it in check_answer.`,
    `- Open by: ${lesson.opening}`,
    `- On the board first: ${lesson.board}`,
    `- Work these in order, one at a time, only moving on once they have done the last one themselves: ${lesson.problems[0]}, then ${lesson.problems[1]}, then ${lesson.problems[2]}.`,
    `- Expect this mistake: ${lesson.watchFor} If it appears, it is the lesson; slow down and take it apart rather than correcting it.`,
    `Everything else is unchanged: they answer before you explain, you check with check_answer, and you never hand over an answer. If they say they have their own homework, drop this plan and work on theirs instead.`,
  ].join("\n");
}
