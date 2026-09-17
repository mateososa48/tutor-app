// Offline board-use eval: runs scripted student conversations through a
// Gemini text model with the real tutor prompt and the real tool
// declarations, executes the tools against a fake board, and scores how the
// tutor uses the board. No audio, no Live session, a few cents per run.
//
//   npx tsx scripts/board-eval.ts [--model gemini-3.1-flash-lite] [--set core|math|icons|sessions|desmos|all]
//     [--scenario fractions] [--turns 6] [--runs 1] [--out file.json] [--verbose]
//
// Sets: core (5 mixed topics), math (12 grade 5–9 topics), icons (real things),
// sessions (lines lifted from recorded sessions: "put it on the board pls",
// "what?", "idk", "lets do part c"), desmos (topics that belong on axes).

import fs from "node:fs";
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { buildGeminiInstructions, type StudentProfile } from "../lib/tutor-prompts";
import { WHITEBOARD_TOOL_DECLARATIONS } from "../lib/whiteboard-tools";
import { createPolicy, looksLikeAnswer, noteStudentUtterance, spokenMath } from "../lib/tutor-policy";
import { createFakeBoard, NON_CREATING_TOOLS } from "./eval-board";
import { EVAL_TOOL_DECLARATIONS, arg, readGeminiKey, runEvalTool, withRetry } from "./eval-tools";

type Scenario = { name: string; student: string[]; profile?: Partial<StudentProfile>; worksheet?: string };

const SCENARIOS: Scenario[] = [
  { name: "fractions", student: ["I don't get fractions at all.", "um, a half?", "I don't know", "two pieces?", "okay", "so two quarters is the same as one half?"] },
  { name: "algebra", student: ["can you help me with 2x + 3 = 11", "subtract 3?", "so x = 16?", "oh wait, divide by 2. x = 4", "can I try another one", "3x - 5 = 7, so x is 4"] },
  { name: "geometry", student: ["what's the area of a triangle", "base times height?", "why do you divide by 2", "ok I think I get it", "what if it's not a right triangle", "makes sense"] },
  { name: "negatives", student: ["why is negative 3 minus negative 5 equal to 2", "I thought two negatives make a plus", "so it's like adding 5?", "ok", "what about negative 3 plus negative 5", "negative 8"] },
  { name: "word-problem", student: ["Sam has 12 apples and gives away a quarter of them. how many are left", "3?", "oh, 9", "yes", "what if he gave away a third", "8"] },
];

// Math-focused scenarios: the topics a grade 5–9 tutor must draw well.
const MATH_SCENARIOS: Scenario[] = [
  { name: "add-fractions", student: ["how do I add 1/2 and 1/3", "um, 2/5?", "why can't I just add the tops and bottoms", "oh so I need the same size pieces", "6?", "so 3/6 + 2/6 = 5/6"] },
  { name: "percent", student: ["what is 25% of 80", "I don't know what percent even means", "out of 100?", "so 25 out of 100", "20?", "yes"] },
  { name: "ratio-word", student: ["for every 2 red marbles there are 3 blue. if there are 20 marbles how many are blue", "10?", "hmm 5 groups?", "so 12 blue", "and 8 red", "ok"] },
  { name: "two-step-eq", student: ["3x - 5 = 16", "add 5?", "3x = 21", "x = 7", "can you give me a harder one", "5x + 2 = 3x + 10... subtract 3x?"] },
  { name: "distributive", student: ["what is 3(x + 4)", "3x + 4?", "why does the 3 go to both", "oh, so 3x + 12", "what about 4(2x - 3)", "8x - 12"] },
  { name: "triangle-area", student: ["how do you find the area of a triangle with base 8 and height 5", "8 times 5 is 40", "divide by 2?", "20", "what if it's slanted, like not a right triangle", "ok"] },
  { name: "angles", student: ["a triangle has angles 50 and 60, what's the third", "I don't remember the rule", "180?", "so 70", "what about a straight line, like two angles on it", "they add to 180"] },
  { name: "pythagoras", student: ["I have a right triangle with legs 6 and 8, what's the hypotenuse", "6 + 8 = 14?", "oh, squares. 36 + 64", "100", "so c is 10", "what if I know the hypotenuse and one leg"] },
  { name: "slope", student: ["what is slope", "rise over run?", "so for the points (1,2) and (3,6)", "rise 4 run 2, slope 2", "what about a negative slope", "ok"] },
  { name: "long-multiply", student: ["how do I do 23 times 14", "I always mess up the carrying", "20 times 10 is 200", "20 times 4 is 80", "3 times 10 is 30 and 3 times 4 is 12", "322"] },
  { name: "negatives-mult", student: ["why is negative times negative positive", "I just don't get it", "so -2 times 3 is -6", "and -2 times -3 is 6", "ok what is -12 divided by -4", "3"] },
  { name: "decimals", student: ["which is bigger, 0.7 or 0.65", "0.65 because 65 is bigger than 7", "oh tenths and hundredths", "so 0.70", "0.7 is bigger", "yes"] },
];

// Where a picture of real things should win.
const ICON_SCENARIOS: Scenario[] = [
  { name: "share-cookies", student: ["I have 12 cookies and 4 friends, how many does each get", "3?", "how do you know", "ok what if it was 5 friends", "so 2 each and 2 left over"] },
  { name: "take-away", student: ["there are 7 apples and I eat 3, how many are left", "4", "what about 15 minus 8", "7", "ok"] },
  { name: "groups-multiply", student: ["why is 3 times 4 the same as 4 times 3", "I don't get it", "oh they're the same amount", "what about 6 times 2", "12"] },
  { name: "ratio-marbles", student: ["for every 2 red marbles there are 3 blue ones, if I have 6 red how many blue", "6?", "hmm 9?", "yes 9", "what if I had 10 red"] },
  { name: "money", student: ["I have 3 dollars and 4 quarters, how much money is that", "4 dollars", "oh 4 quarters is a dollar", "so 4 dollars", "and if I spend 2 dollars 50"] },
  { name: "analogy-negatives", student: ["I don't understand why 5 minus 8 is negative", "you can't take 8 from 5", "so it's like owing?", "ok so negative 3", "what about 3 minus 10"] },
];

// Lines lifted from recorded sessions (Sept 15), where the tutor talked math
// without writing it, answered its own question after "what?", closed on
// "idk", and never re-read the worksheet.
const WORKSHEET = "Unit 4 review. 1) Solve 3x + 7 = 25. 2) Solve 5(x - 2) = 3x + 8. 5) Find the slope of the line through (2, 3) and (6, 11). 8) A right triangle has legs 6 cm and 8 cm. a) Sketch it. b) Which side is the hypotenuse? c) Find the length of the hypotenuse.";
const SESSION_SCENARIOS: Scenario[] = [
  { name: "equation-idk", student: ["can you help me with 3x + 7 = 25", "i dont know", "7", "18 divided by 3?", "ok", "yes"] },
  { name: "board-please", student: ["a right triangle has legs 6 and 8 cm, find the hypotenuse", "umm idk", "what? put it on the board pls", "ok thats 100", "10", "ok lets do another one"] },
  { name: "slope-lost", student: ["how do i find the slope between (2, 3) and (6, 11)", "i dont know", "11 is bigger?", "wait what", "i dont understand", "but what does rise over run mean"] },
  { name: "what-then-idk", student: ["the slope is 3 and the line crosses the y axis at 1. whats the equation", "what?", "idk", "ij", "ok", "bye"] },
  { name: "worksheet-part", worksheet: WORKSHEET, student: ["i need help on my homework, i uploaded a picture of it", "lets do part c", "idk", "ok", "can we do number 2 now", "not sure"] },
  { name: "graph-ask", student: ["can u graph a line that has slope 3 so i can see", "yeah", "what if the slope is negative", "ok", "can i change it myself", "cool"] },
];

// Topics that belong on axes: the Desmos tools should carry most of these.
const DESMOS_SCENARIOS: Scenario[] = [
  { name: "slope-graph", student: ["what does a slope of 2 look like", "so it goes up 2 each time?", "what about y = 2x + 3", "it starts at 3?", "ok"] },
  { name: "system", student: ["how do i solve y = 2x + 1 and y = -x + 7", "set them equal?", "2x + 1 = -x + 7", "x = 2", "so y = 5"] },
  { name: "inequality", student: ["what does x > 3 mean", "so everything bigger than 3", "is 3 included", "what about y < 2x - 1", "ok"] },
  { name: "pattern", student: ["a pattern goes 3, 7, 11, 15. whats the 10th term", "add 4 each time?", "so 39?", "is there a rule", "4n - 1"] },
  { name: "proportional", student: ["a car goes 60 miles every hour. how far in 5 hours", "300", "is that a proportional relationship", "what's the constant", "60"] },
  { name: "distance-midpoint", student: ["whats the distance between (1, 2) and (4, 6)", "i dont know the formula", "3 and 4?", "so 5", "whats the midpoint"] },
  { name: "pythagoras-ladder", student: ["a ladder is 13 feet long and its base is 5 feet from the wall. how high does it reach", "13 minus 5?", "oh squares", "169 - 25 = 144", "12"] },
  { name: "reflection", student: ["how do i reflect the triangle (1,1), (4,1), (4,3) over the y-axis", "make x negative?", "(-1,1), (-4,1), (-4,3)", "what about over the x-axis", "make y negative"] },
  { name: "exp-vs-linear", student: ["which grows faster, 2x or 2 to the x", "2x?", "when x is 10?", "1024 vs 20", "wow"] },
  { name: "scatter-fit", student: ["hours studied and test scores: (1, 60), (2, 65), (3, 72), (4, 78), (5, 85). is there a trend", "they go up?", "how much per hour", "about 6?", "what would 6 hours get"] },
  { name: "box-plot", student: ["the scores were 3, 5, 5, 6, 7, 8, 8, 9, 12. how do i make a box plot", "the median is 7", "what are quartiles", "5 and 8.5?", "ok"] },
];

const SETS: Record<string, Scenario[]> = {
  core: SCENARIOS,
  math: MATH_SCENARIOS,
  icons: ICON_SCENARIOS,
  sessions: SESSION_SCENARIOS,
  desmos: DESMOS_SCENARIOS,
};

const DECLARED = WHITEBOARD_TOOL_DECLARATIONS.map((d) => d.name as string);
const MARK_TOOLS = new Set(["point_at", "circle_item", "highlight", "highlight_step", "cross_out_step"]);
const DRAW_TOOLS = new Set(DECLARED.filter((n) => !NON_CREATING_TOOLS.has(n)));
// Tools that put a picture on the board, as opposed to words in a box.
const PICTURE_TOOLS = new Set<string>([
  "draw_fraction", "add_number_line", "draw_figure", "draw_angle", "draw_array", "add_area_model",
  "draw_balance", "draw_bar_chart", "add_coordinate_axes", "plot_points", "add_function_graph",
  "draw_tape_diagram", "draw_grid", "write_vertical", "draw_long_division", "draw_transversal",
  "draw_icons", "draw_sketch", "add_table", "draw_desmos", "draw_data_plot",
]);
// Pictures Desmos draws. Grows when number lines, bar charts and flat figures move to Desmos.
const DESMOS_TOOLS = new Set<string>(["add_function_graph", "plot_points", "add_coordinate_axes", "draw_desmos", "draw_data_plot"]);
const TEXT_TOOLS = new Set(["add_text_note", "add_callout", "add_worked_example_box", "add_student_attempt", "add_problem_setup"]);

/** The tutor pointing at board content in words: "on the board", "I've drawn", "look at the graph". */
const CLAIMS_BOARD = /\b(on the board|i(?:'ve| have) drawn|i drew|look at the (?:board|picture|diagram|graph|triangle|table)|as you can see|from the picture)\b/i;
/** A student line that is not an attempt at all. */
const NON_ANSWER = /^\s*(i ?(do ?n'?t|dont) know|idk|no idea|not sure|um+|uh+|umm+ idk|ok(ay)?|yes|yeah|no|what\??|wait,? what\??|ij|huh\??|i dont understand)\s*[.!?]*\s*$/i;
const SECOND_PERSON = /^\s*(you|your|du|dein|tú|tu|vous|você)\b/i;

type ToolLog = { name: string; args: Record<string, unknown>; ok: boolean; verdict?: string };

type TurnStats = {
  student: string;
  tutor: string;
  tools: ToolLog[];
  errors: string[];
  boardUsed: boolean;
  pointed: boolean;
  erased: boolean;
  asked: boolean;
  fallback: boolean;
  drewPicture: boolean;
  textOnly: boolean;
  phantom: boolean;
  answer: boolean;
  checked: boolean;
  correct: boolean;
  marked: boolean;
  attempts: number;
  badAttempts: number;
  pipes: number;
  duplicates: number;
  problemsWithNumbers: number;
  questionsWritten: number;
  spokenUnwritten: string | null;
  pictures: number;
  desmos: number;
};

function textOf(args: Record<string, unknown>): string {
  return ["text", "body", "title", "givens", "goal"].map((k) => (typeof args[k] === "string" ? String(args[k]) : "")).filter(Boolean).join(" | ");
}

function normalized(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N}=+\-*/^().,|]/gu, "").trim();
}

const verbose = process.argv.includes("--verbose");

async function runScenario(ai: GoogleGenAI, model: string, scenario: Scenario, turns: number): Promise<TurnStats[]> {
  const profile: StudentProfile = { displayName: "Sam", gradeLevel: "6th grade", learningPrefs: {}, ...(scenario.profile ?? {}) };
  const systemInstruction = buildGeminiInstructions(profile, []);
  const board = createFakeBoard();
  const policy = createPolicy(Date.now());
  const contents: Content[] = [];
  const stats: TurnStats[] = [];
  const tools = [{ functionDeclarations: EVAL_TOOL_DECLARATIONS }];
  const seenText = new Set<string>();
  let lastLatex = "";
  for (const [index, line] of scenario.student.slice(0, turns).entries()) {
    const said = index === 0 && scenario.worksheet ? `[The student uploaded a worksheet. It shows: ${scenario.worksheet}]\n${line}` : line;
    contents.push({ role: "user", parts: [{ text: said }] });
    noteStudentUtterance(policy, line);
    await new Promise((r) => setTimeout(r, Number(arg("pace", "0"))));
    const turn: TurnStats = {
      student: line, tutor: "", tools: [], errors: [],
      boardUsed: false, pointed: false, erased: false, asked: false, fallback: false, drewPicture: false, textOnly: false, phantom: false,
      answer: looksLikeAnswer(line), checked: false, correct: false, marked: false,
      attempts: 0, badAttempts: 0, pipes: 0, duplicates: 0, problemsWithNumbers: 0, questionsWritten: 0,
      spokenUnwritten: null, pictures: 0, desmos: 0,
    };
    for (let round = 0; round < 6; round++) {
      const res = await withRetry(() => ai.models.generateContent({
        model,
        contents,
        config: { systemInstruction, tools, temperature: 0.8, maxOutputTokens: 1200 },
      }));
      const content = res.candidates?.[0]?.content;
      const parts: Part[] = content?.parts ?? [];
      if (!content) break;
      contents.push({ role: "model", parts });
      const calls = parts.filter((p) => p.functionCall);
      const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join(" ").trim();
      if (text) turn.tutor += (turn.tutor ? " " : "") + text;
      if (calls.length === 0) break;
      const responses: Part[] = [];
      for (const part of calls) {
        const name = part.functionCall?.name ?? "";
        const args = (part.functionCall?.args ?? {}) as Record<string, unknown>;
        const result = runEvalTool(name, args, { board, policy, worksheet: scenario.worksheet });
        turn.tools.push({ name, args, ok: result.ok, verdict: result.verdict });
        if (!result.ok) turn.errors.push(`${name}: ${result.message}`);
        if (name === "start_new_problem") { seenText.clear(); lastLatex = ""; }
        if (result.ok && TEXT_TOOLS.has(name)) {
          const t = textOf(args);
          if (/\s\|\s/.test(t)) turn.pipes += 1;
          const key = normalized(t);
          if (key && seenText.has(key)) turn.duplicates += 1;
          if (key) seenText.add(key);
        }
        if (result.ok && name === "draw_equation_step") {
          const key = normalized(String(args.latex ?? ""));
          if (key && key === lastLatex) turn.duplicates += 1;
          lastLatex = key;
        }
        if (verbose) console.log(`    ↳ ${name}(${JSON.stringify(args).slice(0, 140)}) → ${result.message.split("\n")[0].slice(0, 120)}`);
        responses.push({ functionResponse: { id: part.functionCall?.id, name, response: { result: result.message } } });
      }
      contents.push({ role: "user", parts: responses });
    }
    scoreTurn(turn);
    stats.push(turn);
    if (verbose) console.log(`  student: ${line}\n  tutor:   ${turn.tutor.slice(0, 300)}\n  tools:   ${turn.tools.map((t) => t.name).join(", ") || "(none)"}${turn.errors.length ? `\n  errors:  ${turn.errors.join(" | ")}` : ""}\n`);
  }
  if (verbose) console.log(`  board at end: ${board.handle.getBoardSummary()}\n`);
  return stats;
}

function scoreTurn(turn: TurnStats): void {
  const ok = turn.tools.filter((t) => t.ok);
  const names = ok.map((t) => t.name);
  turn.boardUsed = names.some((n) => DRAW_TOOLS.has(n));
  turn.pictures = names.filter((n) => PICTURE_TOOLS.has(n)).length;
  turn.desmos = names.filter((n) => DESMOS_TOOLS.has(n)).length;
  // A picture, not another box of words: the Sept 15 sessions filled the
  // board with prose whenever a topic had no obvious diagram.
  turn.drewPicture = turn.pictures > 0;
  turn.textOnly = turn.boardUsed && !turn.drewPicture;
  turn.pointed = names.some((n) => MARK_TOOLS.has(n));
  // Talking about board content that was never drawn or pointed at: two
  // recorded sessions said "on the board I've drawn a triangle" with no tool call.
  turn.phantom = CLAIMS_BOARD.test(turn.tutor) && !turn.boardUsed && !turn.pointed;
  turn.erased = names.some((n) => n.startsWith("erase"));
  turn.asked = /\?/.test(turn.tutor);
  turn.fallback = names.some((n) => n === "draw_sketch" || n === "add_text_note");
  turn.checked = names.includes("check_answer");
  turn.correct = ok.some((t) => t.name === "check_answer" && t.verdict === "correct");
  turn.marked = turn.correct && names.some((n) => n === "circle_item" || n === "highlight");
  const attempts = ok.filter((t) => t.name === "add_student_attempt");
  turn.attempts = attempts.length;
  turn.badAttempts = attempts.filter((t) => NON_ANSWER.test(turn.student) || SECOND_PERSON.test(String(t.args.text ?? ""))).length;
  // A new problem whose student line has numbers should have them written in the same turn.
  const start = ok.findIndex((t) => t.name === "start_new_problem" || t.name === "start_board_section");
  if (start >= 0 && /\d/.test(turn.student)) {
    turn.problemsWithNumbers = 1;
    const after = ok.slice(start + 1).filter((t) => DRAW_TOOLS.has(t.name));
    const written = after.map((t) => Object.entries(t.args).filter(([k]) => k !== "place" && k !== "column"));
    turn.questionsWritten = after.length > 0 && /\d/.test(JSON.stringify(written)) ? 1 : 0;
  }
  // Arithmetic said out loud with nothing written this turn.
  const wrote = names.some((n) => DRAW_TOOLS.has(n));
  turn.spokenUnwritten = wrote ? null : spokenMath(turn.tutor);
}

type Row = {
  name: string;
  turns: number;
  board: number;
  pictures: number;
  textOnly: number;
  phantom: number;
  pointed: number;
  erased: number;
  asked: number;
  askedWithBoard: number;
  tools: number;
  errors: number;
  fallback: number;
  answers: number;
  checked: number;
  correct: number;
  marked: number;
  attempts: number;
  badAttempts: number;
  pipes: number;
  duplicates: number;
  problemsWithNumbers: number;
  questionsWritten: number;
  spokenUnwritten: number;
  pictureCalls: number;
  desmosCalls: number;
};

function rowFor(name: string, stats: TurnStats[]): Row {
  const count = (f: (t: TurnStats) => boolean) => stats.filter(f).length;
  const sum = (f: (t: TurnStats) => number) => stats.reduce((s, t) => s + f(t), 0);
  return {
    name,
    turns: stats.length,
    board: count((t) => t.boardUsed),
    pictures: count((t) => t.drewPicture),
    textOnly: count((t) => t.textOnly),
    phantom: count((t) => t.phantom),
    pointed: count((t) => t.pointed),
    erased: count((t) => t.erased),
    asked: count((t) => t.asked),
    askedWithBoard: count((t) => t.asked && (t.boardUsed || t.pointed)),
    tools: sum((t) => t.tools.length),
    errors: sum((t) => t.errors.length),
    fallback: count((t) => t.fallback),
    answers: count((t) => t.answer),
    checked: count((t) => t.answer && t.checked),
    correct: count((t) => t.correct),
    marked: count((t) => t.marked),
    attempts: sum((t) => t.attempts),
    badAttempts: sum((t) => t.badAttempts),
    pipes: sum((t) => t.pipes),
    duplicates: sum((t) => t.duplicates),
    problemsWithNumbers: sum((t) => t.problemsWithNumbers),
    questionsWritten: sum((t) => t.questionsWritten),
    spokenUnwritten: count((t) => t.spokenUnwritten !== null),
    pictureCalls: sum((t) => t.pictures),
    desmosCalls: sum((t) => t.desmos),
  };
}

const pct = (n: number, d: number) => (d === 0 ? "–" : `${Math.round((100 * n) / d)}%`);

async function main() {
  const ai = new GoogleGenAI({ apiKey: readGeminiKey() });
  const model = arg("model", "gemini-3.5-flash");
  const only = arg("scenario", "");
  const turns = Number(arg("turns", "6"));
  const runs = Number(arg("runs", "1"));
  const setName = arg("set", "core");
  const set = setName === "all" ? Object.values(SETS).flat() : SETS[setName];
  if (!set) throw new Error(`Unknown set "${setName}". Options: ${[...Object.keys(SETS), "all"].join(", ")}`);
  const scenarios = set.filter((s) => !only || s.name === only);
  const rows: Row[] = [];
  const transcripts: Array<{ scenario: string; run: number; turns: TurnStats[] }> = [];
  const used = new Set<string>();
  for (const scenario of scenarios) {
    for (let r = 0; r < runs; r++) {
      console.log(`=== ${scenario.name} (${model}) run ${r + 1}/${runs}`);
      const stats = await runScenario(ai, model, scenario, turns);
      for (const t of stats) for (const x of t.tools) used.add(x.name);
      rows.push(rowFor(scenario.name, stats));
      transcripts.push({ scenario: scenario.name, run: r + 1, turns: stats });
    }
  }
  const total = rows.reduce<Row>((a, r) => {
    const out: Record<string, number | string> = { ...a };
    for (const k of Object.keys(r) as Array<keyof Row>) if (k !== "name") out[k] = (a[k] as number) + (r[k] as number);
    return out as Row;
  }, rowFor("TOTAL", []));

  console.log(`\nmodel ${model} · set ${setName} · ${turns} turns`);
  console.log("scenario             turns board pics text pointed erased checked marked attempts(bad) pipes dupes q-written spoken desmos errors");
  const line = (r: Row) => [
    r.name.padEnd(20),
    String(r.turns).padStart(5),
    String(r.board).padStart(5),
    String(r.pictures).padStart(4),
    String(r.textOnly).padStart(4),
    String(r.pointed).padStart(7),
    String(r.erased).padStart(6),
    `${r.checked}/${r.answers}`.padStart(7),
    `${r.marked}/${r.correct}`.padStart(6),
    `${r.attempts}(${r.badAttempts})`.padStart(13),
    String(r.pipes).padStart(5),
    String(r.duplicates).padStart(5),
    `${r.questionsWritten}/${r.problemsWithNumbers}`.padStart(9),
    String(r.spokenUnwritten).padStart(6),
    `${r.desmosCalls}/${r.pictureCalls}`.padStart(6),
    String(r.errors).padStart(6),
  ].join(" ");
  for (const r of rows) console.log(line(r));
  console.log(line(total));
  const t = total;
  console.log(`\nboard-use ${pct(t.board, t.turns)} · pointing ${pct(t.pointed, t.turns)} · tools/turn ${(t.tools / Math.max(1, t.turns)).toFixed(2)} · errors ${t.errors}`);
  console.log(`picture turns ${pct(t.pictures, t.turns)} · text-only turns ${t.textOnly} · phantom board claims ${t.phantom}`);
  console.log(`answers checked ${pct(t.checked, t.answers)} (${t.checked}/${t.answers}) · correct answers marked ${pct(t.marked, t.correct)} (${t.marked}/${t.correct})`);
  console.log(`attempts written ${t.attempts}, on a non-answer or in the tutor's words ${t.badAttempts} · pipes in text ${t.pipes} · duplicates ${t.duplicates}`);
  console.log(`new problems with numbers written ${pct(t.questionsWritten, t.problemsWithNumbers)} (${t.questionsWritten}/${t.problemsWithNumbers}) · turns with spoken math and nothing written ${t.spokenUnwritten}`);
  console.log(`Desmos share of pictures ${pct(t.desmosCalls, t.pictureCalls)} (${t.desmosCalls}/${t.pictureCalls})`);
  const never = DECLARED.filter((n) => !used.has(n));
  console.log(`tools never called in this run (${never.length}/${DECLARED.length}): ${never.join(", ")}`);

  const out = arg("out", "");
  if (out) {
    fs.writeFileSync(out, JSON.stringify({ model, set: setName, turns, runs, date: new Date().toISOString(), rows, total, never, transcripts }, null, 2));
    console.log(`wrote ${out}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
