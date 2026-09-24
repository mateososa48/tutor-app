import { test } from "node:test";
import assert from "node:assert/strict";
import { isWaiting, LOOK_BOARD, LOOK_STUDENT, presenceBubble, presenceLook, presenceState, type PresenceActivity, type PresenceInput } from "./tutor-presence";

const base: PresenceInput = { activity: "listening", caption: "", yourTurn: false };
const says = (input: Partial<PresenceInput>) => presenceBubble({ ...base, ...input }).what;

// The session page's own mapping (app/session/[id]/page.tsx, `dockActivity`),
// copied so the pet is tested against what the page really sends: every quiet
// moment is "listening", never "idle".
function pageDockActivity(liveState: string, isTutorSpeaking: boolean, tutorActivity: "idle" | "thinking" | "writing"): PresenceActivity {
  if (liveState === "connecting" || liveState === "idle") return "connecting";
  if (isTutorSpeaking) return "speaking";
  if (tutorActivity === "writing") return "writing";
  if (tutorActivity === "thinking") return "thinking";
  return "listening";
}

test("with the page as it is, a waiting blank still says Your turn and the quiet line still shows", () => {
  const activity = pageDockActivity("active", false, "idle");
  assert.equal(activity, "listening");
  assert.deepEqual(presenceBubble({ ...base, activity, yourTurn: true }), { what: "your-turn", kind: "speech", text: "Your turn" });
  assert.deepEqual(presenceBubble({ ...base, activity, yourTurn: true, quiet: "Take your time." }), {
    what: "quiet",
    kind: "speech",
    text: "Take your time.",
    tone: "quiet",
  });
  assert.deepEqual(presenceLook({ activity, yourTurn: true }), LOOK_BOARD, "eyes on the blank");
});

test("the order: caption, then thinking, then the quiet line, then Your turn", () => {
  const all = { caption: "Split 8 into two parts.", activity: "thinking" as const, quiet: "Take your time.", yourTurn: true };
  assert.equal(says(all), "caption");
  assert.equal(says({ ...all, caption: "" }), "thinking");
  assert.equal(says({ ...all, caption: "", activity: "listening" }), "quiet");
  assert.equal(says({ ...all, caption: "", activity: "listening", quiet: null }), "your-turn");
  assert.equal(says({ ...all, caption: "", activity: "listening", quiet: "  " }), "your-turn", "a blank quiet line is no line");
  assert.equal(says({ ...all, caption: "", activity: "listening", quiet: null, yourTurn: false }), null);
});

test("the caption keeps its own text, lingering and interrupted lines included", () => {
  const b = presenceBubble({ ...base, caption: "A common denominator makes —", activity: "listening", studentSpeaking: true });
  assert.deepEqual(b, { what: "caption", kind: "speech", text: "A common denominator makes —" });
});

test("while the student talks the pet only listens: no bubble of its own, eyes on them", () => {
  const talking = { ...base, studentSpeaking: true, yourTurn: true, quiet: "Take your time." };
  assert.equal(says(talking), null);
  assert.equal(says({ ...talking, activity: "idle" }), null);
  assert.equal(presenceState(talking), "listening");
  assert.deepEqual(presenceLook(talking), LOOK_STUDENT);
  assert.equal(isWaiting(talking), false);
  // Their words do not hide the tutor's own lingering caption.
  assert.equal(says({ ...talking, caption: "Nice. What is 8 split into 2?" }), "caption");
});

test('"idle" is waiting too: the quiet line or Your turn', () => {
  assert.equal(says({ activity: "idle", quiet: "Take your time." }), "quiet");
  assert.equal(says({ activity: "idle", yourTurn: true }), "your-turn");
  assert.equal(presenceState({ activity: "idle" }), "listening");
});

test("the quiet line and Your turn wait while the tutor speaks, writes, thinks or connects", () => {
  for (const activity of ["speaking", "writing", "connecting"] as const) {
    assert.equal(says({ activity, yourTurn: true, quiet: "Take your time." }), null, activity);
  }
  assert.equal(says({ activity: "thinking", yourTurn: true, quiet: "Take your time." }), "thinking");
});

test("hidden says nothing at all, not even the caption", () => {
  assert.equal(says({ hidden: true, caption: "Split 8.", activity: "thinking", yourTurn: true, quiet: "Take your time." }), null);
});

test("poses", () => {
  assert.equal(presenceState({ activity: "connecting" }), "idle");
  assert.equal(presenceState({ activity: "speaking" }), "speaking");
  assert.equal(presenceState({ activity: "thinking" }), "thinking");
  assert.equal(presenceState({ activity: "writing" }), "writing");
  assert.equal(presenceState({ activity: "listening" }), "listening");
  assert.equal(presenceState({ activity: "speaking", hopping: true }), "happy", "a right answer wins over everything");
});

test("eyes: the board while writing or while a blank waits, the student otherwise", () => {
  assert.deepEqual(presenceLook({ activity: "writing", yourTurn: false }), LOOK_BOARD);
  assert.deepEqual(presenceLook({ activity: "writing", yourTurn: false, studentSpeaking: true }), LOOK_BOARD, "its hand is on the board");
  assert.deepEqual(presenceLook({ activity: "thinking", yourTurn: true }), LOOK_BOARD);
  assert.deepEqual(presenceLook({ activity: "speaking", yourTurn: true }), LOOK_STUDENT, "it talks to the student");
  assert.deepEqual(presenceLook({ activity: "listening", yourTurn: false }), LOOK_STUDENT);
});
