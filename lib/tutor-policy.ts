// Session-level tutor policy, shared by both voice stacks (Gemini Live and
// GPT-Live). It keeps the facts a model loses track of over a long voice
// session: every attempt the tutor records with record_attempt, what the
// student just said (frustrated, confused, "I don't know", bored, unsure), and
// durable notes. From those it builds one [Tutor state] line that rides on tool
// results: how this skill is going, misses in a row, a suggested help level
// (H0 wait … H5 worked example), and cues to go down or up. Code supplies the
// facts; the prompt ("How much help", "Adapting up and down") supplies the
// judgment. Pure and unit-tested; each live client owns one instance.
// Replaces lib/tutor-state.ts (a confusion regex and a downshift injection).

export type AttemptResult = "correct" | "slip" | "misconception" | "partial" | "guess" | "stuck";
export const ATTEMPT_RESULTS: AttemptResult[] = ["correct", "slip", "misconception", "partial", "guess", "stuck"];

export type Attempt = { skill: string; result: AttemptResult; help: number; at: number; note?: string };
export type StudentSignal = "frustrated" | "confused" | "idk" | "bored" | "unsure";

export type TutorPolicy = {
  startedAt: number;
  attempts: Attempt[];
  currentSkill: string | null;
  missesInRow: number;
  quickCorrect: number;
  solvedSinceSwitch: number;
  studentTurns: number;
  signalTurn: Partial<Record<StudentSignal, number>>;
  signalQuote: Partial<Record<StudentSignal, string>>;
  notes: string[];
  lastLineKey: string;
};

const MAX_ATTEMPTS = 80;
const MAX_NOTES = 12;
const REVIEW_AFTER = 4;

export function createPolicy(now: number): TutorPolicy {
  return {
    startedAt: now,
    attempts: [],
    currentSkill: null,
    missesInRow: 0,
    quickCorrect: 0,
    solvedSinceSwitch: 0,
    studentTurns: 0,
    signalTurn: {},
    signalQuote: {},
    notes: [],
    lastLineKey: "",
  };
}

// ── What the student says ─────────────────────────────────────────────────

const SIGNAL_PATTERNS: Record<StudentSignal, RegExp[]> = {
  frustrated: [
    /\bi'?m (so |really |just |such )?(bad|terrible|stupid|dumb|hopeless|awful) at\b/i,
    /\bi'?m (so |really )?(stupid|dumb)\b/i,
    /\bi (hate|can'?t stand) (math|this|these|fractions|algebra|equations)\b/i,
    /\bi give up\b/i,
    /\bi (can'?t|cannot) do (this|it|math|these)\b/i,
    /\bi'?ll never (get|understand)\b/i,
    /\b(this|it) is (so |too |really )?(impossible|pointless)\b/i,
    /^\s*ugh+\b/i,
  ],
  confused: [
    /\bi (do ?n'?t|don'?t|do not) (get|understand|follow)\b/i,
    /\bi'?m (so |really |totally )?(lost|confused)\b/i,
    /\bmakes no sense\b/i,
    /\b(that|this) (doesn'?t|does not) make sense\b/i,
    /\bthis is (so |really )?(hard|confusing)\b/i,
    /\bcan you (repeat|say that again|explain that again|go over)\b/i,
    /\bwhat do you mean\b/i,
    /^(huh|what)\??$/i,
    /^wait,? what\b/i,
  ],
  idk: [/\bi (don'?t|do not|dunno) know\b/i, /\bidk\b/i, /\bno idea\b/i, /\bdunno\b/i],
  bored: [/(^|[^t] )(too |so |super )?easy\b/i, /\bboring\b/i, /\bcan we (be done|stop|finish)\b/i, /\bi already (know|did) (this|these|that)\b/i, /^\s*whatever\b/i],
  unsure: [/\bi think\b\W*$/i, /\bmaybe\b/i, /\bnot sure\b/i, /\bprobably (wrong|not)\b/i, /\bis (it|that) right\b/i, /^[^?]{0,24}\d[^?]{0,12}\?\s*$/],
};

export function detectSignals(text: string): StudentSignal[] {
  const t = text.trim();
  if (!t) return [];
  const found = (Object.keys(SIGNAL_PATTERNS) as StudentSignal[]).filter((s) => SIGNAL_PATTERNS[s].some((re) => re.test(t)));
  // "not easy" / "isn't easy" is not boredom.
  if (found.includes("bored") && /\b(not|isn'?t|wasn'?t|never) (that |so |very )?easy\b/i.test(t)) return found.filter((s) => s !== "bored");
  return found;
}

export function noteStudentUtterance(p: TutorPolicy, text: string): void {
  const t = text.trim();
  if (!t) return;
  p.studentTurns += 1;
  for (const s of detectSignals(t)) {
    p.signalTurn[s] = p.studentTurns;
    p.signalQuote[s] = t.length > 48 ? `${t.slice(0, 45)}…` : t;
  }
}

// A signal counts for the utterance it came from and the one after it.
function active(p: TutorPolicy, s: StudentSignal): boolean {
  const turn = p.signalTurn[s];
  return turn !== undefined && p.studentTurns - turn < 2;
}

// ── Attempts ──────────────────────────────────────────────────────────────

export function normalizeSkill(skill: string): string {
  return skill.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
}

export function parseHelpLevel(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5) return value;
  if (typeof value === "string") {
    const m = /^\s*h?([0-5])\s*$/i.exec(value);
    if (m) return Number(m[1]);
  }
  return null;
}

export function recordAttempt(
  p: TutorPolicy,
  input: { skill: string; result: AttemptResult; help: number; note?: string },
  now: number,
): void {
  const skill = normalizeSkill(input.skill) || p.currentSkill || "unnamed skill";
  if (p.currentSkill !== null && skill !== p.currentSkill) {
    p.missesInRow = 0;
    p.solvedSinceSwitch = 0;
  }
  p.currentSkill = skill;
  p.attempts.push({ skill, result: input.result, help: input.help, at: now, note: input.note?.trim() || undefined });
  if (p.attempts.length > MAX_ATTEMPTS) p.attempts.shift();
  if (input.result === "correct") {
    p.missesInRow = 0;
    p.quickCorrect = input.help <= 1 ? p.quickCorrect + 1 : 0;
    p.solvedSinceSwitch += 1;
  } else {
    p.missesInRow += 1;
    p.quickCorrect = 0;
  }
}

export function suggestHelp(p: TutorPolicy): { level: number; why: string } | null {
  const last = p.attempts.at(-1);
  if (!last || last.skill !== p.currentSkill) return null;
  if (p.missesInRow >= 3) return { level: Math.min(5, Math.max(4, last.help + 1)), why: `${p.missesInRow} misses in a row` };
  if (p.missesInRow === 2) return { level: Math.min(5, last.help + 1), why: "2 misses in a row" };
  if (last.result === "misconception") return { level: Math.max(2, last.help), why: "a wrong idea: set up a case where it breaks" };
  if (p.quickCorrect >= 2) return { level: Math.max(0, last.help - 1), why: `${p.quickCorrect} quick right answers` };
  // Worked-example fading: each success earns one level less support.
  if (last.result === "correct") return { level: Math.max(0, last.help - 1), why: "last answer right: fade one level" };
  return { level: last.help, why: `last answer: ${last.result}` };
}

export function cues(p: TutorPolicy): string[] {
  const out: string[] = [];
  const last = p.attempts.at(-1);
  const frustrated = active(p, "frustrated");
  if (frustrated) out.push(`down: sounds frustrated ("${p.signalQuote.frustrated}"), make the next step small enough to win`);
  else if (p.missesInRow >= 3) out.push("down: shrink the step or show a worked example");
  if (active(p, "idk") && !frustrated) out.push("said they don't know: make it smaller or offer two choices");
  if (active(p, "confused") && !frustrated && p.missesInRow < 2) out.push("confused but still trying: give it a moment before stepping in");
  if (!frustrated && p.missesInRow === 0 && (active(p, "bored") || p.quickCorrect >= 2)) out.push("up: give a harder problem");
  if (active(p, "unsure") && last?.result === "correct") out.push("unsure but right: have them check it themselves");
  if (p.solvedSinceSwitch >= REVIEW_AFTER) out.push("mixed review due: one quick problem from an earlier skill");
  return out;
}

export function formatTutorState(p: TutorPolicy, now: number): string {
  const parts: string[] = [];
  if (p.currentSkill) {
    const onSkill = p.attempts.filter((a) => a.skill === p.currentSkill);
    const right = onSkill.filter((a) => a.result === "correct").length;
    parts.push(`skill "${p.currentSkill}": ${right} of ${onSkill.length} right`);
    const last = p.attempts.at(-1);
    if (p.missesInRow > 0 && last) parts.push(`${p.missesInRow} ${p.missesInRow === 1 ? "miss" : "misses"} in a row (last: ${last.result})`);
    const help = suggestHelp(p);
    if (help) parts.push(`suggested help H${help.level} (${help.why})`);
  }
  parts.push(...cues(p));
  if (parts.length === 0) return "";
  const minutes = Math.max(0, Math.round((now - p.startedAt) / 60_000));
  return `[Tutor state: ${parts.join(" · ")} · ${minutes} min in. Not from the student; never read it aloud.]`;
}

// The state line when it changed since the model last saw one, else "".
// Board tool results carry it so the model sees fresh facts without extra turns.
export function takeStateUpdate(p: TutorPolicy, now: number): string {
  const line = formatTutorState(p, now);
  if (!line) return "";
  const key = line.replace(/ · \d+ min in\..*$/, "");
  if (key === p.lastLineKey) return "";
  p.lastLineKey = key;
  return line;
}

// The state line regardless, marked as seen (for check_answer / record_attempt results).
export function currentState(p: TutorPolicy, now: number): string {
  const line = formatTutorState(p, now);
  p.lastLineKey = line.replace(/ · \d+ min in\..*$/, "");
  return line;
}

// ── Durable notes (remember_about_student) ────────────────────────────────

export function rememberNote(p: TutorPolicy, note: string): void {
  const trimmed = note.trim();
  if (!trimmed || p.notes.includes(trimmed)) return;
  p.notes.push(trimmed);
  if (p.notes.length > MAX_NOTES) p.notes.shift();
}

// Compact memory line appended to tool responses so it survives context compression.
export function formatMemory(p: TutorPolicy): string {
  return p.notes.length === 0 ? "" : `[Memory: ${p.notes.join("; ")}]`;
}
