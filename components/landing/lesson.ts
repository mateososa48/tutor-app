// The lesson the landing page replays: one algebra problem, the way a session
// actually goes. Each beat is timed from the start of the loop and can carry a
// student line, something the tutor says, board moves, or all three. The board
// moves are real tool calls, dispatched through the same code the tutor uses.

import type { DockActivity } from "@/components/session/VoiceDock";

export type BoardCall = { name: string; args: Record<string, unknown> };

export type LessonBeat = {
  at: number;
  /** What the student said (goes to the transcript). */
  student?: string;
  /** What the tutor says (caption + transcript, spoken for `hold` ms). */
  say?: string;
  /** Board moves, in order. */
  board?: BoardCall[];
  /** Dock badge after this beat, until the next one. */
  activity?: DockActivity;
};

export const LESSON_TITLE = "Solving 2x + 3 = 11";
export const LESSON_LOOP_MS = 42000;

export const LESSON: LessonBeat[] = [
  { at: 0, student: "I'm stuck on 2x plus 3 equals 11.", activity: "listening" },
  { at: 1400, activity: "thinking" },
  {
    at: 2300,
    say: "Let me put that on the board.",
    activity: "writing",
    board: [
      { name: "start_new_problem", args: { title: LESSON_TITLE } },
      { name: "draw_equation_step", args: { latex: "2x + 3 = 11" } },
    ],
  },
  {
    at: 5200,
    say: "Two x plus three is eleven. What would undo that plus three?",
    activity: "speaking",
    board: [{ name: "draw_balance", args: { left: "x | x | 3", right: "11", label: "both sides weigh the same" } }],
  },
  { at: 9600, activity: "listening" },
  { at: 10600, student: "subtract 3?", activity: "thinking" },
  {
    at: 11600,
    activity: "writing",
    board: [
      { name: "add_student_attempt", args: { text: "subtract 3 from both sides?" } },
      { name: "draw_equation_step", args: { latex: "2x = 8", annotation: "subtract 3 from both sides" } },
    ],
  },
  { at: 14800, say: "Exactly. Both sides, so it stays balanced. Now two x is eight. What is x?", activity: "speaking" },
  { at: 19200, activity: "listening" },
  { at: 20200, student: "16?", activity: "thinking" },
  {
    at: 21200,
    activity: "writing",
    board: [
      { name: "add_student_attempt", args: { text: "x = 16?" } },
      { name: "draw_equation_step", args: { latex: "x = 16" } },
      { name: "cross_out_step", args: { step_label: "x = 16" } },
    ],
  },
  { at: 24200, say: "Close. Two times x is eight. Are we multiplying by two, or dividing?", activity: "speaking" },
  { at: 28400, activity: "listening" },
  { at: 29400, student: "dividing. so x is 4", activity: "thinking" },
  {
    at: 30400,
    activity: "writing",
    board: [
      { name: "draw_equation_step", args: { latex: "x = 4", annotation: "divide both sides by 2" } },
      { name: "circle_item", args: { target: "x = 4", keep: true } },
    ],
  },
  {
    at: 34400,
    say: "That's it. Check it: two times four is eight, plus three is eleven. Try the next one yourself.",
    activity: "speaking",
    board: [
      { name: "start_board_section", args: { title: "Your turn" } },
      { name: "draw_equation_step", args: { latex: "3x - 5 = 7" } },
    ],
  },
  { at: 40000, activity: "listening" },
];

/** Every board move in the lesson, in order, for the dev replay and screenshots. */
export const LESSON_BOARD: BoardCall[] = LESSON.flatMap((b) => b.board ?? []);

/** The scenes the bento and how-it-works tiles photograph, each a real board. */
export const SCENES: Record<string, BoardCall[]> = {
  hero: LESSON_BOARD,
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
