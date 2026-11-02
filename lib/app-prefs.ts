// What a student sets once on this device (Settings and Your tutor, Oct 2026):
// how sessions start, how fast the board writes, which microphone to use, and
// the language the tutor speaks. Kept in this browser, because a microphone
// is a device and the rest are habits; a bad or missing value reads as the
// default, so nothing here can break a session.

import { DEFAULT_LANGUAGE, DEFAULT_MINUTES, SESSION_LANGUAGES, isSessionLength, type LanguageCode, type SessionLength } from "./session-intake";

export type WritingPace = "calm" | "normal" | "quick";

export type AppPrefs = {
  /** "How long today?" starts here. */
  sessionMinutes: SessionLength;
  /** The language a new session is set to. */
  language: LanguageCode;
  /** Open the transcript when a session starts. */
  transcriptOpen: boolean;
  /** Start a session with the microphone off. */
  startMuted: boolean;
  /** How fast the tutor writes on the board. */
  writingPace: WritingPace;
  /** The microphone to use; empty is the system's default. */
  micDeviceId: string;
};

export const DEFAULT_PREFS: AppPrefs = {
  sessionMinutes: DEFAULT_MINUTES,
  language: DEFAULT_LANGUAGE,
  transcriptOpen: false,
  startMuted: false,
  writingPace: "normal",
  micDeviceId: "",
};

/** The board's reveal durations are multiplied by this (lib/board-reveal.ts `pace`). */
export const PACE_FACTOR: Record<WritingPace, number> = { calm: 1.3, normal: 1, quick: 0.7 };

export const PREFS_KEY = "chalk.prefs.v1";
const CHANGE = "chalk-prefs-change";

/** A stored blob read field by field: anything unknown or malformed falls back to its default. */
export function parsePrefs(raw: unknown): AppPrefs {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    sessionMinutes: isSessionLength(r.sessionMinutes) ? r.sessionMinutes : DEFAULT_PREFS.sessionMinutes,
    language: SESSION_LANGUAGES.some((l) => l.code === r.language) ? (r.language as LanguageCode) : DEFAULT_PREFS.language,
    transcriptOpen: r.transcriptOpen === true,
    startMuted: r.startMuted === true,
    writingPace: r.writingPace === "calm" || r.writingPace === "quick" ? r.writingPace : "normal",
    micDeviceId: typeof r.micDeviceId === "string" ? r.micDeviceId.slice(0, 200) : "",
  };
}

let cached: { raw: string | null; prefs: AppPrefs } | null = null;

export function readPrefs(): AppPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PREFS_KEY);
  } catch {
    raw = null;
  }
  if (cached && cached.raw === raw) return cached.prefs;
  let prefs = DEFAULT_PREFS;
  try {
    prefs = parsePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    prefs = DEFAULT_PREFS;
  }
  cached = { raw, prefs };
  return prefs;
}

export function writePrefs(patch: Partial<AppPrefs>): AppPrefs {
  const next = parsePrefs({ ...readPrefs(), ...patch });
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // Private windows can refuse storage; the choice still holds for this page.
  }
  cached = null;
  window.dispatchEvent(new Event(CHANGE));
  return next;
}

export function subscribePrefs(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === PREFS_KEY) onChange();
  };
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
