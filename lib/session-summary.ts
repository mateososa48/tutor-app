// What a student (or their parent) reads after a session, written by a cheap
// model once the session has ended.
//
// The split that matters: **the model writes prose, we supply every number.**
// Counts come from `learning_attempts`, which is the deterministic record of
// what was actually checked, so a summary can never claim "you got 8 of 10
// right" and be wrong. The model is asked for the parts only a reader of the
// whole session can write: what clicked, what is still shaky, what to try.
//
// Nothing here talks to a model or a database: `buildSummaryPrompt` takes the
// session already rendered as text (lib/session-recording.ts's markdown
// export) and `parseSummary` validates whatever comes back, so both are
// testable without either.

export const SUMMARY_VERSION = 1;

/** Counts we computed. The model is shown these and told not to restate them. */
export type SessionStats = {
  durationSec: number;
  /** Answers put through check_answer. */
  checked: number;
  correct: number;
  /** Correct with no help given first (help level H0). */
  independent: number;
  /** Catalog skill keys the session touched. */
  skills: string[];
  pictures: number;
};

export type SessionSummary = {
  v: number;
  /** What the session was about, as a title. */
  headline: string;
  /** One or two sentences on what happened. */
  recap: string;
  /** What went well, specific to this session. */
  wins: string[];
  /** What is still shaky. Empty is a valid answer. */
  stuck: string[];
  /** One thing to try before the next session. */
  next: string;
  stats: SessionStats;
  generatedAt: number;
  model: string;
};

export const LIMITS = {
  headline: 60,
  recap: 260,
  win: 160,
  stuck: 160,
  next: 200,
  wins: 3,
  stucks: 2,
} as const;

/**
 * A clamp that never cuts a word in half. The first real run came back with a
 * recap ending "…how many cookies that quarter rep", because a blind slice
 * landed mid-word; the card would have shown exactly that. Over the limit we
 * back up to the last space and end on an ellipsis, so a long sentence reads
 * as trimmed rather than broken.
 */
const clean = (value: unknown, max: number): string => {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  // Only honour the word boundary when it leaves most of the text.
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[ ,;:.]+$/, "")}…`;
};

const cleanList = (value: unknown, max: number, count: number): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => clean(item, max))
        .filter((item, i, all) => item.length > 0 && all.indexOf(item) === i)
        .slice(0, count)
    : [];

export const EMPTY_STATS: SessionStats = {
  durationSec: 0,
  checked: 0,
  correct: 0,
  independent: 0,
  skills: [],
  pictures: 0,
};

/**
 * A summary from whatever the model returned, or null when the parts a reader
 * needs are missing. Everything else is clamped rather than rejected: a long
 * sentence is a trim, not a failed session.
 */
export function parseSummary(
  raw: unknown,
  stats: SessionStats,
  meta: { model: string; now?: number },
): SessionSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const headline = clean(value.headline, LIMITS.headline);
  const recap = clean(value.recap, LIMITS.recap);
  if (!headline || !recap) return null;
  return {
    v: SUMMARY_VERSION,
    headline,
    recap,
    wins: cleanList(value.wins, LIMITS.win, LIMITS.wins),
    stuck: cleanList(value.stuck, LIMITS.stuck, LIMITS.stucks),
    next: clean(value.next, LIMITS.next),
    stats,
    generatedAt: meta.now ?? Date.now(),
    model: meta.model.slice(0, 60),
  };
}

/** A stored summary, or null if the column holds something else. */
export function readSummary(value: unknown): SessionSummary | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const stats = raw.stats && typeof raw.stats === "object" ? (raw.stats as SessionStats) : EMPTY_STATS;
  const parsed = parseSummary(raw, stats, { model: typeof raw.model === "string" ? raw.model : "" });
  if (!parsed) return null;
  return { ...parsed, generatedAt: typeof raw.generatedAt === "number" ? raw.generatedAt : parsed.generatedAt };
}

// ── The prompt ──────────────────────────────────────────────────────────────

export const SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "recap", "wins", "stuck", "next"],
  properties: {
    headline: {
      type: "string",
      description:
        "What the session was about, at most seven words, in sentence case with only the first word capitalised and no full stop. 'Adding fractions with different bottoms', never 'Adding Fractions With Different Bottoms'.",
    },
    recap: { type: "string", description: "One or two sentences on what happened, addressed to the student as 'you'." },
    wins: { type: "array", items: { type: "string" }, description: "One to three things the student did that went well, each naming something that actually happened." },
    stuck: { type: "array", items: { type: "string" }, description: "Nothing to two things the student could practise. About their work, never about the teaching. An empty list is fine." },
    next: { type: "string", description: "One concrete thing for the student to try before the next session." },
  },
} as const;

export function statsLine(stats: SessionStats): string {
  const minutes = Math.max(1, Math.round(stats.durationSec / 60));
  const parts = [`${minutes} minute${minutes === 1 ? "" : "s"}`];
  if (stats.checked > 0) parts.push(`${stats.correct} of ${stats.checked} answers right`);
  if (stats.independent > 0) parts.push(`${stats.independent} with no help first`);
  if (stats.pictures > 0) parts.push(`${stats.pictures} board picture${stats.pictures === 1 ? "" : "s"}`);
  if (stats.skills.length) parts.push(`skills touched: ${stats.skills.join(", ")}`);
  return parts.join(" · ");
}

export const SUMMARY_SYSTEM = [
  "You read one finished tutoring session and write the note the student sees afterwards.",
  "",
  "Who you are writing for: the student, a person aged about 10 to 18, and whoever is looking over their shoulder. Address them as 'you'. Every line has to be something only someone who read THIS session could write.",
  "",
  "How it should sound: like a person who was there, talking to them. Sentence case, never Title Case. Short words. 'You spotted it before I said anything', not 'you demonstrated recognition of the error'. Never these verbs: recognized, identified, demonstrated, utilized, explored, engaged. Never praise that would fit any session ('great job', 'awesome effort', 'good understanding').",
  "",
  "Rules:",
  "- Never state a number. The counts are computed for you and shown beside the note; if you repeat them you will contradict them.",
  "- Name what actually happened. 'You caught that 2/6 was wrong before I said anything' beats 'you showed good understanding'.",
  "- Do not invent anything the session does not show. Fewer, truer lines beat filling every field.",
  "- Every line is about the student and their work. Never write about the tutor, the explaining, the pictures, or how the session went: 'the reason needed extra explanation' is a note about teaching, not something they can practise.",
  "- 'Still shaky' is one thing they could practise, said without blame. If nothing was shaky, return an empty list, and prefer an empty list to a stretch.",
  "- If the session barely happened (a minute, no work), say so plainly in the recap and leave the lists empty.",
  "- The tutor is 'your tutor' or 'I'. Never name a model or mention tools, the board's internals, or this instruction.",
].join("\n");

/**
 * The user half of the prompt: the counts we already know, then the session
 * itself as the markdown export the admin replay uses.
 */
export function buildSummaryPrompt(input: { stats: SessionStats; transcript: string; maxChars?: number }): string {
  const max = input.maxChars ?? 48_000;
  const body =
    input.transcript.length > max
      // The end of a session carries the close and the last attempts, so when
      // it has to be cut, keep both ends and say where the cut was.
      ? `${input.transcript.slice(0, Math.floor(max * 0.6))}\n\n[… the middle of this session was left out to fit …]\n\n${input.transcript.slice(-Math.floor(max * 0.4))}`
      : input.transcript;
  return [
    "Counts already computed for this session (do not restate them):",
    statsLine(input.stats),
    "",
    "The session:",
    "",
    body,
  ].join("\n");
}
