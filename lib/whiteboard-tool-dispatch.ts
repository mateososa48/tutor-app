import type { WhiteboardHandle } from "@/components/TldrawCore";
import type { CalloutStyle } from "@/lib/whiteboard-tools";
import {
  clamp,
  describeFractionModel,
  formatTick,
  isFigureKind,
  niceStep,
  parseFraction,
  parseLineIntervals,
  parseLineJumps,
  parseLineMarks,
  parsePipeNumbers,
  parseSketchLabels,
  parseSketchStrokes,
  splitPipe,
  type BoardColumn,
  type Fraction,
} from "@/lib/board-diagrams";
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
};

function ensureBoard(ctx: DispatchCtx): WhiteboardHandle | ToolCallResult {
  if (!ctx.whiteboard) return fail("Whiteboard is not ready yet.");
  return ctx.whiteboard;
}

function pickColumn(value: string | undefined): BoardColumn | undefined {
  if (value === "left" || value === "right") return value;
  return undefined;
}

function pickSize(value: string | undefined): "heading" | "body" | undefined {
  if (value === "heading" || value === "body") return value;
  return undefined;
}

// Models sometimes double-escape newlines in JSON, producing literal \n
// strings. Normalize them to real newline characters before drawing.
function normalizeText(s: string): string {
  return s.replace(/\\n/g, "\n");
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

export function dispatchWhiteboardTool(
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
      return ok(`Cleared the board and wrote the heading "${title}".`);
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
          goal,
          givens.value ? normalizeText(givens.value) : undefined,
          unknowns.value ? normalizeText(unknowns.value) : undefined,
          plan.value ? normalizeText(plan.value) : undefined,
          pickColumn(column.value),
        ),
      );
      return ok("Problem setup box drawn.");
    }

    case "add_equation_sequence": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const steps = requiredString(args, "steps");
      if (isToolError(steps)) return steps;
      const annotations = opt(args, "annotations"); if (annotations.error) return annotations.error;
      const title = opt(args, "title"); if (title.error) return title.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title.value }, () =>
        board.addEquationSequence(steps, annotations.value, title.value, pickColumn(column.value)),
      );
      return ok(`Wrote ${splitPipe(steps).length} equation lines.`);
    }

    case "draw_equation_step": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const latex = requiredString(args, "latex");
      if (isToolError(latex)) return latex;
      const annotation = opt(args, "annotation"); if (annotation.error) return annotation.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: latex }, () =>
        board.drawEquationStep(latex, annotation.value, pickColumn(column.value)),
      );
      return ok(`Wrote the line ${latex}${annotation.value ? ` (${annotation.value})` : ""}.`);
    }

    case "add_text_note": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const text = requiredString(args, "text");
      if (isToolError(text)) return text;
      const size = opt(args, "size"); if (size.error) return size.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor" }, () =>
        board.addTextNote(normalizeText(text), pickSize(size.value), pickColumn(column.value)),
      );
      return ok("Note written.");
    }

    case "add_callout": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const text = requiredString(args, "text");
      if (isToolError(text)) return text;
      const style = requiredString(args, "style");
      if (isToolError(style)) return style;
      const ALLOWED_STYLES: readonly CalloutStyle[] = ["hint", "correct", "wrong", "warning", "important", "remember"];
      if (!ALLOWED_STYLES.includes(style as CalloutStyle)) {
        return fail(`Argument "style" must be one of: ${ALLOWED_STYLES.join(", ")}.`);
      }
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor" }, () =>
        board.addCallout(normalizeText(text), style as CalloutStyle, pickColumn(column.value)),
      );
      return ok(`Sticky note (${style}) added.`);
    }

    case "add_student_attempt": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const text = requiredString(args, "text");
      if (isToolError(text)) return text;
      const column = opt(args, "column"); if (column.error) return column.error;
      // Student attempts are student-owned even though the tutor calls the
      // tool, so later corrections never overwrite the student's work.
      board.withDirectMeta({ owner: "student" }, () =>
        board.addStudentAttempt(normalizeText(text), pickColumn(column.value)),
      );
      return ok("Student's attempt written in their hand.");
    }

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
      if (stepIndex === undefined && stepLabel.value === undefined) {
        return fail('Provide "step_label" (preferred) or "step_index" to identify the target step.');
      }
      const done = board.withDirectMeta({ owner: "tutor" }, () =>
        board.highlightStep({ step_label: stepLabel.value, step_index: stepIndex }, resolvedStyle),
      );
      if (!done) return fail("That line is not on the board, so nothing was highlighted. Write the point fresh instead.");
      return ok(`Line ${resolvedStyle === "circle" ? "ringed" : resolvedStyle === "box" ? "boxed" : "underlined"}.`);
    }

    case "cross_out_step": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const stepIndex = optionalNumber(args, "step_index");
      if (isToolError(stepIndex)) return stepIndex;
      const stepLabel = opt(args, "step_label"); if (stepLabel.error) return stepLabel.error;
      if (stepIndex === undefined && stepLabel.value === undefined) {
        return fail('Provide "step_label" (preferred) or "step_index" to identify the target step.');
      }
      const done = board.withDirectMeta({ owner: "tutor" }, () =>
        board.crossOutStep({ step_label: stepLabel.value, step_index: stepIndex }),
      );
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
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? raw }, () =>
        board.drawFraction({ fractions, model, label: label.value, column: pickColumn(column.value) }),
      );
      const parts = fractions.map((f) => describeFractionModel(f, model));
      return ok(`Drew ${parts.join(" beside ")}${label.value ? `, captioned "${label.value}"` : ""}.`);
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
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? `number line ${min} to ${max}` }, () =>
        board.addNumberLine({ min, max, step, marks, intervals, jumps, label: label.value, column: pickColumn(column.value) }),
      );
      const effectiveStep = step ?? niceStep(min, max);
      const bits = [
        `Number line from ${min} to ${max}, ticks every ${formatTick(effectiveStep, effectiveStep)}`,
        marks.length ? `dots at ${marks.map((m) => (m.label ? `${formatTick(m.value, effectiveStep)} (${m.label})` : formatTick(m.value, effectiveStep))).join(", ")}` : "",
        intervals.length ? `${intervals.length} shaded range${intervals.length === 1 ? "" : "s"}` : "",
        jumps.length ? `${jumps.length} hop arrow${jumps.length === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      return ok(`${bits.join("; ")}.`);
    }

    case "draw_figure": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const figureRaw = requiredString(args, "figure");
      if (isToolError(figureRaw)) return figureRaw;
      const figure = figureRaw.toLowerCase().replace(/[\s-]+/g, "_");
      if (!isFigureKind(figure)) return fail('"figure" must be triangle, right_triangle, square, rectangle, or circle.');
      const sides = opt(args, "side_labels"); if (sides.error) return sides.error;
      const vertices = opt(args, "vertex_labels"); if (vertices.error) return vertices.error;
      const angles = opt(args, "angle_labels"); if (angles.error) return angles.error;
      const radius = opt(args, "radius_label"); if (radius.error) return radius.error;
      const diameter = opt(args, "diameter_label"); if (diameter.error) return diameter.error;
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      const markRaw = optionalBoolean(args, "mark_right_angle");
      if (isToolError(markRaw)) return markRaw;
      const markRightAngle = markRaw ?? figure === "right_triangle";
      const sideLabels = splitPipe(sides.value);
      const vertexLabels = splitPipe(vertices.value);
      const angleLabels = splitPipe(angles.value);
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? figure.replace("_", " ") }, () =>
        board.drawFigure({
          figure,
          sideLabels,
          vertexLabels,
          angleLabels,
          markRightAngle,
          radiusLabel: radius.value,
          diameterLabel: diameter.value,
          label: label.value,
          column: pickColumn(column.value),
        }),
      );
      const detail = [
        sideLabels.length ? `sides ${sideLabels.join(", ")}` : "",
        vertexLabels.length ? `vertices ${vertexLabels.join(", ")}` : "",
        angleLabels.length ? `angles ${angleLabels.join(", ")}` : "",
        radius.value ? `radius ${radius.value}` : "",
        diameter.value ? `diameter ${diameter.value}` : "",
      ].filter(Boolean).join("; ");
      return ok(`Drew a ${figure.replace("_", " ")}${detail ? ` with ${detail}` : ""}.`);
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
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: caption.value ?? `${degrees}° angle` }, () =>
        board.drawAngle({ degrees, label: label.value, caption: caption.value, column: pickColumn(column.value) }),
      );
      return ok(`Drew a ${degrees}° angle${label.value ? ` labelled ${label.value}` : ""}.`);
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
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? `${rows} by ${columns} array` }, () =>
        board.drawArray({ rows, columns, splitAfterColumn, splitAfterRow, label: label.value, column: pickColumn(column.value) }),
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
        board.addAreaModel(title, rowLabels, columnLabels, normalizeText(cells), pickColumn(column.value)),
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
      return ok("Table drawn.");
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
      const label = opt(args, "label"); if (label.error) return label.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value }, () =>
        board.plotPoints(points, xMin, xMax, yMin, yMax, label.value, pickColumn(column.value)),
      );
      return ok(`Plotted ${points}.`);
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
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label.value ?? expression }, () =>
        board.addFunctionGraph(expression, xMin, xMax, label.value, pickColumn(column.value) ?? "right"),
      );
      return ok(`Graphed y = ${expression} for x from ${xMin} to ${xMax}.`);
    }

    // ── Notes ──────────────────────────────────────────────────────────────

    case "add_worked_example_box": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const title = requiredString(args, "title");
      if (isToolError(title)) return title;
      const body = requiredString(args, "body");
      if (isToolError(body)) return body;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title }, () =>
        board.addWorkedExampleBox(title, normalizeText(body), pickColumn(column.value)),
      );
      return ok(`Boxed "${title}".`);
    }

    case "add_two_column_comparison": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const title = requiredString(args, "title");
      if (isToolError(title)) return title;
      const leftTitle = requiredString(args, "left_title");
      if (isToolError(leftTitle)) return leftTitle;
      const leftBody = requiredString(args, "left_body");
      if (isToolError(leftBody)) return leftBody;
      const rightTitle = requiredString(args, "right_title");
      if (isToolError(rightTitle)) return rightTitle;
      const rightBody = requiredString(args, "right_body");
      if (isToolError(rightBody)) return rightBody;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title }, () =>
        board.addTwoColumnComparison(title, leftTitle, normalizeText(leftBody), rightTitle, normalizeText(rightBody), pickColumn(column.value)),
      );
      return ok(`Drew "${leftTitle}" beside "${rightTitle}".`);
    }

    case "add_vector_diagram": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const title = requiredString(args, "title");
      if (isToolError(title)) return title;
      const centerLabel = requiredString(args, "center_label");
      if (isToolError(centerLabel)) return centerLabel;
      const vectors = requiredString(args, "vectors");
      if (isToolError(vectors)) return vectors;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title }, () =>
        board.addVectorDiagram(title, centerLabel, vectors, pickColumn(column.value) ?? "right"),
      );
      return ok(`Drew the diagram "${title}".`);
    }

    case "add_process_map": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const title = requiredString(args, "title");
      if (isToolError(title)) return title;
      const nodes = requiredString(args, "nodes");
      if (isToolError(nodes)) return nodes;
      const connectors = opt(args, "connectors"); if (connectors.error) return connectors.error;
      const column = opt(args, "column"); if (column.error) return column.error;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title }, () =>
        board.addProcessMap(title, nodes, connectors.value, pickColumn(column.value)),
      );
      return ok(`Drew the process map "${title}".`);
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
