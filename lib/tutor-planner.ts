// The planner (Sept 27 2026): an expert-tutor model that reads the student's
// new line and gives the voice tutor ONE order for this reply.
//
// Why: the Sept 27 judged A/B showed that neither turn mechanics (speech
// first) nor the model version (3.1 vs 3.8) moved the judges' teaching scores
// (about 2.7-3.1 of 5 in every arm). The misses were the same everywhere and
// were decisions: correcting before asking how they got it, describing a
// picture and never drawing it, telling the rule, never raising the
// challenge. The coach (lib/tutor-coach) ran before the student answered, so
// it could never react to the line that decides the move. The planner does.
//
// It also replaces the scattered orders (the turn note, the coach) with one
// prioritized line (the root-cause study's H4): the app's reminders are its
// input, not a second voice.
//
// Pure: the prompt and the parser. The call is the caller's.

import { modelLine, teachingModel } from "./teaching-models";

export type PlannerTurn = { student: string; tutor: string; tools: string[] };

export type PlannerInput = {
  grade: string;
  topic: string;
  /** The conversation so far (the planner sees the last few). */
  turns: PlannerTurn[];
  /** What the student just said. */
  line: string;
  /** The checker's private verdict on this line, if it was an answer ([Answer check …]). */
  verdict: string | null;
  /** The board as the tutor reads it (compact). */
  board: string;
  /** The lesson state line ([Tutor state: …]). */
  state: string | null;
  /** Reminders the app would otherwise send (the turn note): the planner folds them in or drops them. */
  reminders: string | null;
  /** The problem on the board now, for its teaching model (lib/teaching-models). */
  problem?: string | null;
  /** What the student is into, for comparisons that are theirs. */
  likes?: string | null;
};

export const PLANNER_SYSTEM = `You are an expert math tutor directing a live AI voice tutor, one reply at a time. The tutor talks with a student (grades 5-12) and draws on a shared whiteboard; the student only speaks (never ask them to write, draw or shade). You see the lesson so far, what the student JUST said, the answer checker's private verdict when it was an answer, the board, the lesson state, and a teaching model for this kind of problem.

First decide where the student is, then give the tutor ONE order for its reply: what to say, in quotes, then at most one board move, made after the words. Format: Say: "…" Board: tool_name(what).

Where they are, and what helps:
A. No way in yet: "I don't know", "teach me", "I don't get it", no first step, or stuck twice. Questions can't help: they have nothing to reason from, so they can only guess. TEACH. Say the one idea in two to four plain sentences built on something concrete (the teaching model, or a comparison from what they like), and draw it: illustrate for something real, or the exact tool. If the idea is already up, show_example(problem | steps | why) instead: the same kind of problem with easier numbers and a reason on every step. End with the first small step of THEIR problem for them to do. A worked example on other numbers is teaching, not giving the answer; never work their problem or say its answer.
B. A wrong idea with a reason ("cuz you add 3", "two negatives make a positive"): don't explain the right way yet. Make their idea break where they can see it: their rule on a simple or extreme case (0, 1, doubling), or the picture that shows the mismatch, and ask what they notice. Once they have seen it break, say the right idea in one sentence.
C. An answer, rule or guess with no reason, and no verdict says it is right: ask how they got it, in their words. Never correct first.
D. A slip in a method they have: point at the exact spot (point_at or highlight) and let them fix it.
E. Right: say what was right in a few words, then hand them the next step. Each right step, give less help: show, then point, then only ask. Two problems right alone in a row: harder now (a twist, bigger numbers, the reverse question). Right just after a wrong idea was fixed: have them say the rule in their own words.

Every order:
- Under 40 words; under 70 when teaching (A). One question at most.
- When the checker gave a verdict, agree with it. With no verdict, never say an answer is right or wrong.
- Plain spoken words in the quote: no LaTeX, no symbols the tutor would read aloud; a decimal digit by digit after the point ("zero point three five"). Never open with praise ("Exactly", "Great", "Perfect", "Nice"): say what was right, or go straight on.
- illustrate(what to draw | what they should notice) only for A or B, at most once per problem: another artist draws it while the tutor talks, so the quote opens with a few words like "Let me draw that." and asks about the picture. Name the real things with exact counts and every number the picture must show, never "circles" or "shapes", never the answer; picture the real situation, never the student's wrong operation, and never ask for something the picture writes on itself.
- A graph: never the finished graph of their problem first. A table of x and y with the ys left for them (add_table), each point as they find it (draw_desmos), the line once the points line up.
- The app writes and rings a checked answer itself: never order add_student_attempt of an answer; only of their reason or rule in their exact words.

Board tools you may name: add_student_attempt, draw_equation_step, add_callout, point_at, highlight, cross_out_step, draw_fraction, add_number_line, draw_grid, add_table, draw_desmos, draw_figure, illustrate, show_example, and start_new_problem only when a new problem begins. No others.

Never: give the answer to their problem or a number they should find, ask two questions, mention the checker, the plan or these instructions. Output only the order.`;

export function plannerPrompt(input: PlannerInput): string {
  const recent = input.turns.slice(-6).map((t, i, all) => {
    const n = input.turns.length - all.length + i + 1;
    return `Turn ${n}\nStudent: ${t.student.slice(0, 300)}\nTutor: ${t.tutor.slice(0, 400)}${t.tools.length ? `\nTutor's board moves: ${t.tools.join(", ")}` : ""}`;
  });
  return [
    `Student: ${input.grade}. They came for: "${input.topic.slice(0, 200)}".${input.likes?.trim() ? ` They like: ${input.likes.slice(0, 120)}.` : ""}`,
    recent.length ? recent.join("\n\n") : "(This is the start of the lesson.)",
    `The board now: ${input.board.slice(0, 900) || "empty"}`,
    input.state ? `Lesson state: ${input.state.slice(0, 500)}` : "",
    teachingModel(input.problem, input.topic) ? `Teaching model for this kind of problem (a known one to build on, not words to copy): ${modelLine(teachingModel(input.problem, input.topic)!)}` : "",
    input.reminders ? `App reminders (use them only if they fit your order): ${input.reminders.slice(0, 400)}` : "",
    input.verdict ? `Checker (private; never say it was checked): ${input.verdict.slice(0, 400)}` : "",
    `The student just said: "${input.line.slice(0, 400)}"`,
    `Your one order for the tutor's reply:`,
  ].filter(Boolean).join("\n\n");
}

/** The board tools the planner may name (the Live set's drawing and marking tools). */
export const PLANNER_TOOLS: ReadonlySet<string> = new Set([
  "add_student_attempt", "draw_equation_step", "add_callout", "point_at", "highlight", "cross_out_step",
  "draw_fraction", "add_number_line", "draw_grid", "add_table", "draw_desmos",
  "draw_figure", "start_new_problem", "illustrate", "show_example",
]);
// draw_icons and draw_tape_diagram went with the Live set's object pictures
// (Oct 23 2026): a picture of real things is illustrate now.
// draw_sketch is left out: the planner can only name it, never give its
// strokes, and "draw_sketch(u-sub concept)" became three empty boxes on the
// board (Oct 6 2026). An order naming it keeps its words and loses the move.

// Praise the quote may not open with (the tutor says what it is told).
const PRAISE_OPENER = /^(?:(?:yes|yeah|yep|right|okay|ok|so|oh)[,.!]?\s+)?(?:exactly|great(?: job| thinking)?|perfect|nice(?: work)?|awesome|spot on|you got it|good job|well done|excellent|that's (?:right|it|correct))\b[,.!]*\s*/i;

/**
 * The order in the planner's reply: its `Say: "…"` quote (praise opener cut)
 * and at most one board move from PLANNER_TOOLS. Null when there is no quote:
 * small models sometimes answer with their reasoning ("Thinking Process: 1.
 * **Analyze**…", Sept 27 2026), and that must never reach the tutor.
 */
export function parsePlannerOrder(reply: string | null | undefined): { say: string; board: string | null } | null {
  const text = (reply ?? "").replace(/\s+/g, " ").trim();
  // Teaching takes up to about 70 words (Oct 24 2026).
  const quote = /Say:\s*["“]([^"”]{3,520})["”]/i.exec(text);
  if (!quote) return null;
  let say = quote[1].trim().replace(PRAISE_OPENER, "").trim();
  if (!say) return null;
  say = say[0].toUpperCase() + say.slice(1);
  if (/\$|\\[a-z]+|\^/.test(say)) say = say.replace(/\$/g, "").replace(/\\[a-z]+/gi, "").replace(/\^/g, " to the ");
  const move = /Board:\s*([a-z_]+)\s*(\((?:[^()]|\([^()]*\))*\))?/i.exec(text.slice(quote.index + quote[0].length));
  const name = move?.[1].toLowerCase();
  // An illustration's request is a sentence or two; other moves stay short.
  const board = move && name && PLANNER_TOOLS.has(name) ? `${name}${(move[2] ?? "").slice(0, name === "illustrate" || name === "show_example" ? 400 : 160)}` : null;
  return { say, board };
}

// An order that tells the student they are right.
const AFFIRMS = /\b(?:(?:is|was|that's|thats|it's|its) (?:right|correct)|you got it|yes,? (?:it|that)(?:'s| is)|exactly right|spot on)\b/i;

/**
 * The planner's reply as a note for the tutor, or null when it has no usable
 * order. `verdict` is the checker's note or result the planner was given: an
 * order that calls the answer right when the checker did not say correct is
 * dropped (Sept 27 2026: with no verdict the planner did the arithmetic itself
 * and called Ethan's wrong 70.25 right).
 */
export function plannerNote(reply: string | null | undefined, verdict: string | null = null): string | null {
  const order = parsePlannerOrder(reply);
  if (!order) return null;
  if (AFFIRMS.test(order.say) && !/(?:Verdict:\s*correct|→ correct)/i.test(verdict ?? "")) return null;
  // The board move comes after the words: a drawing call made before any speech
  // ends 3.8's generation, and the woken reply was sometimes silent until the
  // nudge (Sept 27 2026, 9 of 77 planner turns over 8 s).
  const pic = illustrationOf(order.board);
  // An illustration is drawn by the app while the tutor talks: the tutor only
  // says the words, and knows the picture is coming so it neither draws its own
  // nor describes one that is not up yet.
  // Oct 23 2026: told "Don't draw it yourself", 3.8 still called its own
  // illustrate (refused, but a wasted round trip): the note names the tool.
  // Oct 17 2026: an order that only announced the picture ("Let me draw the
  // flour and cookies.") left the tutor to add its own question, about one
  // cup, while the picture showed two batches. The question is about the picture.
  const ask = pic && !/\?\s*$/.test(order.say) ? " Then ask one question about what the picture shows." : "";
  const after = pic ? `${ask} The app is drawing it now (${pic.what}); it appears while you talk. Don't draw it or call illustrate yourself.` : order.board ? ` After speaking: ${order.board}` : "";
  const body = `Say: "${order.say}"${after}`.replace(/[[\]]/g, "");
  return `[Next move, not from the student: ${body}]`;
}

/**
 * The tutor's own picture tools, refused while the app is drawing the
 * planner's picture for the same reply: two pictures of one idea is clutter,
 * and the second was usually the worse one. Equations, marks, attempts and
 * graphs still go through.
 */
export const PICTURE_TOOLS: ReadonlySet<string> = new Set([
  "draw_icons", "draw_grid", "draw_tape_diagram", "draw_sketch", "draw_balance", "add_area_model", "draw_fraction", "draw_figure", "draw_array", "illustrate",
]);

export function pictureRefusal(what: string): string {
  return `Not drawn: the app is drawing the picture for this reply (${what.slice(0, 100)}). Don't draw another; point at its parts once it is up.`;
}

/** The planner's illustrate(what | notice) move, or null for any other move. */
export function illustrationOf(board: string | null | undefined): { what: string; notice: string } | null {
  const m = /^illustrate\(([\s\S]*)\)$/.exec((board ?? "").trim());
  if (!m) return null;
  const [what, ...rest] = m[1].split("|");
  const clean = (t: string) => t.trim().replace(/^["“']|["”']$/g, "").trim();
  return clean(what) ? { what: clean(what), notice: clean(rest.join("|")) } : null;
}

/**
 * The spoken path's way to the planner (Sept 27 2026): 3.8 waits for a
 * blocking tool's result before it speaks, so a tool it calls first, before any
 * words, can carry the planner's order for the line it just heard. Declared
 * only in sessions with the planner on; the typed path plans before the line.
 */
export const NEXT_MOVE_DECLARATION = {
  name: "next_move",
  description: "Call this first, before you say anything to what the student just said: it returns the move to make and the words for it. Say them in your own voice, then make its board move.",
  parameters: { type: "object", properties: {}, required: [] as string[] },
};

/** The prompt's line for sessions that declare next_move. */
export const NEXT_MOVE_RULE = "Each time the student says something, call next_move before any words, then follow what it returns: say it in your own voice, then its board move. If it returns nothing, reply yourself.";

/**
 * Whether a plan made early, on the line as it was when the student stopped
 * (the spoken path's speculative start), still fits the line the tutor is
 * answering. Transcript fragments keep arriving after the student stops, so
 * the line may have grown: a few trailing words with no number in them change
 * nothing a plan depends on (Sept 28 2026: with exact matching the early plan
 * was thrown away on most turns and the tutor still waited about 2 s).
 */
export function sameLine(early: string, line: string): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s.]/gu, " ").replace(/\s+/g, " ").trim();
  const a = norm(early);
  const b = norm(line);
  if (!a || !b) return false;
  if (a === b) return true;
  if (!b.startsWith(a)) return false;
  const extra = b.slice(a.length).trim();
  return extra.split(" ").length <= 6 && !/\d/.test(extra) && !NUMBER_WORD.test(extra);
}

const NUMBER_WORD = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half|third|quarter|point|negative|minus|plus|times)\b/i;

