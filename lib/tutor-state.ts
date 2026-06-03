// Light app-side student model that survives Gemini Live context compression,
// plus confusion detection used to inject downshift guidance.

export type TutorState = {
  notes: string[]; // durable facts the tutor recorded (newest last, capped)
  confusionStreak: number; // consecutive student turns that looked confused
  drawsSinceStudent: number; // successful board tool calls since the student last spoke
};

const MAX_NOTES = 12;

export function createTutorState(): TutorState {
  return { notes: [], confusionStreak: 0, drawsSinceStudent: 0 };
}

export function rememberNote(state: TutorState, note: string): void {
  const trimmed = note.trim();
  if (!trimmed) return;
  state.notes.push(trimmed);
  if (state.notes.length > MAX_NOTES) state.notes.shift();
}

const CONFUSION_PATTERNS: RegExp[] = [
  /\bi (do ?n'?t|don'?t|do not) (get|understand|follow)\b/i,
  /\bi'?m (so |really |totally )?(lost|confused)\b/i,
  /\bno idea\b/i,
  /\bmakes no sense\b/i,
  /\bthis is (so |really )?(hard|confusing)\b/i,
  /\bcan you (repeat|say that again|explain that again|go over)\b/i,
  /\bwhat do you mean\b/i,
  /^(huh|what)\??$/i,
  /^wait,? what\b/i,
];

export function looksConfused(studentText: string): boolean {
  const t = studentText.trim();
  if (!t) return false;
  return CONFUSION_PATTERNS.some((re) => re.test(t));
}

// Called when a student turn finishes. Updates the confusion streak and
// resets the over-draw counter for the new turn.
export function noteStudentTurn(state: TutorState, studentText: string): void {
  state.confusionStreak = looksConfused(studentText) ? state.confusionStreak + 1 : 0;
  state.drawsSinceStudent = 0;
}

export function noteDraw(state: TutorState): void {
  state.drawsSinceStudent += 1;
}

// Compact memory line appended to tool responses so it refreshes in-context
// (survives sliding-window compression). Empty string when there is nothing yet.
export function formatMemory(state: TutorState): string {
  if (state.notes.length === 0) return "";
  return `[Memory: ${state.notes.join("; ")}]`;
}

// A downshift directive injected after the tutor's turn when the student looked
// confused. Reused, debounced injection path replaces the old "draw something" nudge.
export function formatDownshift(): string {
  return (
    "[Pacing: the student seems lost. Downshift now — stop adding new material. " +
    "Make the next step tiny, swap in a concrete everyday example, and check one small thing. " +
    "Add encouragement. Do not mention this note.]"
  );
}
