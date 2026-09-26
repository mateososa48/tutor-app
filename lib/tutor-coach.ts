// The coach (Sept 26 2026): a small, cheap model that reads the lesson between
// the tutor's turns and hands it one order for the next one.
//
// Why: gemini-3.8-live follows a short, concrete order in its context and skims
// a rulebook, and the benchmark's judges kept naming the same semantic misses
// that no regex can see: it explained where it should have asked, corrected
// before it knew how the student got there, talked a picture it never drew.
// Tutor CoPilot (Wang et al. 2024, a randomized trial with hundreds of human
// tutors) raised student mastery by suggesting exactly this kind of move live
// ("ask a question", "give a hint"), most for the least experienced tutors.
//
// Timing: the coach runs after the tutor's turn and before the student's next
// line is known, as it must in a spoken session (the student is still
// thinking), so it never sees their answer. Its order goes into the tutor's
// context with the student's line (TutorRuntime.turnNote's channel).
//
// Pure: the prompt and the parser. The call itself is the caller's (the bench
// calls a Gemini text model; the app posts to /api/coach).

export type CoachTurn = { student: string; tutor: string; tools: string[] };

export type CoachInput = {
  grade: string;
  topic: string;
  turns: CoachTurn[];
  /** The board as the tutor reads it ([Board: …], compact). */
  board: string;
  /** The lesson state line ([Tutor state: …]) the tutor already gets, so the coach does not repeat it. */
  state: string | null;
};

export const COACH_SYSTEM = `You coach a live AI voice math tutor between its turns, the way an expert tutor would whisper to a newer one. The tutor talks with a student (grades 5-12) and writes on a shared whiteboard with tools. Only the tutor can write or draw on the board: the student answers by speaking, so never ask the student to write, shade, draw or place anything; the tutor draws what the student says. You see the conversation, what is on the board, and the lesson state the tutor already knows.

Give the tutor ONE order for its next turn, at most 25 words, or the single word none when it is already doing the right thing.

What to look for, in this order:
1. The student's thinking is not known yet (a wrong answer, a rule, a guess): ask how they got it, in their words, before correcting anything.
2. The tutor explained or told: make the student do the next step, say the rule, or find the value instead.
3. The idea lives only in words: name the one picture to draw (a table, a number line, a grid, bars, a graph, the shape) or the board item to point at.
4. The student is stuck twice: a smaller question, or two choices.
5. The student has it: one of the same kind with new numbers, alone; after two alone, harder.
6. The tutor asked two things, or ended with nothing for the student to do: one question.

Rules for the order: never give the answer or any number the student should find; never praise; do not repeat the lesson state; speak to the tutor ("Ask…", "Draw…", "Point at…"); name a tool only when it helps (add_table, add_number_line, draw_grid, draw_tape_diagram, draw_desmos, point_at, highlight). Output only the order or none.`;

export function coachPrompt(input: CoachInput): string {
  const turns = input.turns.slice(-8).map((t, i, all) => {
    const n = input.turns.length - all.length + i + 1;
    return `Turn ${n}\nStudent: ${t.student.slice(0, 300)}\nTutor: ${t.tutor.slice(0, 400)}${t.tools.length ? `\nTutor's board moves: ${t.tools.join(", ")}` : ""}`;
  });
  return `Student: ${input.grade}. They came for: "${input.topic.slice(0, 200)}".

${turns.join("\n\n")}

The board now: ${input.board.slice(0, 900) || "empty"}
${input.state ? `Lesson state the tutor already has: ${input.state.slice(0, 300)}\n` : ""}
The student has not answered yet. Your one order for the tutor's next turn (or none):`;
}

/** The coach's reply as a note for the tutor, or null for "none" or an empty reply. */
export function coachNote(reply: string | null | undefined): string | null {
  const text = (reply ?? "").replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").trim();
  if (!text || /^none\b/i.test(text)) return null;
  const words = text.split(" ");
  const order = (words.length > 30 ? `${words.slice(0, 30).join(" ")}…` : text).replace(/[\[\]]/g, "");
  return `[Coach, not from the student: ${order}]`;
}
