import { parseScene, renderScene, type Scene } from "@/lib/illustration/scene";
import type { WhiteboardHandle } from "@/components/TldrawCore";
import { parsePlan, planIsSolutionSteps, planSummary, PLAN_MAX_STEPS, validStep } from "@/lib/board-plan";
import {
  clamp,
  type IconArrange,
  describeFractionModel,
  figureSideLabels,
  formatTick,
  isFigureKind,
  niceStep,
  parseFraction,
  parseLineIntervals,
  parseLineJumps,
  parseLineMarks,
  parseNumber,
  parsePipeNumbers,
  parseSketchLabels,
  parseSketchStrokes,
  splitPipe,
  type BoardColumn,
  type Fraction,
  parseTapeRows,
  parseOperation,
  parseAngleMarks,
  parseXYPoints,
  parseSlopeRun,
  FIGURE_KINDS,
} from "@/lib/board-diagrams";
import { isHeadingItem, parseTargetList, toolRole } from "@/lib/board-items";
import {
  attemptProblem,
  boardLines,
  calloutProblem,
  repeatsProblem,
  contentFingerprint,
  findDuplicate,
  pictureContent,
  splitSlots,
  splitSteps,
  withoutPraise,
} from "@/lib/board-content-rules";
import { parsePlace, type PlaceRequest } from "@/lib/board-layout";
import { exampleWritten, parseExample } from "@/lib/worked-example";
import { ensureRelation, graphLatexProblem, toDesmosLatex } from "@/lib/desmos-graph";
import { buildDataPlot, type DataKind, type FitKind } from "@/lib/desmos-data";
import { figureModel } from "@/lib/desmos-figure";
import { buildFreeGraph, FREE_MAX_ITEMS } from "@/lib/desmos-free";
import { DEFAULT_GRAPH_SIZE, isGraphTable } from "@/lib/desmos-spec";
import { latexToPlain } from "@/lib/latex-plain";
import { resolveIconName, suggestIcons } from "@/lib/board-icons";
import { normalizeLatex, splitLatexLines } from "@/lib/latex-normalize";
import {
  fail,
  isToolError,
  ok,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requiredNumber,
  requiredString,
  type ToolCallResult,
} from "@/lib/tool-args";

type Args = Record<string, unknown>;

type DispatchCtx = {
  whiteboard: WhiteboardHandle | null;
  /** The live tool call's id, so a cancelled call can be taken back (TldrawCore.undoCall). */
  callId?: string;
};

function ensureBoard(ctx: DispatchCtx): WhiteboardHandle | ToolCallResult {
  if (!ctx.whiteboard) return fail("Whiteboard is not ready yet.");
  return ctx.whiteboard;
}

function pickColumn(value: string | undefined): BoardColumn | undefined {
  if (value === "left" || value === "right") return value;
  return undefined;
}

function columnPlacement(value: unknown): PlaceRequest | null {
  return value === "left" || value === "right" ? { kind: "area", area: value } : null;
}

// The board is for short things. Long prose belongs in speech: the model
// reached for text boxes whenever a topic had no obvious picture, and the
// board filled with paragraphs (Sept 15 sessions).
// The board is an infinite canvas, so this is about readability, not space.
const MAX_ICONS = 120;

function iconMiss(name: string): string {
  const near = suggestIcons(name);
  return near.length
    ? `No icon called "${name}". Closest: ${near.join(", ")}.`
    : `No icon called "${name}". Try a plainer everyday word, or draw_sketch for anything the set does not have.`;
}
const NOTE_MAX = 160;
const BOX_BODY_MAX = 140;
const BOX_BODY_LINES = 3;
const CALLOUT_MAX = 120;
// Separates a result from a follow-up sentence that should come after the item id.
const NEXT = "\u241e";
/** A drawing younger than this is kept when a new heading arrives. */
const FRESH_WORK_MS = 30_000;
/** Writing, not pictures: none of it keeps a board from turning. */
const LINE_TOOLS = new Set(["draw_equation_step", "add_equation_sequence", "add_student_attempt", "add_callout", "add_text_note", "add_worked_example_box", "add_problem_setup", "start_board_section"]);

function countLines(body: string): number {
  return body.split(/\n|\s\|\s/).map((l) => l.trim()).filter(Boolean).length;
}


function pickSize(value: string | undefined): "heading" | "body" | undefined {
  if (value === "heading" || value === "body") return value;
  return undefined;
}

// What a call writes or draws, to recognise the same thing written twice.
// Headings are never duplicates (a heading starts something new).
function contentOf(name: string, args: Args): string | null {
  const str = (key: string) => (typeof args[key] === "string" ? (args[key] as string) : "");
  switch (name) {
    case "start_new_problem":
    case "start_board_section":
      return null;
    case "add_text_note":
    case "add_callout":
    case "add_student_attempt":
      return boardLines(str("text"));
    case "add_worked_example_box":
      return `${str("title")}\n${boardLines(str("body"))}`;
    case "add_problem_setup":
      return [str("goal"), str("givens"), str("unknowns"), str("plan")].join("\n");
    case "draw_equation_step":
      return splitLatexLines(str("latex")).map(normalizeLatex).join("\n");
    case "add_equation_sequence":
      return splitSteps(str("steps")).map(normalizeLatex).join("\n");
    case "show_example":
      return [str("problem"), ...splitSteps(str("steps")).map(normalizeLatex), ...str("why").split("|")].map((l) => l.trim()).join("\n");
    case "draw_illustration":
      // The scene is an object: the generic picture fingerprint reads only
      // strings, so every illustration had looked like the first one.
      return typeof args.scene === "string" ? args.scene : JSON.stringify(args.scene ?? null);
    default:
      return toolRole(name) === "draw" ? pictureContent(args) : null;
  }
}

function pickHighlightStyle(value: string | undefined): "circle" | "underline" | "box" | undefined {
  if (value === "circle" || value === "underline" || value === "box") return value;
  return undefined;
}

// Read an optional string argument, returning the tool error if it is invalid.
// Written as a tiny helper so the diagram cases below stay readable.
function opt(args: Args, key: string): { error?: ToolCallResult; value?: string } {
  const value = optionalString(args, key);
  if (isToolError(value)) return { error: value };
  return { value };
}

// Every tool call is one board item: whatever it creates gets an id (b7) the
// model can point at, ring, or erase later. The id rides along in the result.

// Text that is an equation or an expression rather than words: a relation
// sign, a power, a LaTeX command, a function of x, or arithmetic between
// numbers, and at most a few plain words around it.
function looksLikeMath(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  const mathy = /[=^\\]|\b(?:sin|cos|tan|log|ln|sqrt)\s*\(|\b[a-z]\s*\(\s*[a-z]\s*\)|\d\s*[-+×÷*/]\s*\d/.test(t);
  if (!mathy) return false;
  const words = t.replace(/[^a-zA-Z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !/^(sin|cos|tan|log|ln|sqrt|pi|frac|left|right|cdot|times|div|text)$/i.test(w));
  return words.length <= 3;
}

const GROWING = new Set(["draw_desmos", "add_function_graph", "add_table"]);

/** The items on this page that a new graph or table grows out of: same tool, and everything they held is in the new one. */
export function supersededBy(name: string, content: string, items: Array<{ id: string; tool: string; owner: string; content?: string }>): string[] {
  if (!GROWING.has(name)) return [];
  const pageStart = items.map((i) => i.tool).lastIndexOf("start_new_problem");
  const body = (c: string) => c.slice(c.indexOf(":") + 1);
  const pieces = (c: string) => body(c).split(/[|;&]|(?<=\))\s*,|=(?=\()/).map((x) => x.replace(/^(?:expressions|points|rows|columns|cells)=/, "")).filter((x) => x && !/^settings=|^(?:x|y)_?(?:min|max)=/.test(x));
  const next = new Set(pieces(content));
  const columns = (c: string) => /columns=([^&]*)/.exec(body(c))?.[1] ?? null;
  return items.slice(pageStart + 1).filter((it) => {
    if (it.tool !== name || it.owner !== "tutor" || !it.content || it.content === content) return false;
    if (name === "add_table") return columns(it.content) !== null && columns(it.content) === columns(content);
    const old = pieces(it.content);
    return old.length > 0 && old.every((x) => next.has(x));
  }).map((it) => it.id);
}

export function dispatchWhiteboardTool(
  name: string,
  args: Args,
  ctx: DispatchCtx,
): ToolCallResult {
  // A new problem with the problem and the first question in one call (Sept
  // 24 2026: a worksheet problem took four calls before the first word, and
  // the functions went up as a handwritten note). The heading is placed
  // first, then each line, then the question, each its own item.
  // A new heading seconds after a drawing would erase it (Sept 25 2026: the
  // cookies went up and came down in one turn). Fresh work stays: the heading
  // opens a section beside it instead, and the result says so.
  if (name === "start_new_problem" && ctx.whiteboard?.itemsSnapshot) {
    const now = Date.now();
    // A picture just drawn stays beside the next problem (the student works
    // the next one from it: Jayden's cookies). Lines, answers and tags do not
    // hold the board: it is turned, framed and slid away (Oct 14 2026), and
    // nothing on it is lost.
    const fresh = ctx.whiteboard.itemsSnapshot().filter((it) => it.owner === "tutor" && !isHeadingItem(it) && !LINE_TOOLS.has(it.tool) && now - it.createdAt < FRESH_WORK_MS);
    if (fresh.length > 0 && typeof args.title === "string" && args.title.trim()) {
      const problemText = typeof args.problem === "string" ? args.problem.trim() : "";
      // The same title again ("Comparing Decimals" three times across one board,
      // Sept 26 2026): the problem itself heads the new section when it is short.
      const sameTitle = ctx.whiteboard.itemsSnapshot().some((it) => isHeadingItem(it) && it.label.trim().toLowerCase() === args.title!.toString().trim().toLowerCase());
      const shortProblem = problemText && problemText.length <= 32 && !/\\[a-z]/i.test(problemText) && !problemText.includes("|") ? problemText : null;
      const title = sameTitle ? shortProblem ?? "Next one" : String(args.title);
      const section = dispatchWhiteboardTool("start_board_section", { title }, ctx);
      if (section.success) {
        const rest: string[] = [`Kept the board: what you drew ${Math.round((now - Math.max(...fresh.map((it) => it.createdAt))) / 1000)} s ago is still up, and "${title}" opened as a section beside it.`];
        if (problemText && title !== problemText && /[\d=+\-−×÷*/^\\<>]/.test(problemText)) {
          for (const line of splitSteps(problemText).map((l) => l.trim()).filter(Boolean).slice(0, 6)) {
            const r = dispatchWhiteboardTool("draw_equation_step", { latex: line }, ctx);
            if (r.success) rest.push((r.message ?? "").replace(/\n\[Board:[\s\S]*$/, "").trim());
          }
        }
        if (typeof args.ask === "string" && args.ask.trim()) {
          const r = dispatchWhiteboardTool("add_callout", { text: args.ask }, ctx);
          if (r.success) rest.push((r.message ?? "").replace(/\n\[Board:[\s\S]*$/, "").trim());
        }
        rest.push("To clear the board on purpose, erase_items first.");
        return ok(rest.join(" "));
      }
    }
  }
  if (name === "start_new_problem" && ((typeof args.problem === "string" && args.problem.trim()) || (typeof args.ask === "string" && args.ask.trim()))) {
    const { problem, ask, ...rest } = args;
    // The topic is not the problem (Sept 25 2026: 3.8 passed problem="Decimals"
    // and got a fake problem line): a problem has a digit, an operator or LaTeX.
    const problemText = typeof problem === "string" ? problem.trim() : "";
    const titleText = typeof rest.title === "string" ? rest.title.trim() : "";
    const isProblem = Boolean(problemText) && problemText.toLowerCase() !== titleText.toLowerCase() && /[\d=+\-−×÷*/^\\<>]/.test(problemText);
    const page = dispatchWhiteboardTool("start_new_problem", rest, ctx);
    if (!page.success) return page;
    const plain = (m: string | undefined) => (m ?? "").replace(/\n\[Board:[\s\S]*$/, "").trim();
    const head = plain(page.message).replace(/\s*Write the problem exactly as given[\s\S]*$/, "");
    const parts: string[] = [head];
    if (problemText && !isProblem) parts.push(`(problem="${problemText.slice(0, 40)}" is the topic, not a problem, so nothing was written for it.)`);
    const lines = isProblem ? splitSteps(problemText).map((l) => l.trim()).filter(Boolean).slice(0, 6) : [];
    const written: string[] = [];
    for (const line of lines) {
      const r = dispatchWhiteboardTool("draw_equation_step", { latex: line }, ctx);
      if (r.success) written.push(plain(r.message));
      else parts.push(`A line was not written: ${r.error}`);
    }
    if (written.length) parts.push(`The problem is up, typeset: ${written.join("; ")}.`);
    if (typeof ask === "string" && ask.trim()) {
      const r = dispatchWhiteboardTool("add_callout", { text: ask }, ctx);
      parts.push(r.success ? plain(r.message) : `The question was not written: ${r.error}`);
    }
    parts.push(written.length ? "Next: ask what they'd try first; if they don't know how, teach it (show_example)." : "Next: write the problem exactly as given (problem=, typeset), then ask.");
    return ok(parts.join(" "));
  }
  // The session plan (Sept 24 2026): a box at the top right, not an item.
  // Steps once after the opening, then `step` to move on.
  if (name === "set_plan") {
    const board = ctx.whiteboard;
    if (!board?.setPlan) return fail("This board cannot show a plan.");
    const rawSteps = Array.isArray(args.steps) ? args.steps : typeof args.steps === "string" && args.steps.trim() ? args.steps : null;
    let parsed = rawSteps ? parsePlan(rawSteps) : null;
    if (rawSteps && !parsed) return fail(`"steps" has no steps in it: give 2-4 short steps separated by " | " ('What fractions are | Adding them | Practice').`);
    if (parsed && planIsSolutionSteps(parsed.steps)) return fail(`Not written: those are the steps of one problem. The plan box holds this lesson's 2-4 goals ('Two-step equations | Equations with brackets | Graphing a line'); say a problem's steps as you work them, on the board as lines.`);
    const notes: string[] = [];
    // The same plan sent again (Sept 25 2026: 3.8 re-sent `steps` on every
    // call, and the box was rewritten each time) only moves the step.
    const current = board.plan?.() ?? null;
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    if (parsed && current && parsed.steps.length === current.steps.length && parsed.steps.every((s, i) => same(s, current.steps[i].label))) {
      parsed = null;
      if (args.step === undefined || args.step === null || args.step === "") return ok(`The plan is already on the board, on step ${current.current}. ${planSummary(current)} Say the step you are on and go.`);
    }
    const count = parsed?.steps.length ?? current?.steps.length ?? 0;
    let step: number | undefined;
    if (args.step !== undefined && args.step !== null && args.step !== "") {
      const n = typeof args.step === "number" ? args.step : typeof args.step === "string" && /^\s*\d+\s*$/.test(args.step) ? Number(args.step) : NaN;
      if (validStep(n, count)) step = n;
      else notes.push(count > 0 ? `step ${String(args.step)} was ignored: the plan has ${count} steps` : "step was ignored: there is no plan yet");
    }
    if (!parsed && step === undefined) return fail('Give "steps" (2-4, split by " | ") to write the plan, or "step" to move on to the next one.');
    if (parsed && parsed.dropped > 0) notes.push(`kept the first ${PLAN_MAX_STEPS} steps`);
    const { plan } = board.withDirectMeta({ owner: "tutor" }, () => board.setPlan!(parsed?.steps, step));
    if (!plan) return fail("The plan could not be written.");
    const labels = plan.steps.map((s) => s.label);
    const sentence = labels.length > 1 ? `First ${labels[0].toLowerCase()}, then ${labels.slice(1, -1).map((l) => l.toLowerCase()).join(", then ")}${labels.length > 2 ? ", then " : ""}${labels.at(-1)!.toLowerCase()}.` : `${labels[0]}.`;
    const said = parsed
      ? `The plan is up (${sentence.replace(/\.$/, "")}); step 1 is ${labels[0]}.`
      : `On step ${plan.current} now: ${labels[plan.current - 1] ?? ""}.`;
    return ok(`${said} ${planSummary(plan)}${notes.length ? ` (${notes.join("; ")})` : ""}`);
  }
  const board = ctx.whiteboard;
  const token = board ? board.beginItem(name, ctx.callId) : null;
  // Where the new item goes: the tutor's `place`, else its older `column`.
  if (board?.setPlacement) board.setPlacement(parsePlace(args.place) ?? columnPlacement(args.column));
  // Already up? Point at it rather than write it a second time (a recorded
  // session wrote the same two points on the board twice in a row).
  const content = board && token ? contentOf(name, args) : null;
  if (board && token && content) {
    token.content = contentFingerprint(name, content);
    const twin = board.itemsSnapshot ? findDuplicate(name, token.content, board.itemsSnapshot()) : null;
    if (twin) {
      board.endItem(token, null);
      const shown = board.withDirectMeta({ owner: "tutor" }, () => board.pointAt(twin));
      const notes = board.takeNotes?.() ?? [];
      return ok(`Already on the board as ${twin}${shown ? ` (${shown.label})` : ""}, so it was not written again; pointing at it instead${notes.length ? `; ${notes.join("; ")}` : ""}.`);
    }
  }
  // A graph or a table that grows (another point, a ? filled in) replaces the
  // one before it on this page instead of stacking a copy under it (Oct 24
  // 2026: five Desmos graphs of one line, four copies of one x|y table).
  const older = board && token?.content && board.itemsSnapshot ? supersededBy(name, token.content, board.itemsSnapshot()) : [];
  const result = dispatchInner(name, args, ctx);
  if (!board || !token) return result;
  const replaced = result.success && older.length && board.withDirectMeta({ owner: "tutor" }, () => board.eraseItems(older)).length
    ? `in place of ${older.join(", ")} (the same ${name === "add_table" ? "table" : "graph"} with less on it)`
    : null;
  // A follow-up ("Next, write the problem…") comes after the item id, and is
  // never part of the item's label.
  const [said, next] = (result.success ? result.message ?? "Done" : "").split(NEXT);
  const itemId = board.endItem(token, result.success ? said : null);
  // What placement or a mark noticed: "stayed on this page: there was room",
  // "b2 is on page 1, so the board turns there to show it".
  const notes = [...(replaced ? [replaced] : []), ...(board.takeNotes?.() ?? [])];
  if (!result.success) return result;
  if (!itemId && notes.length === 0 && !next) return result;
  let message = said.replace(/[.]\s*$/, "");
  if (itemId) message += ` (item ${itemId})`;
  if (notes.length > 0) message += `; ${notes.join("; ")}`;
  if (next) message += `. ${next}`;
  return { success: true, message };
}

function dispatchInner(
  name: string,
  args: Args,
  ctx: DispatchCtx,
): ToolCallResult {
  // All direct-tool handle calls below are wrapped in
  // `board.withDirectMeta({ owner: "tutor" | "student", tutorReferenceLabel? }, () => ...)`.
  // The wrapper tags every shape created during the call with `meta.owner` so
  // future highlight/cross-out/correction tools can scope to a single owner.

  switch (name) {
    case "start_new_problem": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const title = requiredString(args, "title");
      if (isToolError(title)) return title;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title }, () =>
        board.startNewProblem(title),
      );
      return ok(`Cleared the board and wrote the heading "${title}".${NEXT}Write the problem exactly as given (problem=, typeset), then ask what they already know.`);
    }

    case "start_board_section": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const title = requiredString(args, "title");
      if (isToolError(title)) return title;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title }, () =>
        board.startBoardSection(title, false),
      );
      return ok(`Added the subheading "${title}".`);
    }

    case "add_problem_setup": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const goal = requiredString(args, "goal");
      if (isToolError(goal)) return goal;
      const givens = opt(args, "givens"); if (givens.error) return givens.error;
      const unknowns = opt(args, "unknowns"); if (unknowns.error) return unknowns.error;
      const plan = opt(args, "plan"); if (plan.error) return plan.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: goal }, () =>
        board.addProblemSetup(
          boardLines(goal),
          givens.value ? splitSlots(givens.value).map(boardLines).filter(Boolean).join("; ") : undefined,
          unknowns.value ? boardLines(unknowns.value) : undefined,
          plan.value ? boardLines(plan.value) : undefined,
          pickColumn(column.value),
        ),
      );
      return ok(`Problem setup box: goal "${goal.replace(/\s+/g, " ").slice(0, 80)}".`);
    }

    case "add_equation_sequence": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const stepsRaw = requiredString(args, "steps");
      if (isToolError(stepsRaw)) return stepsRaw;
      const steps = splitSteps(stepsRaw).map(normalizeLatex).filter(Boolean);
      if (steps.length === 0) return fail('"steps" is empty.');
      const annotations = opt(args, "annotations"); if (annotations.error) return annotations.error;
      const title = opt(args, "title"); if (title.error) return title.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title.value }, () =>
        board.addEquationSequence(steps, splitSlots(annotations.value), title.value, pickColumn(column.value)),
      );
      return ok(`Wrote ${steps.length} equation lines: ${steps.map(latexToPlain).join(" / ")}.`);
    }

    // Oct 24 2026: one block, its own item (not an equation line, so the
    // student's next line goes under their own problem, not under this).
    case "show_example": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const example = parseExample(args);
      if ("error" in example) return fail(example.error);
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: `Example: ${latexToPlain(example.problem)}` }, () =>
        board.addEquationSequence([example.problem, ...example.steps], ["", ...example.why], "Example", "right"),
      );
      return ok(exampleWritten(example));
    }

    case "draw_equation_step": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const latex = requiredString(args, "latex");
      if (isToolError(latex)) return latex;
      // "a = 1 \\\\ b = 2" is two lines; unicode operators become LaTeX.
      const lines = splitLatexLines(latex).map(normalizeLatex).filter(Boolean);
      if (lines.length === 0) return fail('"latex" is empty.');
      const annotation = opt(args, "annotation"); if (annotation.error) return annotation.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: latex }, () =>
        lines.forEach((line, i) => board.drawEquationStep(line, i === lines.length - 1 ? annotation.value : undefined, pickColumn(column.value))),
      );
      return ok(`Wrote the line ${lines.map(latexToPlain).join(" / ")}${annotation.value ? ` (${annotation.value})` : ""}.`);
    }

    case "add_text_note": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const text = requiredString(args, "text");
      if (isToolError(text)) return text;
      const note = boardLines(text);
      // Math sent as a note went up in handwriting, "^2" and "\pi" as typed
      // (Sept 24 2026). Math is typeset: it goes up as equation lines instead.
      if (looksLikeMath(note)) {
        const lines = splitSteps(text).map((l) => l.trim()).filter(Boolean).slice(0, 6);
        const ids: string[] = [];
        for (const line of lines) {
          const r = dispatchWhiteboardTool("draw_equation_step", { latex: line }, ctx);
          if (r.success) ids.push(...((r.message ?? "").match(/\(item (b\d+)\)/g) ?? []).map((m) => m.slice(6, -1)));
        }
        if (ids.length) return ok(`That was math, so it went up typeset as ${ids.length === 1 ? "a line" : "lines"} (${ids.join(", ")}). Use draw_equation_step for math; a note is for a few plain words.`);
      }
      if (note.length > NOTE_MAX) {
        return fail(`That note is ${note.length} characters. A board note is one short line (${NOTE_MAX} max): say the explanation out loud, or draw the idea instead.`);
      }
      const size = opt(args, "size"); if (size.error) return size.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor" }, () =>
        board.addTextNote(note, pickSize(size.value), pickColumn(column.value)),
      );
      return ok(`Wrote the note "${note.replace(/\s+/g, " ").slice(0, 90)}".`);
    }

    case "add_callout": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const text = requiredString(args, "text");
      if (isToolError(text)) return text;
      // One sky tag (Sept 16 2026): an old `style` argument is ignored.
      const asked = boardLines(text).replace(/\n+/g, " ");
      const question = withoutPraise(asked);
      const tag = question ?? asked;
      const problem = calloutProblem(tag);
      if (problem) return fail(problem);
      if (tag.length > CALLOUT_MAX) {
        return fail(`That tag is ${tag.length} characters. A tag holds one short line (${CALLOUT_MAX} max): keep the question or the rule, say the rest.`);
      }
      // The problem is already up: a tag repeating it is noise.
      const items = board.itemsSnapshot?.() ?? [];
      const since = items.slice(items.map((i) => i.tool).lastIndexOf("start_new_problem") + 1);
      const problemLines = since.filter((i) => i.tool === "draw_equation_step").slice(0, 6);
      if (repeatsProblem(tag, problemLines.map((i) => i.label))) {
        return fail(`The problem is already on the board (${problemLines[0].id}): ask about it in a few words ("How many for one cup?"), or say it.`);
      }
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor" }, () => board.addCallout(tag, pickColumn(column.value)));
      return ok(`Tagged "${tag.slice(0, 90)}".${question ? " The praise before it was left out: say it instead." : ""}`);
    }

    case "add_student_attempt": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const text = requiredString(args, "text");
      if (isToolError(text)) return text;
      const attempt = boardLines(text);
      const problem = attemptProblem(attempt);
      if (problem) return fail(problem);
      const column = opt(args, "column"); if (column.error) return column.error;
      // LaTeX in their words (Sept 25 2026: "x = \\frac{-(-3) \\pm …}" went up
      // in handwriting, backslashes and all) is typeset as their line.
      if (/\\[a-zA-Z]|[{}^_]/.test(attempt)) {
        const lines = splitLatexLines(attempt).map(normalizeLatex).filter(Boolean);
        board.withDirectMeta({ owner: "student", tutorReferenceLabel: attempt }, () =>
          lines.forEach((line, i) =>
            // The answer line behind its "You said" tag; working lines above it plain.
            i === lines.length - 1 && board.addStudentMath ? board.addStudentMath(line) : board.drawEquationStep(line, i === lines.length - 1 ? "their answer" : undefined, pickColumn(column.value)),
          ),
        );
        return ok(`Student's attempt ${lines.map(latexToPlain).join(" / ")} typeset as their line.`);
      }
      // Student attempts are student-owned even though the tutor calls the
      // tool, so later corrections never overwrite the student's work.
      board.withDirectMeta({ owner: "student" }, () =>
        board.addStudentAttempt(attempt, pickColumn(column.value)),
      );
      return ok(`Student's attempt "${attempt.replace(/\s+/g, " ").slice(0, 80)}" written in their hand.`);
    }

    // Undeclared since Sept 16 2026, still replayed for old recordings and
    // scripts: highlight_step, add_coordinate_axes, clear_whiteboard.
    case "highlight_step": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const style = requiredString(args, "style");
      if (isToolError(style)) return style;
      const resolvedStyle = pickHighlightStyle(style);
      if (!resolvedStyle) return fail('Argument "style" must be circle, underline, or box.');
      const stepIndex = optionalNumber(args, "step_index");
      if (isToolError(stepIndex)) return stepIndex;
      const stepLabel = opt(args, "step_label"); if (stepLabel.error) return stepLabel.error;
      // No target: the newest line is what the tutor means.
      const target = stepIndex === undefined && stepLabel.value === undefined ? { step_index: -1 } : { step_label: stepLabel.value, step_index: stepIndex };
      const done = board.withDirectMeta({ owner: "tutor" }, () => board.highlightStep(target, resolvedStyle));
      if (!done) return fail("That line is not on the board, so nothing was highlighted. Write the point fresh instead.");
      return ok(`Line ${resolvedStyle === "circle" ? "ringed" : resolvedStyle === "box" ? "boxed" : "underlined"}.`);
    }

    case "cross_out_step": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const stepIndex = optionalNumber(args, "step_index");
      if (isToolError(stepIndex)) return stepIndex;
      const stepLabel = opt(args, "step_label"); if (stepLabel.error) return stepLabel.error;
      const target = stepIndex === undefined && stepLabel.value === undefined ? { step_index: -1 } : { step_label: stepLabel.value, step_index: stepIndex };
      const done = board.withDirectMeta({ owner: "tutor" }, () => board.crossOutStep(target));
      if (!done) return fail("That line is not on the board, so nothing was crossed out. Write the correction fresh instead.");
      return ok("Line crossed out.");
    }

    // ── Pictures ────────────────────────────────────────────────────────────

    case "draw_fraction": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const raw = requiredString(args, "fraction");
      if (isToolError(raw)) return raw;
      const first = parseFraction(raw);
      if (!first) return fail(`Could not read the fraction "${raw}". Use the form 3/4 with a denominator of 24 or less.`);
      const fractions: Fraction[] = [first];
      const second = opt(args, "second_fraction"); if (second.error) return second.error;
      if (second.value) {
        const f2 = parseFraction(second.value);
        if (!f2) return fail(`Could not read the second fraction "${second.value}".`);
        fractions.push(f2);
      }
      const modelRaw = opt(args, "model"); if (modelRaw.error) return modelRaw.error;
      const model = modelRaw.value === "bar" ? "bar" : "circle";
      const cdRaw = optionalNumber(args, "common_denominator"); if (isToolError(cdRaw)) return cdRaw;
      let drawn = fractions;
      if (cdRaw !== undefined) {
        const cd = Math.round(cdRaw);
        if (cd < 2 || cd > 24) return fail('"common_denominator" must be between 2 and 24.');
        const bad = fractions.find((f) => cd % f.d !== 0);
        if (bad) return fail(`"common_denominator" ${cd} is not a multiple of ${bad.d}; pick a common multiple of the denominators.`);
        drawn = fractions.map((f) => ({ n: f.n * (cd / f.d), d: cd }));
      }
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? raw }, () =>
        board.drawFraction({ fractions: drawn, model, label: label.value, column: pickColumn(column.value) }),
      );
      const parts = drawn.map((f) => describeFractionModel(f, model));
      const recut = cdRaw !== undefined ? ` (${fractions.map((f) => `${f.n}/${f.d}`).join(" and ")} recut into ${Math.round(cdRaw)}ths)` : "";
      return ok(`Drew ${parts.join(" beside ")}${recut}${label.value ? `, captioned "${label.value}"` : ""}.`);
    }

    case "add_number_line": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const min = requiredNumber(args, "min");
      if (isToolError(min)) return min;
      const max = requiredNumber(args, "max");
      if (isToolError(max)) return max;
      if (!(max > min)) return fail('"max" must be greater than "min".');
      const stepRaw = optionalNumber(args, "step");
      if (isToolError(stepRaw)) return stepRaw;
      let step = stepRaw && stepRaw > 0 ? stepRaw : undefined;
      if (step && (max - min) / step > 40) step = undefined;
      const pointsRaw = opt(args, "points"); if (pointsRaw.error) return pointsRaw.error;
      const intervalsRaw = opt(args, "intervals"); if (intervalsRaw.error) return intervalsRaw.error;
      const jumpsRaw = opt(args, "jumps"); if (jumpsRaw.error) return jumpsRaw.error;
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      const marks = parseLineMarks(pointsRaw.value).filter((m) => m.value >= min && m.value <= max);
      const intervals = parseLineIntervals(intervalsRaw.value);
      const jumps = parseLineJumps(jumpsRaw.value).filter((j) => j.from >= min && j.from <= max && j.to >= min && j.to <= max);
      const styleRaw = opt(args, "label_style"); if (styleRaw.error) return styleRaw.error;
      const labelStyle = styleRaw.value === "fraction" || styleRaw.value === "decimal" ? styleRaw.value : undefined;
      const secondMin = optionalNumber(args, "second_min"); if (isToolError(secondMin)) return secondMin;
      const secondMax = optionalNumber(args, "second_max"); if (isToolError(secondMax)) return secondMax;
      const secondLabel = opt(args, "second_label"); if (secondLabel.error) return secondLabel.error;
      const hasSecond = secondMin !== undefined && secondMax !== undefined && secondMax !== secondMin;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? `number line ${min} to ${max}` }, () =>
        board.addNumberLine({
          min, max, step, marks, intervals, jumps, label: label.value, column: pickColumn(column.value), labelStyle,
          secondMin: hasSecond ? secondMin : undefined, secondMax: hasSecond ? secondMax : undefined, secondLabel: hasSecond ? secondLabel.value : undefined,
        }),
      );
      const effectiveStep = step ?? niceStep(min, max);
      const bits = [
        `Number line from ${min} to ${max}, ticks every ${formatTick(effectiveStep, effectiveStep)}`,
        marks.length ? `dots at ${marks.map((m) => (m.label ? `${formatTick(m.value, effectiveStep)} (${m.label})` : formatTick(m.value, effectiveStep))).join(", ")}` : "",
        intervals.length ? `${intervals.length} shaded range${intervals.length === 1 ? "" : "s"}` : "",
        jumps.length ? `${jumps.length} hop arrow${jumps.length === 1 ? "" : "s"}` : "",
        hasSecond ? `second scale ${secondMin} to ${secondMax}${secondLabel.value ? ` (${secondLabel.value})` : ""} lined up underneath` : "",
      ].filter(Boolean);
      // A bare line (Sept 25 2026: drawn for "-7 - 4" with nothing on it, then
      // "narrated"): say so, with the two ways to mark it.
      const bare = marks.length === 0 && intervals.length === 0 && jumps.length === 0;
      return ok(`${bits.join("; ")}.${bare ? " Nothing is marked on it yet: points= puts dots on it, jumps= draws a move (\"-7>-11\")." : ""}`);
    }

    case "draw_figure": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const figureRaw = requiredString(args, "figure");
      if (isToolError(figureRaw)) return figureRaw;
      const figure = figureRaw.toLowerCase().replace(/[\s-]+/g, "_");
      if (!isFigureKind(figure)) return fail(`"figure" must be one of ${FIGURE_KINDS.join(", ")}.`);
      const sides = opt(args, "side_labels"); if (sides.error) return sides.error;
      const vertices = opt(args, "vertex_labels"); if (vertices.error) return vertices.error;
      const angles = opt(args, "angle_labels"); if (angles.error) return angles.error;
      const radius = opt(args, "radius_label"); if (radius.error) return radius.error;
      const diameter = opt(args, "diameter_label"); if (diameter.error) return diameter.error;
      const height = opt(args, "height_label"); if (height.error) return height.error;
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      const markRaw = optionalBoolean(args, "mark_right_angle");
      if (isToolError(markRaw)) return markRaw;
      const markRightAngle = markRaw ?? figure === "right_triangle";
      const gridRaw = optionalBoolean(args, "grid");
      if (isToolError(gridRaw)) return gridRaw;
      // Positional: "12 | | 6" means base 12, right side blank, top 6.
      const positional = (value: string | undefined) => {
        const parts = (value ?? "").split("|").map((t) => t.trim());
        while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
        return parts;
      };
      const sideLabels = positional(sides.value);
      const vertexLabels = positional(vertices.value);
      const angleLabels = positional(angles.value);
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? figure.replace("_", " ") }, () =>
        board.drawFigure({
          figure,
          sideLabels,
          vertexLabels,
          angleLabels,
          markRightAngle,
          radiusLabel: radius.value,
          diameterLabel: diameter.value,
          heightLabel: height.value,
          grid: gridRaw === true,
          label: label.value,
          column: pickColumn(column.value),
        }),
      );
      // Drawn on Desmos, a figure is to scale when its numbers say how big;
      // numbers that cannot make the shape are worth hearing either way.
      const model = figureModel({ figure, sideLabels, vertexLabels, angleLabels, markRightAngle, radiusLabel: radius.value, diameterLabel: diameter.value, heightLabel: height.value });
      const onDesmos = board.desmosFor?.("draw_figure", figure) ?? false;
      const scale = onDesmos ? (model.toScale ? ", drawn to scale" : ", not to scale (no lengths to go by)") : "";
      const gridNote = gridRaw && !onDesmos ? " The grid needs Desmos, which is not drawing here, so there is no grid." : "";
      const warning = model.warning ? ` Careful: ${model.warning}.` : "";
      const detail = [
        figureSideLabels(figure, sideLabels).description,
        height.value ? `height ${height.value}` : "",
        vertexLabels.length ? `vertices ${vertexLabels.join(", ")}` : "",
        angleLabels.length ? `angles ${angleLabels.join(", ")}` : "",
        radius.value ? `radius ${radius.value}` : "",
        diameter.value ? `diameter ${diameter.value}` : "",
      ].filter(Boolean).join("; ");
      return ok(`Drew a ${figure.replace("_", " ")}${detail ? ` with ${detail}` : ""}${scale}.${warning}${gridNote}`);
    }

    case "draw_angle": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const degreesRaw = requiredNumber(args, "degrees");
      if (isToolError(degreesRaw)) return degreesRaw;
      const degrees = clamp(Math.round(degreesRaw), 1, 359);
      const label = opt(args, "label"); if (label.error) return label.error;
      const caption = opt(args, "caption"); if (caption.error) return caption.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      const adjRaw = optionalNumber(args, "adjacent_degrees"); if (isToolError(adjRaw)) return adjRaw;
      const adjacentDegrees = adjRaw && adjRaw > 0 && degrees + Math.round(adjRaw) < 360 ? Math.round(adjRaw) : undefined;
      const adjacentLabel = opt(args, "adjacent_label"); if (adjacentLabel.error) return adjacentLabel.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: caption.value ?? `${degrees}° angle` }, () =>
        board.drawAngle({ degrees, label: label.value, caption: caption.value, column: pickColumn(column.value), adjacentDegrees, adjacentLabel: adjacentLabel.value }),
      );
      return ok(`Drew a ${degrees}° angle${label.value ? ` labelled ${label.value}` : ""}${adjacentDegrees ? ` next to a ${adjacentDegrees}° angle${adjacentLabel.value ? ` labelled ${adjacentLabel.value}` : ""}${degrees + adjacentDegrees === 180 ? " (together a straight line)" : ""}` : ""}.`);
    }

    case "draw_array": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const rowsRaw = requiredNumber(args, "rows");
      if (isToolError(rowsRaw)) return rowsRaw;
      const colsRaw = requiredNumber(args, "columns");
      if (isToolError(colsRaw)) return colsRaw;
      const rows = clamp(Math.round(rowsRaw), 1, 12);
      const columns = clamp(Math.round(colsRaw), 1, 12);
      const splitCol = optionalNumber(args, "split_after_column");
      if (isToolError(splitCol)) return splitCol;
      const splitRow = optionalNumber(args, "split_after_row");
      if (isToolError(splitRow)) return splitRow;
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      const splitAfterColumn = splitCol && splitCol >= 1 && splitCol < columns ? Math.round(splitCol) : undefined;
      const splitAfterRow = splitRow && splitRow >= 1 && splitRow < rows ? Math.round(splitRow) : undefined;
      const shadedRaw = optionalNumber(args, "shaded");
      if (isToolError(shadedRaw)) return shadedRaw;
      const shaded = shadedRaw === undefined ? undefined : clamp(Math.round(shadedRaw), 0, rows * columns);
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? `${rows} by ${columns} array` }, () =>
        board.drawArray({ rows, columns, splitAfterColumn, splitAfterRow, shaded, label: label.value, column: pickColumn(column.value) }),
      );
      const split = [
        splitAfterColumn ? `split into ${splitAfterColumn} + ${columns - splitAfterColumn} columns` : "",
        splitAfterRow ? `split into ${splitAfterRow} + ${rows - splitAfterRow} rows` : "",
      ].filter(Boolean).join(", ");
      return ok(`Drew a ${rows} × ${columns} array of dots (${rows * columns} dots)${split ? `, ${split}` : ""}.`);
    }

    case "add_area_model": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const title = requiredString(args, "title");
      if (isToolError(title)) return title;
      const rowLabels = requiredString(args, "row_labels");
      if (isToolError(rowLabels)) return rowLabels;
      const columnLabels = requiredString(args, "column_labels");
      if (isToolError(columnLabels)) return columnLabels;
      const cells = requiredString(args, "cells");
      if (isToolError(cells)) return cells;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title }, () =>
        board.addAreaModel(title, rowLabels, columnLabels, cells.replace(/\\n/g, "\n"), pickColumn(column.value)),
      );
      return ok(`Drew the area model "${title}" with rows ${splitPipe(rowLabels).join(", ")} and columns ${splitPipe(columnLabels).join(", ")}.`);
    }

    case "draw_balance": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const leftRaw = requiredString(args, "left");
      if (isToolError(leftRaw)) return leftRaw;
      const rightRaw = requiredString(args, "right");
      if (isToolError(rightRaw)) return rightRaw;
      const left = splitPipe(leftRaw).slice(0, 8);
      const right = splitPipe(rightRaw).slice(0, 8);
      if (left.length === 0 || right.length === 0) return fail("Both pans need at least one tile.");
      const tiltRaw = opt(args, "tilt"); if (tiltRaw.error) return tiltRaw.error;
      const tilt = tiltRaw.value === "left" || tiltRaw.value === "right" ? tiltRaw.value : "level";
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? "balance" }, () =>
        board.drawBalance({ left, right, tilt, label: label.value, column: pickColumn(column.value) }),
      );
      return ok(`Drew a balance scale, ${tilt === "level" ? "level" : `dipping ${tilt}`}: left pan ${left.join(" + ")}, right pan ${right.join(" + ")}.`);
    }

    case "draw_bar_chart": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const categoriesRaw = requiredString(args, "categories");
      if (isToolError(categoriesRaw)) return categoriesRaw;
      const valuesRaw = requiredString(args, "values");
      if (isToolError(valuesRaw)) return valuesRaw;
      const categories = splitPipe(categoriesRaw).slice(0, 8);
      const values = parsePipeNumbers(valuesRaw).slice(0, categories.length);
      if (categories.length === 0 || values.length !== categories.length) {
        return fail("Give one numeric value per category, e.g. categories 'A | B' with values '3 | 5'.");
      }
      const unit = opt(args, "unit"); if (unit.error) return unit.error;
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? "bar chart" }, () =>
        board.drawBarChart({ categories, values, unit: unit.value, label: label.value, column: pickColumn(column.value) }),
      );
      return ok(`Drew a bar chart: ${categories.map((c, i) => `${c} = ${values[i]}`).join(", ")}${unit.value ? ` (${unit.value})` : ""}.`);
    }

    case "draw_sketch": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const strokesRaw = requiredString(args, "strokes");
      if (isToolError(strokesRaw)) return strokesRaw;
      const strokes = parseSketchStrokes(strokesRaw);
      if (strokes.length === 0) return fail("No strokes could be read. Use 'x,y x,y x,y' pairs in 0-100, strokes separated by ';'.");
      const labelsRaw = opt(args, "labels"); if (labelsRaw.error) return labelsRaw.error;
      const widthRaw = optionalNumber(args, "width");
      if (isToolError(widthRaw)) return widthRaw;
      const heightRaw = optionalNumber(args, "height");
      if (isToolError(heightRaw)) return heightRaw;
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      const labels = parseSketchLabels(labelsRaw.value);
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? "sketch" }, () =>
        board.drawSketch({
          strokes,
          labels,
          width: clamp(widthRaw ?? 320, 160, 560),
          height: clamp(heightRaw ?? 220, 120, 420),
          label: label.value,
          column: pickColumn(column.value),
        }),
      );
      return ok(`Sketched ${strokes.length} stroke${strokes.length === 1 ? "" : "s"}${labels.length ? ` with labels ${labels.map((l) => l.text).join(", ")}` : ""}.`);
    }

    // ── Tables and graphs ──────────────────────────────────────────────────

    case "add_table": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const columns = requiredString(args, "columns");
      if (isToolError(columns)) return columns;
      const rows = requiredString(args, "rows");
      if (isToolError(rows)) return rows;
      const title = opt(args, "title"); if (title.error) return title.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title.value }, () =>
        board.addTable(columns, rows, title.value, pickColumn(column.value)),
      );
      return ok(`Table${title.value ? ` "${title.value}"` : ""} with columns ${columns.replace(/\s+/g, " ").slice(0, 80)}.`);
    }

    case "add_coordinate_axes": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const xMin = requiredNumber(args, "x_min"); if (isToolError(xMin)) return xMin;
      const xMax = requiredNumber(args, "x_max"); if (isToolError(xMax)) return xMax;
      const yMin = requiredNumber(args, "y_min"); if (isToolError(yMin)) return yMin;
      const yMax = requiredNumber(args, "y_max"); if (isToolError(yMax)) return yMax;
      if (!(xMax > xMin) || !(yMax > yMin)) return fail("Axis maxima must be greater than minima.");
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value }, () =>
        board.addCoordinateAxes(xMin, xMax, yMin, yMax, label.value, pickColumn(column.value)),
      );
      return ok(`Drew empty axes, x from ${xMin} to ${xMax}, y from ${yMin} to ${yMax}.`);
    }

    case "plot_points": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const points = requiredString(args, "points");
      if (isToolError(points)) return points;
      const xMin = requiredNumber(args, "x_min"); if (isToolError(xMin)) return xMin;
      const xMax = requiredNumber(args, "x_max"); if (isToolError(xMax)) return xMax;
      const yMin = requiredNumber(args, "y_min"); if (isToolError(yMin)) return yMin;
      const yMax = requiredNumber(args, "y_max"); if (isToolError(yMax)) return yMax;
      if (!(xMax > xMin) || !(yMax > yMin)) return fail("Axis maxima must be greater than minima.");
      const connect = optionalBoolean(args, "connect"); if (isToolError(connect)) return connect;
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value }, () =>
        board.plotPoints(points, xMin, xMax, yMin, yMax, label.value, pickColumn(column.value), connect === true),
      );
      return ok(`Plotted ${points}${connect ? ", joined into a shape" : ""}.`);
    }

    case "add_function_graph": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const expression = requiredString(args, "expression");
      if (isToolError(expression)) return expression;
      const xMin = requiredNumber(args, "x_min"); if (isToolError(xMin)) return xMin;
      const xMax = requiredNumber(args, "x_max"); if (isToolError(xMax)) return xMax;
      if (!(xMax > xMin)) return fail('"x_max" must be greater than "x_min".');
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      const marks = opt(args, "mark_points"); if (marks.error) return marks.error;
      const runRaw = opt(args, "slope_run"); if (runRaw.error) return runRaw.error;
      const markPoints = parseXYPoints(marks.value);
      const slopeRun = parseSlopeRun(runRaw.value);
      const second = opt(args, "second_expression"); if (second.error) return second.error;
      if (runRaw.value && !slopeRun) return fail('"slope_run" must look like "1..3" (two different x-values).');
      const yLow = typeof args.y_min === "number" && Number.isFinite(args.y_min) ? args.y_min : undefined;
      const yHigh = typeof args.y_max === "number" && Number.isFinite(args.y_max) ? args.y_max : undefined;
      if (yLow !== undefined && yHigh !== undefined && !(yHigh > yLow)) return fail('"y_max" must be greater than "y_min".');
      const extraRaw = opt(args, "extra_expressions"); if (extraRaw.error) return extraRaw.error;
      const extraExpressions = (extraRaw.value ?? "").split(/;|\n/).map((part) => part.trim()).filter(Boolean).slice(0, 6);
      // A broken expression is refused now, so the tutor can fix it in the same turn.
      for (const raw of [expression, second.value?.trim(), ...extraExpressions]) {
        if (!raw) continue;
        const problem = graphLatexProblem(ensureRelation(toDesmosLatex(raw)));
        if (problem) return fail(`Could not read "${raw}": ${problem}. Write it in LaTeX, e.g. "\\frac{1}{x}", "\\sqrt{x}", "\\left|x-2\\right|".`);
      }
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? expression }, () =>
        board.addFunctionGraph(expression, xMin, xMax, label.value, pickColumn(column.value) ?? "right", {
          markPoints,
          slopeRun,
          secondExpression: second.value?.trim() || undefined,
          yMin: yLow,
          yMax: yHigh,
          extraExpressions,
        }),
      );
      const extra = [
        markPoints.length ? `marked ${markPoints.map((p) => `(${p.x}, ${p.y})${p.label ? ` ${p.label}` : ""}`).join(", ")}` : "",
        slopeRun ? `slope triangle from x = ${slopeRun.x1} to x = ${slopeRun.x2}` : "",
        second.value ? `second line y = ${second.value.trim()} with the crossing point marked` : "",
        extraExpressions.length ? `also ${extraExpressions.join("; ")}` : "",
      ].filter(Boolean).join("; ");
      return ok(`Graphed y = ${expression} for x from ${xMin} to ${xMax}${extra ? `; ${extra}` : ""}.`);
    }

    case "draw_desmos": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      if (board.canUseDesmos?.() === false || !board.drawGraph) {
        return fail("Desmos is not available in this session. Use add_function_graph for curves and inequalities, plot_points for points and shapes, or draw_figure for a figure.");
      }
      const text: Record<string, string | undefined> = {};
      for (const key of ["expressions", "points", "table", "sliders", "settings", "label", "column"]) {
        const v = opt(args, key);
        if (v.error) return v.error;
        text[key] = v.value;
      }
      const view: Record<string, number | undefined> = {};
      for (const key of ["x_min", "x_max", "y_min", "y_max"]) {
        const v = optionalNumber(args, key);
        if (isToolError(v)) return v;
        view[key] = v;
      }
      const input = {
        expressions: text.expressions,
        points: text.points,
        table: text.table,
        sliders: text.sliders,
        settings: text.settings,
        xMin: view.x_min,
        xMax: view.x_max,
        yMin: view.y_min,
        yMax: view.y_max,
        box: DEFAULT_GRAPH_SIZE,
      };
      const check = buildFreeGraph({ ...input, colors: [] });
      if ("error" in check) return fail(check.error);
      const pens = Math.min(FREE_MAX_ITEMS + 2, check.spec.expressions.filter((e) => isGraphTable(e) || Boolean(e.color)).length);
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: text.label ?? "graph" }, () =>
        board.drawGraph?.((colors) => {
          const graph = buildFreeGraph({ ...input, colors });
          return "error" in graph ? check.spec : graph.spec;
        }, { pens, label: text.label, column: pickColumn(text.column) ?? "right", summary: check.described.join("; ") }),
      );
      return ok(`Drew a Desmos graph: ${check.described.join("; ")}.`);
    }

    case "draw_data_plot": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const kindRaw = requiredString(args, "kind");
      if (isToolError(kindRaw)) return kindRaw;
      const kind = kindRaw.toLowerCase().replace(/[\s-]+/g, "_") as DataKind;
      if (!["dot_plot", "histogram", "box_plot", "scatter"].includes(kind)) return fail('"kind" must be dot_plot, histogram, box_plot or scatter.');
      const text: Record<string, string | undefined> = {};
      for (const key of ["values", "points", "fit", "x_label", "y_label", "label", "column"]) {
        const v = opt(args, key);
        if (v.error) return v.error;
        text[key] = v.value;
      }
      const fit = (text.fit ?? "none").toLowerCase() as FitKind;
      if (!["none", "linear", "exponential"].includes(fit)) return fail('"fit" must be none, linear or exponential.');
      const binWidth = optionalNumber(args, "bin_width");
      if (isToolError(binWidth)) return binWidth;
      if (binWidth !== undefined && !(binWidth > 0)) return fail('"bin_width" must be a positive number.');
      const values = (text.values ?? "").split(/[|,;\s]+/).map((v) => parseNumber(v)).filter((v): v is number => v !== null && Number.isFinite(v));
      if (values.length > 200) return fail("At most 200 values.");
      const input = { kind, values, points: parseXYPoints(text.points), fit, binWidth, xLabel: text.x_label, yLabel: text.y_label };
      const check = buildDataPlot({ ...input, colors: [] });
      if ("error" in check) return fail(check.error);
      const meta = { owner: "tutor" as const, tutorReferenceLabel: text.label ?? kind.replace("_", " ") };
      const col = pickColumn(text.column);
      if (board.canUseDesmos?.() !== false && board.drawGraph) {
        board.withDirectMeta(meta, () =>
          board.drawGraph?.((colors) => {
            const plot = buildDataPlot({ ...input, colors });
            return "error" in plot ? check.spec : plot.spec;
          }, { pens: 2, label: text.label, column: col, summary: check.summary }),
        );
        return ok(`Drew ${check.summary}.`);
      }
      // Without Desmos, the vector picture of the same data.
      const fallback = check.fallback;
      if (!fallback) return fail("A box plot needs Desmos, which is not available in this session. Draw a dot plot (kind dot_plot) and say the five numbers instead.");
      board.withDirectMeta(meta, () => {
        if (fallback.tool === "number_line") board.addNumberLine({ ...fallback.drawing, label: text.label ?? fallback.drawing.label, column: col });
        else if (fallback.tool === "bar_chart") board.drawBarChart({ ...fallback.drawing, label: text.label ?? fallback.drawing.label, column: col });
        else if (fallback.tool === "function") board.addFunctionGraph(fallback.expression, fallback.xMin, fallback.xMax, text.label, col ?? "right", { markPoints: fallback.points, slopeRun: null });
        else board.plotPoints(fallback.points.map((p) => `(${p.x},${p.y})${p.label ? `:${p.label}` : ""}`).join(", "), fallback.xMin, fallback.xMax, fallback.yMin, fallback.yMax, text.label, col ?? "right", false);
      });
      return ok(`Drew ${check.summary}, without Desmos.`);
    }

    // ── Notes ──────────────────────────────────────────────────────────────

    case "add_worked_example_box": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const title = requiredString(args, "title");
      if (isToolError(title)) return title;
      const body = requiredString(args, "body");
      if (isToolError(body)) return body;
      const boxBody = boardLines(body);
      if (boxBody.length > BOX_BODY_MAX || countLines(boxBody) > BOX_BODY_LINES) {
        const lines = countLines(boxBody);
        return fail(`That box is ${boxBody.length} characters over ${lines} ${lines === 1 ? "line" : "lines"}. A box holds ${BOX_BODY_LINES} short lines (${BOX_BODY_MAX} chars max): keep the rule, say the rest out loud, or draw it.`);
      }
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title }, () =>
        board.addWorkedExampleBox(title, boxBody, pickColumn(column.value)),
      );
      return ok(`Boxed "${title}".`);
    }

    case "draw_tape_diagram": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const rowsRaw = requiredString(args, "rows");
      if (isToolError(rowsRaw)) return rowsRaw;
      const rows = parseTapeRows(rowsRaw);
      if (rows.length === 0) return fail('"rows" needs at least one row of boxes, e.g. \'Red: 2 | 2 | 2 = 6; Blue: 3 | 3\'.');
      const totalLabel = opt(args, "total_label"); if (totalLabel.error) return totalLabel.error;
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? "tape diagram" }, () =>
        board.drawTapeDiagram({ rows, totalLabel: totalLabel.value, label: label.value, column: pickColumn(column.value) }),
      );
      const desc = rows.map((r) => `${r.name ? `${r.name}: ` : ""}${r.segments.length} box${r.segments.length === 1 ? "" : "es"}${r.segments.some((s) => s.shaded) ? ` (${r.segments.filter((s) => s.shaded).length} shaded)` : ""}${r.total ? ` = ${r.total}` : ""}`).join("; ");
      return ok(`Drew a tape diagram: ${desc}${totalLabel.value ? `; bracket "${totalLabel.value}"` : ""}${label.value ? `, captioned "${label.value}"` : ""}.`);
    }

    case "draw_grid": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const rowsRaw = requiredNumber(args, "rows"); if (isToolError(rowsRaw)) return rowsRaw;
      const colsRaw = requiredNumber(args, "columns"); if (isToolError(colsRaw)) return colsRaw;
      const rows = clamp(Math.round(rowsRaw), 1, 20);
      const columns = clamp(Math.round(colsRaw), 1, 20);
      const shadedRaw = optionalNumber(args, "shaded"); if (isToolError(shadedRaw)) return shadedRaw;
      const shaded = clamp(Math.round(shadedRaw ?? 0), 0, rows * columns);
      const srRaw = optionalNumber(args, "shade_rows"); if (isToolError(srRaw)) return srRaw;
      const scRaw = optionalNumber(args, "shade_columns"); if (isToolError(scRaw)) return scRaw;
      // Both a count and bands (Sept 25 2026: shaded=35 with shade_columns=5
      // drew a 50/50 grid for "0.35 or 0.5"): the count is the picture asked
      // for, so the bands go.
      const bandsIgnored = shaded > 0 && Boolean(srRaw || scRaw);
      const shadeRows = srRaw && !bandsIgnored ? clamp(Math.round(srRaw), 0, rows) : undefined;
      const shadeColumns = scRaw && !bandsIgnored ? clamp(Math.round(scRaw), 0, columns) : undefined;
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? `${rows} by ${columns} grid` }, () =>
        board.drawGrid({ rows, columns, shaded, shadeRows, shadeColumns, label: label.value, column: pickColumn(column.value) }),
      );
      const bands = shadeRows || shadeColumns
        ? `${shadeRows ? `${shadeRows} of ${rows} rows tinted` : ""}${shadeRows && shadeColumns ? ", " : ""}${shadeColumns ? `${shadeColumns} of ${columns} columns hatched` : ""}${shadeRows && shadeColumns ? `; overlap ${shadeRows * shadeColumns} of ${rows * columns}` : ""}`
        : `${shaded} shaded`;
      return ok(`Drew a ${rows} × ${columns} grid (${rows * columns} squares) with ${bands}${label.value ? `, captioned "${label.value}"` : ""}.${bandsIgnored ? " (shade_rows/shade_columns were ignored: shaded=N is the count; use the bands only for a product of fractions.)" : ""}`);
    }

    case "draw_illustration": {
      // An illustration from a scene the illustrator wrote (lib/illustration).
      // Not offered to the Live model: the app draws these for its illustrate
      // calls and the planner's orders (Oct 2026). The scene comes as an object
      // or as its JSON.
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      if (!board.drawIllustration) return fail("This board can't draw illustrations.");
      const raw = args.scene;
      const scene = typeof raw === "string" ? parseScene(raw) : raw && typeof raw === "object" && "root" in (raw as object) ? (raw as Scene) : null;
      if (!scene) return fail("draw_illustration needs a scene with a root.");
      const caption = typeof args.caption === "string" ? args.caption.trim().slice(0, 80) : "";
      // The part names go in the label the board summary shows, so the tutor
      // and the planner can point at "jar2" without having drawn it.
      const partList = Object.keys(renderScene(scene).parts).filter((k) => !k.includes(".")).slice(0, 8);
      const title = caption || scene.title || "illustration";
      const name = `${title}${partList.length ? ` (parts: ${partList.join(", ")})` : ""}`;
      let drawn: ReturnType<NonNullable<typeof board.drawIllustration>> = null;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: name }, () => {
        drawn = board.drawIllustration!(scene);
      });
      const done = drawn as { parts: string[]; problems: string[] } | null;
      if (!done) return fail("The illustration came out empty.");
      const parts = done.parts.filter((p) => !p.includes("."));
      // Its parts once, in the result and so in the board list's label (Oct 23
      // 2026: they were written twice, and the short list cut both off).
      // Oct 24 2026: pictures went up and were never marked, so the student had
      // to work out for themselves which blocks were which. The result says how.
      // After the item id (NEXT), so it never becomes part of the picture's label.
      const ring = parts.length ? `${NEXT}Ring each part as you name it: circle_item(target="${parts.at(-1)}").` : "";
      return ok(`Drew "${title}"${parts.length ? ` (parts: ${parts.slice(0, 8).join(", ")})` : ""}.${done.problems.length ? ` Not drawn: ${done.problems.slice(0, 3).join("; ")}.` : ""}${ring}`);
    }

    case "write_vertical": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const operandsRaw = requiredString(args, "operands"); if (isToolError(operandsRaw)) return operandsRaw;
      const opRaw = requiredString(args, "operation"); if (isToolError(opRaw)) return opRaw;
      const operation = parseOperation(opRaw);
      if (!operation) return fail('"operation" must be +, -, or ×.');
      const operands = splitPipe(operandsRaw).map((t) => t.replace(/\s+/g, "")).filter(Boolean).slice(0, 4);
      if (operands.length < 2) return fail('"operands" needs two to four numbers separated by |, e.g. \'347 | 289\'.');
      if (operands.some((t) => t.length > 12)) return fail("Each operand must be 12 characters or fewer.");
      const result = opt(args, "result"); if (result.error) return result.error;
      const carries = opt(args, "carries"); if (carries.error) return carries.error;
      const partialsRaw = opt(args, "partial_products"); if (partialsRaw.error) return partialsRaw.error;
      const partials = splitPipe(partialsRaw.value).map((t) => t.trim()).filter(Boolean).slice(0, 6);
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? operands.join(` ${operation} `) }, () =>
        board.writeVertical({ operands, operation, result: result.value?.trim() || undefined, carries: carries.value, partials, label: label.value, column: pickColumn(column.value) }),
      );
      return ok(`Wrote ${operands.join(` ${operation} `)} in columns${partials.length ? ` with partial products ${partials.join(", ")}` : ""}${result.value ? ` = ${result.value}` : " (answer left blank)"}.`);
    }

    case "draw_long_division": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const dividend = requiredString(args, "dividend"); if (isToolError(dividend)) return dividend;
      const divisor = requiredString(args, "divisor"); if (isToolError(divisor)) return divisor;
      const quotient = opt(args, "quotient"); if (quotient.error) return quotient.error;
      const stepsRaw = opt(args, "steps"); if (stepsRaw.error) return stepsRaw.error;
      const steps = (stepsRaw.value ?? "").split("|").map((t) => t.replace(/\s+$/, "")).filter((t) => t.trim().length > 0).slice(0, 8);
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? `${dividend.trim()} ÷ ${divisor.trim()}` }, () =>
        board.drawLongDivision({ dividend: dividend.trim(), divisor: divisor.trim(), quotient: quotient.value, steps, label: label.value, column: pickColumn(column.value) }),
      );
      return ok(`Set up ${dividend.trim()} ÷ ${divisor.trim()} as long division${quotient.value ? ` with quotient ${quotient.value.trim()}` : ""}${steps.length ? ` and ${steps.length} step line${steps.length === 1 ? "" : "s"}` : ""}.`);
    }

    case "draw_transversal": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const labelsRaw = requiredString(args, "angle_labels"); if (isToolError(labelsRaw)) return labelsRaw;
      const angleLabels = labelsRaw.split("|").map((t) => t.trim()).slice(0, 8);
      const marksRaw = opt(args, "mark_angles"); if (marksRaw.error) return marksRaw.error;
      const marks = parseAngleMarks(marksRaw.value);
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? "parallel lines and a transversal" }, () =>
        board.drawTransversal({ angleLabels, marks, label: label.value, column: pickColumn(column.value) }),
      );
      const named = angleLabels.map((t, i) => (t ? `${i + 1}: ${t}` : "")).filter(Boolean).join(", ");
      return ok(`Drew two parallel lines cut by a transversal${named ? `; angles ${named}` : ""}${marks.length ? `; marked ${marks.join(", ")}` : ""}.`);
    }

    case "draw_icons": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const iconRaw = requiredString(args, "icon"); if (isToolError(iconRaw)) return iconRaw;
      const icon = resolveIconName(iconRaw);
      if (!icon) return fail(iconMiss(iconRaw));
      const countRaw = requiredNumber(args, "count"); if (isToolError(countRaw)) return countRaw;
      // Never clamp silently: a lesson on Sept 15 asked for 55 apples three
      // times, got 40 each time with a result that said 40, and the tutor
      // ended up apologising to the student for the app.
      const wanted = Math.round(countRaw);
      if (wanted < 1) return fail('"count" must be at least 1.');
      if (wanted > MAX_ICONS) {
        return fail(`${wanted} icons is more than the board holds (${MAX_ICONS} max). Draw one group and label it, use draw_tape_diagram for a large amount, or write the number instead.`);
      }
      const count = wanted;
      const gsRaw = optionalNumber(args, "group_size"); if (isToolError(gsRaw)) return gsRaw;
      const groupSize = gsRaw && gsRaw >= 2 ? clamp(Math.round(gsRaw), 2, 12) : undefined;
      const arrangeRaw = opt(args, "arrange"); if (arrangeRaw.error) return arrangeRaw.error;
      const ARRANGES: readonly IconArrange[] = ["rows", "array", "ten_frame", "ring", "groups"];
      const arrange = arrangeRaw.value ? ARRANGES.find((a) => a === arrangeRaw.value) : undefined;
      if (arrangeRaw.value && !arrange) return fail(`"arrange" must be one of: ${ARRANGES.join(", ")}.`);
      const columnsRaw = optionalNumber(args, "columns"); if (isToolError(columnsRaw)) return columnsRaw;
      const columns = columnsRaw ? clamp(Math.round(columnsRaw), 1, 20) : undefined;
      const crossedRaw = optionalNumber(args, "crossed"); if (isToolError(crossedRaw)) return crossedRaw;
      const crossed = crossedRaw ? clamp(Math.round(crossedRaw), 0, count) : 0;
      const secondRaw = opt(args, "second_icon"); if (secondRaw.error) return secondRaw.error;
      const secondIcon = secondRaw.value ? resolveIconName(secondRaw.value) ?? undefined : undefined;
      if (secondRaw.value && !secondIcon) return fail(iconMiss(secondRaw.value));
      const secondCountRaw = optionalNumber(args, "second_count"); if (isToolError(secondCountRaw)) return secondCountRaw;
      const secondCount = secondIcon ? clamp(Math.round(secondCountRaw ?? count), 1, MAX_ICONS) : undefined;
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? `${count} ${icon.replaceAll("_", " ")}` }, () =>
        board.drawIcons({ icon, count, groupSize, arrange, columns, crossed, secondIcon, secondCount, label: label.value, column: pickColumn(column.value) }),
      );
      const bits = [
        `${count} ${icon.replaceAll("_", " ")}${count === 1 ? "" : "s"}`,
        groupSize ? `in groups of ${groupSize}` : "",
        arrange && arrange !== "rows" ? `laid out as ${arrange.replace("_", " ")}${columns ? ` of ${columns}` : ""}` : "",
        crossed ? `${crossed} crossed out` : "",
        secondIcon ? `and ${secondCount} ${secondIcon.replaceAll("_", " ")}${secondCount === 1 ? "" : "s"} in a second row` : "",
      ].filter(Boolean).join(", ");
      return ok(`Drew ${bits}${label.value ? `, captioned "${label.value}"` : ""}.`);
    }

    case "point_at": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const target = requiredString(args, "target");
      if (isToolError(target)) return target;
      const item = board.withDirectMeta({ owner: "tutor" }, () => board.pointAt(target));
      if (!item) return fail(`Nothing on the board matches "${target}". Use an id from the [Board: …] list.`);
      return ok(`Pointing at ${item.id} (${item.label}).`);
    }

    case "highlight": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const target = requiredString(args, "target");
      if (isToolError(target)) return target;
      const text = opt(args, "text");
      if (text.error) return text.error;
      // One sky pen (Sept 16): an old `color` argument is ignored. Words get a
      // quick highlighter swipe (Oct 24 2026, Mateo: "a quick swipe that looks
      // like a highlighter… not a transparent thin line"); how: "underline"
      // keeps the Oct 14 scribble.
      const how = typeof args.how === "string" && args.how.trim().toLowerCase() === "underline" ? "underline" : "marker";
      if (!board.highlight) return fail("Highlighting is not available on this board.");
      const res = board.withDirectMeta({ owner: "tutor" }, () => board.highlight!(target, text.value, how));
      if (!res) return fail(`Nothing on the board matches "${target}". Use an id from the [Board: …] list.`);
      if (text.value && res.part === "item") {
        return ok(`Couldn't find "${text.value}" written in ${res.item.id}, so the whole item (${res.item.label}) is marked`);
      }
      return ok(text.value ? `${how === "marker" ? "Highlighted" : "Underlined"} "${text.value}" in ${res.item.id} (${res.item.label})` : `Marked ${res.item.id} (${res.item.label})`);
    }

    // Answered: the question tags fade (the app, after a right answer).
    case "settle_questions": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const n = board.fadeQuestions?.() ?? 0;
      return ok(n ? `Faded ${n} answered question tag${n === 1 ? "" : "s"}.` : "No question tags to fade.");
    }

    // A right answer, marked by the app (not declared to the model): a green
    // box drawn round it and a check beside it (Oct 14 2026).
    case "mark_correct": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const target = requiredString(args, "target");
      if (isToolError(target)) return target;
      if (!board.markCorrect) return dispatchWhiteboardTool("circle_item", { target, keep: true }, ctx);
      const item = board.withDirectMeta({ owner: "tutor" }, () => board.markCorrect!(target));
      if (!item) return fail(`Nothing on the board matches "${target}".`);
      return ok(`Boxed ${item.id} (${item.label}) in green with a check.`);
    }

    case "circle_item": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const target = requiredString(args, "target");
      if (isToolError(target)) return target;
      const keep = optionalBoolean(args, "keep");
      if (isToolError(keep)) return keep;
      const item = board.withDirectMeta({ owner: "tutor" }, () => board.circleItem(target, keep === true));
      if (!item) return fail(`Nothing on the board matches "${target}". Use an id from the [Board: …] list.`);
      return ok(keep ? `Ringed ${item.id} (${item.label}); the ring stays.` : `Laser ring around ${item.id} (${item.label}), fading in a few seconds.`);
    }

    case "erase_items": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const targets = requiredString(args, "targets");
      if (isToolError(targets)) return targets;
      const list = parseTargetList(targets);
      if (list.length === 0) return fail('Give at least one item id or label in "targets".');
      const erased = board.withDirectMeta({ owner: "tutor" }, () => board.eraseItems(list));
      if (erased.length === 0) return fail(`Nothing on the board matches ${list.map((t) => `"${t}"`).join(", ")}.`);
      return ok(`Erased ${erased.length} item${erased.length === 1 ? "" : "s"}: ${erased.join("; ")}.`);
    }

    case "erase_older": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const keep = optionalNumber(args, "keep");
      if (isToolError(keep)) return keep;
      const erased = board.withDirectMeta({ owner: "tutor" }, () => board.eraseOlder(keep ?? 3));
      if (erased.length === 0) return ok("Nothing older to erase; the board is already tidy.");
      return ok(`Erased ${erased.length} older item${erased.length === 1 ? "" : "s"}, kept the heading and the newest ${keep ?? 3}.`);
    }

    case "look_at_board": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      return ok("Looking at the board; a fresh picture of it is on its way to you");
    }

    case "clear_whiteboard": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      board.withDirectMeta({ owner: "tutor" }, () => board.clearWhiteboard());
      return ok("Whiteboard cleared.");
    }

    default:
      return fail(`Unknown whiteboard tool "${name}".`);
  }
}
