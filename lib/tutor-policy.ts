// Session-level tutor policy, shared by both voice stacks (Gemini Live and
// GPT-Live). It keeps the facts a model loses track of over a long voice
// session: every attempt check_answer records, what the student just said
// (frustrated, confused, "I don't know", bored, unsure, leaving), and durable
// notes. From those it builds one [Tutor state] line that rides on tool
// results: how this skill is going, misses in a row, a suggested help level
// (H0 wait … H5 worked example), and cues to go down or up. Code supplies the
// facts; the prompt ("How much help", "Adapting up and down") supplies the
// judgment. Pure and unit-tested; each live client owns one instance.
//
// Nudges (Sept 16 2026). Recorded sessions judged 20+ answers without
// check_answer, did arithmetic out loud that never reached the board, saved
// no memory, and forgot an uploaded worksheet. Each of those now leaves a
// one-line note that the next board result carries once (boardResultExtras).

import { isNonAnswer } from "./board-content-rules";

// "incorrect": wrong, kind not given. "unchecked": the checker could not
// judge it, so it counts neither way.
export type AttemptResult = "correct" | "slip" | "misconception" | "partial" | "guess" | "stuck" | "incorrect" | "unchecked";
export const ATTEMPT_RESULTS: AttemptResult[] = ["correct", "slip", "misconception", "partial", "guess", "stuck", "incorrect", "unchecked"];

/** `callId`: the tool call that recorded it, so a cancelled call can take it back. `auto`: recorded by the app ("I don't know"). */
export type Attempt = { skill: string; result: AttemptResult; help: number; at: number; note?: string; callId?: string; auto?: boolean };
export type StudentSignal = "frustrated" | "confused" | "idk" | "bored" | "unsure" | "closing";

export type SessionFile = { label: string; name: string; pages: number };

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
  /** A student line that looks like an answer and has not been checked yet. */
  pendingAnswer: string | null;
  answerNudged: boolean;
  /** Arithmetic the tutor said aloud in a turn that wrote nothing. */
  unwrittenMath: string | null;
  /** Why remembering something is due now, or null. */
  memoryDue: string | null;
  memoryNudges: number;
  notesSaved: number;
  files: SessionFile[];
  filesRemindedAt: number;
  resultsSinceFilesReminder: number;
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
    pendingAnswer: null,
    answerNudged: false,
    unwrittenMath: null,
    memoryDue: null,
    memoryNudges: 0,
    notesSaved: 0,
    files: [],
    filesRemindedAt: now,
    resultsSinceFilesReminder: 0,
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
  closing: [/\b(bye|goodbye|see you|gotta go|got to go|have to go|i'?m done for today|that'?s all for today|that'?s it for today|let'?s stop here)\b/i],
};

export function detectSignals(text: string): StudentSignal[] {
  const t = text.trim();
  if (!t) return [];
  const found = (Object.keys(SIGNAL_PATTERNS) as StudentSignal[]).filter((s) => SIGNAL_PATTERNS[s].some((re) => re.test(t)));
  // "not easy" / "isn't easy" is not boredom.
  if (found.includes("bored") && /\b(not|isn'?t|wasn'?t|never) (that |so |very )?easy\b/i.test(t)) return found.filter((s) => s !== "bored");
  return found;
}

// ── Answers and spoken arithmetic ─────────────────────────────────────────
// Two heuristics the recorded sessions asked for: the tutor judged 20+ answers
// by eye without check_answer, and did arithmetic out loud that it never wrote
// ("six squared is thirty six…") until the student said "put it on the board".

const NUMBER_WORD =
  "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|half|halves|thirds?|quarters?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?|negative";
const HAS_NUMBER = new RegExp(`\\d|[½⅓⅔¼¾²³]|\\b(${NUMBER_WORD})\\b`, "i");
const FILLER = /^(?:(?:um+|uh+|er+|hmm+|oh|so|wait|ok(?:ay)?|well|like|maybe|i think|i guess|is it|it'?s|that'?s|thats|then)\b[\s,.:!-]*)+/i;
// Asking the tutor something, or stating a new problem: not an answer to check.
const ASKS_OR_STATES =
  /^(can|could|would|how|why|what(?:'s|s| is| are| does| do| about| if| even)?\b|when|where|which|who|help|i need|i have|we have|we're|we are|explain|show me|tell me|let'?s|do i|does|did|is there|are there|wie|warum|was ist|kannst|cómo|por qué|qué es|puedes|comment|pourquoi|peux)\b/i;
// A proposed move ("subtract 3?", "divide by 2") is not a value to check.
const STEP_VERB = /^(add|subtract|take away|multiply|divide|distribute|move|plug|put|cross|flip|combine|square|isolate|simplify|factor|expand)\b/i;
const HAS_VALUE_EQUATION = /\b[a-z]\s*=\s*-?\s*[\d(½⅓¼¾]/i;
// A problem being posed, anywhere in the line: "…legs 6 and 8, find the hypotenuse".
const POSES_PROBLEM = /\b(find|solve|calculate|work out|how (?:do|many|much|far|long|high|can)|what(?:'s|s| is| are| would| does)|is there|are there|can you|help me)\b/i;

/** True when the student's words look like an answer worth checking: a short line with a value in it. */
export function looksLikeAnswer(text: string): boolean {
  const t = text.trim().replace(FILLER, "").trim();
  if (!t) return false;
  if (t.split(/\s+/).length > 14) return false;
  if (HAS_VALUE_EQUATION.test(t)) return true;
  if (ASKS_OR_STATES.test(t) || POSES_PROBLEM.test(t)) return false;
  if (STEP_VERB.test(t) && !t.includes("=")) return false;
  return HAS_NUMBER.test(t);
}

const NUMBER_TOKEN = new RegExp(`^(-?\\d[\\d.,/]*|${NUMBER_WORD})$`, "i");
// "one" is also a pronoun and "is" joins any two words, so a pair of numbers
// counts only with a real operation between them, or a lone "is"/"equals".
const STRONG_OPERATION = /^(plus|minus|times|divided|over|squared|cubed|multiplied|add|subtract|×|÷|\+|−)$/i;
const WEAK_OPERATION = /^(is|equals?|gives|makes|=)$/i;

/** The first stretch of spoken arithmetic ("three times six is eighteen"), or null. */
export function spokenMath(text: string): string | null {
  const words = text.replace(/[.,;:!?()"“”]/g, " ").split(/\s+/).filter(Boolean);
  const isNumber = words.map((w) => NUMBER_TOKEN.test(w));
  for (let i = 0; i < words.length; i++) {
    if (!isNumber[i]) continue;
    // Pair each number with the next one only, at most 5 words later.
    const j = isNumber.indexOf(true, i + 1);
    if (j < 0 || j - i > 6) continue;
    const between = words.slice(i + 1, j);
    const strong = between.some((w) => STRONG_OPERATION.test(w));
    const weak = between.length === 1 && WEAK_OPERATION.test(between[0]);
    if (!strong && !weak) continue;
    let start = i;
    while (start > 0 && isNumber[start - 1]) start--; // "negative three", "thirty six"
    let end = j;
    while (end + 1 < words.length && end - start < 14 && (isNumber[end + 1] || STRONG_OPERATION.test(words[end + 1]) || WEAK_OPERATION.test(words[end + 1]))) end++;
    while (end > j && !isNumber[end]) end--;
    return words.slice(start, end + 1).join(" ");
  }
  return null;
}

export function noteStudentUtterance(p: TutorPolicy, text: string, now = Date.now()): void {
  const t = text.trim();
  if (!t) return;
  p.studentTurns += 1;
  const signals = detectSignals(t);
  for (const s of signals) {
    p.signalTurn[s] = p.studentTurns;
    p.signalQuote[s] = t.length > 48 ? `${t.slice(0, 45)}…` : t;
  }
  if (looksLikeAnswer(t)) {
    p.pendingAnswer = t.length > 80 ? `${t.slice(0, 77)}…` : t;
    p.answerNudged = false;
  }
  // "I don't know" while working a skill is a stuck attempt, whether or not
  // the tutor records it (recorded sessions never did).
  if (p.currentSkill && signals.includes("idk") && isNonAnswer(t)) {
    const last = p.attempts.at(-1);
    recordAttempt(p, { skill: p.currentSkill, result: "stuck", help: last?.help ?? 1, auto: true }, now);
  }
  if (signals.includes("closing") && p.notesSaved === 0) p.memoryDue = "they are leaving and nothing was saved this session";
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
  input: { skill: string; result: AttemptResult; help: number; note?: string; callId?: string; auto?: boolean },
  now: number,
): void {
  const skill = normalizeSkill(input.skill) || p.currentSkill || "unnamed skill";
  p.attempts.push({
    skill,
    result: input.result,
    help: input.help,
    at: now,
    note: input.note?.trim() || undefined,
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.auto ? { auto: true } : {}),
  });
  if (p.attempts.length > MAX_ATTEMPTS) p.attempts.shift();
  applyAttempt(p, p.attempts[p.attempts.length - 1]);
  if (input.result === "misconception" && !p.attempts.slice(0, -1).some((a) => a.skill === skill && a.result === "misconception")) {
    p.memoryDue = `a wrong idea came up${input.note ? ` (${input.note.trim()})` : ` in ${skill}`}`;
  }
}

function applyAttempt(p: TutorPolicy, a: Attempt): void {
  if (p.currentSkill !== null && a.skill !== p.currentSkill) {
    p.missesInRow = 0;
    p.solvedSinceSwitch = 0;
  }
  p.currentSkill = a.skill;
  if (a.result === "unchecked") return;
  if (a.result === "correct") {
    p.missesInRow = 0;
    p.quickCorrect = a.help <= 1 ? p.quickCorrect + 1 : 0;
    p.solvedSinceSwitch += 1;
  } else {
    p.missesInRow += 1;
    p.quickCorrect = 0;
  }
}

/** Take back what a cancelled tool call recorded. True when something was removed. */
export function cancelAttempt(p: TutorPolicy, callId: string): boolean {
  const kept = p.attempts.filter((a) => a.callId !== callId);
  if (kept.length === p.attempts.length) return false;
  p.attempts = [];
  p.currentSkill = null;
  p.missesInRow = 0;
  p.quickCorrect = 0;
  p.solvedSinceSwitch = 0;
  for (const a of kept) {
    p.attempts.push(a);
    applyAttempt(p, a);
  }
  return true;
}

export function suggestHelp(p: TutorPolicy): { level: number; why: string } | null {
  const last = [...p.attempts].reverse().find((a) => a.result !== "unchecked");
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

// The state line regardless, marked as seen (for check_answer results).
export function currentState(p: TutorPolicy, now: number): string {
  const line = formatTutorState(p, now);
  p.lastLineKey = line.replace(/ · \d+ min in\..*$/, "");
  return line;
}

// ── Durable notes (remember_about_student) ────────────────────────────────

export function rememberNote(p: TutorPolicy, note: string): void {
  const trimmed = note.trim();
  if (!trimmed) return;
  p.notesSaved += 1;
  p.memoryDue = null;
  if (p.notes.includes(trimmed)) return;
  p.notes.push(trimmed);
  if (p.notes.length > MAX_NOTES) p.notes.shift();
}

// Compact memory line appended to tool responses so it survives context compression.
export function formatMemory(p: TutorPolicy): string {
  return p.notes.length === 0 ? "" : `[Memory: ${p.notes.join("; ")}]`;
}

// ── Nudges (Sept 16 2026) ─────────────────────────────────────────────────

/** check_answer ran: the pending answer is dealt with. */
export function noteAnswerChecked(p: TutorPolicy): void {
  p.pendingAnswer = null;
  p.answerNudged = false;
}

/** A tutor turn ended. Arithmetic said aloud in a turn that drew nothing is due on the board. */
export function noteTutorTurn(p: TutorPolicy, text: string, drew: boolean): void {
  if (drew) {
    p.unwrittenMath = null;
    return;
  }
  const said = spokenMath(text);
  if (said) p.unwrittenMath = said;
}

/** Something was written on the board: an earlier reminder is answered. */
export function noteBoardWrite(p: TutorPolicy): void {
  p.unwrittenMath = null;
}

export function setSessionFiles(p: TutorPolicy, files: SessionFile[], now: number): void {
  p.files = files;
  p.filesRemindedAt = now;
  p.resultsSinceFilesReminder = 0;
}

const FILES_EVERY_RESULTS = 6;
const FILES_EVERY_MS = 3 * 60_000;

function describeFiles(files: SessionFile[]): string {
  return files.map((f) => `${f.label} "${f.name}"${f.pages > 1 ? ` (${f.pages} pages)` : ""}`).join(", ");
}

/**
 * The notes due on this board result, each once: a changed [Tutor state], the
 * memory, an unchecked answer, arithmetic said but not written, a memory
 * reminder, and (every few results) the uploaded files.
 */
export function boardResultExtras(p: TutorPolicy, now: number): string {
  const out: string[] = [];
  const memory = formatMemory(p);
  if (memory) out.push(memory);
  const state = takeStateUpdate(p, now);
  if (state) out.push(state);
  if (p.pendingAnswer && !p.answerNudged) {
    p.answerNudged = true;
    out.push(`[Unchecked answer: the student said "${p.pendingAnswer}". Call check_answer before you say whether it is right.]`);
  }
  if (p.unwrittenMath) {
    out.push(`[Said, not written: you said "${p.unwrittenMath}" out loud. Put it on the board so the student can follow it.]`);
    p.unwrittenMath = null;
  }
  if (p.memoryDue && p.memoryNudges < 3) {
    p.memoryNudges += 1;
    out.push(`[Memory: ${p.memoryDue}. If it will matter next session, call remember_about_student.]`);
    p.memoryDue = null;
  }
  p.resultsSinceFilesReminder += 1;
  if (p.files.length > 0 && (p.resultsSinceFilesReminder >= FILES_EVERY_RESULTS || now - p.filesRemindedAt >= FILES_EVERY_MS)) {
    p.resultsSinceFilesReminder = 0;
    p.filesRemindedAt = now;
    out.push(`[Files: ${describeFiles(p.files)}. When the student names a problem or a part, call look_at_worksheet first and copy it exactly.]`);
  }
  return out.join(" ");
}
