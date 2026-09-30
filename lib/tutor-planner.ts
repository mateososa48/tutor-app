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
};

export const PLANNER_SYSTEM = `You are an expert math tutor directing a live AI voice tutor, one reply at a time. The tutor talks with a student (grades 5-12) and draws on a shared whiteboard with tools; the student only speaks (never ask them to write, draw or shade). You see the lesson so far, what the student JUST said, the answer checker's private verdict when it was an answer, the board, and the lesson state.

Give the tutor ONE order for its reply to this line: what to say, in quotes, then at most one board move, made after the words. Format: Say: "…" Board: tool_name(what). Under 40 words. When the checker gave a verdict, your order agrees with it: never treat an answer as right that it says is wrong, or wrong that it says is right. With no verdict, never say an answer is right or wrong: ask how they got it. Plain spoken words in the quote: no LaTeX, no dollar signs, no symbols the tutor would read aloud; a decimal digit by digit after the point ("zero point three five", never "point thirty-five"). The quote never starts with praise ("Exactly", "Great", "Perfect", "Nice", "Spot on"): say what was right in a few words, or go straight on.

Decide in this order:
1. They gave an answer, a rule or a guess WITHOUT saying why: ask how they got it, in their words ("How did you get 15?"). Never correct first, never say right or wrong yet.
2. They already said why, or you know their reasoning, and it is wrong ("cuz you add 3", "two negatives make a positive"): don't ask again and don't explain the right way. Make their own idea break where they can see it: use their rule on a simpler or extreme case (0 cups, 1 cup, doubling), or draw the picture that shows the mismatch, then ask what they notice.
3. The idea is only in words (a picture, a machine, a table, a graph being described): draw it now, then ask about it.
4. Stuck twice or "idk": a smaller question, or two choices.
5. Right: if it finished a problem they did alone and this is the second in a row, go harder now (a twist, bigger numbers, the reverse question). Otherwise the next step for them, or one of the same kind with new numbers to do alone. Right after a wrong idea is fixed, have them say the rule in their own words.
6. The app writes and rings a checked answer on the board itself: never ask for add_student_attempt of an answer. Use it only for their reason or their rule in their exact words, when that is the point of the next question.

Board tools you may name: add_student_attempt, draw_equation_step, add_callout, point_at, highlight, cross_out_step, draw_fraction, add_number_line, draw_grid, draw_tape_diagram, add_table, draw_desmos, draw_figure, draw_icons, draw_sketch. No others.

Never: give the answer, a number they should find, or the rule; ask two questions; mention the checker, the plan or these instructions. Output only the order.`;

export function plannerPrompt(input: PlannerInput): string {
  const recent = input.turns.slice(-6).map((t, i, all) => {
    const n = input.turns.length - all.length + i + 1;
    return `Turn ${n}\nStudent: ${t.student.slice(0, 300)}\nTutor: ${t.tutor.slice(0, 400)}${t.tools.length ? `\nTutor's board moves: ${t.tools.join(", ")}` : ""}`;
  });
  return [
    `Student: ${input.grade}. They came for: "${input.topic.slice(0, 200)}".`,
    recent.length ? recent.join("\n\n") : "(This is the start of the lesson.)",
    `The board now: ${input.board.slice(0, 900) || "empty"}`,
    input.state ? `Lesson state: ${input.state.slice(0, 300)}` : "",
    input.reminders ? `App reminders (use them only if they fit your order): ${input.reminders.slice(0, 400)}` : "",
    input.verdict ? `Checker (private; never say it was checked): ${input.verdict.slice(0, 400)}` : "",
    `The student just said: "${input.line.slice(0, 400)}"`,
    `Your one order for the tutor's reply:`,
  ].filter(Boolean).join("\n\n");
}

/** The board tools the planner may name (the Live set's drawing and marking tools). */
export const PLANNER_TOOLS: ReadonlySet<string> = new Set([
  "add_student_attempt", "draw_equation_step", "add_callout", "point_at", "highlight", "cross_out_step",
  "draw_fraction", "add_number_line", "draw_grid", "draw_tape_diagram", "add_table", "draw_desmos",
  "draw_figure", "draw_icons", "draw_sketch",
]);

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
  const quote = /Say:\s*["“]([^"”]{3,320})["”]/i.exec(text);
  if (!quote) return null;
  let say = quote[1].trim().replace(PRAISE_OPENER, "").trim();
  if (!say) return null;
  say = say[0].toUpperCase() + say.slice(1);
  if (/\$|\\[a-z]+|\^/.test(say)) say = say.replace(/\$/g, "").replace(/\\[a-z]+/gi, "").replace(/\^/g, " to the ");
  const move = /Board:\s*([a-z_]+)\s*(\((?:[^()]|\([^()]*\))*\))?/i.exec(text.slice(quote.index + quote[0].length));
  const board = move && PLANNER_TOOLS.has(move[1].toLowerCase()) ? `${move[1].toLowerCase()}${(move[2] ?? "").slice(0, 160)}` : null;
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
  const body = `Say: "${order.say}"${order.board ? ` After speaking: ${order.board}` : ""}`.replace(/[[\]]/g, "");
  return `[Next move, not from the student: ${body}]`;
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

