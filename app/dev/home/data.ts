// Mock data for the home page mockups (/dev/home). Nothing here is real.
import { SHOTS } from "@/components/landing/shots.generated";

export type Shot = { src: string; width: number; height: number };

export type MockSession = {
  id: string;
  title: string;
  day: string;
  time: string;
  ago: string;
  minutes: number;
  status: "paused" | "ended";
  shot?: Shot;
  /** The closing "Today's rule" the tutor leaves at the end of a session. */
  rule?: string;
  /** The last thing the tutor asked, for a paused session. */
  lastLine?: string;
};

export const STUDENT = {
  name: "Lucía",
  grade: "8th grade",
  workingOn: "Two-step equations, quiz on Friday",
  voice: "Marin",
  speed: "Slow",
};

export const DATE_LINE = "Tuesday, September 15";

export const SESSIONS: MockSession[] = [
  {
    id: "s1",
    title: "Solving 2x + 3 = 11",
    day: "Today",
    time: "4:12 PM",
    ago: "2 hours ago",
    minutes: 24,
    status: "paused",
    shot: SHOTS.hero,
    lastLine: "So what is left on the left side once the 3 is gone?",
  },
  {
    id: "s2",
    title: "Solve 3(x − 2) = 12",
    day: "Yesterday",
    time: "5:40 PM",
    ago: "Yesterday",
    minutes: 18,
    status: "ended",
    shot: SHOTS.steps,
    rule: "Distribute first, then undo the subtraction.",
  },
  {
    id: "s3",
    title: "Problem 4 from the worksheet",
    day: "Sunday",
    time: "11:05 AM",
    ago: "Sunday",
    minutes: 12,
    status: "ended",
    shot: SHOTS.worksheet,
    rule: "Undo the + 2 before the × 5.",
  },
  {
    id: "s4",
    title: "Why x = 16 was wrong",
    day: "Saturday",
    time: "3:30 PM",
    ago: "Saturday",
    minutes: 9,
    status: "ended",
    shot: SHOTS.hint,
    rule: "Plug the answer back in to check it.",
  },
  {
    id: "s5",
    title: "Adding 2/3 and 1/4",
    day: "Thursday",
    time: "6:15 PM",
    ago: "Thursday",
    minutes: 21,
    status: "ended",
    rule: "Same size pieces before you add.",
  },
  {
    id: "s6",
    title: "Slope from two points",
    day: "Sep 8",
    time: "7:02 PM",
    ago: "Last week",
    minutes: 16,
    status: "ended",
    rule: "Rise over run, in that order.",
  },
];

export const NOTES = [
  "Checks answers by plugging them back in",
  "Sometimes subtracts from only one side",
  "Likes the balance picture for equations",
  "Has a quiz on two-step equations this Friday",
];

// The last seven days, ending today.
export const WEEK = [
  { day: "W", minutes: 0 },
  { day: "T", minutes: 21 },
  { day: "F", minutes: 0 },
  { day: "S", minutes: 9 },
  { day: "S", minutes: 12 },
  { day: "M", minutes: 18 },
  { day: "T", minutes: 24 },
];
export const WEEK_MINUTES = WEEK.reduce((s, d) => s + d.minutes, 0);

export const STARTERS = ["Quiz me for Friday", "Check my worksheet", "Explain x on both sides", "I have a photo of a problem"];

/** Starters built from this student's own notes and last sessions, not generic prompts. */
export const SUGGESTIONS = [
  "Quiz me on two-step equations",
  "Check problem 4 from the worksheet",
  "Why was x = 16 wrong?",
  "Something new",
];

export type TopicState = "got" | "practicing" | "next" | "new";
export const TOPICS: { name: string; state: TopicState }[] = [
  { name: "Adding fractions", state: "got" },
  { name: "Distributing", state: "got" },
  { name: "Two-step equations", state: "practicing" },
  { name: "Checking answers", state: "practicing" },
  { name: "x on both sides", state: "next" },
  { name: "Slope", state: "new" },
];

export const PLAN = [
  { verb: "Warm up", minutes: 5, what: "One like yesterday", math: "4(x + 1) = 20", why: "keeps distributing fresh", state: "done" as const },
  { verb: "Learn", minutes: 15, what: "Equations with x on both sides", math: "5x + 2 = 3x + 10", why: "the last new idea before Friday", state: "next" as const, shot: SHOTS.steps },
  { verb: "Check", minutes: 8, what: "Three quiz-style problems, no hints", math: "7 − 2x = 1", why: "so Friday feels familiar", state: "later" as const },
];
