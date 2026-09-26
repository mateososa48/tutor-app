// What the code can count about a benchmark case without a judge
// (scripts/bench.ts). Pure: a run's turns in, numbers out.
import type { BenchCase } from "./bench-cases";
import type { Judgement } from "./bench-judge";
import { estimateCostUsd, type TurnUsage } from "../lib/live-turn-metrics";

export type ToolRecord = {
  name: string;
  args: Record<string, unknown>;
  callId: string;
  /** Milliseconds after the student's line. */
  atMs: number;
  /** Called before the tutor's first audio of the turn. */
  beforeSpeech: boolean;
  ok: boolean;
  result: string;
  durationMs: number;
  cancelled?: boolean;
};

export type TurnRecord = {
  n: number;
  student: string;
  tutor: string;
  tools: ToolRecord[];
  firstAudioMs: number | null;
  durationMs: number;
  silent: boolean;
  nudged: boolean;
  timedOut: boolean;
  interrupted: boolean;
  promptTokens: number | null;
  /** The turn's billed usage by modality (the largest count Live reported during the turn). */
  usage?: TurnUsage | null;
  /** The auto-check note the code sent with this turn's student line, if any. */
  autoCheck?: string | null;
  /** The full [Board: …] list after the turn, and the short one the tutor reads. */
  board: string;
  boardCompact: string;
  shot: string;
  boardShot: string | null;
};

export type Metrics = {
  turns: number;
  /** Turn 1 asked a question and taught nothing (no plan, no problem, no picture). */
  openingAsked: boolean;
  /** A tutor turn in the first three asked what they know / where it stops making sense / what they did. */
  askedWhatTheyKnow: boolean;
  /** Turn of the first set_plan, or null. */
  planTurn: number | null;
  /** Turn the problem first went on the board (start_new_problem with problem=, an equation line, or a picture). */
  problemTurn: number | null;
  boardTurns: number;
  pictureTurns: number;
  markTurns: number;
  /** Board turns that only wrote words or equation lines: no picture, no mark. */
  textOnlyTurns: number;
  /** Tutor turns that said "on the board" or the like with nothing drawn or pointed at that turn. */
  phantomClaims: number;
  /** Student lines that were answers, and how many turns then called check_answer. */
  answerLines: number;
  /** Answer lines checked: by check_answer, or by the code's auto-check. */
  checkedTurns: number;
  autoChecks: number;
  studentAttemptsWritten: number;
  multiQuestionTurns: number;
  praiseTurns: number;
  permissionQuestions: number;
  wordsPerTurn: number;
  /** Median and worst time from the student's line to the tutor's first sound. */
  firstAudioMedianMs: number | null;
  firstAudioMaxMs: number | null;
  silentTurns: number;
  nudgedTurns: number;
  timedOutTurns: number;
  interruptedTurns: number;
  toolCalls: number;
  toolErrors: number;
  toolErrorNames: string[];
  /** Tool calls the model made before its first word of the turn (each one reads the whole context). */
  toolsBeforeSpeech: number;
  promptTokensMax: number | null;
  promptTokensSum: number;
  /** Estimated Live cost of the case in dollars (lib/live-turn-metrics prices), or null without usage. */
  costUsd: number | null;
  /** Tool calls per tutor turn. */
  callsPerTurn: number;
  /** Turns whose first sound came more than 8 s after the student's line. */
  slowTurns: number;
  /** Turns whose transcript carries LaTeX, markup or tool syntax the student would hear. */
  leakTurns: number;
  /** Turns where the tutor said the same sentence twice. */
  repeatTurns: number;
  /** Student attempts written with a backslash in them (raw LaTeX in handwriting). */
  rawLatexAttempts: number;
  wallMs: number;
};

export type CaseRun = {
  /** The run's file tag: the case id, or "<id>-r2" for a repeat. */
  id: string;
  /** The case this run played. */
  caseId?: string;
  name: string;
  grade: string;
  liveModel: string;
  setupMs: number;
  wallMs: number;
  closed: string | null;
  framesSent: number;
  turns: TurnRecord[];
  pageErrors: string[];
  finalBoard: string | null;
  metrics: Metrics;
  judgement: Judgement | null;
};

export const PICTURE_TOOLS = new Set<string>([
  "draw_fraction", "add_number_line", "draw_figure", "draw_angle", "draw_array", "add_area_model",
  "draw_balance", "draw_bar_chart", "add_coordinate_axes", "plot_points", "add_function_graph",
  "draw_tape_diagram", "draw_grid", "write_vertical", "draw_long_division", "draw_transversal",
  "draw_icons", "draw_sketch", "add_table", "draw_desmos", "draw_data_plot",
]);

// The same claim the board eval counts (scripts/board-eval.ts), plus "this
// number line" style references.
const CLAIMS_BOARD = /\b(on the board|i(?:'ve| have) (?:drawn|written|put)|i drew|i wrote|look at the (?:board|picture|diagram|graph|triangle|table|number line|grid|circle|bars?)|as you can see|from the picture|(?:this|the) (?:number line|graph|table|diagram|picture) (?:here|shows|i)|see (?:the|this) (?:number line|graph|table|diagram|picture))\b/i;
const ASKS_WHAT_THEY_KNOW = /\b(already know|what do you know|what you know|where (?:it|does it|do you|things?) (?:stop|start|get|go)|which part|what (?:is|was|part is|parts? are) (?:confusing|tricky|hard|the (?:tricky|hard|confusing) (?:part|bit))|what did you (?:do|try|get|put|write)|how did you (?:get|do|work)|walk me through|what have you tried|what (?:do|did) you think|tell me what you (?:did|tried|know|think))\b/i;
const OPENING_ALLOWED = new Set(["start_new_problem", "look_at_worksheet", "add_callout", "look_at_board", "remember_about_student"]);
// What a kid would hear that is not speech: LaTeX between dollars, markup, a
// stage direction, or a tool call read aloud ("set_plan(steps=…").
const LEAK = /\$[^$\n]{1,80}\$|<!--|<no speech|<\/?[a-z]+>|\b[a-z_]+\((?:[a-z_]+=|")|-{3,}/i;
// A sentence of six or more words said twice in one turn (Sept 25 2026, 3.8:
// "split that into two equations… And now, split that into two equations…").
function repeatsItself(text: string): boolean {
  const seen = new Set<string>();
  for (const raw of text.split(/(?<=[.!?])\s+|\s*[.!?]\s*(?=[A-Z])/)) {
    const s = raw.toLowerCase().replace(/^(?:(?:and|so|now|then|ok|okay),?\s+)+/, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    if (s.split(" ").length < 6) continue;
    if (seen.has(s)) return true;
    seen.add(s);
  }
  return false;
}
const SLOW_MS = 8_000;

type PolicyFns = {
  looksLikeAnswer: (text: string) => boolean;
  praiseOpener: (text: string) => string | null;
  permissionQuestion: (text: string) => string | null;
  isNonAnswer?: (text: string) => boolean;
};

type Role = (name: string) => string;
let roleOf: Role = (name) => (PICTURE_TOOLS.has(name) || /^(draw_|add_|write_|start_new_problem|set_plan)/.test(name) ? "draw" : /^(point_at|circle_item|highlight|cross_out_step|underline)/.test(name) ? "mark" : "other");
export function setToolRole(fn: Role) {
  roleOf = fn;
}

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

export function measure(turns: TurnRecord[], c: BenchCase, policy: PolicyFns): Metrics {
  const ok = (t: TurnRecord, pred: (x: ToolRecord) => boolean) => t.tools.some((x) => x.ok && !x.cancelled && pred(x));
  const drew = (t: TurnRecord) => ok(t, (x) => roleOf(x.name) === "draw" && x.name !== "start_new_problem" && x.name !== "set_plan");
  const drewPicture = (t: TurnRecord) => ok(t, (x) => PICTURE_TOOLS.has(x.name));
  const marked = (t: TurnRecord) => ok(t, (x) => roleOf(x.name) === "mark");
  const first = turns[0];
  const openingAsked = Boolean(first) && /\?/.test(first.tutor) && !first.tools.some((x) => x.ok && (!OPENING_ALLOWED.has(x.name) || (x.name === "start_new_problem" && typeof x.args.problem === "string" && x.args.problem.trim())));
  const askedWhatTheyKnow = turns.slice(0, 3).some((t) => ASKS_WHAT_THEY_KNOW.test(t.tutor));
  const planTurn = turns.find((t) => ok(t, (x) => x.name === "set_plan" && typeof x.args.steps === "string"))?.n ?? null;
  const problemTurn = turns.find((t) => ok(t, (x) => (x.name === "start_new_problem" && typeof x.args.problem === "string" && x.args.problem.trim() !== "") || x.name === "draw_equation_step" || PICTURE_TOOLS.has(x.name)))?.n ?? null;
  // A student line counts as an answer from turn 2 on (the intake message is not one).
  const answerTurns = turns.filter((t) => t.n > 1 && policy.looksLikeAnswer(t.student) && !(policy.isNonAnswer?.(t.student) ?? false));
  const firstAudio = turns.map((t) => t.firstAudioMs).filter((x): x is number => x != null);
  const words = turns.reduce((s, t) => s + (t.tutor ? t.tutor.split(/\s+/).length : 0), 0);
  const allTools = turns.flatMap((t) => t.tools);
  const promptTokens = turns.map((t) => t.promptTokens).filter((x): x is number => x != null);
  const costs = turns.map((t) => (t.usage ? estimateCostUsd(t.usage) : null)).filter((x): x is number => x != null);
  void c;
  return {
    turns: turns.length,
    openingAsked,
    askedWhatTheyKnow,
    planTurn,
    problemTurn,
    boardTurns: turns.filter(drew).length,
    pictureTurns: turns.filter(drewPicture).length,
    markTurns: turns.filter(marked).length,
    textOnlyTurns: turns.filter((t) => drew(t) && !drewPicture(t) && !marked(t)).length,
    phantomClaims: turns.filter((t) => CLAIMS_BOARD.test(t.tutor) && !drew(t) && !marked(t)).length,
    answerLines: answerTurns.length,
    checkedTurns: answerTurns.filter((t) => Boolean(t.autoCheck) || ok(t, (x) => x.name === "check_answer")).length,
    autoChecks: turns.filter((t) => Boolean(t.autoCheck)).length,
    studentAttemptsWritten: allTools.filter((x) => x.ok && x.name === "add_student_attempt").length,
    multiQuestionTurns: turns.filter((t) => (t.tutor.match(/\?/g) ?? []).length > 1).length,
    praiseTurns: turns.filter((t) => policy.praiseOpener(t.tutor) !== null).length,
    permissionQuestions: turns.filter((t) => policy.permissionQuestion(t.tutor) !== null).length,
    wordsPerTurn: turns.length ? Math.round(words / turns.length) : 0,
    firstAudioMedianMs: median(firstAudio),
    firstAudioMaxMs: firstAudio.length ? Math.max(...firstAudio) : null,
    silentTurns: turns.filter((t) => t.silent).length,
    nudgedTurns: turns.filter((t) => t.nudged).length,
    timedOutTurns: turns.filter((t) => t.timedOut).length,
    interruptedTurns: turns.filter((t) => t.interrupted).length,
    toolCalls: allTools.length,
    toolErrors: allTools.filter((x) => !x.ok).length,
    toolErrorNames: [...new Set(allTools.filter((x) => !x.ok).map((x) => `${x.name}: ${x.result.replace(/^Error: /, "").slice(0, 80)}`))],
    toolsBeforeSpeech: allTools.filter((x) => x.beforeSpeech).length,
    promptTokensMax: promptTokens.length ? Math.max(...promptTokens) : null,
    promptTokensSum: promptTokens.reduce((a, b) => a + b, 0),
    costUsd: costs.length ? Math.round(costs.reduce((a, b) => a + b, 0) * 1000) / 1000 : null,
    callsPerTurn: turns.length ? Math.round((allTools.length / turns.length) * 10) / 10 : 0,
    slowTurns: turns.filter((t) => t.firstAudioMs != null && t.firstAudioMs > SLOW_MS).length,
    leakTurns: turns.filter((t) => LEAK.test(t.tutor)).length,
    repeatTurns: turns.filter((t) => repeatsItself(t.tutor)).length,
    rawLatexAttempts: allTools.filter((x) => x.ok && x.name === "add_student_attempt" && typeof x.args.text === "string" && x.args.text.includes("\\")).length,
    wallMs: turns.reduce((s, t) => s + t.durationMs, 0),
  };
}
