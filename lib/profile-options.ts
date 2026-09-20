// What the settings page lets a student say about themselves. Values are
// exactly what the profile stores and the prompts read: `registerForGrade` in
// tutor-prompts parses the level text, and learningPrefs are -1 | 0 | 1.
// Onboarding writes the same level strings. Phrases are written to sit inside
// the settings page's sentences ("I'm in high school", "keep it casual").

export const STUDENT_LEVELS = [
  { value: "5th grade", label: "5th grade", detail: "Elementary", phrase: "in 5th grade" },
  { value: "6th grade", label: "6th grade", detail: "Middle school", phrase: "in 6th grade" },
  { value: "7th grade", label: "7th grade", detail: "Middle school", phrase: "in 7th grade" },
  { value: "8th grade", label: "8th grade", detail: "Middle school", phrase: "in 8th grade" },
  { value: "9th grade", label: "9th grade", detail: "High school", phrase: "in 9th grade" },
  { value: "10th grade", label: "10th grade", detail: "High school", phrase: "in 10th grade" },
  { value: "11th grade", label: "11th grade", detail: "High school", phrase: "in 11th grade" },
  { value: "12th grade", label: "12th grade", detail: "High school", phrase: "in 12th grade" },
  { value: "College / University", label: "College", detail: "Or university", phrase: "in college" },
  { value: "Self-learner", label: "Not in school", detail: "Learning on my own", phrase: "learning on my own" },
] as const;

// What onboarding stored before Sept 20 2026: a school band instead of a
// grade. Still matched so those profiles read correctly; not offered again.
const LEGACY_LEVELS = [
  { value: "Middle school (6–8)", label: "Middle school", detail: "Grades 6–8", phrase: "in middle school" },
  { value: "High school (9–12)", label: "High school", detail: "Grades 9–12", phrase: "in high school" },
] as const;

export type LearningPrefKey = "hintVsAnswer" | "pace" | "examplesVsTheory" | "tone";
export type PrefValue = -1 | 0 | 1;
export type PrefOption = { value: PrefValue; phrase: string; detail: string };

// Phrases say what profileLines tells the tutor. hintVsAnswer 1 is "wants
// more direct explanations", never "give me the answer".
export const LEARNING_PREFS: readonly {
  key: LearningPrefKey;
  label: string;
  options: readonly [PrefOption, PrefOption, PrefOption];
}[] = [
  {
    key: "hintVsAnswer",
    label: "When you're stuck",
    options: [
      { value: -1, phrase: "give me a hint first", detail: "A nudge to try before any explaining" },
      { value: 0, phrase: "mix hints and explaining", detail: "A bit of both" },
      { value: 1, phrase: "explain it to me", detail: "More explaining, still no answers handed over" },
    ],
  },
  {
    key: "pace",
    label: "Pace",
    options: [
      { value: -1, phrase: "slow and thorough", detail: "Small steps, with checks along the way" },
      { value: 0, phrase: "at a steady pace", detail: "Somewhere in between" },
      { value: 1, phrase: "briskly", detail: "Moves on once you've got it" },
    ],
  },
  {
    key: "examplesVsTheory",
    label: "Explanations",
    options: [
      { value: -1, phrase: "an example", detail: "Something concrete first, then the idea" },
      { value: 0, phrase: "whatever fits", detail: "A bit of both" },
      { value: 1, phrase: "the big idea", detail: "The rule first, then examples" },
    ],
  },
  {
    key: "tone",
    label: "Tone",
    options: [
      { value: -1, phrase: "formal", detail: "Polite and to the point" },
      { value: 0, phrase: "friendly", detail: "Somewhere in between" },
      { value: 1, phrase: "casual", detail: "Relaxed, like a friend" },
    ],
  },
];

export function normalizePref(value: unknown): PrefValue {
  return value === -1 || value === 1 ? value : 0;
}

const squash = (text: string) => text.replace(/[‐‑‒–—-]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

/** The option a stored level means, tolerating hyphen and case differences. */
export function matchLevel(value: string | null | undefined) {
  if (!value) return null;
  const wanted = squash(value);
  return (
    STUDENT_LEVELS.find((level) => squash(level.value) === wanted) ??
    LEGACY_LEVELS.find((level) => squash(level.value) === wanted) ??
    null
  );
}

/** How a stored level reads in "I'm …": an option's phrase, "in grade 11", or the text as stored. */
export function levelPhrase(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const match = matchLevel(value);
  if (match) return match.phrase;
  if (/^\d{1,2}$/.test(value.trim())) return `in grade ${value.trim()}`;
  return value.trim();
}
