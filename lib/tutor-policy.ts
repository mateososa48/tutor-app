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

import { clockCue, clockLabel } from "./session-clock";
import { isNonAnswer } from "./board-content-rules";

// "incorrect": wrong, kind not given. "unchecked": the checker could not
// judge it, so it counts neither way.
export type AttemptResult = "correct" | "slip" | "misconception" | "partial" | "guess" | "stuck" | "incorrect" | "unchecked";
export const ATTEMPT_RESULTS: AttemptResult[] = ["correct", "slip", "misconception", "partial", "guess", "stuck", "incorrect", "unchecked"];

/** `callId`: the tool call that recorded it, so a cancelled call can take it back. `auto`: recorded by the app ("I don't know"). */
/** `problem`: the problem as checked, so "right on different problems" can be told from the same one twice. */
/** `step`: a step inside the problem on the board ("25 - 7" while solving 3x + 7 = 25), not the problem itself. */
export type Attempt = { skill: string; result: AttemptResult; help: number; at: number; note?: string; callId?: string; auto?: boolean; problem?: string; step?: boolean };
export type StudentSignal = "frustrated" | "confused" | "idk" | "bored" | "unsure" | "closing";

export type SessionFile = { label: string; name: string; pages: number };

export type TutorPolicy = {
  startedAt: number;
  /** Minutes they said they have today (the intake), or null. */
  plannedMinutes: number | null;
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
  /** A permission or check-in question the tutor just asked ("does that make sense?"). */
  askedPermission: string | null;
  /** The student just claimed to understand ("yeah I get it"): not proof. */
  claimedGetIt: string | null;
  /** The skill the student last gave a reason for, in their own words ("because…"). */
  reasonSkill: string | null;
  /** A stock praise opener the tutor just used ("Exactly!"). */
  praiseOpener: string | null;
  /** The tutor talked about something on the board ("look at the bars") and marked nothing. */
  unmarkedReference: string | null;
  /** Why remembering something is due now, or null. */
  memoryDue: string | null;
  memoryNudges: number;
  notesSaved: number;
  files: SessionFile[];
  filesRemindedAt: number;
  resultsSinceFilesReminder: number;
  /** The problem on the board now (start_problem), so a checked step inside it is not taken for a finished problem. */
  pageProblem: string | null;
  /** The skill of the first answer checked on this page: later ones are filed under it (labels drift). */
  pageSkill: string | null;
  /** The memory line as last sent (it rides on a result only when it changes). */
  memorySent: string;
  /**
   * The help the board itself gave since the last answer (Sept 23 2026): a
   * picture is a strategy hint (H3), a picture that does the key step (a
   * fraction recut to a common denominator) a shown step (H4), a worked
   * example H5, a highlight or a ring H2. The tutor called an answer found
   * by counting slices it had just drawn "H1", and the flow jumped to "no hints".
   */
  boardHelp: number;
  /** The student's last whole utterance, for their spoken working. */
  lastUtterance: string;
  /** The student asked to see it on the board ("show it on the board"). */
  boardAsk: string | null;
  /** Drawing calls so far this session: zero means the board is still empty. */
  drawCount: number;
};

const MAX_ATTEMPTS = 80;
const MAX_NOTES = 12;
const REVIEW_AFTER = 4;

export function createPolicy(now: number): TutorPolicy {
  return {
    startedAt: now,
    plannedMinutes: null,
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
    askedPermission: null,
    claimedGetIt: null,
    reasonSkill: null,
    praiseOpener: null,
    unmarkedReference: null,
    memoryDue: null,
    memoryNudges: 0,
    notesSaved: 0,
    files: [],
    filesRemindedAt: now,
    resultsSinceFilesReminder: 0,
    pageProblem: null,
    pageSkill: null,
    memorySent: "",
    boardHelp: 0,
    lastUtterance: "",
    boardAsk: null,
    drawCount: 0,
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
  p.lastUtterance = t;
  if (asksForBoard(t)) p.boardAsk = t.length > 48 ? `${t.slice(0, 45)}…` : t;
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
  if (claimsUnderstanding(t)) p.claimedGetIt = t.length > 48 ? `${t.slice(0, 45)}…` : t;
  if (p.currentSkill && givesReason(t)) p.reasonSkill = p.currentSkill;
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
  input: { skill: string; result: AttemptResult; help: number; note?: string; callId?: string; auto?: boolean; problem?: string; step?: boolean },
  now: number,
): void {
  // One page, one skill (Sept 24 2026): the tutor renamed the skill five
  // times in one session ("comparing…", "equivalent…", "like…"), which reset
  // every count. The page's first checked answer names it for the page.
  let skill = normalizeSkill(input.skill) || p.currentSkill || "unnamed skill";
  if (p.pageProblem) {
    if (p.pageSkill) skill = p.pageSkill;
    else if (!input.step) p.pageSkill = skill;
  }
  p.attempts.push({
    skill,
    result: input.result,
    help: input.help,
    at: now,
    note: input.note?.trim() || undefined,
    ...(input.problem ? { problem: input.problem.replace(/\s+/g, "").toLowerCase().slice(0, 120) } : {}),
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.auto ? { auto: true } : {}),
    ...(input.step ? { step: true } : {}),
  });
  if (p.attempts.length > MAX_ATTEMPTS) p.attempts.shift();
  applyAttempt(p, p.attempts[p.attempts.length - 1]);
  if (input.result === "misconception" && !p.attempts.slice(0, -1).some((a) => a.skill === skill && a.result === "misconception")) {
    p.memoryDue = `a wrong idea came up${input.note ? ` (${input.note.trim()})` : ` in ${skill}`}`;
  }
}

function applyAttempt(p: TutorPolicy, a: Attempt): void {
  // A step inside the problem on the board: progress or a miss on this
  // problem, never a switch of skill or a solved problem.
  if (a.step) {
    if (a.result === "unchecked") return;
    if (a.result === "correct") p.missesInRow = 0;
    else {
      p.missesInRow += 1;
      p.quickCorrect = 0;
    }
    return;
  }
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
  // Named, or the model invents one ("16 ÷ 2" in a fractions lesson, Sept 23).
  const earlier = p.solvedSinceSwitch >= REVIEW_AFTER ? [...p.attempts].reverse().find((a) => !a.step && a.skill !== p.currentSkill && a.result !== "unchecked")?.skill : undefined;
  if (earlier) out.push(`mixed review due: one quick problem on "${earlier}" from earlier`);
  return out;
}

// ── The tutor-led flow (Sept 22 2026) ─────────────────────────────────────
// Where the current skill stands, computed from checked answers, so the tool
// results can say what to do next instead of hoping the model keeps count:
// the recordings showed "up" ignored 17 times when it was a soft hint. The
// bar for "understood for today" (the tutoring review): two right with no
// help on different problems, plus a reason in the student's own words.

export type FlowStep = "open" | "probe" | "show" | "together" | "alone" | "why" | "up";

/** Different problems solved right with no help on the current skill. */
export function aloneRight(p: TutorPolicy): number {
  const seen = new Set<string>();
  let n = 0;
  for (const a of p.attempts) {
    if (a.step || a.skill !== p.currentSkill || a.result !== "correct" || a.help > 0) continue;
    const key = a.problem ?? `#${a.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    n += 1;
  }
  return n;
}

// Two misses (or two "I don't know"s) in a row: a picture of this problem.
const SHOW_NEXT = "draw this problem as a picture (tape diagram, area model or number line), point at what answers it, one small question";

export function flowStep(p: TutorPolicy): { step: FlowStep; next: string } | null {
  // Mid-problem: the last thing checked was a step of the problem on the
  // board (Sept 22 2026: "25 - 7 = 18" was taken for a solved problem, and
  // the tutor jumped to a harder one with a student who had solved nothing).
  const recent = [...p.attempts].reverse().find((a) => a.result !== "unchecked");
  if (recent?.step) {
    if (p.missesInRow >= 2) return { step: "show", next: SHOW_NEXT };
    if (recent.result === "correct") return { step: "together", next: "that step is done, not the problem: the next step of this same problem is theirs (ask for the next line), help only where they stall" };
    return { step: "together", next: "point at the exact spot in this step and let them fix it" };
  }
  // Before any answer is checked the session is still opening (Sept 24 2026:
  // on 3.1 the first reply asked the show-me question with nothing asked
  // first). The state line says so on the first board results.
  if (!p.currentSkill) {
    if (p.attempts.length === 0 && p.studentTurns >= 1 && p.studentTurns <= 2) return { step: "open", next: "no teaching yet: ask what exactly they want (a sheet, or the whole idea), then what they already know and where it stops making sense; one question a turn; then the plan in one breath and one small show-me problem" };
    return null;
  }
  const onSkill = p.attempts.filter((a) => a.skill === p.currentSkill && !a.step && a.result !== "unchecked");
  const last = onSkill.at(-1);
  if (!last) return p.missesInRow >= 2 ? { step: "show", next: SHOW_NEXT } : { step: "probe", next: "before teaching: what they already know about it and which part doesn't make sense (unless they said), then their first move on it" };
  const alone = aloneRight(p);
  const reason = p.reasonSkill === p.currentSkill;
  if (last.result === "correct") {
    if (alone >= 2 && reason) return { step: "up", next: "they've shown it (2 right with no help, and why). Go harder now: start_new_problem with a harder one, write it, and ask for their first move. Don't ask if they want one" };
    if (alone >= 1 && !reason) return { step: "why", next: "ask how they know (why the key step works) before you move on" };
    // Fading, not a jump (Sept 24 2026): a problem they first got wrong, or
    // one that took a lot of help, is followed by one more done together, and
    // only a right answer after that goes to one alone. "No hints" is never
    // an order the tutor can read out any more (it said it four times in nine
    // minutes, straight after helped answers).
    const missedFirst = Boolean(last.problem) && p.attempts.some((a) => a !== last && a.problem === last.problem && a.result !== "correct" && a.result !== "unchecked");
    if (last.help >= 3 || missedFirst) return { step: "together", next: "that one needed help: another of the same kind together, they do each step and you help only where they stall (write each line as they say it). start_new_problem, write it, and ask for their first step" };
    return { step: "alone", next: "one of the same kind with new numbers; they do it and you only listen. start_new_problem, write it, and ask" };
  }
  if (p.missesInRow >= 2) return { step: "show", next: SHOW_NEXT };
  if (last.result === "misconception") return { step: "together", next: "show where the idea breaks (a picture or a simpler case), let them notice, then a similar one together" };
  if (onSkill.some((a) => a.result === "correct")) return { step: "together", next: "one step back: a smaller version together, then alone again" };
  return { step: "together", next: "point at the exact spot and let them fix it" };
}

export function formatTutorState(p: TutorPolicy, now: number): string {
  const parts: string[] = [];
  if (p.currentSkill) {
    const onSkill = p.attempts.filter((a) => a.skill === p.currentSkill && !a.step);
    const right = onSkill.filter((a) => a.result === "correct").length;
    parts.push(`skill "${p.currentSkill}": ${right} of ${onSkill.length} right, ${aloneRight(p)} with no help`);
    const flow = flowStep(p);
    if (flow) parts.push(`step ${flow.step.toUpperCase()} · next: ${flow.next}`);
    const last = p.attempts.at(-1);
    if (p.missesInRow > 0 && last) parts.push(`${p.missesInRow} ${p.missesInRow === 1 ? "miss" : "misses"} in a row (last: ${last.result})`);
    const help = suggestHelp(p);
    if (help) parts.push(`suggested help H${help.level} (${help.why})`);
  }
  if (!p.currentSkill) {
    const opening = flowStep(p);
    if (opening) parts.push(`step ${opening.step.toUpperCase()} · next: ${opening.next}`);
  }
  parts.push(...cues(p).filter((c) => !(c.startsWith("up:") && flowStep(p)?.step === "up")));
  const time = clockCue(now - p.startedAt, p.plannedMinutes);
  if (time) parts.push(time);
  if (parts.length === 0) return "";
  return `[Tutor state: ${parts.join(" · ")} · ${clockLabel(now - p.startedAt, p.plannedMinutes)}. Not from the student; never read it aloud.]`;
}

// The line without its minutes, so a line that only aged is not sent again.
const lineKey = (line: string) => line.replace(/ · \d+ (?:of \d+ )?min(?: in)?\..*$/, "");

// The state line when it changed since the model last saw one, else "".
// Board tool results carry it so the model sees fresh facts without extra turns.
export function takeStateUpdate(p: TutorPolicy, now: number): string {
  const line = formatTutorState(p, now);
  if (!line) return "";
  const key = lineKey(line);
  if (key === p.lastLineKey) return "";
  p.lastLineKey = key;
  return line;
}

// The state line regardless, marked as seen (for check_answer results).
export function currentState(p: TutorPolicy, now: number): string {
  const line = formatTutorState(p, now);
  p.lastLineKey = lineKey(line);
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
// Board v2 / tutor-led flow (Sept 22 2026). Recorded sessions ended 22% of
// turns on a check-in or a request for permission; the prompt forbids it, and a
// small model still does it. Said once, the next tool result names it.
const PERMISSION_RE = /\b(does (that|this) make sense|make sense\?|(do|would) you (want|like) to|want to (try|keep|do|go|see|move)|should we (try|keep|do|go|move)|shall we|(are you )?ready\?|sound good|you with me\?|got it\?|okay\?|ok\?)/i;

/** The permission or check-in question in a tutor turn, or null. */
export function permissionQuestion(text: string): string | null {
  const m = PERMISSION_RE.exec(text);
  if (!m) return null;
  const tail = text.slice(m.index + m[0].length).match(/^[^.?!]{0,40}\?/)?.[0] ?? "";
  return `${m[0]}${tail}`.replace(/\s+/g, " ").trim();
}

// "yeah I get it", "ok makes sense", "got it": the student says they understand.
const GET_IT_RE = /^(yeah|yes|yep|yup|ok(ay)?|oh|ohh|right|sure|mhm|mm-?hm)?[,.! ]*(i (get|got|understand) (it|that|now)|it makes sense|makes sense( now)?|that makes sense|got it|i see|oh i see|i think i get it|i understand)\b[^?]*$/i;

export function claimsUnderstanding(text: string): boolean {
  // Any sentence of the line can be the claim ("one row is 10? Yeah I get it.").
  const sentences = text.trim().toLowerCase().split(/(?<=[.!?])\s+/);
  return sentences.some((s) => GET_IT_RE.test(s.trim()) && !/\b(don'?t|do not|not sure|no idea)\b/.test(s));
}

/** "because the 5 isn't stuck to the x": the student says why, not just what. */
export function givesReason(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.split(/\s+/).length < 4) return false;
  return /\b(because|cause|'cause|cuz|since|so that|that's why|thats why|which means|otherwise|so the|so you|so it|you have to|you need to|it's like)\b/.test(t);
}

// "Exactly!", "Spot on!": praise that says nothing, at the front of a turn.
const PRAISE_OPENER_RE = /^\s*(exactly|spot on|perfect|great job|good job|nice job|awesome|amazing|excellent|fantastic|brilliant|well done|great work|nailed it|you got it|correct)\b[!.,]?/i;
// Gushing anywhere in a turn (Sept 24 2026: "Eighteen eightieths you nailed
// it", "You've really got this down" slipped past the opener check).
const PRAISE_ANYWHERE_RE = /\b(you nailed it|nailed it|you've (?:really )?got this(?: down)?|you got this down|perfectly|you're (?:so )?(?:smart|a natural|a genius)|great job|awesome job|amazing job|fantastic|brilliant)\b/i;

export function praiseOpener(text: string): string | null {
  const m = PRAISE_OPENER_RE.exec(text) ?? PRAISE_ANYWHERE_RE.exec(text);
  return m ? m[0].trim() : null;
}

// Words that send the student's eyes to the board ("look at the bars", "this
// step", "see the shaded part"). Said with no highlight, ring or point in the
// same reply, the student has to guess where to look (Sept 23 2026: marking
// had nearly vanished; Mateo wants the circling back).
const BOARD_REFERENCE = /\b(look at [a-z ]{0,20}?(?:the|this|that|these|those)(?: [a-z]+){1,2}|see (?:the|this|that|how|where) [a-z]+|notice [a-z ]{0,12}?(?:the|this|that)(?: [a-z]+){1,2}|(?:this|that|these|those) (?:bars?|box(?:es)?|lines?|steps?|parts?|pieces?|rows?|columns?|squares?|numbers?|dots?|picture|diagram|drawings?|graph|grid|triangle|side|circles?|pies?|slices?)|on the board|up there|right here)\b/i;

/** The phrase that pointed at the board, if the tutor's words did. */
export function boardReference(text: string): string | null {
  const m = BOARD_REFERENCE.exec(text);
  return m ? m[0].trim().slice(0, 60) : null;
}

export function noteTutorTurn(p: TutorPolicy, text: string, drew: boolean, marked = false): void {
  p.unmarkedReference = marked ? null : boardReference(text);
  const asked = permissionQuestion(text);
  if (asked) p.askedPermission = asked;
  const praise = praiseOpener(text);
  if (praise) p.praiseOpener = praise;
  if (drew) {
    p.unwrittenMath = null;
    return;
  }
  const said = spokenMath(text);
  if (said) p.unwrittenMath = said;
}

/** Something was written on the board: an earlier reminder is answered. A new page names the problem. */
export function noteBoardWrite(p: TutorPolicy, name?: string, args?: Record<string, unknown>): void {
  p.unwrittenMath = null;
  p.drawCount += 1;
  if (name === "start_problem" || name === "start_new_problem") {
    const raw = typeof args?.problem === "string" ? args.problem : typeof args?.title === "string" ? args.title : "";
    p.pageProblem = raw.trim() ? raw.trim().slice(0, 200) : null;
    p.pageSkill = null;
    p.boardHelp = 0;
    return;
  }
  if (name === "write_example" || name === "add_worked_example_box") p.boardHelp = Math.max(p.boardHelp, 5);
  else if (name && PICTURE_TOOLS.has(name)) p.boardHelp = Math.max(p.boardHelp, name === "draw_fraction" && args?.common_denominator !== undefined ? 4 : 3);
}

/** A highlight, ring or point: pointing at the spot is H2 help. */
export function noteBoardMark(p: TutorPolicy): void {
  p.boardHelp = Math.max(p.boardHelp, 2);
}

// Pictures scaffold an answer: counting the slices of a pie the tutor just
// drew is not solving it alone.
const PICTURE_TOOLS = new Set([
  "draw_fraction", "add_number_line", "draw_figure", "draw_angle", "draw_array", "add_area_model", "draw_bar_chart",
  "draw_tape_diagram", "draw_grid", "draw_transversal", "draw_icons", "draw_sketch", "add_function_graph", "draw_desmos",
  "draw_data_plot", "write_vertical", "draw_long_division", "draw_balance", "plot_points",
]);

// "show it on the board", "can you draw it", "write it down" (Sept 23 2026:
// asked once, and the tutor put up only the problem).
export function asksForBoard(text: string): boolean {
  return /\b(show|draw|write|put)\b[^.?!]{0,24}\b(on the board|board|down|it out)\b|\bshow me\b|\bdraw it\b/i.test(text);
}

/**
 * Working said out loud ("make it 12, so 3/12 and 2/12, so 5/12"): two or
 * more fractions, or three numbers with an operation. It belongs on the
 * board as lines, so a slip has a line to point at.
 */
export function spokenWorking(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const fractions = t.match(/\d+\s*\/\s*\d+/g) ?? [];
  const numbers = t.match(/\d+/g) ?? [];
  const op = /[+×*÷=-]|\b(plus|minus|times|multiply|multiplied|divide|divided|add|subtract|into|same|bottom|top)\b/i.test(t);
  if (fractions.length >= 2 || (numbers.length >= 3 && op)) return t.length > 90 ? `${t.slice(0, 87)}…` : t;
  return null;
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
  // A budget (Sept 24 2026): tool results were most of what the tutor read
  // (23.8k characters in a 9-minute session against 727 from the student), and
  // it read their orders aloud. So: the memory only when it changed, the state
  // line only when it changed, and at most ONE reminder per result, most
  // important first; the others wait for the next result.
  const out: string[] = [];
  const memory = formatMemory(p);
  if (memory && memory !== p.memorySent) {
    p.memorySent = memory;
    out.push(memory);
  }
  const state = takeStateUpdate(p, now);
  if (state) out.push(state);
  p.resultsSinceFilesReminder += 1;
  const reminder = nextReminder(p, now);
  if (reminder) out.push(reminder);
  return out.join(" ");
}

function nextReminder(p: TutorPolicy, now: number): string | null {
  if (p.pendingAnswer && !p.answerNudged) {
    p.answerNudged = true;
    return `[Unchecked answer: the student said "${p.pendingAnswer}". Call check_answer before you say whether it is right.]`;
  }
  if (p.unwrittenMath) {
    const said = p.unwrittenMath;
    p.unwrittenMath = null;
    return `[Said, not written: "${said}". Put it on the board.]`;
  }
  if (p.boardAsk) {
    const asked = p.boardAsk;
    p.boardAsk = null;
    return `[They asked to see it on the board ("${asked}"): show the working now, as lines or a picture.]`;
  }
  if (p.unmarkedReference) {
    const ref = p.unmarkedReference;
    p.unmarkedReference = null;
    return `[You said "${ref}" but marked nothing: highlight or ring it as you say it.]`;
  }
  if (p.askedPermission) {
    const asked = p.askedPermission;
    p.askedPermission = null;
    return `[You asked "${asked}". You lead: give them the next thing to do.]`;
  }
  if (p.claimedGetIt) {
    const claim = p.claimedGetIt;
    p.claimedGetIt = null;
    return `[They said "${claim}". That is not proof: give them one of the same kind with new numbers (start_new_problem, then write it) and have them talk you through it.]`;
  }
  if (p.praiseOpener) {
    const praise = p.praiseOpener;
    p.praiseOpener = null;
    return `[You said "${praise}". Confirm plainly and name the move they made, or just go on.]`;
  }
  if (p.memoryDue && p.memoryNudges < 3) {
    p.memoryNudges += 1;
    const due = p.memoryDue;
    p.memoryDue = null;
    return `[Memory: ${due}. If it will matter next session, call remember_about_student.]`;
  }
  if (p.files.length > 0 && (p.resultsSinceFilesReminder >= FILES_EVERY_RESULTS || now - p.filesRemindedAt >= FILES_EVERY_MS)) {
    p.resultsSinceFilesReminder = 0;
    p.filesRemindedAt = now;
    return `[Files: ${describeFiles(p.files)}. When the student names a problem or a part, call look_at_worksheet first and copy it exactly.]`;
  }
  return null;
}

// ── The board note between turns (Sept 25 2026) ───────────────────────────
// Every "draw this" reminder used to ride on a board tool's result, so a
// tutor that stopped drawing never heard that it should (a recorded session
// explained numerator and denominator for 95 seconds over an empty board). A
// note sent between turns, as context and not as a turn, reaches the model
// before its next reply: Gemini 3.8 reads it, obeys it, and does not answer
// it separately (probed Sept 25).

const EXPLAINS_WORDS = 10;
const LONG_TURN_WORDS = 28;
const MATH_WORD = /\b(numbers?|fractions?|pieces?|parts?|top|bottom|numerator|denominator|bigger|smaller|equal|add(?:ing)?|plus|minus|subtract(?:ing)?|times|multiply(?:ing)?|divid(?:e|ing)|half|halves|thirds?|fourths?|quarters?|sixths?|eighths?|x|y|equations?|slope|percent|decimals?|angles?|area|sides?|shaded|slices?)\b/i;
const MATH_QUESTION = /\b(what|which|how many|how much|why)\b[^.?!]*\b(number|fraction|piece|part|top|bottom|numerator|denominator|bigger|smaller|equal|add|plus|minus|times|divide|half|third|fourth|quarter|x|y)\b[^.?!]*\?/i;

/**
 * The note to send after the tutor's turn, or null. Only when the turn drew
 * nothing: an explanation over an empty board, arithmetic said and not
 * written, or a long turn with no board move at all.
 */
export function boardNote(p: TutorPolicy, tutorText: string, drew: boolean, marked: boolean): string | null {
  if (drew) return null;
  const text = tutorText.trim();
  if (!text) return null;
  const words = text.split(/\s+/).length;
  const said = spokenMath(text);
  const empty = p.drawCount === 0;
  // An explanation is the telling, not the asking: "Fractions, got it. Are
  // we looking at a problem on a sheet, or the whole idea?" names the topic
  // and asks, and needs no picture yet. Only the sentences that are not
  // questions count, and they have to say something mathematical.
  const telling = text.split(/(?<=[.!?])\s+/).filter((sentence) => !sentence.trim().endsWith("?")).join(" ");
  const tellingWords = telling.trim() ? telling.trim().split(/\s+/).length : 0;
  if (empty && ((tellingWords >= EXPLAINS_WORDS && MATH_WORD.test(telling)) || said || MATH_QUESTION.test(text))) {
    return "[Board note, not from the student: the board is empty and you explained in words. Before your next words, draw the idea (the picture for it, or the line), then talk about the picture and point at the part you mean.]";
  }
  if (said) return `[Board note, not from the student: you said "${said}" and wrote nothing. Write it (draw_equation_step) before you speak next, then point at it.]`;
  if (!marked && words >= LONG_TURN_WORDS) {
    return "[Board note, not from the student: a whole turn with no board move. Next turn, draw or mark the thing you talk about first, then speak.]";
  }
  return null;
}
