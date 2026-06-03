export type LearningPrefs = {
  hintVsAnswer?: number;    // -1 hints, 0 balanced, 1 direct answers
  pace?: number;             // -1 slow, 0 medium, 1 fast
  examplesVsTheory?: number; // -1 examples, 0 balanced, 1 theory
  tone?: number;             // -1 formal, 0 balanced, 1 casual
};

export type StudentProfile = {
  displayName?: string | null;
  gradeLevel?: string | null;
  learningPrefs?: LearningPrefs | null;
  extraContext?: string | null;
  voiceName?: string | null;
};

function describeSlider(
  value: number | undefined,
  negative: string,
  zero: string,
  positive: string,
): string {
  if (value === -1) return negative;
  if (value === 1) return positive;
  return zero;
}

// Turn a free-form grade level into explicit register guidance so the tutor
// auto-scales vocabulary, abstraction, and step size to the student's age.
function registerForGrade(grade: string | null | undefined): string {
  const g = (grade ?? "").toLowerCase();
  if (/(element|grade\s*[1-5]\b|\b[1-5](st|nd|rd|th)\b)/.test(g))
    return "Use very short sentences, concrete everyday examples, and lots of warmth. Tiny steps. Avoid jargon entirely.";
  if (/(middle|grade\s*[6-8]\b|\b[6-8]th\b)/.test(g))
    return "Use short, plain sentences and concrete examples before any abstraction. Encourage often. Small steps.";
  if (/(high|grade\s*(9|10|11|12)\b|\b9th\b|\b1[0-2]th\b|freshman|sophomore|junior|senior)/.test(g))
    return "Plain language is still best, but some abstraction and a brisker pace are fine once they are engaged.";
  return "Keep language plain and concrete; let the student's answers set the pace.";
}

export function buildStudentContext(profile: StudentProfile | null): string {
  if (!profile) return "";

  const lines: string[] = ["<student_profile>"];

  if (profile.displayName) {
    lines.push(`  name: ${profile.displayName}`);
  }
  if (profile.gradeLevel) {
    lines.push(`  level: ${profile.gradeLevel}`);
  }

  const p = profile.learningPrefs ?? {};

  const hints = describeSlider(p.hintVsAnswer, "prefer hints over direct answers", "balanced on hints vs answers", "prefer direct answers");
  const pace = describeSlider(p.pace, "slow and thorough pace", "medium pace", "fast and concise pace");
  const style = describeSlider(p.examplesVsTheory, "lots of examples", "balanced examples and theory", "theory-first");
  const tone = describeSlider(p.tone, "formal and rigorous tone", "balanced tone", "casual and friendly tone");

  lines.push(`  teaching_style: ${hints}, ${pace}, ${style}, ${tone}`);
  lines.push(`  register: ${registerForGrade(profile.gradeLevel)}`);

  if (profile.extraContext?.trim()) {
    lines.push(`  context: ${profile.extraContext.trim()}`);
  }

  lines.push("</student_profile>");

  return lines.join("\n");
}
