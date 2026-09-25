// The judge for the tutor benchmark (scripts/bench.ts): one model call per
// case over the transcript, the tool log, the board lists and the pictures.
//
// It grades with the frameworks the cases were built from: Bridge's expert
// decision (what was the student's error, what strategy, what intention) and
// MathDial's move taxonomy (focus / probing / telling / generic; a good
// teacher resolves most confusions with focus and probing moves, and reveals
// the answer in under a fifth of conversations, where ChatGPT told in a
// third). The board is graded as a tutor's board on a video call: did it
// draw the thing the math is about, did each step go up as it was said, is
// it readable, and does what was said match what is there.
import fs from "node:fs";
import path from "node:path";
import type { BenchCase } from "./bench-cases";
import type { CaseRun } from "./bench-metrics";

export type TurnVerdict = {
  turn: number;
  move: "focus" | "probing" | "telling" | "generic";
  student_move: string;
  mistake_identified: "yes" | "no" | "na";
  confirmed_wrong: boolean;
  answer_leaked: boolean;
  targeted: "yes" | "no" | "na";
  ends_with_student_action: boolean;
  generic_praise: boolean;
  help_fit: "yes" | "no";
  board_fit: "yes" | "no" | "na";
  board_note: string;
  reason: string;
};

export type Scores = {
  diagnosis: number;
  remediation: number;
  pacing: number;
  voice: number;
  board_object: number;
  board_steps: number;
  board_clean: number;
  board_matches_speech: number;
};

export type Judgement = {
  turns: TurnVerdict[];
  scores: Scores;
  checks: Array<{ check: string; met: boolean; note: string }>;
  outcome_met: boolean;
  outcome_reason: string;
  student_realistic: boolean;
  student_note: string;
  best: string;
  worst: string;
  human_tutor_would: string;
};

export const SCORE_KEYS: Array<keyof Scores> = ["diagnosis", "remediation", "pacing", "voice", "board_object", "board_steps", "board_clean", "board_matches_speech"];

const SYSTEM = `You train math tutors, and you are grading one recorded session of an AI voice tutor with a simulated student. The tutor speaks aloud and draws on a shared whiteboard with tools; you get the transcript, every tool call with its arguments and result, what the board listed after each turn, and pictures of the board. Be strict, specific and consistent; judge only what is in the record. Ignore the tutor's tone unless it changes what the student can do.

FOR EACH TURN (the student's line and the tutor's reply to it), return:
- move: the tutor's main move, as in MathDial. "focus" = steers the student's own thinking (asks for their strategy, points at a step, asks for an explanation, asks them to self-correct, changes the question a little); "probing" = asks for a fact or a piece of background; "telling" = reveals a step, the strategy, or the answer; "generic" = greeting, chat, or a question that does no teaching work ("does that make sense?").
- student_move: "correct_confident", "correct_unsure", "slip", "misconception", "partial", "idk_or_guess", "asks_for_answer", "frustrated", "bored", "question", "chat" or "none".
- mistake_identified: "na" unless the student's line holds a mathematical error; else "yes" if the reply shows the tutor saw THAT error (named it, pointed at it, asked about exactly that step), else "no".
- confirmed_wrong: true if the tutor treated a wrong answer or claim as right.
- answer_leaked: true if the tutor stated the final answer to the student's current problem before the student did, or laid out its full solution. A fully worked DIFFERENT problem is not a leak. Confirming what the student just said is not a leak.
- targeted: "na" unless the student erred or was stuck; "yes" if the reply goes at the specific cause (this wrong idea, this step, this missing piece), "no" if it is generic ("try again", "not quite", the same question again, re-explaining everything).
- ends_with_student_action: true if the reply ends by giving the student one concrete thing to do (a step, a check, a reason, a choice, a specific question). "Does that make sense?" or nothing is false.
- generic_praise: true if it praises without naming what was good ("great job", "exactly!", "perfect").
- help_fit: "yes" if the amount of help suits this student now (a shown step for a stuck novice, a light point for a slip, a harder task for someone cruising, a fair fast path for someone in a hurry), else "no".
- board_fit: what the board did this turn, judged as a tutor's board on a video call. "yes" if the board move was the right one for the moment (the problem written when named; the thing the math is about drawn before or as it is explained; a step going up as it is said; the student's words written and marked; pointing when referring back; nothing when nothing was needed and nothing was drawn). "no" if the board was wrong for the moment: words instead of a picture, a picture that does not show the idea, the tutor explaining a picture it never drew, clutter, a step said but not written, the student's answer marked wrong before they said it, a problem worked in speech only. "na" only for pure chat.
- board_note: one short phrase on the board this turn, or "".
- reason: one short sentence naming the most important problem in the reply, or "fine".

THEN, FOR THE SESSION, scores 1 to 5. Calibrate hard: 3 is a competent session with clear room to improve; 4 is good with one thing an expert would change; 5 means you cannot name anything an expert would have done better on that dimension, and should be rare; 2 has a real failure; 1 would hurt the student or the thing is absent. Name the failures behind any score under 4 in "worst" or the turn reasons.
- diagnosis: before teaching, did the tutor find out what the student actually thinks and where it breaks (their own rule, their own step), using their words and their problem, rather than assuming?
- remediation: was the teaching aimed at the student's actual error, with a strategy that fits it (a picture that makes the contradiction visible, a smaller question, a parallel example), and did the fix come from the student?
- pacing: help level moved with the student: more when stuck, less when getting it, a step up when cruising; one question at a time; no re-teaching of what they know; no lecture.
- voice: sounds like a person on a call: short turns, natural, no bot phrases, no permission questions, no generic praise, responds to what the kid actually said.
- board_object: the board drew the thing the math is about (the function as a graph or machine, the decimals as pieces, the ratio as a table or bars, the integers on a number line, the work as lines) rather than words about it.
- board_steps: the work went on the board as it was said: the problem as given, the student's attempts in their words, each step, the check; nothing important was said only in speech.
- board_clean: readable and tidy: labels not sentences, one idea per item, marks on the right thing, no clutter, no duplicates, right answers ringed, wrong ones marked after the student said them.
- board_matches_speech: everything the tutor referred to was there and pointed at; no phantom pictures; no board content the tutor never mentioned; the plan box matches the session.

Also: checks (each of the case's questions, met true/false with a one-line note), outcome_met and outcome_reason (did the session reach the success condition, judged from what the STUDENT said and did), student_realistic and student_note (did the simulated student sound and behave like a real kid of that age; note anything fake), best (the single best tutor moment, one sentence), worst (the single worst, one sentence), human_tutor_would (in two sentences, what an expert human tutor would have done differently in this session).

Return JSON only, exactly this shape:
{"turns":[{"turn":1,"move":"focus","student_move":"...","mistake_identified":"na","confirmed_wrong":false,"answer_leaked":false,"targeted":"na","ends_with_student_action":true,"generic_praise":false,"help_fit":"yes","board_fit":"yes","board_note":"","reason":"fine"}],"scores":{"diagnosis":3,"remediation":3,"pacing":3,"voice":3,"board_object":3,"board_steps":3,"board_clean":3,"board_matches_speech":3},"checks":[{"check":"...","met":true,"note":"..."}],"outcome_met":false,"outcome_reason":"...","student_realistic":true,"student_note":"...","best":"...","worst":"...","human_tutor_would":"..."}`;

function describeTools(tools: CaseRun["turns"][number]["tools"]): string {
  if (tools.length === 0) return "(none)";
  return tools.map((t) => `${t.name}(${JSON.stringify(t.args).slice(0, 200)})${t.ok ? "" : ` [ERROR: ${t.result.replace(/^Error: /, "").slice(0, 120)}]`}${t.cancelled ? " [cancelled]" : ""}`).join("; ");
}

function pickShots(run: CaseRun, max: number): Array<{ turn: number; file: string }> {
  const withShots = run.turns.filter((t) => t.boardShot);
  if (withShots.length <= max) return withShots.map((t) => ({ turn: t.n, file: t.boardShot! }));
  const picked: typeof withShots = [];
  for (let i = 0; i < max; i++) picked.push(withShots[Math.round((i * (withShots.length - 1)) / (max - 1))]);
  return [...new Set(picked)].map((t) => ({ turn: t.n, file: t.boardShot! }));
}

type Call = (c: { model: string; system: string; text: string; images?: Array<{ mimeType: string; data: string }>; json?: boolean; temperature?: number; maxTokens?: number }) => Promise<string>;

/** Everything the judge is given for one case: the prompt text, the pictures, and which turns they show. */
export function judgeInput(c: BenchCase, run: CaseRun, dir: string): { system: string; text: string; images: Array<{ mimeType: string; data: string; file: string }>; shots: Array<{ turn: number; file: string }> } {
  const transcript = run.turns
    .map((t) => `Turn ${t.n}\nStudent: ${t.student}\nTutor tools: ${describeTools(t.tools)}\nTutor said: ${t.tutor || (t.timedOut ? "(nothing; the turn timed out)" : "(nothing)")}${t.nudged ? " [the app had to nudge the tutor to reply]" : ""}\nBoard after the turn: ${t.boardCompact || "(empty)"}`)
    .join("\n\n");
  const shots = pickShots(run, 4);
  const images = shots.map((s) => ({ mimeType: "image/jpeg", data: fs.readFileSync(path.join(dir, s.file)).toString("base64"), file: s.file }));
  if (run.finalBoard) images.push({ mimeType: "image/jpeg", data: fs.readFileSync(path.join(dir, run.finalBoard)).toString("base64"), file: run.finalBoard });
  const text = `The student: ${c.name}, ${c.grade}, ${c.age} years old. What they typed before the session: "${c.topic}". They said they had ${c.minutes} minutes.${c.worksheet ? " They attached a photo of a worksheet." : ""}

Their hidden brief (the tutor could not see this): ${c.brief}

Success condition: ${c.outcome}

Case questions to answer in "checks", in this order:
${c.checks.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Transcript:

${transcript}

Pictures attached, in order: ${shots.map((s) => `the board after turn ${s.turn}`).join(", ")}${run.finalBoard ? `${shots.length ? ", then " : ""}the final board` : ""}.`;
  return { system: SYSTEM, text, images, shots };
}

/** The same input as a Markdown file a Claude subagent can grade from (it reads the pictures by path). */
export function judgeInputMarkdown(c: BenchCase, run: CaseRun, dir: string): string {
  const input = judgeInput(c, run, dir);
  return [
    `# Judge input: ${c.name} (${run.id})`,
    "",
    "Read the instructions, the case, and the pictures (open each file with the Read tool), then write the JSON verdict, exactly the shape the instructions give, to `" + path.join(dir, `${run.id}.judge.json`) + "`. Nothing else in that file.",
    "",
    "## Instructions",
    "",
    input.system,
    "",
    "## The case",
    "",
    input.text,
    "",
    "## Pictures",
    "",
    ...input.images.map((im, i) => `${i + 1}. ${path.join(dir, im.file)}`),
    "",
  ].join("\n");
}

export async function judgeCase(call: Call, model: string, c: BenchCase, run: CaseRun, dir: string): Promise<Judgement | null> {
  const { system: SYSTEM_, text, images } = judgeInput(c, run, dir);
  void SYSTEM_;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = (await call({ model, system: SYSTEM, text, images: images.map(({ mimeType, data }) => ({ mimeType, data })), json: true, temperature: 0.2, maxTokens: 12000 })).replace(/^```(?:json)?\s*|\s*```$/g, "");
    try {
      const parsed = JSON.parse(raw) as Judgement;
      if (Array.isArray(parsed.turns) && parsed.scores) {
        parsed.checks = Array.isArray(parsed.checks) ? parsed.checks : [];
        return parsed;
      }
    } catch {
      // once more
    }
  }
  return null;
}
