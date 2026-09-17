// When Explore tells the tutor what the student changed (Sept 17 2026). A
// report is a user turn on Gemini Live, so the tutor answers it; sent while
// anyone is talking, it would cut the tutor off. So a report waits until the
// student has stopped changing things for 2.5 s, comes at most every 8 s, and
// only while nobody is talking; closing the panel sends what is left. Each
// report describes everything changed since the panel opened. Pure; tested in
// explore-report.test.ts.

export const EXPLORE_QUIET_MS = 2500;
export const EXPLORE_GAP_MS = 8000;

export type ExploreReporter = {
  /** What the student has changed so far, in words ("" for nothing). */
  pending: string;
  changedAt: number;
  sentAt: number;
  lastSent: string;
};

export function createExploreReporter(now: number): ExploreReporter {
  return { pending: "", changedAt: now, sentAt: -Infinity, lastSent: "" };
}

export function noteExploreChange(r: ExploreReporter, description: string, now: number): void {
  if (description === r.pending) return;
  r.pending = description;
  r.changedAt = now;
}

/** The text to send now, or null. `quiet`: the tutor is not speaking or thinking, and the student is not talking. */
export function exploreReportDue(r: ExploreReporter, now: number, quiet: boolean): string | null {
  if (!r.pending || r.pending === r.lastSent || !quiet) return null;
  if (now - r.changedAt < EXPLORE_QUIET_MS || now - r.sentAt < EXPLORE_GAP_MS) return null;
  return r.pending;
}

export function markExploreSent(r: ExploreReporter, text: string, now: number): void {
  r.lastSent = text;
  r.sentAt = now;
}

/** On close: what the tutor has not heard yet, or null. */
export function finalExploreReport(r: ExploreReporter): string | null {
  return r.pending && r.pending !== r.lastSent ? r.pending : null;
}

/** The session event the tutor receives. */
export function exploreEventText(itemId: string, description: string, closed: boolean): string {
  return `[Explore ${itemId}: the student ${description}. ${closed ? "They closed Explore; the board graph now shows their version." : "They are still exploring; a picture of their graph came with this."} React to what they found in a sentence, and ask what they notice.]`;
}
