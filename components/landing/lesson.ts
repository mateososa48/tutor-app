// The lesson the landing hero replays (rebuilt Sept 28 2026): one fractions
// question, the way a session actually goes, with the student's mistake in it.
// People who saw the old hero thought Chalk was a chatbot: it showed only the
// tutor's words, in a dark box. Now both people talk: the student's words come
// out of their tile and the tutor's out of the pet, word by word, as spoken,
// and every idea lands on the board as a picture.
//
// The demo opens mid-lesson on `LESSON_SEED` (drawn at once, no writing), so the
// frame is never blank. Each beat is timed from the start of the loop. Board
// moves are real tool calls, dispatched through the same code the tutor uses;
// they refer to earlier drawings as "@n" (see `resolveRefs`).
// "How it works" already plays 2/3 against 3/4, so the hero asks about 3/5.

import type { DockActivity } from "@/components/session/VoiceDock";

export type BoardCall = { name: string; args: Record<string, unknown> };

export type LessonBeat = {
  at: number;
  /** What the student says, out loud (their bubble, then the transcript). */
  student?: string;
  /** What the tutor says (the pet's bubble, then the transcript). */
  say?: string;
  /** Board moves, in order. */
  board?: BoardCall[];
  /** Dock badge after this beat, until the next one. */
  activity?: DockActivity;
  /** A checked right answer: the pet hops. */
  celebrate?: boolean;
};

/**
 * The hero lesson names board items by the order they were drawn in this loop
 * ("@2" is the second drawing), because the board keeps counting item ids
 * across a clear: the second loop's bars are not b2 and b3. `idOf` turns the
 * nth drawing into its real id.
 */
export function resolveRefs(call: BoardCall, idOf: (n: number) => string | undefined): BoardCall {
  const args: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(call.args)) {
    args[k] = typeof v === "string" ? v.replace(/@(\d+)/g, (m, n) => idOf(Number(n)) ?? m) : v;
  }
  return { name: call.name, args };
}

export const LESSON_TITLE = "Which is bigger, 3/5 or 2/3?";
export const LESSON_STUDENT = "Student";
/** When the finished board fades and the lesson starts again. */
export const LESSON_LOOP_MS = 31000;

/** On the board before the first beat: the question and both bars. */
export const LESSON_SEED: BoardCall[] = [
  { name: "start_new_problem", args: { title: LESSON_TITLE } },
  { name: "draw_fraction", args: { fraction: "3/5", model: "bar" } },
  { name: "draw_fraction", args: { fraction: "2/3", model: "bar", place: "below @2" } },
];

const ATTEMPT = "3/5, cause 3 is more than 2?";

export const LESSON: LessonBeat[] = [
  { at: 0, student: "3/5? cause 3 is more than 2", activity: "listening" },
  { at: 2400, activity: "writing", board: [{ name: "add_student_attempt", args: { text: ATTEMPT, place: "below @3" } }] },
  {
    at: 3600,
    say: "Hmm. Look at the two bars. Which one has more shaded?",
    activity: "speaking",
    board: [{ name: "point_at", args: { target: "@3" } }],
  },
  { at: 7400, activity: "listening" },
  { at: 8200, student: "wait... the 2/3 one?" },
  {
    at: 10000,
    say: "Yes. Let's prove it. Cut both into fifteenths.",
    activity: "writing",
    board: [
      { name: "cross_out_step", args: { step_label: ATTEMPT } },
      { name: "draw_fraction", args: { fraction: "3/5", model: "bar", common_denominator: 15, place: "beside @2" } },
      { name: "draw_fraction", args: { fraction: "2/3", model: "bar", common_denominator: 15, place: "below @5" } },
    ],
  },
  {
    at: 16000,
    say: "Nine fifteenths, ten fifteenths. So which is bigger?",
    activity: "speaking",
    board: [{ name: "highlight", args: { target: "@6", text: "10/15" } }],
  },
  { at: 19400, activity: "listening" },
  { at: 20200, student: "2/3! ten is more than nine" },
  {
    at: 22400,
    activity: "writing",
    celebrate: true,
    board: [
      { name: "draw_equation_step", args: { latex: "\\frac{2}{3} > \\frac{3}{5}", annotation: "10 fifteenths beat 9", place: "below @6" } },
      { name: "circle_item", args: { target: "last", keep: true } },
    ],
  },
  { at: 23600, say: "That's it. Same size bar, more of it shaded.", activity: "speaking" },
  { at: 27200, activity: "listening" },
];

/** Every board move in the lesson, in order, for the dev replay and screenshots. */
export const LESSON_BOARD: BoardCall[] = [...LESSON_SEED, ...LESSON.flatMap((b) => b.board ?? [])].map((call) =>
  resolveRefs(call, (n) => `b${n}`),
);

/** The scenes the bento and how-it-works tiles photograph, each a real board. */
export const SCENES: Record<string, BoardCall[]> = {
  hero: LESSON_BOARD,
  heroSeed: LESSON_SEED.map((call) => resolveRefs(call, (n) => `b${n}`)),
  steps: [
    { name: "start_new_problem", args: { title: "Solve 3(x − 2) = 12" } },
    { name: "draw_equation_step", args: { latex: "3(x - 2) = 12" } },
    { name: "draw_equation_step", args: { latex: "3x - 6 = 12", annotation: "distribute the 3" } },
    { name: "draw_equation_step", args: { latex: "3x = 18", annotation: "add 6 to both sides" } },
    { name: "highlight", args: { target: "3x = 18" } },
  ],
  hint: [
    { name: "draw_equation_step", args: { latex: "2x = 8", annotation: "subtract 3 from both sides" } },
    { name: "add_student_attempt", args: { text: "x = 16?" } },
    { name: "draw_equation_step", args: { latex: "x = 16" } },
    { name: "cross_out_step", args: { step_label: "x = 16" } },
  ],
  worksheet: [
    { name: "start_new_problem", args: { title: "Problem 5" } },
    { name: "draw_equation_step", args: { latex: "y = 2x + 1", annotation: "from the worksheet" } },
    { name: "draw_desmos", args: { expressions: "y=2x+1", points: "(0,1):b, (1,3)", x_min: -5, x_max: 5, y_min: -5, y_max: 5 } },
  ],
  graph: [
    { name: "draw_desmos", args: { expressions: "y=x^2-4", points: "(-2,0):A, (2,0):B, (0,-4):C", x_min: -5, x_max: 5, y_min: -5, y_max: 5, label: "where it crosses" } },
  ],
  figure: [
    { name: "draw_figure", args: { figure: "right_triangle", side_labels: "6 | 8 | x", label: "the hypotenuse" } },
  ],
  icons: [
    { name: "draw_icons", args: { icon: "cookies", count: 12, group_size: 4, arrange: "groups", label: "12 cookies, 3 friends" } },
  ],
  // Sept 22, for the combined how-it-works section: the range of the tutor,
  // each a real board with its marks. `compare` is photographed call by call
  // (see `seq` in scripts/landing-shots.mjs) so a section can play it back.
  compare: [
    { name: "start_new_problem", args: { title: "Which is bigger, 2/3 or 3/4?" } },
    { name: "draw_fraction", args: { fraction: "2/3", second_fraction: "3/4", model: "bar" } },
    { name: "add_student_attempt", args: { text: "2/3 is bigger?" } },
    { name: "cross_out_step", args: { step_label: "2/3 is bigger?" } },
    { name: "draw_fraction", args: { fraction: "2/3", second_fraction: "3/4", model: "bar", common_denominator: 12, label: "cut into twelfths" } },
    { name: "highlight", args: { target: "last", text: "9/12" } },
    { name: "add_student_attempt", args: { text: "3/4 is bigger" } },
    { name: "draw_equation_step", args: { latex: "\\frac{3}{4} > \\frac{2}{3}", annotation: "9 twelfths beat 8" } },
    { name: "circle_item", args: { target: "last", keep: true } },
  ],
  negatives: [
    { name: "add_number_line", args: { min: -5, max: 5, step: 1, points: "-3:start, 2", jumps: "-3>2:+5", label: "−3 + 5" } },
    { name: "highlight", args: { target: "last", text: "+5" } },
  ],
  slope: [
    { name: "add_function_graph", args: { expression: "2*x + 1", x_min: -1, x_max: 4, slope_run: "1..3", mark_points: "(0,1):start", label: "slope = rise over run" } },
    { name: "highlight", args: { target: "last", text: "rise 4" } },
  ],
  percent: [
    { name: "draw_grid", args: { rows: 10, columns: 10, shaded: 35, label: "35 out of 100 = 35%" } },
  ],
  area: [
    { name: "add_area_model", args: { title: "(x + 3)(x + 2)", row_labels: "x | 3", column_labels: "x | 2", cells: "x^2 | 2x; 3x | " } },
  ],
  solved: [
    { name: "draw_equation_step", args: { latex: "2x + 3 = 11" } },
    { name: "draw_equation_step", args: { latex: "2x = 8", annotation: "subtract 3 from both sides" } },
    { name: "add_student_attempt", args: { text: "x = 4?" } },
    { name: "draw_equation_step", args: { latex: "x = 4", annotation: "divide both sides by 2" } },
    { name: "circle_item", args: { target: "last", keep: true } },
  ],
  ratio: [
    { name: "draw_tape_diagram", args: { rows: "Red: *4 | *4 = 8; Blue: 4 | 4 | 4 = 12", total_label: "20 marbles", label: "2 : 3" } },
  ],
  fraction: [
    { name: "draw_fraction", args: { fraction: "3/4", second_fraction: "6/8", label: "the same amount" } },
  ],
};
