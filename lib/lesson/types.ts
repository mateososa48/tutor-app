// The tutoring engine's shared types (Oct 31 2026, Plan B step B1). One lesson
// state on the server, one typed plan per student line, board operations the
// code compiles and the page applies, and receipts that say what is actually
// on the board. Typed and spoken input go through the same engine.
//
// Kept apart on purpose: what the student said (exact words, with ids), what
// the code verified about it, what the tutor plans to say, and what the board
// shows. A tutor inference is never stored as the student's words.

import type { ClaimAssessment } from "../math-claims";

/** Where a fact came from: a student line (its id and span), a worksheet, or the tutor. */
export type SourceRef =
  | { kind: "utterance"; id: string; span?: [number, number] }
  | { kind: "worksheet"; file: string; page?: number; question?: string }
  | { kind: "tutor"; turn: string };

export type StudentInput = {
  id: string;
  source: "intake" | "typed" | "spoken";
  text: string;
  at: number;
};

/** A given of a problem: "base = 12 cm", read from the worksheet or the student's words. */
export type Fact = { id: string; name: string; value: number; unit?: string; source: SourceRef; confirmed?: boolean };

export type ProblemRecord = {
  id: string;
  revision: number;
  /** The problem as given: "3x + 7 = 22", "A bike costs $3 plus $5 an hour…". */
  statement: string;
  /** Its math, when it is one line of math: the working column starts from it. */
  math?: string;
  givens: Fact[];
  /** What is being found, in words. */
  unknown?: string;
  /**
   * The answer to the whole problem, private: given once by the planner with
   * arithmetic that produces it, kept only when the code's own evaluation of
   * that arithmetic agrees ("4" from "(23-3)/5"). A student's "I got 4" is
   * then checked in code, not by the model's say-so.
   */
  solution?: { answer: string; work: string };
  source: SourceRef;
  status: "open" | "solved" | "set_aside";
};

export type QuestionKind = "value" | "step" | "explain" | "choice" | "open";

export type QuestionRecord = {
  id: string;
  problemId: string | null;
  /** The question as the tutor asked it. */
  text: string;
  kind: QuestionKind;
  /** The answer, private to the tutor; what a response is checked against. */
  expects?: string;
  /** Math the answer is checked on ("3x + 7 - 7", "5*4+3"), when it is not just `expects`. */
  check?: string;
  /** A board blank the answer fills ("work.L2", "table1.r2c2"). */
  fill?: string;
  /** The problem's final answer: a right one is boxed. */
  final?: boolean;
  status: "open" | "answered" | "superseded";
  askedTurn: string;
  answeredBy?: string;
};

export type AnswerVerdict = "correct" | "partial" | "incorrect" | "unknown";

/** What one student line showed, kept apart: their answer, their reasons, the help they had. */
export type LearnerEvidence = {
  id: string;
  inputId: string;
  problemId: string | null;
  questionId?: string;
  answer?: { text: string; verdict: AnswerVerdict; detail?: string };
  claims: ClaimAssessment[];
  /** They gave a reason (a "because"); whether it holds is in `claims`. */
  reasonGiven: boolean;
  /** Help on this problem before this line (0 none … 5 worked example). */
  assistance: number;
  at: number;
};

export type Signal = "stop" | "done_understood" | "show_me" | "slower" | "already_answered" | "no_idea" | "frustrated" | "different_way" | "harder" | "question";

export type RequestRecord = { id: string; inputId: string; kind: Signal; text: string; status: "open" | "resolved" };

// ── The board ───────────────────────────────────────────────────────────

export type PictureKind = "plane" | "table" | "work" | "geometry" | "blocks" | "groups";

/** One thing on the board the lesson knows: its semantic id, the item it became, and its spec. */
export type BoardObject = {
  sid: string;
  kind: PictureKind | "heading" | "mark" | "fraction" | "illustration";
  problemId: string | null;
  /** The board's item id once applied ("b4"). */
  itemId?: string;
  spec?: unknown;
  /** The parts it has, by name (what a speech segment or a mark can refer to). */
  parts: string[];
  /** Facts the picture states, from its spec ("diagonal AC 13 cm"). */
  facts: string[];
  /** Text the student can read on it (facts can hold more: a computed area, a view range). */
  shown?: string[];
  status: "pending" | "applied" | "failed";
  /** The board page it is on (each new problem's heading turns the page); older pages are filed away, out of sight. */
  page?: number;
};

/** A compiled board operation, applied by the page as it is. */
export type BoardOp =
  | { opId: string; type: "heading"; title: string }
  | { opId: string; type: "draw"; sid: string; kind: PictureKind; spec: unknown; rendered: RenderedPicture; label: string; reserveH?: number }
  | { opId: string; type: "edit"; sid: string; kind: PictureKind; spec: unknown; rendered: RenderedPicture; label: string }
  | { opId: string; type: "mark"; ref: string; how: "ring" | "swipe" | "underline" | "check" | "cross" | "point" }
  /** One of the board's own exact picture tools, drawn as asked (fraction models). */
  | { opId: string; type: "tool"; sid: string; name: "draw_fraction" | "draw_grid"; args: Record<string, unknown>; label: string }
  /** Real things drawn by the illustrator (lib/illustration): the page asks for the scene and draws it. */
  | { opId: string; type: "illustrate"; sid: string; what: string; notice?: string; label: string };

export type RenderedPicture = {
  svg: string;
  w: number;
  h: number;
  parts: Record<string, { x: number; y: number; w: number; h: number }>;
  aliases: Record<string, string>;
  paths?: Record<string, { pts: Array<[number, number]>; closed: boolean }>;
};

/** What the page reports back for one op. */
export type BoardReceipt = {
  opId: string;
  status: "applied" | "unchanged" | "blocked" | "partial" | "failed";
  /** The item it made or changed. */
  itemId?: string;
  /** Parts actually on the board after it. */
  parts?: string[];
  issue?: string;
  at: number;
};

// ── One turn ────────────────────────────────────────────────────────────

export type TeachingMove = "clarify" | "diagnose" | "explain" | "model_step" | "completion" | "hint" | "contrast" | "confirm" | "practice" | "self_explanation" | "repair" | "recap" | "close";

export type SpeechSegment = {
  id: string;
  text: string;
  /** Board refs ("work.L2", "fig1.diagonal", "graph1") that must be up before this is said. */
  needs: string[];
  /** What to say instead if one of them could not be drawn. */
  fallback?: string;
  /** Already said, while the rest of the turn was being planned (lib/lesson/stream). */
  early?: boolean;
};

export type PlannedQuestion = {
  text: string;
  kind: QuestionKind;
  expects?: string;
  check?: string;
  fill?: string;
  final?: boolean;
};

/** The model's plan for one turn, after parsing; the code checks it before any of it happens. */
export type TurnPlan = {
  move: TeachingMove;
  speech: SpeechSegment[];
  board: BoardIntent[];
  question: PlannedQuestion | null;
  /** This turn states the answer to their problem (help, counted as such). */
  givesAnswer: boolean;
  /** The current problem's answer and the arithmetic that gives it, when the lesson has none yet. */
  solution?: { answer: string; work: string };
  /** The problem this turn moves to ("P2"), when it is not the current one. */
  problem?: string;
  close: boolean;
  why?: string;
};

// What the model may ask the board for. The code turns each into a spec it
// can check (dimensions from the problem's facts, steps that keep the
// solution, points on the line) before anything is drawn.
export type BoardIntent =
  | { do: "work_step"; left: string; right: string; note?: string; result?: string | null }
  | { do: "work_line"; text: string }
  | { do: "work_fill"; line: string; text: string }
  | { do: "table"; id?: string; columns: string; rows: string; title?: string }
  | { do: "graph"; id?: string; points?: string; lines?: string; arrows?: string; view?: { xMin?: number; xMax?: number; yMin?: number; yMax?: number }; new?: boolean }
  | { do: "figure"; id?: string; shape: "right_triangle" | "rectangle" | "polygon"; base?: number | string; height?: number | string; unit?: string; in_rectangle?: boolean; shade_other?: boolean; vertices?: Array<[number, number]>; labels?: string[] }
  | { do: "example"; problem: string; steps: string; why?: string }
  | { do: "mark"; ref: string; how: "ring" | "swipe" | "underline" | "check" | "cross" | "point" }
  | { do: "fractions"; id?: string; fractions: string; common?: number; model?: "bar" | "circle" }
  | { do: "blocks"; id?: string; rows: string }
  | { do: "groups"; id?: string; groups: string }
  | { do: "grid"; id?: string; rows: number; columns: number; shaded: number; label?: string }
  | { do: "picture"; id?: string; what: string; notice?: string };

export type LessonState = {
  v: 1;
  revision: number;
  /** Bumped by every committed student line: work for an older one is stale. */
  epoch: number;
  grade?: string;
  /** What they came for, in their words, kept for the whole session. */
  goal: { text: string; source: SourceRef };
  /** Pictures they uploaded at the start, and whether their problems could be read. */
  uploads?: { files: number; read: boolean };
  problems: ProblemRecord[];
  current: string | null;
  questions: QuestionRecord[];
  evidence: LearnerEvidence[];
  requests: RequestRecord[];
  board: BoardObject[];
  /** The conversation, newest last, bounded. */
  transcript: Array<{ id: string; role: "student" | "tutor"; text: string; at: number }>;
  /** The turn waiting for its receipts. */
  pending: { turnId: string; epoch: number; ops: BoardOp[]; plan: TurnPlan } | null;
  closing: boolean;
  turns: number;
};
