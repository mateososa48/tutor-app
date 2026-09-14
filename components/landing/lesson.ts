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
      { name: "highlight_step", args: { step_label: "x = 4", style: "circle" } },
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
    { name: "highlight_step", args: { step_label: "3x = 18", style: "underline" } },
  ],
  hint: [
    { name: "draw_equation_step", args: { latex: "2x = 8", annotation: "subtract 3 from both sides" } },
    { name: "add_student_attempt", args: { text: "x = 16?" } },
    { name: "draw_equation_step", args: { latex: "x = 16" } },
    { name: "cross_out_step", args: { step_label: "x = 16" } },
  ],
  worksheet: [
    { name: "start_new_problem", args: { title: "Problem 4" } },
    { name: "draw_equation_step", args: { latex: "5x + 2 = 17", annotation: "from the worksheet" } },
  ],
};
