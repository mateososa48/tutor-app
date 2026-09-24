// Silence after the tutor's turn belongs to the student (Sept 23 2026).
//
// 3.1 never spoke into silence; 3.8's proactive audio can, so the prompt's old
// "If they stay quiet a while: 'Take your time.'" could now cut into a kid's
// thinking. The app owns silence instead: 20 s after the tutor stops, the pet
// shows a quiet "Take your time." (no voice); at 45 s the tutor gets one
// session event asking for a single low-pressure line ("say what you've got
// so far"), never a hint. Anything the student does (speaks, types, sends)
// restarts it, and "wait" or "let me think" skips the check-in.

export const QUIET_HINT_AFTER_MS = 20_000;
export const QUIET_CHECKIN_AFTER_MS = 45_000;

export const QUIET_HINT = "Take your time.";

export const QUIET_CHECKIN_EVENT =
  "The student has been quiet for about 45 seconds since your last turn. Say one short, low-pressure line that invites them to share what they have so far, even half an idea, in your own words. No hint, no new question, and don't repeat the question.";

export type QuietInput = {
  now: number;
  /** A live, unpaused session with nothing else going on (no Explore panel open). */
  active: boolean;
  /** The tutor is speaking, thinking or writing. */
  tutorBusy: boolean;
  /** When the tutor last went quiet after speaking (epoch ms, 0 if it has not spoken). */
  tutorQuietSince: number;
  /** The student's last sign of life: speech, a typed message, a key press. */
  lastStudentAt: number;
  /** Their last words asked for time ("wait", "let me think"). */
  askedToWait: boolean;
  /** The tutorQuietSince already checked in for (so it happens once a turn). */
  checkedInFor: number;
};

export type QuietStep = {
  hint: boolean;
  checkIn: boolean;
  /** How long the silence has run, ms. */
  sinceMs: number;
  /** Why a due check-in was skipped. */
  skipped?: "asked to wait";
};

const NONE: QuietStep = { hint: false, checkIn: false, sinceMs: 0 };

export function quietStep(i: QuietInput): QuietStep {
  if (!i.active || i.tutorBusy || i.tutorQuietSince <= 0) return NONE;
  // The student has done something since the tutor stopped: it is not their silence.
  if (i.lastStudentAt >= i.tutorQuietSince) return NONE;
  const sinceMs = Math.max(0, i.now - i.tutorQuietSince);
  const hint = sinceMs >= QUIET_HINT_AFTER_MS;
  const due = sinceMs >= QUIET_CHECKIN_AFTER_MS && i.checkedInFor !== i.tutorQuietSince;
  if (due && i.askedToWait) return { hint, checkIn: false, sinceMs, skipped: "asked to wait" };
  return { hint, checkIn: due, sinceMs };
}

const WAIT = /\b(wait|hold on|hang on|one sec(?:ond)?|a sec(?:ond)?|give me a (?:sec(?:ond)?|minute|min)|let me think|i'?m thinking|thinking)\b/i;

/** Whether the student asked for time. */
export function asksToWait(utterance: string): boolean {
  return WAIT.test(utterance);
}
