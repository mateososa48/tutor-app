import type { UploadedFile } from "./file-processor";
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

export type SessionIntake = {
  topic: string;
  language: LanguageCode;
  fileNames: string[];
  /** A staged lesson they picked rather than a problem they brought (lib/staged-lessons.ts). */
  lessonKey?: string;
};

export const EMPTY_INTAKE: SessionIntake = {
  topic: "",
  language: DEFAULT_LANGUAGE,
  fileNames: [],
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
  else parts.push(topic ? `I need help with: ${topic}` : "I need help with the work I just uploaded.");
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
  if (fileCount > 0) {
    lines.push(
      `They attached ${fileCount === 1 ? "one picture" : `${fileCount} pictures`} of the work. Read ${fileCount === 1 ? "it" : "them"} before your first sentence.`,
    );
  }
  lines.push(
    "Ask nothing about what they want to work on and do not greet them at length. Your first sentence starts the work on this problem, and one short question about where they are with it is fine once the work is on the board.",
  );
  return lines.join("\n");
}
