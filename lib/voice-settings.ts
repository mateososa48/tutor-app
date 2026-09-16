// Tutor voices, named after GPT-Live built-in voices. Gemini Live sessions map
// each one to a Gemini prebuilt voice (geminiVoiceFor, below). There is no
// preview: the old one played OpenAI TTS, which is not what Gemini sessions
// sound like, and it failed once the OpenAI account ran out of credits.

export const TUTOR_VOICE_STORAGE_KEY = "tutor_voice_name";

export const TUTOR_VOICES = [
  {
    name: "marin",
    label: "Marin",
    tone: "Warm, clear",
  },
  {
    name: "cedar",
    label: "Cedar",
    tone: "Grounded",
  },
  {
    name: "sage",
    label: "Sage",
    tone: "Calm",
  },
  {
    name: "coral",
    label: "Coral",
    tone: "Bright",
  },
  {
    name: "ballad",
    label: "Ballad",
    tone: "Gentle",
  },
  {
    name: "ash",
    label: "Ash",
    tone: "Steady",
  },
] as const;

export type TutorVoiceName = (typeof TUTOR_VOICES)[number]["name"];

export const DEFAULT_TUTOR_VOICE: TutorVoiceName = "marin";

export function isTutorVoiceName(value: unknown): value is TutorVoiceName {
  return TUTOR_VOICES.some((voice) => voice.name === value);
}

export function getTutorVoiceName(): TutorVoiceName {
  if (typeof window === "undefined") return DEFAULT_TUTOR_VOICE;
  try {
    const stored = window.localStorage.getItem(TUTOR_VOICE_STORAGE_KEY);
    return isTutorVoiceName(stored) ? stored : DEFAULT_TUTOR_VOICE;
  } catch {
    return DEFAULT_TUTOR_VOICE;
  }
}

export function saveTutorVoiceName(voiceName: TutorVoiceName): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TUTOR_VOICE_STORAGE_KEY, voiceName);
  } catch {}
}

export function getTutorVoiceLabel(voiceName: TutorVoiceName): string {
  const voice = TUTOR_VOICES.find((option) => option.name === voiceName);
  return voice ? `${voice.label} · ${voice.tone}` : voiceName;
}

// Gemini Live has its own voice roster. Map each tutor voice to the closest
// Gemini voice so the settings page works for either provider.
const GEMINI_VOICE_BY_TUTOR_VOICE: Record<TutorVoiceName, string> = {
  marin: "Kore",
  cedar: "Charon",
  sage: "Aoede",
  coral: "Leda",
  ballad: "Puck",
  ash: "Orus",
};

export function geminiVoiceFor(voiceName: unknown): string {
  return isTutorVoiceName(voiceName) ? GEMINI_VOICE_BY_TUTOR_VOICE[voiceName] : GEMINI_VOICE_BY_TUTOR_VOICE[DEFAULT_TUTOR_VOICE];
}

// How fast the tutor's voice plays. The client time-stretches Gemini's audio
// with the pitch kept, so each stop is a playback rate, not a prompt. The model
// talks fast on its own, so the default is "Slow", and the slow side has finer
// steps than the fast side because that is where students need them.
export const TUTOR_SPEEDS = [
  { id: "slowest", label: "Slowest", rate: 0.7 },
  { id: "slow", label: "Slow", rate: 0.8 },
  { id: "normal", label: "Normal", rate: 1 },
  { id: "fast", label: "Fast", rate: 1.2 },
  { id: "very-fast", label: "Very fast", rate: 1.4 },
] as const;

export type TutorSpeedId = (typeof TUTOR_SPEEDS)[number]["id"];

export const DEFAULT_TUTOR_SPEED: TutorSpeedId = "slow";
export const TUTOR_SPEED_STORAGE_KEY = "tutor_speech_speed";

// The last choice made in this tab, so the control still works when storage
// is blocked (private windows).
let chosenSpeed: TutorSpeedId | null = null;

export function isTutorSpeedId(value: unknown): value is TutorSpeedId {
  return TUTOR_SPEEDS.some((speed) => speed.id === value);
}

export function normalizeTutorSpeed(value: unknown): TutorSpeedId {
  return isTutorSpeedId(value) ? value : DEFAULT_TUTOR_SPEED;
}

export function tutorSpeedIndex(id: TutorSpeedId): number {
  return Math.max(0, TUTOR_SPEEDS.findIndex((speed) => speed.id === id));
}

/** The stop nearest a slider position (0 = Slowest). */
export function tutorSpeedAt(position: number): TutorSpeedId {
  if (!Number.isFinite(position)) return DEFAULT_TUTOR_SPEED;
  const index = Math.min(TUTOR_SPEEDS.length - 1, Math.max(0, Math.round(position)));
  return TUTOR_SPEEDS[index].id;
}

export function tutorSpeedRate(id: TutorSpeedId): number {
  return TUTOR_SPEEDS[tutorSpeedIndex(id)].rate;
}

export function tutorSpeedLabel(id: TutorSpeedId): string {
  return TUTOR_SPEEDS[tutorSpeedIndex(id)].label;
}

export function getTutorSpeed(): TutorSpeedId {
  if (chosenSpeed !== null) return chosenSpeed;
  if (typeof window === "undefined") return DEFAULT_TUTOR_SPEED;
  try {
    return normalizeTutorSpeed(window.localStorage.getItem(TUTOR_SPEED_STORAGE_KEY));
  } catch {
    return DEFAULT_TUTOR_SPEED;
  }
}

export function saveTutorSpeed(id: TutorSpeedId): TutorSpeedId {
  const speed = normalizeTutorSpeed(id);
  chosenSpeed = speed;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(TUTOR_SPEED_STORAGE_KEY, speed);
    } catch {}
  }
  return speed;
}
