// Tutor voices. These are GPT-Live built-in voices that are ALSO available on
// the TTS endpoint, so the settings page can play a cheap preview of each.
// (GPT-Live has more voices — quartz, vesper, willow, … — but they have no TTS
// preview yet; add them here once they do.)

export const TUTOR_VOICE_STORAGE_KEY = "tutor_voice_name";

export const TUTOR_VOICES = [
  {
    name: "marin",
    label: "Marin",
    tone: "Warm, clear",
    color: "#9f462d",
    sampleText: "Let's take this one step at a time.",
  },
  {
    name: "cedar",
    label: "Cedar",
    tone: "Grounded",
    color: "#4d5b66",
    sampleText: "Here's the idea in plain terms.",
  },
  {
    name: "sage",
    label: "Sage",
    tone: "Calm",
    color: "#2f6f61",
    sampleText: "Easy pace, sharp thinking.",
  },
  {
    name: "coral",
    label: "Coral",
    tone: "Bright",
    color: "#c2703a",
    sampleText: "Nice, let's make this click.",
  },
  {
    name: "ballad",
    label: "Ballad",
    tone: "Gentle",
    color: "#7a5b9f",
    sampleText: "You've got this, we'll build it together.",
  },
  {
    name: "ash",
    label: "Ash",
    tone: "Steady",
    color: "#4f6f9f",
    sampleText: "We'll keep it clear and simple.",
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
