import type { WhiteboardHandle } from "@/components/TldrawCore";
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
import { parseTargetList, toolRole } from "@/lib/board-items";
import {
  attemptProblem,
  boardLines,
  calloutProblem,
  contentFingerprint,
  findDuplicate,
  pictureContent,
  splitSlots,
  splitSteps,
} from "@/lib/board-content-rules";
import { parsePlace, type PlaceRequest } from "@/lib/board-layout";
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
export function dispatchWhiteboardTool(
  name: string,
  args: Args,
  ctx: DispatchCtx,
): ToolCallResult {
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
  const result = dispatchInner(name, args, ctx);
  if (!board || !token) return result;
  // A follow-up ("Next, write the problem…") comes after the item id, and is
  // never part of the item's label.
  const [said, next] = (result.success ? result.message ?? "Done" : "").split(NEXT);
  const itemId = board.endItem(token, result.success ? said : null);
  // What placement or a mark noticed: "stayed on this page: there was room",
  // "b2 is on page 1, so the board turns there to show it".
  const notes = board.takeNotes?.() ?? [];
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
      return ok(`Cleared the board and wrote the heading "${title}".${NEXT}Next, write the problem itself exactly as given, then work under it.`);
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
      const tag = boardLines(text).replace(/\n+/g, " ");
      const problem = calloutProblem(tag);
      if (problem) return fail(problem);
      if (tag.length > CALLOUT_MAX) {
        return fail(`That tag is ${tag.length} characters. A tag holds one short line (${CALLOUT_MAX} max): keep the question or the rule, say the rest.`);
      }
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor" }, () => board.addCallout(tag, pickColumn(column.value)));
      return ok(`Tagged "${tag.slice(0, 90)}".`);
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
      return ok(`${bits.join("; ")}.`);
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
      const shadeRows = srRaw ? clamp(Math.round(srRaw), 0, rows) : undefined;
      const shadeColumns = scRaw ? clamp(Math.round(scRaw), 0, columns) : undefined;
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? `${rows} by ${columns} grid` }, () =>
        board.drawGrid({ rows, columns, shaded, shadeRows, shadeColumns, label: label.value, column: pickColumn(column.value) }),
      );
      const bands = shadeRows || shadeColumns
        ? `${shadeRows ? `${shadeRows} of ${rows} rows tinted` : ""}${shadeRows && shadeColumns ? ", " : ""}${shadeColumns ? `${shadeColumns} of ${columns} columns hatched` : ""}${shadeRows && shadeColumns ? `; overlap ${shadeRows * shadeColumns} of ${rows * columns}` : ""}`
        : `${shaded} shaded`;
      return ok(`Drew a ${rows} × ${columns} grid (${rows * columns} squares) with ${bands}${label.value ? `, captioned "${label.value}"` : ""}.`);
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
      // One sky highlighter (Sept 16): an old `color` argument is ignored.
      if (!board.highlight) return fail("Highlighting is not available on this board.");
      const res = board.withDirectMeta({ owner: "tutor" }, () => board.highlight!(target, text.value));
      if (!res) return fail(`Nothing on the board matches "${target}". Use an id from the [Board: …] list.`);
      if (text.value && res.part === "item") {
        return ok(`Couldn't find "${text.value}" written in ${res.item.id}, so the whole item (${res.item.label}) is marked`);
      }
      return ok(text.value ? `Highlighted "${text.value}" in ${res.item.id} (${res.item.label})` : `Marked ${res.item.id} (${res.item.label})`);
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
