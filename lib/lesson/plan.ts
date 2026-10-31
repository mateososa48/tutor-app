// The turn plan the model returns, and its reading (Oct 31 2026, Plan B B1/B4).
// The model is forced to answer through one tool whose input is this shape, so
// there is no prose order for a second model to reinterpret (session 3597rg:
// the planner's "curve, secant, tangent and a sliding point" became a call
// with the curve and one point). Shape is not truth: lib/lesson/validate.ts
// checks the content before any of it is said or drawn.

import type { BoardIntent, PlannedQuestion, SpeechSegment, TeachingMove, TurnPlan } from "./types";

export const MOVES: TeachingMove[] = ["clarify", "diagnose", "explain", "model_step", "completion", "hint", "contrast", "confirm", "practice", "self_explanation", "repair", "recap", "close"];

/** The tool's fields, as written; TURN_PLAN_TOOL below puts them in the order the model fills them. */
const TURN_PLAN_BASE = {
  name: "turn_plan",
  description: "Your plan for this one turn: what the voice says, what the board shows, the one question (if any) and its private answer.",
  input_schema: {
    type: "object",
    properties: {
      move: { type: "string", enum: MOVES, description: "The teaching move this turn makes." },
      speech: {
        type: "array",
        description: "What the voice says, in order. Short spoken sentences, math in words.",
        items: {
          type: "object",
          properties: {
            say: { type: "string" },
            needs: { type: "array", items: { type: "string" }, description: "Board refs this sentence talks about; it waits until they are drawn. E.g. \"fig1.diagonal\", \"work.L2\", \"graph1\"." },
            fallback: { type: "string", description: "What to say instead if a needed part could not be drawn." },
          },
          required: ["say"],
        },
      },
      board: {
        type: "array",
        description: "Board changes, applied in order before the sentences that need them.",
        items: {
          type: "object",
          properties: {
            do: { type: "string", enum: ["work_step", "work_line", "work_fill", "table", "graph", "figure", "example", "mark", "fractions", "blocks", "picture"] },
            fractions: { type: "string", description: "fractions: one or two fractions on the same whole, \"1/2, 1/3\"." },
            common: { type: "number", description: "fractions: cut both into this many equal parts (6 for halves and thirds)." },
            model: { type: "string", enum: ["bar", "circle"], description: "fractions: bars (default) or circles." },
            what: { type: "string", description: "picture: real things with exact counts and arrangement, \"2 tens rods and 3 unit cubes\", \"a bag with 3 red and 2 blue marbles\". Never the answer written on it." },
            notice: { type: "string", description: "picture: what they should notice in it." },
            line: { type: "string", description: "work_fill: the waiting line to fill (\"L2\"), with text its full line (\"3x = 15\")." },
            left: { type: "string", description: "work_step: what is done to the left side, as written under it (\"−7\", \"÷3\")." },
            right: { type: "string", description: "work_step: what is done to the right side." },
            note: { type: "string", description: "work_step: the move in a few words (\"subtract 7 from both sides\")." },
            result: { type: "string", description: "work_step: the line the move gives (\"3x = 15\"), with ? for what the student should find (\"3x = ?\")." },
            text: { type: "string", description: "work_line: a line written under the newest one." },
            id: { type: "string", description: "table/graph/figure: its id (\"table1\", \"graph1\", \"fig1\"); the same id edits the one already up." },
            columns: { type: "string", description: "table: \"x | y\"." },
            rows: { type: "string", description: "table: \"0 | ?; 1 | ?\". blocks: its states left to right, \"42: 4 tens 2 ones | after the trade: 3 tens 12 ones (10 new) | take away 7: 3 tens 12 ones, cross 7 ones\"." },
            title: { type: "string" },
            points: { type: "string", description: "graph: \"(0, -1); (1, 1); A(2, 3)\"." },
            lines: { type: "string", description: "graph: \"y = 2x - 1; x = 3; through (0, -1) and (2, 3)\"." },
            arrows: { type: "string", description: "graph: \"(0, -1) to (1, -1): right 1; (1, -1) to (1, 1): up 2\"." },
            x_min: { type: "number" },
            x_max: { type: "number" },
            y_min: { type: "number" },
            y_max: { type: "number" },
            shape: { type: "string", enum: ["right_triangle", "rectangle", "polygon"], description: "figure: what to construct." },
            base: { type: "string", description: "figure: a fact id (\"F1\") or a number from the problem." },
            height: { type: "string", description: "figure: a fact id or a number from the problem." },
            unit: { type: "string" },
            in_rectangle: { type: "boolean", description: "figure right_triangle: draw it inside its rectangle with the diagonal." },
            shade_other: { type: "boolean", description: "figure: shade the rectangle's other half too." },
            vertices: { type: "string", description: "figure polygon: \"(0,0); (4,0); (0,3)\"." },
            labels: { type: "string", description: "figure polygon: side labels in order, \"4 | 5 | 3\"." },
            problem: { type: "string", description: "example: a problem like theirs with other numbers." },
            steps: { type: "string", description: "example: its lines, \"2x + 3 = 11 | 2x = 8 | x = 4\"." },
            why: { type: "string", description: "example: the reason for each step, \"take 3 off both sides | split 8 into 2 equal groups\"." },
            ref: { type: "string", description: "mark: what to mark (\"work.L3\", \"fig1.diagonal\", \"graph1.P2\", \"table1.r2c2\")." },
            how: { type: "string", enum: ["ring", "swipe", "underline", "check", "cross", "point"], description: "mark: ring it, swipe a highlighter over it, underline it, box it green with a check (a right final answer), cross it out, or point at it." },
          },
          required: ["do"],
        },
      },
      verdict: {
        type: "object",
        description: "Only when you call their answer right or wrong and the checker gave no verdict: the answer, and arithmetic the code can check that shows it.",
        properties: {
          answer: { type: "string" },
          is: { type: "string", enum: ["correct", "incorrect", "partial"] },
          because: { type: "array", items: { type: "string" }, description: "E.g. [\"5*4+3 = 23\", \"23 <= 23\", \"5*5+3 = 28\", \"28 > 23\"]." },
        },
        required: ["answer", "is", "because"],
      },
      question: {
        type: "object",
        description: "The one question you end on, if any, and its private answer. Never ask what they already said.",
        properties: {
          ask: { type: "string", description: "The question, as said (it must also be in speech)." },
          kind: { type: "string", enum: ["value", "step", "explain", "choice", "open"] },
          expects: { type: "string", description: "The answer, private (\"3x = 15\", \"5\", \"30\")." },
          check: { type: "string", description: "Math their answer is checked on, when not just expects (\"3x + 7 = 22\" for a value of x)." },
          fill: { type: "string", description: "A board blank their answer fills: \"work.L2\" (a ? line), \"table1.r2c2\"." },
          final: { type: "boolean", description: "The answer to the whole problem: a right one is boxed." },
        },
        required: ["ask", "kind"],
      },
      gives_answer: { type: "boolean", description: "True when this turn tells them the answer to their problem (counted as help)." },
      solution: {
        type: "object",
        description: "Only when CURRENT PROBLEM shows no ANSWER yet: its final answer, private, and plain arithmetic that computes it, which the code evaluates (answer \"4\", work \"(23-3)/5\").",
        properties: { answer: { type: "string" }, work: { type: "string" } },
        required: ["answer", "work"],
      },
      close: { type: "boolean", description: "True to end or wrap up the session: no new task, no question." },
      why: { type: "string", description: "One short line on why this move, for the logs." },
    },
    required: ["move", "speech", "board"],
  },
} as const;

/**
 * The tool the model answers with, speech first: the model writes fields in
 * schema order, and the first sentence is said as soon as it is complete
 * (lib/lesson/stream.ts). Question and verdict first cost 3.4-5.8 s before
 * the first word (Oct 31 2026); without the question, an early sentence
 * may only use numbers the student already has.
 */
const P = TURN_PLAN_BASE.input_schema.properties;
export const TURN_PLAN_TOOL = {
  ...TURN_PLAN_BASE,
  input_schema: {
    ...TURN_PLAN_BASE.input_schema,
    properties: { move: P.move, speech: P.speech, question: P.question, verdict: P.verdict, solution: P.solution, gives_answer: P.gives_answer, close: P.close, board: P.board, why: P.why },
  },
};

export type ParsedPlan = { ok: true; plan: TurnPlan; verdict: { answer: string; is: "correct" | "incorrect" | "partial"; because: string[] } | null } | { ok: false; issues: string[] };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function pairs(raw: string): Array<[number, number]> {
  return [...raw.matchAll(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

/** The tool input as a TurnPlan, or what is wrong with its shape. */
export function parseTurnPlan(raw: unknown): ParsedPlan {
  if (!raw || typeof raw !== "object") return { ok: false, issues: ["no plan"] };
  const r = raw as Record<string, unknown>;
  const issues: string[] = [];
  const move = MOVES.includes(r.move as TeachingMove) ? (r.move as TeachingMove) : null;
  if (!move) issues.push(`move must be one of ${MOVES.join(", ")}`);
  const rawSpeech = Array.isArray(r.speech) ? r.speech : typeof r.speech === "string" ? [r.speech] : [];
  const speech: SpeechSegment[] = rawSpeech.map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const said = typeof s === "string" ? s : str(o.say) || str(o.text) || str(o.speech);
    return { id: `s${i + 1}`, text: said, needs: Array.isArray(o.needs) ? o.needs.map(str).filter(Boolean) : [], ...(str(o.fallback) ? { fallback: str(o.fallback) } : {}) };
  }).filter((s) => s.text);
  if (!speech.length) issues.push("speech is empty");
  const board: BoardIntent[] = [];
  for (const b of Array.isArray(r.board) ? r.board : []) {
    const o = (b ?? {}) as Record<string, unknown>;
    switch (o.do) {
      case "work_step":
        board.push({ do: "work_step", left: str(o.left), right: str(o.right), ...(str(o.note) ? { note: str(o.note) } : {}), result: str(o.result) || null });
        break;
      case "work_fill":
        if (str(o.line) && str(o.text)) board.push({ do: "work_fill", line: str(o.line).replace(/^work\./, ""), text: str(o.text) });
        else issues.push("work_fill needs line and text");
        break;
      case "work_line":
        if (str(o.text)) board.push({ do: "work_line", text: str(o.text) });
        else issues.push("work_line needs text");
        break;
      case "table":
        if (str(o.columns)) board.push({ do: "table", ...(str(o.id) ? { id: str(o.id) } : {}), columns: str(o.columns), rows: str(o.rows), ...(str(o.title) ? { title: str(o.title) } : {}) });
        else issues.push("table needs columns");
        break;
      case "graph": {
        const view: Record<string, number> = {};
        for (const [k, key] of [["x_min", "xMin"], ["x_max", "xMax"], ["y_min", "yMin"], ["y_max", "yMax"]] as const) if (typeof o[k] === "number") view[key] = o[k] as number;
        board.push({ do: "graph", ...(str(o.id) ? { id: str(o.id) } : {}), ...(str(o.points) ? { points: str(o.points) } : {}), ...(str(o.lines) ? { lines: str(o.lines) } : {}), ...(str(o.arrows) ? { arrows: str(o.arrows) } : {}), ...(Object.keys(view).length ? { view } : {}) });
        break;
      }
      case "figure": {
        const shape = o.shape === "right_triangle" || o.shape === "rectangle" || o.shape === "polygon" ? o.shape : null;
        if (!shape) {
          issues.push("figure needs shape right_triangle, rectangle or polygon");
          break;
        }
        board.push({
          do: "figure",
          ...(str(o.id) ? { id: str(o.id) } : {}),
          shape,
          ...(o.base !== undefined ? { base: typeof o.base === "number" ? o.base : str(o.base) } : {}),
          ...(o.height !== undefined ? { height: typeof o.height === "number" ? o.height : str(o.height) } : {}),
          ...(str(o.unit) ? { unit: str(o.unit) } : {}),
          ...(o.in_rectangle === true ? { in_rectangle: true } : {}),
          ...(o.shade_other === true ? { shade_other: true } : {}),
          ...(str(o.vertices) ? { vertices: pairs(str(o.vertices)) } : {}),
          ...(str(o.labels) ? { labels: str(o.labels).split("|").map((l) => l.trim()) } : {}),
        });
        break;
      }
      case "example":
        if (str(o.problem) && str(o.steps)) board.push({ do: "example", problem: str(o.problem), steps: str(o.steps), ...(str(o.why) ? { why: str(o.why) } : {}) });
        else issues.push("example needs problem and steps");
        break;
      case "mark": {
        const how = ["ring", "swipe", "underline", "check", "cross", "point"].includes(String(o.how)) ? (o.how as "ring") : "ring";
        if (str(o.ref)) board.push({ do: "mark", ref: str(o.ref), how });
        else issues.push("mark needs ref");
        break;
      }
      case "fractions":
        if (str(o.fractions)) board.push({ do: "fractions", ...(str(o.id) ? { id: str(o.id) } : {}), fractions: str(o.fractions), ...(typeof o.common === "number" ? { common: o.common } : {}), ...(o.model === "circle" ? { model: "circle" as const } : {}) });
        else issues.push("fractions needs fractions");
        break;
      case "blocks":
        if (str(o.rows)) board.push({ do: "blocks", ...(str(o.id) ? { id: str(o.id) } : {}), rows: str(o.rows) });
        else issues.push("blocks needs rows");
        break;
      case "picture":
        if (str(o.what)) board.push({ do: "picture", ...(str(o.id) ? { id: str(o.id) } : {}), what: str(o.what).slice(0, 300), ...(str(o.notice) ? { notice: str(o.notice).slice(0, 300) } : {}) });
        else issues.push("picture needs what");
        break;
      default:
        issues.push(`unknown board do "${String(o.do)}"`);
    }
  }
  let question: PlannedQuestion | null = null;
  if (r.question && typeof r.question === "object") {
    const q = r.question as Record<string, unknown>;
    const kind = ["value", "step", "explain", "choice", "open"].includes(String(q.kind)) ? (q.kind as PlannedQuestion["kind"]) : "open";
    if (str(q.ask)) question = { text: str(q.ask), kind, ...(str(q.expects) ? { expects: str(q.expects) } : {}), ...(str(q.check) ? { check: str(q.check) } : {}), ...(str(q.fill) ? { fill: str(q.fill) } : {}), ...(q.final === true ? { final: true } : {}) };
  }
  let verdict: { answer: string; is: "correct" | "incorrect" | "partial"; because: string[] } | null = null;
  if (r.verdict && typeof r.verdict === "object") {
    const v = r.verdict as Record<string, unknown>;
    if (["correct", "incorrect", "partial"].includes(String(v.is))) verdict = { answer: str(v.answer), is: v.is as "correct", because: Array.isArray(v.because) ? v.because.map(str).filter(Boolean) : [] };
  }
  if (issues.length || !move) return { ok: false, issues };
  const sol = r.solution && typeof r.solution === "object" ? (r.solution as Record<string, unknown>) : null;
  const solution = sol && str(sol.answer) && str(sol.work) ? { answer: str(sol.answer), work: str(sol.work) } : undefined;
  return { ok: true, plan: { move, speech, board, question, givesAnswer: r.gives_answer === true, close: r.close === true, ...(solution ? { solution } : {}), ...(str(r.why) ? { why: str(r.why) } : {}) }, verdict };
}
