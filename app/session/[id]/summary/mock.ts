// Canned data for `?mock=` on this page, in development only.
//
// The prose is **real gpt-5.6-luna output** from two recorded sessions on
// Sept 21 2026, so the preview shows how the model actually writes rather
// than how we wish it would. The counts, the boards and the conversation are
// invented: both of those sessions predate `learning_attempts`, so their real
// stats carry no answer counts, and a preview should show every part filled.
// The board pictures are the landing page's photographs of the real board.

import type { SessionSummary } from "@/lib/session-summary";

export type MockBoard = { index: number; title: string; src: string };
export type MockTurn = { role: "tutor" | "student"; text: string; at: number };

export type MockPayload = {
  summary: SessionSummary | null;
  state: string;
  sessionStatus: string;
  title: string;
  startedAt: number;
  durationSec: number;
  boards: MockBoard[];
  turns: MockTurn[];
};

/** Yesterday afternoon, so the header reads as a real past session. */
const startedAt = () => Date.now() - 22 * 60 * 60 * 1000;

const BOARDS: MockBoard[] = [
  { index: 1, title: "Solving 3(x − 2) = 12", src: "/landing/steps.png" },
  { index: 2, title: "Solving 4x − 9 = 2x + 7", src: "/landing/worksheet.png" },
  { index: 3, title: "Graphing y = 2x + 1", src: "/landing/graph.png" },
  { index: 4, title: "Rectangle perimeter problem", src: "/landing/figure.png" },
  { index: 5, title: "Today's takeaway", src: "/landing/fraction.png" },
];

const TURNS: MockTurn[] = [
  { role: "student", text: "my homework. i dont understand it", at: 0 },
  { role: "tutor", text: "Okay, let's look at it together. Which problem are you on?", at: 2_000 },
  { role: "student", text: "the first one. 3x plus 7 equals 25", at: 6_000 },
  { role: "tutor", text: "I've put it on the board. Before we solve it, what do you think the x is doing in there? Is it a number we know, or one we're trying to find?", at: 9_000 },
  { role: "student", text: "one we're trying to find", at: 15_000 },
  { role: "tutor", text: "Right. So everything we do is about getting x by itself. There's a 7 stuck to it. What undoes adding 7?", at: 17_000 },
  { role: "student", text: "subtracting 7?", at: 24_000 },
  { role: "tutor", text: "Yes. And whatever we do to one side we do to the other, so the scale stays balanced. Try it: what's left on each side?", at: 26_000 },
  { role: "student", text: "3x equals 18", at: 33_000 },
  { role: "tutor", text: "Good. Now the 3 is multiplying x. What undoes that?", at: 35_000 },
  { role: "student", text: "divide by 3. so x is 6", at: 40_000 },
  { role: "tutor", text: "x is 6. Check it: 3 times 6 is 18, plus 7 is 25. It works. Want to try the next one on your own first?", at: 42_000 },
];

const done: SessionSummary = {
  v: 1,
  headline: "Solving homework equations and perimeter",
  recap:
    "You worked through several homework equations, including one with x on both sides and a rectangle perimeter problem. You ended by stating your own rule: put the x terms on one side and the numbers on the other.",
  wins: [
    "You chose to take the constant block away from both sides in the balance problem.",
    "You used opposite operations to solve the equation with x on both sides.",
    "You expanded the bracket, combined like terms, and found the rectangle's dimensions.",
  ],
  stuck: [
    "Be careful to use the opposite operation: adding undoes subtraction.",
    "When you reach a form like a coefficient times x equals a total, practise dividing the total by the coefficient.",
  ],
  next: "Try one similar equation on your own, write every line, and substitute your answer back into the original equation to check it.",
  stats: {
    durationSec: 780,
    checked: 6,
    correct: 5,
    independent: 2,
    // Real catalog keys: it holds no geometry skills at all, so the
    // perimeter half of this session would record none.
    skills: ["equations.variables-both-sides", "algebra.distribute"],
    pictures: 38,
  },
  generatedAt: Date.now(),
  model: "openai/gpt-5.6-luna",
};

/** A short session that ended mid-idea: one board, one shaky, no counts. */
const short: SessionSummary = {
  v: 1,
  headline: "Making sense of fractions",
  recap:
    "You started with pizza, chocolate, and apples, then worked on sharing cookies into equal groups. You asked what a quarter meant and correctly found the size of each equal cookie group, but the session ended before you answered how many cookies that quarter…",
  wins: [
    "You answered that the bottom number tells how many equal slices make the whole.",
    "You said the top number shows the shaded parts.",
  ],
  stuck: ["You were still working on connecting a quarter of a set to one equal group."],
  next: "Practise with the cookies: split the whole set into equal groups, then say how many cookies are in one quarter.",
  stats: { durationSec: 240, checked: 0, correct: 0, independent: 0, skills: ["fractions.identify"], pictures: 10 },
  generatedAt: Date.now(),
  model: "openai/gpt-5.6-luna",
};

const base = { sessionStatus: "ended", title: "my homework. i dont understand it", startedAt: startedAt(), durationSec: 780, boards: BOARDS, turns: TURNS };

export const SUMMARY_MOCKS: Record<string, MockPayload> = {
  "1": { ...base, summary: done, state: "done" },
  done: { ...base, summary: done, state: "done" },
  short: { ...base, summary: short, state: "done", title: "i dont understand fractions. im in 5th grade", durationSec: 240, boards: [{ index: 1, title: "What is a fraction?", src: "/landing/fraction.png" }], turns: TURNS.slice(0, 6) },
  pending: { ...base, summary: null, state: "pending" },
  failed: { ...base, summary: null, state: "failed" },
  noboard: { ...base, summary: done, state: "done", boards: [] },
};
