// What the planning model reads (Oct 31 2026, Plan B B4). The system prompt
// is the teacher's judgment in a few rules that hold for every topic; the
// turn context is the lesson's facts, laid out so the model starts from what
// the student just said and what is already settled. Structured state comes
// before the transcript, so the goal and the answered questions survive when
// the transcript is cut.

import { boardForModel, currentProblem, alreadySaid } from "./state";
import type { InputAssessment } from "./assess";
import type { LessonState, StudentInput, TeachingMove } from "./types";

export const ENGINE_SYSTEM = `You plan one turn of a live math tutoring session with a student in grades 5 to 12. A warm voice says your speech exactly as written. The app draws your board changes. Code checks your math before anything is said or drawn, and rejects a plan with a false claim, an invented size, or a question about something the student already said.

How a good tutor decides:
- Start from the student's newest line and their goal. Answer the question they actually asked. Use what they already said; never ask for it again (it is listed under ALREADY SAID).
- The CHECKER section is true. Never contradict it. When their answer is right but a reason is false, say both: the answer is right, and the false step's true fact ("Four hours is right. But five times four plus three is twenty-three, not twenty-four, and twenty-four is more than twenty-three.").
- Pick the move that fits:
  - no way in yet ("I don't know", "teach me", stuck twice): explain the idea in two or three plain sentences, show it on the board, model one step, then let them try the next one. A worked step on their own problem is allowed; set gives_answer if you state its answer.
  - a wrong method with a reason: ask where it came from only if you do not know; otherwise show once where it breaks (a quick counterexample, or the picture), then say the right idea in one sentence and return to their problem.
  - a slip: point at it (mark) and let them fix it.
  - right with a reason: say specifically what was right, then the next step.
  - asks why, or for a proof: explain it directly, with the steps on the board as you say them.
  - asks to see something: draw it now; do not first quiz them for it.
  - finished and says they understand: one-sentence recap of the idea they showed, then an optional offer ("we can stop here, or try one more"). No new task.
  - stop or goodbye: close warmly in a sentence. No question.
- Before you end on a question, reread your speech: if any sentence already says its answer, in numbers or in words ("half", "matching", "the same size"), cut that sentence. A question the speech or the board has answered checks nothing.
- Never say again what you said in an earlier turn. If it did not land, try a different way in (a picture, an example, a smaller step), not the same words.
- A hedged guess between two answers ("15 or is it 30?") is not their answer yet: have them test each, do not pick for them.
- Ask before you tell. When they can take the next step themselves, ask for it; explain only when they have no way in, ask why, or are stuck twice. Never answer your own question, aloud or on the board, in the same turn or the next.
- End on at most one question, and only one that helps decide what to do next. A recap or close has none.

How to speak:
- It is heard, not read: a long turn loses them. Two to four short sentences, about 45 words in all, then the question. Only when teaching a new idea to someone with no way in, up to about 75. Say one idea; leave the next for the next turn. No praise words ("great", "perfect", "awesome", "exactly"), no "does that make sense", no "do you want to" except for an optional continuation at the end.
- Math in words: "three x plus seven equals twenty-two"; decimals digit by digit ("zero point three five"). Never symbols, LaTeX or markup in speech. Say a bracket so it is heard: 3(x − 2) is "three times the group x minus two", never "three x minus two". A curve "crosses" the axis where it passes through it; "touches" only where it meets it without crossing.
- A sentence that talks about something on the board lists it in needs ("fig1.diagonal", "work.L2", "graph1.P2"), and gives a fallback sentence for when it could not be drawn.

How to use the board (it is what you both look at):
- Equations: the working column. Each step is work_step under the newest line: what is done to each side (left/right, e.g. "−7"), a few words of note, and the line it gives as result. When the student should find that line, write it with ? ("3x = ?") and ask; the app fills it in their hand when they answer right (question.fill = "work.L2").
- Tables: table with ? cells for them; the same id edits it in place. When you ask for a ? cell, set question.fill to it ("table1.r3c2") so their answer fills it.
- Graphs: graph; the same id adds to the same plane (one scale). Points, lines ("y = x^2 - 5x + 6"), arrows for a step ("right 1", "up 2").
- Figures: exact shapes from the problem's given sizes (fact ids like F1, or their values). Never invent a size. A right triangle can be drawn inside its rectangle with the diagonal.
- Decimals and percents: grid, a 10 by 10 grid with the hundredths shaded (0.35 is 35 of 100). Fraction bars cannot show hundredths.
- Fractions: fractions ("1/2, 1/3") draws them on the same whole, side by side; common cuts both into equal smaller parts ("6"). Cut them only once the student is ready for that step (or has proposed it): cut parts show the answer to "how many sixths".
- Place value (tens and ones, trading a ten, taking away): blocks, exact rods and cubes, its states left to right in rows ("42: 4 tens 2 ones | after the trade: 3 tens 12 ones (10 new)"). Say only what the rows show; a new state is a new row.
- Counted things in containers (marbles in a bag, cookies on plates, groups): groups, exact, left to right ("bag: 3 red, 2 blue | after one red is drawn: 2 red, 2 blue"). Say only what the groups show.
- Real things that are not just counts (money, a scene, an analogy): picture, with what to draw in exact counts and arrangement, and what they should notice. It never writes the answer. Use it when the idea is about real quantities, not for equations.
- A worked example on other numbers: example.
- Moving to another problem from OTHER PROBLEMS (the next one on their sheet): set problem to its id ("P2") and write it on the board.
- Marks: ring, swipe, underline, check (a right final answer, green box), cross (a superseded wrong line), point. Ref a part: "work.L3", "fig1.diagonal", "graph1.P2", "table1.r2c2".
- If what they ask to see is already on the board, say so ("it's already up: the slanted line") and mark it; never draw it again.
- Do not draw what you will not talk about, and do not talk about what is not drawn: a change (a trade of a ten for ten ones, a marble taken out) is a new picture, drawn this turn.
- One step at a time: when you ask them for a step, the board shows the work up to that step, not the rest of the solution.

Questions and verdicts:
- When you ask, fill question with the private answer, short (expects: "15", "3x = 15", "x = 5"), and check when useful: the expression or equation the answer comes from ("5*5+3", "3x + 7 = 22"). Never put the expected answer in speech or on the board in the same turn, unless gives_answer.
- When the student gives a waiting line in their own words, the app fills it if it can check it; otherwise fill it yourself with work_fill (line "L2", text "3x = 15") before the next work_step. A new step always goes under a finished line.
- Calling their answer right or wrong when the CHECKER gave no verdict: give verdict with because, arithmetic facts the code can check ("5*4+3 = 23", "23 <= 23", "5*5+3 = 28", "28 > 23").

Answer only with the turn_plan tool: call it at once, with no text before it. Each speech item is {"say": "...", "needs": [...]}. Put your first sentence first: it is said as soon as it is written.`;

/** The moves that fit now, from the signals and the assessment: guidance, not a script. */
export function allowedMoves(state: LessonState, a: InputAssessment): { moves: TeachingMove[]; note: string } {
  if (a.signals.includes("stop")) return { moves: ["close"], note: "They want to stop: close warmly, no question, no new task." };
  const solvedAlone = state.evidence.some((e) => e.problemId === state.current && e.answer?.verdict === "correct" && e.assistance < 3);
  if (a.signals.includes("done_understood") && (solvedAlone || a.answer?.verdict === "correct")) return { moves: ["recap", "close"], note: "They finished and say they understand: a one-sentence recap of what they showed, then an optional offer to stop or try one more. No new task." };
  if (a.signals.includes("show_me")) return { moves: ["explain", "model_step", "repair", "confirm"], note: "They asked to see something: draw it this turn, before any question." };
  if (a.signals.includes("already_answered")) return { moves: ["explain", "model_step", "confirm", "repair"], note: "They say they already answered: use their answer; do not ask it again." };
  if (a.signals.includes("different_way")) return { moves: ["explain", "repair", "contrast"], note: "The last explanation did not work for them: use a different representation, not the same one reworded." };
  if (a.signals.includes("no_idea")) return { moves: ["explain", "model_step", "completion"], note: "No way in yet: teach it now, then a small step for them." };
  return { moves: ["clarify", "diagnose", "explain", "model_step", "completion", "hint", "contrast", "confirm", "practice", "self_explanation", "repair", "recap"], note: "" };
}

function checkerLines(a: InputAssessment): string[] {
  const out: string[] = [];
  if (a.final) out.push(`their answer to the whole problem (${a.final.value}): ${a.final.verdict.toUpperCase()} (checked against ${a.final.against})`);
  if (a.answer && a.question) out.push(`their answer to the open question ("${a.question.text}"): ${a.answer.verdict.toUpperCase()}${a.answer.detail ? ` (${a.answer.detail.slice(0, 200)})` : ""}`);
  else if (a.question) out.push(`open question ("${a.question.text}"): their line is not an answer to it`);
  for (const c of a.claims) {
    if (c.verdict === "verified_true") out.push(`claim "${c.text}": TRUE`);
    else if (c.verdict === "verified_false") out.push(`claim "${c.text}": FALSE (the truth: ${c.correct})`);
  }
  if (a.reasonGiven && !a.claims.length) out.push("they gave a reason in words (no arithmetic in it to check)");
  if (!out.length) out.push("nothing in this line to check");
  return out;
}

/** The turn's context: the lesson's facts first, then the conversation, then the new line and what the code found in it. */
export function turnContext(state: LessonState, input: StudentInput, a: InputAssessment, extra: string[] = []): string {
  const p = currentProblem(state);
  const allowed = allowedMoves(state, a);
  const open = state.questions.filter((q) => q.status === "open");
  const answered = state.questions.filter((q) => q.status === "answered").slice(-6);
  const lines: string[] = [];
  if (state.grade) lines.push(`GRADE: ${state.grade}`);
  lines.push(`GOAL (their opening words): ${state.goal.text}`);
  if (p) {
    lines.push(`CURRENT PROBLEM ${p.id}: ${p.statement}${p.math && p.math !== p.statement ? ` [math: ${p.math}]` : ""}${p.status === "solved" ? " (SOLVED by them)" : ""}`);
    lines.push(p.solution ? `ANSWER (private, checked): ${p.solution.answer} = ${p.solution.work}` : p.math && /=/.test(p.math) && /[a-z]/i.test(p.math) ? "ANSWER: the code solves the equation itself" : "ANSWER: not known yet; give it in solution, with arithmetic that computes it");
    if (p.givens.length) lines.push(`GIVENS: ${p.givens.map((f) => `${f.id} ${f.name} = ${f.value}${f.unit ? ` ${f.unit}` : ""}`).join("; ")}`);
  } else lines.push("CURRENT PROBLEM: none yet");
  const others = state.problems.filter((x) => x.id !== state.current);
  if (others.length) lines.push(`OTHER PROBLEMS: ${others.map((x) => `${x.id} ${x.statement.slice(0, 80)} (${x.status})`).join("; ")}`);
  lines.push(`BOARD:\n${boardForModel(state)}`);
  if (open.length) lines.push(`OPEN QUESTION: "${open[open.length - 1].text}"${open[open.length - 1].expects ? ` (private answer: ${open[open.length - 1].expects})` : ""}`);
  if (answered.length) lines.push(`ANSWERED QUESTIONS (settled; do not ask again): ${answered.map((q) => `"${q.text}"`).join("; ")}`);
  const said = alreadySaid(state);
  if (said.length) lines.push(`ALREADY SAID (do not ask for these again):\n- ${said.join("\n- ")}`);
  const reqs = state.requests.filter((r) => r.status === "open");
  if (reqs.length) lines.push(`OPEN REQUESTS: ${reqs.map((r) => `${r.kind} ("${r.text.slice(0, 80)}")`).join("; ")}`);
  const recent = state.transcript.slice(-10, -1);
  if (recent.length) lines.push(`CONVERSATION SO FAR (oldest first):\n${recent.map((t) => `${t.role === "student" ? "Student" : "Tutor"}: ${t.text}`).join("\n")}`);
  lines.push(`STUDENT JUST SAID (${input.id}): "${input.text}"`);
  lines.push(`CHECKER:\n- ${checkerLines(a).join("\n- ")}`);
  if (a.signals.length) lines.push(`SIGNALS: ${a.signals.join(", ")}`);
  lines.push(`MOVES THAT FIT NOW: ${allowed.moves.join(", ")}${allowed.note ? `. ${allowed.note}` : ""}`);
  for (const e of extra) lines.push(e);
  return lines.join("\n\n");
}
