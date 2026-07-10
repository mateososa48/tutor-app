export const TUTOR_VOICE_STORAGE_KEY = "tutor_voice_name";

export const TUTOR_VOICES = [
  {
    name: "Kore",
    tone: "Firm",
    color: "#9f462d",
    sampleText: "Let's take this one step at a time.",
  },
  {
    name: "Puck",
    tone: "Upbeat",
    color: "#2f6f61",
    sampleText: "Nice, let's make this click.",
  },
  {
    name: "Zephyr",
    tone: "Bright",
    color: "#4f6f9f",
    sampleText: "We'll keep it clear and light.",
  },
  {
    name: "Aoede",
    tone: "Breezy",
    color: "#7a5b9f",
    sampleText: "Easy pace, sharp thinking.",
  },
  {
    name: "Charon",
    tone: "Informative",
    color: "#4d5b66",
    sampleText: "Here is the idea in plain terms.",
  },
  {
    name: "Sulafat",
    tone: "Warm",
    color: "#8a5b2f",
    sampleText: "You've got this, we'll build it together.",
  },
] as const;

export type TutorVoiceName = (typeof TUTOR_VOICES)[number]["name"];

export const DEFAULT_TUTOR_VOICE: TutorVoiceName = "Kore";

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
  return voice ? `${voice.name} · ${voice.tone}` : voiceName;
}
