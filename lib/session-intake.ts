import type { UploadedFile } from "./file-processor";
import { topicBrief } from "./skill-map";
import { lessonByKey, lessonPlan, lessonTopic } from "./staged-lessons";

// What the student tells us before a session starts, so the tutor can open on
// the actual problem instead of "what are we working on today?".
//
// The answers travel from the intake screen (/session) to the live session in
// two places: the text fields go through localStorage keyed by session id (they
// survive a reload), and the files stay in memory for this tab only, because
// base64 images are far too big for localStorage. `takeIntake` reads once and
// clears, so a session never opens on stale context.

export const SESSION_LANGUAGES = [
  { code: "de", label: "Deutsch", english: "German" },
  { code: "en", label: "English", english: "English" },
  { code: "es", label: "Español", english: "Spanish" },
  { code: "fr", label: "Français", english: "French" },
  { code: "it", label: "Italiano", english: "Italian" },
  { code: "pt", label: "Português", english: "Portuguese" },
  { code: "pl", label: "Polski", english: "Polish" },
  { code: "tr", label: "Türkçe", english: "Turkish" },
  { code: "uk", label: "Українська", english: "Ukrainian" },
  { code: "ru", label: "Русский", english: "Russian" },
  { code: "ar", label: "العربية", english: "Arabic" },
  { code: "zh", label: "中文", english: "Mandarin Chinese" },
  { code: "vi", label: "Tiếng Việt", english: "Vietnamese" },
] as const;

export type LanguageCode = (typeof SESSION_LANGUAGES)[number]["code"];

/** Sessions open in English unless the student picks otherwise (Mateo, Sept 15 2026). */
export const DEFAULT_LANGUAGE: LanguageCode = "en";

/**
 * How long today (Sept 24 2026, round C). Mateo cut this on Sept 15 as one
 * question too many, then asked for it back so the tutor can size the lesson;
 * it came back as one row, one tap, with 20 already picked.
 */
export const SESSION_LENGTHS = [10, 15, 20, 30, 45, 60] as const;
export type SessionLength = (typeof SESSION_LENGTHS)[number];
export const DEFAULT_MINUTES: SessionLength = 20;

export function isSessionLength(value: unknown): value is SessionLength {
  return typeof value === "number" && (SESSION_LENGTHS as readonly number[]).includes(value);
}

export type SessionIntake = {
  topic: string;
  language: LanguageCode;
  fileNames: string[];
  /** Minutes they said they have today; older intakes have none. */
  minutes?: SessionLength;
  /** A staged lesson they picked rather than a problem they brought (lib/staged-lessons.ts). */
  lessonKey?: string;
};

export const EMPTY_INTAKE: SessionIntake = {
  topic: "",
  language: DEFAULT_LANGUAGE,
  fileNames: [],
  minutes: DEFAULT_MINUTES,
};

export function languageName(code: LanguageCode): string {
  return SESSION_LANGUAGES.find((l) => l.code === code)?.english ?? "English";
}

const key = (sessionId: string) => `chalk.intake.${sessionId}`;
// Files are per tab: base64 images would blow past localStorage's few megabytes.
const pendingFiles = new Map<string, UploadedFile[]>();

export function storeIntake(sessionId: string, intake: SessionIntake, files: UploadedFile[]) {
  try {
    window.localStorage.setItem(key(sessionId), JSON.stringify({ ...intake, at: Date.now() }));
  } catch {
    // Storage blocked: the session still gets the intake through memory below.
  }
  if (files.length > 0) pendingFiles.set(sessionId, files);
  else pendingFiles.delete(sessionId);
}

// What was already handed over, so React's double-mount in development reads
// the same answers twice instead of losing them on the second pass.
const taken = new Map<string, { intake: SessionIntake; files: UploadedFile[] }>();

/** Reads the intake for a session and clears the store, so it is used once. */
export function takeIntake(sessionId: string): { intake: SessionIntake; files: UploadedFile[] } | null {
  const already = taken.get(sessionId);
  if (already) return already;
  let intake: SessionIntake | null = null;
  try {
    const raw = window.localStorage.getItem(key(sessionId));
    if (raw) {
      const parsed = JSON.parse(raw) as SessionIntake & { at?: number };
      // Anything older than a day is a leftover, not this session's context.
      if (!parsed.at || Date.now() - parsed.at < 24 * 60 * 60 * 1000) intake = { ...EMPTY_INTAKE, ...parsed };
    }
    window.localStorage.removeItem(key(sessionId));
  } catch {
    // Storage blocked: fall through to whatever is in memory.
  }
  const files = pendingFiles.get(sessionId) ?? [];
  pendingFiles.delete(sessionId);
  if (!intake && files.length === 0) return null;
  const result = { intake: intake ?? EMPTY_INTAKE, files };
  taken.set(sessionId, result);
  return result;
}

// The live client fetches its prompt itself (lib/gemini-tutor.ts), so the
// session page hands the intake over here for the moment the socket opens.
let active: { intake: SessionIntake; fileCount: number } | null = null;

export function setActiveIntake(intake: SessionIntake, fileCount: number) {
  active = { intake, fileCount };
}

export function getActiveIntake(): { intake: SessionIntake; fileCount: number } | null {
  return active;
}

export function clearActiveIntake() {
  active = null;
}

/** A session title from the topic: the first line, trimmed to fit the sidebar. */
export function intakeTitle(intake: SessionIntake): string {
  const line = intake.topic.split("\n")[0].trim();
  if (!line) return "Session";
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line;
}

/**
 * The student's opening turn, in their own voice, sent as soon as the tutor
 * connects. The tutor answers this instead of asking what to work on.
 */
export function intakeOpeningMessage(intake: SessionIntake, fileCount: number): string {
  const parts: string[] = [];
  const topic = intake.topic.trim();
  const lesson = lessonByKey(intake.lessonKey);
  // A picked lesson is not something they are stuck on, so they do not say so.
  if (lesson && topic === lessonTopic(lesson)) parts.push(`I want to work on ${lesson.label.toLowerCase()}.`);
  // No topic and nothing uploaded: say so, rather than the upload that isn't
  // there (Sept 24: the tutor's first move was look_at_worksheet on nothing).
  else parts.push(topic ? `I need help with: ${topic}` : fileCount > 0 ? "I need help with the work I just uploaded." : "I'm not sure what to work on yet.");
  if (fileCount > 0) {
    parts.push(fileCount === 1 ? "I uploaded a picture of it." : `I uploaded ${fileCount} pictures of it.`);
  }
  parts.push(`Please teach me in ${languageName(intake.language)}.`);
  return parts.join(" ");
}

/**
 * The block appended to the tutor's instructions for this session: the language
 * it runs in and the context to open on, so the first sentence is already about
 * the student's problem.
 */
export function intakeInstructions(intake: SessionIntake, fileCount: number): string {
  const lines: string[] = ["# This session"];
  const language = languageName(intake.language);
  lines.push(
    `Language: speak and write on the board in ${language}. Everything you say and every label, heading and note you draw is in ${language}, whatever language the student writes in. Keep the student's own notation for numbers and symbols.`,
  );
  const topic = intake.topic.trim();
  const lesson = lessonByKey(intake.lessonKey);
  if (lesson && topic === lessonTopic(lesson)) lines.push(lessonPlan(lesson));
  else if (topic) lines.push(`The student said what they need before starting: "${topic}"`);
  // Mateo, Sept 22 2026: the tutor dived straight into the first problem on
  // the sheet. Aristotle asks what they need and what they already know,
  // every time, and builds the teaching on the answer. Spelled out here, not
  // only in the prompt: on 3.1 the first order it meets wins (Sept 24, a
  // session opened on the show-me problem with no question asked).
  lines.push(
    "Open, don't dive in. Your first reply: acknowledge what they said in a few words, then ask what exactly they want (a problem on a sheet, or the whole idea); a page for the topic on the board, nothing else. Second reply: what they already know about it and where it stops making sense. Only then teach: say the plan in one breath and start with one small show-me problem.",
  );
  // Where to look for the gap (round C): the skill the topic names, what
  // comes before it, and small show-me problems for the probe that follows
  // the opening (lib/skill-map.ts). Words only, never recorded as evidence.
  const brief = topic ? topicBrief(topic) : "";
  if (brief) lines.push(`For after the opening, not your first reply: ${brief} The one you ask goes on the board: start_new_problem, then write it.`);
  if (fileCount > 0) {
    lines.push(
      `They attached ${fileCount === 1 ? "one picture" : `${fileCount} pictures`} of the work. Read ${fileCount === 1 ? "it" : "them"} before your first sentence, and ask which problem first. When they pick one: look_at_worksheet, start_new_problem with the problem exactly as printed (problem=), and before any first move ask what they already know about that kind and where it stops making sense.`,
    );
  }
  // Round C (Sept 24 2026): the plan is sized to the time they said they
  // have, said in one breath, and written as one line on the board.
  const minutes = intake.minutes;
  if (minutes) {
    lines.push(
      `They have ${minutes} minutes today. Size the plan to it: roughly one step per ten minutes, and keep the last few minutes for a quick check and today's rule. [Tutor state] shows the clock; when it says to wrap up, wrap up.`,
    );
  }
  lines.push(
    `The plan comes only once you know where they are: two to four short steps, said in one breath and written with set_plan ("What fractions are | Adding them | Practice"), then the first step; set_plan(step=2) when you move on. Never a plan or a problem in your first reply.`,
  );
  return lines.join("\n");
}
