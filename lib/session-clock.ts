// The session's clock, as the tutor reads it (round C, Sept 24 2026).
//
// The student says how long they have in the intake (10 to 60 minutes). The
// student never sees a countdown (time pressure is a known anxiety trigger);
// the tutor sees it in its [Tutor state] line and gives one heads-up before
// the end: "last one, then we wrap up". The last minutes are a quick check
// with no help and today's rule.

export type ClockPhase = "on" | "last" | "wrap" | "over";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Minutes left when the heads-up is due: a quarter of the session, 3 to 10. */
export function lastWindow(planned: number): number {
  return clamp(Math.round(planned * 0.25), 3, 10);
}

/** Minutes left when the wrap-up starts: a tenth of the session, 2 to 5. */
export function wrapWindow(planned: number): number {
  return clamp(Math.round(planned * 0.1), 2, 5);
}

export function clockPhase(elapsedMs: number, planned: number | null): ClockPhase {
  if (!planned || planned <= 0) return "on";
  const left = planned - elapsedMs / 60_000;
  if (left <= 0) return "over";
  if (left <= wrapWindow(planned)) return "wrap";
  if (left <= lastWindow(planned)) return "last";
  return "on";
}

/** "12 of 20 min", or "12 min in" when they gave no length. */
export function clockLabel(elapsedMs: number, planned: number | null): string {
  const minutes = Math.max(0, Math.round(elapsedMs / 60_000));
  return planned ? `${minutes} of ${planned} min` : `${minutes} min in`;
}

/** The cue for the state line, or null while there is time. */
export function clockCue(elapsedMs: number, planned: number | null): string | null {
  const phase = clockPhase(elapsedMs, planned);
  if (!planned || phase === "on") return null;
  // No minutes in the cue: the line is resent only when it changes, and a
  // number that ticks down would resend it every minute.
  if (phase === "last") {
    return `time: nearly done, so the problem after this one is the last; say so once, briefly ("last one, then we wrap up"), when this one is done`;
  }
  if (phase === "wrap") {
    return "time: wrap up now, once this problem is done: one quick check with no help, today's rule in one sentence, and remember_about_student";
  }
  return `time: past the ${planned} minutes they chose; close warmly unless they want to keep going`;
}
