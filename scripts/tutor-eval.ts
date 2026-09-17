// Offline teaching eval. Simulated students, each with a persona and (where it
// matters) a wrong idea that holds until the tutor earns the change, talk to the
// real tutor prompt, tools, and dispatcher on a fake board. A judge model then
// grades every tutor turn on teaching, not drawing: did it notice the mistake,
// confirm a wrong answer, give the answer away, praise generically, end on
// something for the student to do, and pitch the amount of help right.
//
//   npx tsx scripts/tutor-eval.ts [--persona misconception,anxious] [--turns 6]
//     [--tutor gemini-3.5-flash] [--student gemini-3.5-flash-lite]
//     [--judge gemini-3.1-pro-preview] [--runs 1] [--label baseline]
//     [--out path.json] [--verbose] [--prompt path/to/other/tutor-prompts.ts]
//
// --prompt loads buildGeminiInstructions from another copy of the prompt file,
// so an old version can be compared with the current one:
//   git show HEAD:lib/tutor-prompts.ts > /tmp/old/tutor-prompts.ts
//
// Roughly 20–30 model calls per persona per run. Text only: no audio, no Live
// session. scripts/board-eval.ts still measures board use.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import type { StudentProfile } from "../lib/tutor-prompts";
import { WHITEBOARD_TOOL_DECLARATIONS } from "../lib/whiteboard-tools";
import { createPolicy, noteStudentUtterance, type TutorPolicy } from "../lib/tutor-policy";
import { createFakeBoard, NON_CREATING_TOOLS, type FakeBoard } from "./eval-board";
import { EVAL_TOOL_DECLARATIONS, arg, readGeminiKey, runEvalTool, withRetry } from "./eval-tools";

// ── Personas ───────────────────────────────────────────────────────────────

type Persona = {
  id: string;
  grade: string;
  opening: string;
  brief: string; // hidden from the tutor
  outcome: string; // what a good session reaches, for the judge
};

const PERSONAS: Persona[] = [
  {
    id: "misconception",
    grade: "6th grade",
    opening: "can you help me add 1/2 and 1/3",
    brief:
      "You believe you add fractions by adding the tops and adding the bottoms, so 1/2 + 1/3 = 2/5, and you say that answer early. Keep this belief. Only give it up if the tutor leads you to notice a contradiction yourself (for example comparing sizes, or a picture where 2/5 is smaller than 1/2). If the tutor only tells you it is wrong or tells you the rule, say something like \"oh ok\" and make the same kind of mistake on the next fraction problem. Once you really see why, you can follow along.",
    outcome: "The student explains in their own words why the pieces must be the same size (a common denominator) and adds 1/2 + 1/3 correctly.",
  },
  {
    id: "careless",
    grade: "8th grade",
    opening: "we're doing equations like 3x + 7 = 22",
    brief:
      "You understand solving two-step equations well. About half the time you make an arithmetic slip (for example 22 - 7 = 16, or 15 / 3 = 6). If the tutor points you to the line with the slip, you find and fix it yourself. Long explanations of the method annoy you because you already know it.",
    outcome: "The student fixes their own arithmetic slips after being pointed at them, and the tutor does not re-teach the method they already know.",
  },
  {
    id: "answer-seeker",
    grade: "7th grade",
    opening: "whats the answer to 4(x - 2) = 20. i have 15 of these due tomorrow",
    brief:
      "You are tired and want answers. Push for the answer two or three times (\"just tell me\", \"can you just do it\"). You are capable of solving it. If the tutor offers a fast, fair path (for example quickly working a similar problem and then letting you try yours) you go along with it. If the tutor only keeps asking you questions, you get more annoyed and shorter.",
    outcome: "The student solves 4(x - 2) = 20 themselves (x = 7), and the tutor never states x = 7 before the student does.",
  },
  {
    id: "anxious",
    grade: "6th grade",
    opening: "we have a test on percents friday and im really bad at math",
    brief:
      "You have math anxiety. Give short, hesitant answers, say \"I don't know\" when unsure, and second-guess yourself (\"is it 20? probably wrong\"). You are actually right fairly often. Generic praise (\"great job!\") does not convince you. Specific feedback about what you did, and small wins, make you relax and say a bit more.",
    outcome: "The student works out a percent of an amount (like 25% of 80) with growing confidence and says what they did.",
  },
  {
    id: "bored-advanced",
    grade: "7th grade",
    opening: "we're doing negative numbers i guess. whatever",
    brief:
      "You already know integer rules well. Answer correctly and fast with very few words (\"8\", \"easy\", \"-12\"). If the tutor keeps giving you easy problems or explaining things you know, get curt (\"yeah\", \"can we be done\"). If the tutor gives you something genuinely harder or more interesting, you engage and say more.",
    outcome: "The tutor notices the student is ahead and raises the difficulty within the first few turns instead of re-teaching basics.",
  },
  {
    id: "novice",
    grade: "8th grade",
    opening: "what even is slope. we started it today and i was lost the whole time",
    brief:
      "You have never understood slope. You cannot answer abstract questions about it and say \"I don't know\" when asked something you have not been shown how to think about. A clear example with a picture helps a lot, and after one you can do a similar one with a little help.",
    outcome: "After seeing an example, the student finds the slope of a simple line or between two points themselves.",
  },
  {
    id: "idk",
    grade: "6th grade",
    opening: "for every 3 cats there are 5 dogs and there are 40 animals. how many dogs",
    brief:
      "Answer \"I don't know\" or \"idk\" to the first two questions the tutor asks. After that, respond normally when a question is made smaller or you are given choices; if the tutor just repeats the same big question, keep saying you don't know.",
    outcome: "The student reaches 25 dogs with the tutor breaking the problem into smaller steps rather than giving the answer.",
  },
];

// ── Board tools (the fake board and the tool runner are shared) ────────────

const DRAW_TOOLS = new Set(WHITEBOARD_TOOL_DECLARATIONS.map((d) => d.name as string).filter((n) => !NON_CREATING_TOOLS.has(n)));

// ── Model plumbing ─────────────────────────────────────────────────────────

const usage = { calls: 0, prompt: 0, output: 0, thoughts: 0 };

type GenArgs = Parameters<GoogleGenAI["models"]["generateContent"]>[0];

async function generate(ai: GoogleGenAI, args: GenArgs) {
  const res = await withRetry(() => ai.models.generateContent(args));
  usage.calls += 1;
  usage.prompt += res.usageMetadata?.promptTokenCount ?? 0;
  usage.output += res.usageMetadata?.candidatesTokenCount ?? 0;
  usage.thoughts += res.usageMetadata?.thoughtsTokenCount ?? 0;
  return res;
}

function visibleText(parts: Part[] | undefined): string {
  return (parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join(" ").replace(/\s+/g, " ").trim();
}

const verbose = process.argv.includes("--verbose");

// ── One tutor turn ─────────────────────────────────────────────────────────

type ToolLog = { name: string; args: Record<string, unknown>; ok: boolean };
type Turn = { student: string; tutor: string; tools: ToolLog[]; board: string };

const TOOLS = [{ functionDeclarations: EVAL_TOOL_DECLARATIONS }];

async function tutorTurn(ai: GoogleGenAI, model: string, systemInstruction: string, contents: Content[], board: FakeBoard, policy: TutorPolicy, student: string): Promise<Turn> {
  contents.push({ role: "user", parts: [{ text: student }] });
  noteStudentUtterance(policy, student);
  const turn: Turn = { student, tutor: "", tools: [], board: "" };
  for (let round = 0; round < 6; round++) {
    const res = await generate(ai, { model, contents, config: { systemInstruction, tools: TOOLS, temperature: 0.8, maxOutputTokens: 4096 } });
    const content = res.candidates?.[0]?.content;
    if (!content?.parts?.length) break;
    contents.push({ role: "model", parts: content.parts });
    const text = visibleText(content.parts);
    if (text) turn.tutor += (turn.tutor ? " " : "") + text;
    const calls = content.parts.filter((p) => p.functionCall);
    if (calls.length === 0) break;
    const responses: Part[] = [];
    for (const part of calls) {
      const name = part.functionCall?.name ?? "";
      const args = (part.functionCall?.args ?? {}) as Record<string, unknown>;
      // Same shape as the app: board result, board summary, then any changed [Tutor state].
      const result = runEvalTool(name, args, { board, policy });
      turn.tools.push({ name, args, ok: result.ok });
      responses.push({ functionResponse: { id: part.functionCall?.id, name, response: { result: result.message } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  turn.board = board.handle.getBoardSummary();
  return turn;
}

// ── The simulated student ──────────────────────────────────────────────────

function studentSystem(p: Persona): string {
  return `You are role-playing a real ${p.grade} student in a live, spoken math tutoring session with an AI tutor who also writes on a shared whiteboard.

Who you are: ${p.brief}

How to talk: say only what the student says out loud next. Short and natural, like a kid talking, usually under 20 words. No narration, no stage directions, no quotation marks, no "Student:" label. Stay in character the whole time and never mention being simulated or an AI.

Important: do not become better at math than your brief says. If your brief gives you a wrong belief or a habit, keep acting on it until the brief says you would drop it. A tutor simply telling you that you are wrong is not enough.`;
}

async function studentLine(ai: GoogleGenAI, model: string, p: Persona, history: Turn[]): Promise<string> {
  const transcript = history.map((t) => `You: ${t.student}\nTutor: ${t.tutor || "(said nothing)"}`).join("\n");
  const board = history.at(-1)?.board ?? "";
  const prompt = `${transcript}\n\nThe whiteboard now shows: ${board || "nothing yet"}\n\nWhat do you say next? Only your words.`;
  const res = await generate(ai, { model, contents: [{ role: "user", parts: [{ text: prompt }] }], config: { systemInstruction: studentSystem(p), temperature: 0.7, maxOutputTokens: 1024 } });
  const text = visibleText(res.candidates?.[0]?.content?.parts).replace(/^(student|you)\s*:\s*/i, "").replace(/^["“]|["”]$/g, "").trim();
  return text || "ok";
}

// ── The judge ──────────────────────────────────────────────────────────────

type Verdict = {
  turn: number;
  student_move: string;
  mistake_identified: "yes" | "no" | "na";
  confirmed_wrong: boolean;
  answer_leaked: boolean;
  targeted: "yes" | "no" | "na";
  ends_with_student_action: boolean;
  generic_praise: boolean;
  help_fit: "yes" | "no";
  reason: string;
};
type Judgement = { turns: Verdict[]; outcome_met: boolean; outcome_reason: string };

const JUDGE_SYSTEM = `You train math tutors. You grade transcripts of an AI math tutor working with a simulated student, turn by turn, against research on effective tutoring. The tutor speaks aloud and also uses whiteboard tools; each turn lists its tool calls. Grade the TUTOR, never the student.

For each numbered turn (the student's message and the tutor's reply to it) return:
- student_move: one of "correct_confident", "correct_unsure", "slip" (right method, arithmetic or copying error), "misconception" (acting on a wrong idea), "partial" (right idea, incomplete or partly wrong), "idk_or_guess", "asks_for_answer", "frustrated", "bored_or_curt", "new_problem_or_question", "other".
- mistake_identified: "na" unless the student's message contains a mathematical error. Otherwise "yes" if the tutor's reply shows it noticed that error (saying so, pointing at it, or questioning exactly that step), else "no".
- confirmed_wrong: true if the tutor treated a mathematically incorrect student answer or claim as correct ("yes", "exactly", "right", or building on it as if true).
- answer_leaked: true if the tutor stated the final answer to the problem the student is working on before the student produced it, or laid out that problem's full solution. Fully working a DIFFERENT parallel problem is not a leak. Confirming an answer the student already gave is not a leak.
- targeted: "na" unless the student erred or was stuck. "yes" if the reply aims at the specific cause (the actual wrong idea, the actual wrong step, the actual missing piece); "no" if it is generic ("try again", "not quite", repeating the same question, re-explaining everything).
- ends_with_student_action: true if the reply ends by giving the student something concrete to do: try a step, check a line, explain a reason, choose between options, or answer a specific question. "Does that make sense?", "okay?" or no prompt is false.
- generic_praise: true if the reply praises without naming what the student did ("great job", "exactly!", "awesome", "nicely done", "you're so smart").
- help_fit: "yes" if the amount of help suits this student at this moment: a worked example or a shown step for a stuck novice; a light nudge or pointing for a slip; a harder problem for a bored student who gets everything right; a fair fast path for a tired student who wants answers; not re-teaching what the student already knows; not a string of questions to a student who has said they don't know. Otherwise "no".
- reason: one short sentence naming the most important problem in the reply, or "fine".

Then return outcome_met (true or false) and outcome_reason: did the session reach the success condition given for this student.

Be strict and consistent, and judge only what is in the transcript. Return JSON only, exactly this shape:
{"turns":[{"turn":1,"student_move":"...","mistake_identified":"na","confirmed_wrong":false,"answer_leaked":false,"targeted":"na","ends_with_student_action":true,"generic_praise":false,"help_fit":"yes","reason":"fine"}],"outcome_met":false,"outcome_reason":"..."}`;

function describeTools(tools: ToolLog[]): string {
  if (tools.length === 0) return "(none)";
  return tools.map((t) => `${t.name}(${JSON.stringify(t.args).slice(0, 160)})${t.ok ? "" : " [error]"}`).join("; ");
}

async function judge(ai: GoogleGenAI, model: string, p: Persona, turns: Turn[]): Promise<Judgement | null> {
  const transcript = turns.map((t, i) => `Turn ${i + 1}\nStudent: ${t.student}\nTutor tools: ${describeTools(t.tools)}\nTutor said: ${t.tutor || "(nothing)"}`).join("\n\n");
  const prompt = `The student (${p.grade}). Their hidden brief, which the tutor could not see: ${p.brief}\n\nSuccess condition: ${p.outcome}\n\nTranscript:\n\n${transcript}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generate(ai, { model, contents: [{ role: "user", parts: [{ text: prompt }] }], config: { systemInstruction: JUDGE_SYSTEM, temperature: 0.2, maxOutputTokens: 16000, responseMimeType: "application/json" } });
    const raw = visibleText(res.candidates?.[0]?.content?.parts).replace(/^```(?:json)?\s*|\s*```$/g, "");
    try {
      const parsed = JSON.parse(raw) as Judgement;
      if (Array.isArray(parsed.turns)) return parsed;
    } catch {
      // retry once
    }
  }
  return null;
}

// ── Scoring ────────────────────────────────────────────────────────────────

type Row = {
  persona: string;
  turns: number;
  errTurns: number;
  identified: number;
  confirmedWrong: number;
  leaked: number;
  targetedN: number;
  targeted: number;
  action: number;
  praise: number;
  fit: number;
  multiQ: number;
  words: number;
  board: number;
  toolErrors: number;
  outcome: boolean | null;
};

function score(persona: string, turns: Turn[], j: Judgement | null): Row {
  const v = j?.turns ?? [];
  return {
    persona,
    turns: turns.length,
    errTurns: v.filter((x) => x.mistake_identified !== "na").length,
    identified: v.filter((x) => x.mistake_identified === "yes").length,
    confirmedWrong: v.filter((x) => x.confirmed_wrong).length,
    leaked: v.filter((x) => x.answer_leaked).length,
    targetedN: v.filter((x) => x.targeted !== "na").length,
    targeted: v.filter((x) => x.targeted === "yes").length,
    action: v.filter((x) => x.ends_with_student_action).length,
    praise: v.filter((x) => x.generic_praise).length,
    fit: v.filter((x) => x.help_fit === "yes").length,
    multiQ: turns.filter((t) => (t.tutor.match(/\?/g) ?? []).length > 1).length,
    words: turns.reduce((s, t) => s + (t.tutor ? t.tutor.split(/\s+/).length : 0), 0),
    board: turns.filter((t) => t.tools.some((x) => DRAW_TOOLS.has(x.name))).length,
    toolErrors: turns.reduce((s, t) => s + t.tools.filter((x) => !x.ok).length, 0),
    outcome: j ? j.outcome_met : null,
  };
}

const pct = (n: number, d: number) => (d === 0 ? "  –" : `${Math.round((100 * n) / d)}%`.padStart(4));

function printTable(rows: Row[]) {
  const head = ["persona".padEnd(15), "turns", "caught", "wrong✓", "leaked", "target", "action", "praise", "fit", ">1 q", "words", "board", "outcome"];
  console.log(head.join("  "));
  const line = (r: Row) => [
    r.persona.padEnd(15),
    String(r.turns).padStart(5),
    pct(r.identified, r.errTurns).padStart(6),
    String(r.confirmedWrong).padStart(6),
    pct(r.leaked, r.turns).padStart(6),
    pct(r.targeted, r.targetedN).padStart(6),
    pct(r.action, r.turns).padStart(6),
    pct(r.praise, r.turns).padStart(6),
    pct(r.fit, r.turns).padStart(4),
    pct(r.multiQ, r.turns).padStart(4),
    String(r.turns ? Math.round(r.words / r.turns) : 0).padStart(5),
    pct(r.board, r.turns).padStart(5),
    r.outcome === null ? "  ?" : r.outcome ? "  met" : "  missed",
  ].join("  ");
  for (const r of rows) console.log(line(r));
  const t = rows.reduce<Row>((a, r) => ({
    persona: "TOTAL", turns: a.turns + r.turns, errTurns: a.errTurns + r.errTurns, identified: a.identified + r.identified,
    confirmedWrong: a.confirmedWrong + r.confirmedWrong, leaked: a.leaked + r.leaked, targetedN: a.targetedN + r.targetedN,
    targeted: a.targeted + r.targeted, action: a.action + r.action, praise: a.praise + r.praise, fit: a.fit + r.fit,
    multiQ: a.multiQ + r.multiQ, words: a.words + r.words, board: a.board + r.board, toolErrors: a.toolErrors + r.toolErrors,
    outcome: null,
  }), { persona: "TOTAL", turns: 0, errTurns: 0, identified: 0, confirmedWrong: 0, leaked: 0, targetedN: 0, targeted: 0, action: 0, praise: 0, fit: 0, multiQ: 0, words: 0, board: 0, toolErrors: 0, outcome: null });
  const met = rows.filter((r) => r.outcome).length;
  console.log(line(t).replace(/\s+\?$/, `  ${met}/${rows.length}`));
  console.log("\ncaught = mistakes noticed · wrong✓ = wrong answers confirmed · leaked = answer given away · target = remediation aimed at the cause");
  console.log("action = ends with something to do · praise = generic praise · fit = help level suited the moment · >1 q = turns with 2+ questions");
  console.log(`tool errors ${t.toolErrors}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const ai = new GoogleGenAI({ apiKey: readGeminiKey() });

  const tutorModel = arg("tutor", "gemini-3.5-flash");
  const studentModel = arg("student", "gemini-3.5-flash-lite");
  const judgeModel = arg("judge", "gemini-3.8-flash");
  const turnsPer = Number(arg("turns", "6"));
  const runs = Number(arg("runs", "1"));
  const label = arg("label", "run");
  const only = arg("persona", "").split(",").map((s) => s.trim()).filter(Boolean);
  const personas = PERSONAS.filter((p) => only.length === 0 || only.includes(p.id));
  if (personas.length === 0) throw new Error(`No persona matches ${only.join(",")}. Options: ${PERSONAS.map((p) => p.id).join(", ")}`);

  const promptArg = arg("prompt", "");
  const prompts = (await import(promptArg ? pathToFileURL(path.resolve(promptArg)).href : "../lib/tutor-prompts")) as typeof import("../lib/tutor-prompts");
  const promptName = promptArg || "lib/tutor-prompts.ts";

  const rows: Row[] = [];
  const log: unknown[] = [];
  const toolUse = { turns: 0, check: 0, worksheet: 0 };
  for (const p of personas) {
    for (let r = 0; r < runs; r++) {
      console.log(`\n=== ${p.id} (${p.grade}) run ${r + 1}/${runs}`);
      const profile: StudentProfile = { displayName: "Sam", gradeLevel: p.grade, learningPrefs: {} };
      const systemInstruction = prompts.buildGeminiInstructions(profile, []);
      const board = createFakeBoard();
      const policy = createPolicy(Date.now());
      const contents: Content[] = [];
      const turns: Turn[] = [];
      let say = p.opening;
      for (let i = 0; i < turnsPer; i++) {
        const turn = await tutorTurn(ai, tutorModel, systemInstruction, contents, board, policy, say);
        turns.push(turn);
        if (verbose) console.log(`  student: ${turn.student}\n  tutor:   ${turn.tutor}\n  tools:   ${turn.tools.map((t) => t.name).join(", ") || "(none)"}\n`);
        if (i < turnsPer - 1) say = await studentLine(ai, studentModel, p, turns);
      }
      // A judge outage (503s for minutes) must not throw away the tutor's turns.
      let verdict: Judgement | null = null;
      try {
        verdict = await judge(ai, judgeModel, p, turns);
        if (!verdict) console.log("  (judge returned no parseable verdict)");
      } catch (err) {
        console.log(`  (judge unavailable: ${err instanceof Error ? err.message.slice(0, 160) : String(err)})`);
      }
      if (verbose && verdict) {
        for (const v of verdict.turns) if (v.reason && v.reason !== "fine") console.log(`  turn ${v.turn}: ${v.reason}`);
        console.log(`  outcome: ${verdict.outcome_met ? "met" : "missed"} — ${verdict.outcome_reason}`);
      }
      rows.push(score(p.id, turns, verdict));
      toolUse.turns += turns.length;
      toolUse.check += turns.filter((t) => t.tools.some((x) => x.name === "check_answer")).length;
      toolUse.worksheet += turns.filter((t) => t.tools.some((x) => x.name === "look_at_worksheet")).length;
      log.push({ persona: p.id, run: r + 1, turns, verdict });
    }
  }

  console.log(`\n${label}: prompt ${promptName} · tutor ${tutorModel} · student ${studentModel} · judge ${judgeModel} · ${turnsPer} turns`);
  printTable(rows);
  // check_answer records the attempt too (record_attempt was merged into it on Sept 16 2026).
  console.log(`check_answer in ${toolUse.check} of ${toolUse.turns} tutor turns · look_at_worksheet in ${toolUse.worksheet}`);
  console.log(`model calls ${usage.calls} · tokens in ${usage.prompt.toLocaleString()} · out ${usage.output.toLocaleString()} · thinking ${usage.thoughts.toLocaleString()}`);

  const out = arg("out", "");
  if (out) {
    fs.writeFileSync(out, JSON.stringify({ label, prompt: promptName, date: new Date().toISOString(), tutorModel, studentModel, judgeModel, turnsPer, rows, log, usage }, null, 2));
    console.log(`wrote ${out}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
