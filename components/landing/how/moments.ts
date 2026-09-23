import type { DockActivity } from "@/components/session/VoiceDock";
import type { PetState } from "@/components/board/TutorPet";
import { SHOTS } from "../shots.generated";

// What the combined how-it-works section shows (Sept 22). Two things, used by
// all five layouts:
//
// LESSON is one short session on one question, beat by beat, each beat a real
// photograph of the board after that many tool calls (`compare` in lesson.ts,
// shot call by call, every frame cropped to the finished board so they stack).
// It is the loop the product runs: you say it, it draws, you try, it catches
// the slip without handing over the answer, it finds a better picture, you get
// there, it marks it.
//
// RANGE is the same loop on other topics, one board each, so the section
// shows breadth rather than one linear equation. Every line the tutor says
// follows the prompt's own rules: it points at the picture and ends on
// something for the student to do, and never says the answer first.

export type Beat = {
  key: string;
  /** The move, in two to four words. */
  move: string;
  /** One line under the move. */
  detail: string;
  /** Who is talking in this beat and what they say. */
  who: "you" | "tutor";
  says: string;
  /** Index into SHOTS.compare.frames. */
  frame: number;
  /** What the board is doing, in the words of the tool it called. */
  action: string;
  activity: DockActivity;
  pet: PetState;
};

export const LESSON_TOPIC = "Which is bigger, 2/3 or 3/4?";

export const LESSON: Beat[] = [
  {
    key: "ask",
    move: "You say it",
    detail: "Out loud, the way you would to a person. Half a question is fine.",
    who: "you",
    says: "Is two thirds bigger than three quarters? I think it is.",
    frame: 0,
    action: "draws both as bars",
    activity: "writing",
    pet: "listening",
  },
  {
    key: "try",
    move: "You try first",
    detail: "Your answer goes on the board in your words, right or wrong.",
    who: "you",
    says: "Two thirds, because three is smaller?",
    frame: 1,
    action: "writes your try, crosses it out",
    activity: "writing",
    pet: "puzzled",
  },
  {
    key: "hint",
    move: "It finds a better picture",
    detail: "Not the answer. The smallest nudge that gets you there.",
    who: "tutor",
    says: "Let's cut both into twelfths so the pieces match. Now which one has more shaded?",
    frame: 2,
    action: "recuts both, highlights 9/12",
    activity: "speaking",
    pet: "speaking",
  },
  {
    key: "got",
    move: "You get there",
    detail: "It checks your answer and marks it, so you can see what you did.",
    who: "you",
    says: "Three quarters. Nine twelfths is more than eight.",
    frame: 3,
    action: "writes it out, rings it",
    activity: "writing",
    pet: "happy",
  },
];

export const LESSON_FRAMES = SHOTS.compare.frames;
export const LESSON_SIZE = { width: SHOTS.compare.width, height: SHOTS.compare.height };

export type Moment = {
  key: string;
  topic: string;
  /** What a student would actually say. */
  ask: string;
  /** What the tutor says back, while the board shows `shot`. */
  says: string;
  /** What it did on the board, as short verbs. */
  moves: string[];
  shot: (typeof SHOTS)[keyof typeof SHOTS];
  alt: string;
};

export const RANGE: Moment[] = [
  {
    key: "compare",
    topic: "Fractions",
    ask: "Is two thirds bigger than three quarters?",
    says: "Let's cut both into twelfths so the pieces match. Which has more shaded now?",
    moves: ["draws both", "crosses out a try", "highlights 9/12", "rings the answer"],
    shot: SHOTS.compare,
    alt: "The board: 2/3 and 3/4 as bars, the student's try '2/3 is bigger?' crossed out, both recut into twelfths with 9/12 highlighted, and 3/4 > 2/3 ringed.",
  },
  {
    key: "negatives",
    topic: "Negative numbers",
    ask: "Why is negative three plus five positive?",
    says: "Start at negative three and take five hops to the right. Where do you land?",
    moves: ["draws a number line", "hops +5", "highlights the jump"],
    shot: SHOTS.negatives,
    alt: "The board: a number line from −5 to 5, a dot at −3 marked start, a hop arrow labelled +5 landing on 2, the +5 highlighted.",
  },
  {
    key: "slope",
    topic: "Graphs",
    ask: "What does slope actually mean?",
    says: "From this point to that one it goes up four while it goes across two. So how steep is it?",
    moves: ["graphs it on Desmos", "draws rise and run", "highlights the rise"],
    shot: SHOTS.slope,
    alt: "The board: y = 2x + 1 graphed on Desmos with a rise-over-run triangle, run 2 and rise 4, the rise highlighted.",
  },
  {
    key: "area",
    topic: "Algebra",
    ask: "How do I multiply (x + 3)(x + 2)?",
    says: "Each box is one piece times another. Three are filled in. What goes in the last one?",
    moves: ["draws an area model", "leaves one box for you"],
    shot: SHOTS.area,
    alt: "The board: an area model for (x + 3)(x + 2) with x², 2x and 3x filled in and the last box empty.",
  },
  {
    key: "ratio",
    topic: "Ratios",
    ask: "Two red for every three blue, twenty marbles. How many are red?",
    says: "Five equal boxes make twenty marbles. How many marbles in each box?",
    moves: ["draws a tape diagram", "shades the red"],
    shot: SHOTS.ratio,
    alt: "The board: a tape diagram, red two boxes of 4 making 8, blue three boxes of 4 making 12, a bracket for 20 marbles.",
  },
  {
    key: "percent",
    topic: "Percent",
    ask: "What does 35 percent even look like?",
    says: "A hundred squares, thirty-five shaded. So what would fifty percent look like?",
    moves: ["draws a hundred grid", "shades 35"],
    shot: SHOTS.percent,
    alt: "The board: a 10 by 10 grid with 35 squares shaded, captioned 35 out of 100 = 35%.",
  },
  {
    key: "solved",
    topic: "Equations",
    ask: "So x is four?",
    says: "Check it yourself: two times four, plus three. Do you get eleven?",
    moves: ["writes your answer", "rings it", "asks you to check"],
    shot: SHOTS.solved,
    alt: "The board: 2x + 3 = 11, then 2x = 8, the student's x = 4?, and x = 4 ringed.",
  },
];

export const PAGE_BG: [number, number, number] = [0.984, 0.984, 0.988];
