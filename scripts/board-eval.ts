// Offline board-use eval: runs scripted student conversations through a
// Gemini text model with the real tutor prompt and the real tool
// declarations, executes the tools against a fake board, and scores how the
// tutor uses the board. No audio, no Live session, a few cents per run.
//
//   npx tsx scripts/board-eval.ts [--model gemini-3.5-flash] [--scenario fractions] [--turns 6] [--verbose] [--runs 1]

import fs from "node:fs";
import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import { buildGeminiInstructions, type StudentProfile } from "../lib/tutor-prompts";
import { WHITEBOARD_TOOL_DECLARATIONS } from "../lib/whiteboard-tools";
import { dispatchWhiteboardTool } from "../lib/whiteboard-tool-dispatch";
import { formatBoardItems, isHeadingItem, itemLabelFrom, resolveItemTarget, type BoardItem } from "../lib/board-items";
import type { WhiteboardHandle, ItemToken } from "../components/TldrawCore";

type Scenario = { name: string; student: string[]; profile?: Partial<StudentProfile> };

const SCENARIOS: Scenario[] = [
  {
    name: "fractions",
    student: [
      "I don't get fractions at all.",
      "um, a half?",
      "I don't know",
      "two pieces?",
      "okay",
      "so two quarters is the same as one half?",
    ],
  },
  {
    name: "algebra",
    student: [
      "can you help me with 2x + 3 = 11",
      "subtract 3?",
      "so x = 16?",
      "oh wait, divide by 2. x = 4",
      "can I try another one",
      "3x - 5 = 7, so x is 4",
    ],
  },
  {
    name: "geometry",
    student: [
      "what's the area of a triangle",
      "base times height?",
      "why do you divide by 2",
      "ok I think I get it",
      "what if it's not a right triangle",
      "makes sense",
    ],
  },
  {
    name: "negatives",
    student: [
      "why is negative 3 minus negative 5 equal to 2",
      "I thought two negatives make a plus",
      "so it's like adding 5?",
      "ok",
      "what about negative 3 plus negative 5",
      "negative 8",
    ],
  },
  {
    name: "word-problem",
    student: [
      "Sam has 12 apples and gives away a quarter of them. how many are left",
      "3?",
      "oh, 9",
      "yes",
      "what if he gave away a third",
      "8",
    ],
  },
];

const DRAW_TOOLS = new Set(WHITEBOARD_TOOL_DECLARATIONS.map((d) => d.name).filter((n) =>
  !["point_at", "circle_item", "erase_items", "erase_older", "look_at_board", "clear_whiteboard", "remember_about_student", "highlight_step", "cross_out_step"].includes(n)));
const NON_CREATING = new Set(["point_at", "erase_items", "erase_older", "look_at_board", "clear_whiteboard", "remember_about_student", "highlight_step", "cross_out_step"]);

// A board that remembers items and titles but draws nothing.
function fakeBoard(): { handle: WhiteboardHandle; items: () => BoardItem[] } {
  let items: BoardItem[] = [];
  let title: string | undefined;
  let seq = 0;
  const base: Partial<WhiteboardHandle> = {
    beginItem: (tool: string): ItemToken => ({ tool, shapes: new Set(), eqs: new Set() }),
    endItem: (token: ItemToken, label: string | null) => {
      if (NON_CREATING.has(token.tool)) return null;
      if (token.tool === "circle_item" && !/orange/.test(label ?? "")) return null;
      const id = `b${++seq}`;
      items = [...items, { id, tool: token.tool, label: itemLabelFrom(label, token.tool), shapeIds: [`shape:${id}`], eqItemIds: [], owner: token.tool === "add_student_attempt" ? "student" : "tutor", createdAt: Date.now() }];
      return id;
    },
    getBoardSummary: () => formatBoardItems(items, title),
    startNewProblem: (t: string) => { items = []; title = t; },
    clearWhiteboard: () => { items = []; title = undefined; },
    withDirectMeta: (_meta, fn) => fn(),
    pointAt: (target: string) => resolveItemTarget(items, target),
    circleItem: (target: string) => resolveItemTarget(items, target),
    eraseItems: (targets: string[]) => {
      const gone: string[] = [];
      for (const t of targets) {
        const item = resolveItemTarget(items, t);
        if (item) { gone.push(item.label); items = items.filter((i) => i.id !== item.id); }
      }
      return gone;
    },
    eraseOlder: (keep: number) => {
      const body = items.filter((i) => !isHeadingItem(i));
      const victims = body.slice(0, Math.max(0, body.length - keep));
      items = items.filter((i) => !victims.includes(i));
      return victims.map((v) => v.label);
    },
    highlightStep: () => true,
    crossOutStep: () => true,
    exportImage: async () => null,
  };
  const handle = new Proxy(base as WhiteboardHandle, {
    get(target, prop) {
      if (prop in target) return (target as unknown as Record<string | symbol, unknown>)[prop];
      return () => undefined;
    },
  });
  return { handle, items: () => items };
}

// The free tier allows a handful of requests a minute: wait out 429s.
async function withRetry<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = /429|RESOURCE_EXHAUSTED/.test(msg);
      if (!is429 || i >= attempts - 1) throw err;
      const m = /retry in ([\d.]+)s/i.exec(msg);
      const wait = Math.min(90_000, Math.ceil((m ? Number(m[1]) : 20 * (i + 1)) * 1000) + 1500);
      process.stdout.write(`    (rate limited, waiting ${Math.round(wait / 1000)}s)\n`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

type TurnStats = { student: string; tutor: string; tools: string[]; errors: string[]; boardUsed: boolean; pointed: boolean; erased: boolean; asked: boolean };

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const verbose = process.argv.includes("--verbose");

async function runScenario(ai: GoogleGenAI, model: string, scenario: Scenario, turns: number): Promise<TurnStats[]> {
  const profile: StudentProfile = { displayName: "Sam", gradeLevel: "6th grade", learningPrefs: {}, ...(scenario.profile ?? {}) };
  const systemInstruction = buildGeminiInstructions(profile, []);
  const board = fakeBoard();
  const contents: Content[] = [];
  const stats: TurnStats[] = [];
  const tools = [{ functionDeclarations: WHITEBOARD_TOOL_DECLARATIONS as unknown as FunctionDeclaration[] }];
  for (const line of scenario.student.slice(0, turns)) {
    contents.push({ role: "user", parts: [{ text: line }] });
    await new Promise((r) => setTimeout(r, Number(arg("pace", "0"))));
    const turn: TurnStats = { student: line, tutor: "", tools: [], errors: [], boardUsed: false, pointed: false, erased: false, asked: false };
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
      const text = parts.map((p) => p.text ?? "").join(" ").trim();
      if (text) turn.tutor += (turn.tutor ? " " : "") + text;
      if (calls.length === 0) break;
      const responses: Part[] = [];
      for (const part of calls) {
        const name = part.functionCall?.name ?? "";
        const args = (part.functionCall?.args ?? {}) as Record<string, unknown>;
        turn.tools.push(name);
        let message: string;
        if (name === "remember_about_student") {
          message = "Noted.";
        } else {
          const result = dispatchWhiteboardTool(name, args, { whiteboard: board.handle });
          if (result.success) {
            message = `${result.message ?? "Done"}.\n[Board: ${board.handle.getBoardSummary()}]`;
          } else {
            message = `Error: ${result.error}`;
            turn.errors.push(`${name}: ${result.error}`);
          }
        }
        if (verbose) console.log(`    ↳ ${name}(${JSON.stringify(args).slice(0, 140)}) → ${message.split("\n")[0].slice(0, 120)}`);
        responses.push({ functionResponse: { name, response: { result: message } } });
      }
      contents.push({ role: "user", parts: responses });
    }
    turn.boardUsed = turn.tools.some((t) => DRAW_TOOLS.has(t));
    turn.pointed = turn.tools.some((t) => t === "point_at" || t === "circle_item" || t === "highlight_step");
    turn.erased = turn.tools.some((t) => t.startsWith("erase"));
    turn.asked = /\?/.test(turn.tutor);
    stats.push(turn);
    if (verbose) console.log(`  student: ${line}\n  tutor:   ${turn.tutor.slice(0, 300)}\n  tools:   ${turn.tools.join(", ") || "(none)"}${turn.errors.length ? `\n  errors:  ${turn.errors.join(" | ")}` : ""}\n`);
  }
  if (verbose) console.log(`  board at end: ${board.handle.getBoardSummary()}\n`);
  return stats;
}

async function main() {
  const env = fs.readFileSync(".env.local", "utf8");
  const key = env.split("\n").find((l) => l.startsWith("GEMINI_API_KEY="))?.slice("GEMINI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("GEMINI_API_KEY missing in .env.local");
  const ai = new GoogleGenAI({ apiKey: key });
  const model = arg("model", "gemini-3.5-flash");
  const only = arg("scenario", "");
  const turns = Number(arg("turns", "6"));
  const runs = Number(arg("runs", "1"));
  const scenarios = SCENARIOS.filter((s) => !only || s.name === only);
  const rows: Array<{ name: string; turns: number; board: number; pointed: number; erased: number; asked: number; askedWithBoard: number; tools: number; errors: number }> = [];
  for (const scenario of scenarios) {
    for (let r = 0; r < runs; r++) {
      if (verbose) console.log(`\n=== ${scenario.name} (${model}) run ${r + 1}`);
      const stats = await runScenario(ai, model, scenario, turns);
      rows.push({
        name: scenario.name,
        turns: stats.length,
        board: stats.filter((t) => t.boardUsed).length,
        pointed: stats.filter((t) => t.pointed).length,
        erased: stats.filter((t) => t.erased).length,
        asked: stats.filter((t) => t.asked).length,
        askedWithBoard: stats.filter((t) => t.asked && (t.boardUsed || t.pointed)).length,
        tools: stats.reduce((s, t) => s + t.tools.length, 0),
        errors: stats.reduce((s, t) => s + t.errors.length, 0),
      });
    }
  }
  const total = rows.reduce((a, r) => ({ turns: a.turns + r.turns, board: a.board + r.board, pointed: a.pointed + r.pointed, erased: a.erased + r.erased, asked: a.asked + r.asked, askedWithBoard: a.askedWithBoard + r.askedWithBoard, tools: a.tools + r.tools, errors: a.errors + r.errors }), { turns: 0, board: 0, pointed: 0, erased: 0, asked: 0, askedWithBoard: 0, tools: 0, errors: 0 });
  console.log(`\nmodel ${model}`);
  console.log("scenario      turns  board  pointed  erased  asked  asked+board  tools  errors");
  for (const r of rows) console.log(`${r.name.padEnd(13)} ${String(r.turns).padStart(5)} ${String(r.board).padStart(6)} ${String(r.pointed).padStart(8)} ${String(r.erased).padStart(7)} ${String(r.asked).padStart(6)} ${String(r.askedWithBoard).padStart(12)} ${String(r.tools).padStart(6)} ${String(r.errors).padStart(7)}`);
  console.log(`${"TOTAL".padEnd(13)} ${String(total.turns).padStart(5)} ${String(total.board).padStart(6)} ${String(total.pointed).padStart(8)} ${String(total.erased).padStart(7)} ${String(total.asked).padStart(6)} ${String(total.askedWithBoard).padStart(12)} ${String(total.tools).padStart(6)} ${String(total.errors).padStart(7)}`);
  console.log(`board-use rate ${(100 * total.board / Math.max(1, total.turns)).toFixed(0)}%  pointing rate ${(100 * total.pointed / Math.max(1, total.turns)).toFixed(0)}%  tools/turn ${(total.tools / Math.max(1, total.turns)).toFixed(2)}  errors ${total.errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
