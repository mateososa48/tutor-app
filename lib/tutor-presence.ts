// What the tutor's pet does and says on the voice dock (Sept 23 2026). Pure,
// so the order of what it says can be tested apart from the component
// (components/session/TutorPresence.tsx).
//
// The page hands the pet the dock's activity. "listening" is what the dock
// shows whenever nobody is talking (the tutor is listening for the student),
// so for the pet it means waiting: it may say the quiet line or "Your turn".
// "idle" means the same. Whether the student is talking right now is its own
// signal, `studentSpeaking`: then the pet only listens, with no bubble of its
// own. (A first version read "listening" as "the student is talking"; the page
// sends "listening" for every quiet moment, so "Your turn" never showed.)

export type PresenceActivity = "connecting" | "listening" | "idle" | "thinking" | "writing" | "speaking";

export type PresenceInput = {
  activity: PresenceActivity;
  /** The tutor's words as they are spoken (the live caption); it lingers after the voice. */
  caption: string;
  /** A blank on the board is waiting for the student's answer. */
  yourTurn: boolean;
  /** The student is talking right now. */
  studentSpeaking?: boolean;
  /** A line for a long silence ("Take your time."), set by the page. */
  quiet?: string | null;
  /** The transcript is open, so the pet has stepped away. */
  hidden?: boolean;
  /** The student just got one right. */
  hopping?: boolean;
};

export type PresenceBubble =
  | { what: null }
  | { what: "caption"; kind: "speech"; text: string }
  | { what: "thinking"; kind: "thought" }
  | { what: "quiet"; kind: "speech"; text: string; tone: "quiet" }
  | { what: "your-turn"; kind: "speech"; text: string };

export type PresenceState = "happy" | "idle" | "speaking" | "thinking" | "writing" | "listening";

/** Nobody is talking and the tutor is not busy: the student's move. */
export function isWaiting({ activity, studentSpeaking }: Pick<PresenceInput, "activity" | "studentSpeaking">): boolean {
  return (activity === "listening" || activity === "idle") && !studentSpeaking;
}

/**
 * What the pet says, most important first: the tutor's own words (the caption
 * lingers a moment after the voice stops, and an interrupted line ends on
 * "—"); then "Thinking"; then, only while everyone is quiet, the quiet line,
 * and last "Your turn". The quiet line is the lowest-key thing it says and
 * takes the place of "Your turn" while it is set.
 */
export function presenceBubble(input: PresenceInput): PresenceBubble {
  if (input.hidden) return { what: null };
  const caption = input.caption.trim();
  if (caption) return { what: "caption", kind: "speech", text: input.caption };
  if (input.activity === "thinking") return { what: "thinking", kind: "thought" };
  if (!isWaiting(input)) return { what: null };
  const quiet = input.quiet?.trim();
  if (quiet) return { what: "quiet", kind: "speech", text: quiet, tone: "quiet" };
  if (input.yourTurn) return { what: "your-turn", kind: "speech", text: "Your turn" };
  return { what: null };
}

/** The pet's pose. Waiting and the student talking are both "listening"; only its eyes and its bubble differ. */
export function presenceState(input: Pick<PresenceInput, "activity" | "hopping">): PresenceState {
  if (input.hopping) return "happy";
  switch (input.activity) {
    case "connecting":
      return "idle";
    case "speaking":
    case "thinking":
    case "writing":
      return input.activity;
    default:
      return "listening";
  }
}

// The board is up and to the pet's left (right and up are positive).
export const LOOK_BOARD = { x: -0.8, y: 0.45 } as const;
export const LOOK_STUDENT = { x: -0.15, y: 0 } as const;

/** Where the pet looks: at the board while it writes or while a blank waits on the student, else at the student. */
export function presenceLook(input: Pick<PresenceInput, "activity" | "yourTurn" | "studentSpeaking">): { x: number; y: number } {
  if (input.activity === "writing") return LOOK_BOARD;
  if (input.studentSpeaking) return LOOK_STUDENT;
  if (input.yourTurn && input.activity !== "speaking") return LOOK_BOARD;
  return LOOK_STUDENT;
}
