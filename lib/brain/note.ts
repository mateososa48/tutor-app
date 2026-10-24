// The private note the brain reads with each student line (the LiveKit voice
// path). Built by whoever owns the TutorRuntime (the session page's client,
// or the bench) from the same parts, so the bake-off measures what ships.
// Pure.

export type NoteParts = {
  /** The checker's note on this line (TutorRuntime.takeAutoCheckNote), if it was an answer. */
  check: string | null;
  /** The lesson state line (formatTutorState). */
  state: string | null;
  /** The board as the tutor reads it (the compact list). */
  board: string;
  /** The app's reminders: the turn note, a refused board move, a picture that failed. */
  reminders: Array<string | null | undefined>;
  /** What the tutor remembers about the student (formatMemory). */
  memory?: string | null;
  /** They're saying goodbye (detectSignals "closing"). */
  leaving?: boolean;
};

export const LEAVING_NOTE = "They're leaving: say goodbye warmly in one or two sentences, with today's idea in a few words if it fits. No new question, no new task, no board moves.";

export function buildTurnNote(p: NoteParts): string {
  const reminders = [p.leaving ? LEAVING_NOTE : null, ...p.reminders].filter((r): r is string => Boolean(r && r.trim())).join(" ");
  return [
    p.check ? `Checker: ${p.check}` : "Checker: no answer to check in this line.",
    p.state ? `Lesson: ${p.state}` : "",
    p.board.trim() ? `Board: ${p.board.trim().slice(0, 1600)}` : "Board: empty.",
    reminders ? `Reminders: ${reminders.slice(0, 900)}` : "",
    p.memory ? `Memory: ${p.memory.slice(0, 400)}` : "",
    "Private; never read aloud.",
  ].filter(Boolean).join("\n");
}

/** A board move as the history records it: the tool and its main words ("draw_fraction 1/2, 2/4"). */
export function describeMove(name: string, args: Record<string, unknown>): string {
  const keys = ["problem", "title", "latex", "text", "fraction", "second_fraction", "expressions", "what", "target", "steps", "points"];
  const bits = keys.map((k) => args[k]).filter((v) => typeof v === "string" && v.trim()).map((v) => String(v).slice(0, 60));
  return bits.length ? `${name} ${bits.join(", ")}` : name;
}
