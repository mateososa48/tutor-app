// What onboarding asks, what it stores, and what the tutor is told about it.
//
// Two branches, chosen on the first screen. A student answers a name and a
// grade, then goes straight into a session (the intake dialog asks what they
// are working on). A parent answers the child's name and grade, then what is
// going on, and hands the device over. Nothing here is a preference or an
// ability rating: self-report on those is close to noise for this age group,
// and the tutor reads far more from one problem than from a page of answers.
//
// A parent's answer is a lead, never a fact. It reaches the prompt as
// something to check quietly, and the student never hears it repeated.

export type OnboardedBy = "student" | "parent";

export const CONCERNS = [
  { key: "behind", label: "Falling behind in class", lead: "they've been falling behind in class" },
  { key: "test", label: "A test is coming up", lead: "a test is coming up" },
  { key: "homework", label: "Homework is a struggle", lead: "homework has been a struggle" },
  { key: "challenge", label: "Ready for more of a challenge", lead: "they're ready for more of a challenge" },
  { key: "unsure", label: "Not sure yet", lead: null },
] as const;

export type ConcernKey = (typeof CONCERNS)[number]["key"];

export type OnboardingRecord = {
  by: OnboardedBy;
  /** Only when a parent set the account up. */
  concern?: ConcernKey;
  /** The parent's own words, if they added any. */
  note?: string;
};

export const NOTE_MAX = 300;

// Stored values are what `registerForGrade` in tutor-prompts parses: "7th
// grade" reads as middle school, "5th grade" as elementary, "11th grade" as
// high school. College and "not in school" keep the values older profiles
// already hold, so nothing downstream changes for them.
export const GRADE_OPTIONS: readonly { value: string; label: string; band: string }[] = [
  { value: "5th grade", label: "5th", band: "Elementary" },
  { value: "6th grade", label: "6th", band: "Middle school" },
  { value: "7th grade", label: "7th", band: "Middle school" },
  { value: "8th grade", label: "8th", band: "Middle school" },
  { value: "9th grade", label: "9th", band: "High school" },
  { value: "10th grade", label: "10th", band: "High school" },
  { value: "11th grade", label: "11th", band: "High school" },
  { value: "12th grade", label: "12th", band: "High school" },
  { value: "College / University", label: "College", band: "Or university" },
  { value: "Self-learner", label: "Not in school", band: "Learning on my own" },
];

export function gradeLabel(value: string | null | undefined): string {
  const found = GRADE_OPTIONS.find((g) => g.value === value);
  return found ? found.label : (value ?? "").trim();
}

const BY = new Set<OnboardedBy>(["student", "parent"]);
const CONCERN_KEYS = new Set<string>(CONCERNS.map((c) => c.key));

/** The stored record, or null when the input is not one (an empty jsonb is the usual case). */
export function sanitizeOnboarding(input: unknown): OnboardingRecord | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.by !== "string" || !BY.has(raw.by as OnboardedBy)) return null;
  const record: OnboardingRecord = { by: raw.by as OnboardedBy };
  if (record.by === "parent") {
    if (typeof raw.concern === "string" && CONCERN_KEYS.has(raw.concern)) record.concern = raw.concern as ConcernKey;
    if (typeof raw.note === "string") {
      const note = raw.note.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
      if (note) record.note = note;
    }
  }
  return record;
}

/** The line the prompt gets. Nothing for a student's own signup. */
export function onboardingProfileLine(input: unknown): string | null {
  const record = sanitizeOnboarding(input);
  if (!record || record.by !== "parent") return null;
  const lead = CONCERNS.find((c) => c.key === record.concern)?.lead ?? null;
  const rule = "Treat it as a lead to check for yourself, not a fact, and never repeat it to the student.";
  if (lead && record.note) return `A parent set this up and said ${lead} ("${record.note}"). ${rule}`;
  if (lead) return `A parent set this up and said ${lead}. ${rule}`;
  if (record.note) return `A parent set this up and wrote: "${record.note}". ${rule}`;
  return "A parent set this up for them.";
}

// ── The tutor's notepad ──────────────────────────────────────────────────────
// The onboarding screen shows the tutor taking notes as the answers come in,
// in the same handwriting the settings page uses for "what your tutor reads".
// These are those notes: short, honest, and for a parent's answer, the rule
// the tutor will follow made visible.

export type BoardNote = { label: string; text: string };

export type OnboardingDraft = {
  by: OnboardedBy | null;
  name: string;
  grade: string;
  concern: ConcernKey | null;
  note: string;
};

export function onboardingNotes(draft: OnboardingDraft): BoardNote[] {
  if (!draft.by) return [];
  const notes: BoardNote[] = [];
  const name = draft.name.trim();
  if (name) notes.push({ label: "Name", text: name });
  if (draft.grade) notes.push({ label: "Grade", text: gradeLabel(draft.grade) });
  if (draft.by === "parent") {
    const concern = CONCERNS.find((c) => c.key === draft.concern);
    if (concern) {
      notes.push({ label: "Parent says", text: concern.label });
      const note = draft.note.trim();
      if (note) notes.push({ label: "Parent's note", text: note });
      notes.push({ label: "Note to self", text: concern.lead ? "Check this for myself" : "Find out what's going on" });
    }
  } else if (draft.grade) {
    notes.push({ label: "Next", text: "Ask what they're working on" });
  }
  return notes;
}
