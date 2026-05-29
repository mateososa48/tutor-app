import type { WhiteboardHandle } from "@/components/TldrawCore";
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

function pickColumn(value: string | undefined): "left" | "right" | undefined {
  if (value === "left" || value === "right") return value;
  return undefined;
}

function pickSize(value: string | undefined): "heading" | "body" | undefined {
  if (value === "heading" || value === "body") return value;
  return undefined;
}

function pickHighlightStyle(value: string | undefined): "circle" | "underline" | "box" | undefined {
  if (value === "circle" || value === "underline" || value === "box") return value;
  return undefined;
}

export function dispatchWhiteboardTool(
  name: string,
  args: Args,
  ctx: DispatchCtx,
): ToolCallResult {
  // All direct-tool handle calls below are wrapped in
  // `board.withDirectMeta({ owner: "tutor" | "student", tutorReferenceLabel? }, () => ...)`.
  // The wrapper tags every shape created during the call with `meta.owner` so
  // future highlight/cross-out/correction tools can scope to a single owner
  // (e.g. cross_out_step targets a tutor-owned step, not a student attempt).

  switch (name) {
    case "start_new_problem": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const title = requiredString(args, "title");
      if (isToolError(title)) return title;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title }, () =>
        board.startNewProblem(title),
      );
      return ok(`Cleared board and titled "${title}".`);
    }

    case "start_board_section": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const title = requiredString(args, "title");
      if (isToolError(title)) return title;
      const freshPage = optionalBoolean(args, "fresh_page");
      if (isToolError(freshPage)) return freshPage;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title }, () =>
        board.startBoardSection(title, freshPage ?? false),
      );
      return ok(`Added section "${title}".`);
    }

    case "add_problem_setup": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const goal = requiredString(args, "goal");
      if (isToolError(goal)) return goal;
      const givens = optionalString(args, "givens");
      if (isToolError(givens)) return givens;
      const unknowns = optionalString(args, "unknowns");
      if (isToolError(unknowns)) return unknowns;
      const plan = optionalString(args, "plan");
      if (isToolError(plan)) return plan;
      const column = optionalString(args, "column");
      if (isToolError(column)) return column;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: goal }, () =>
        board.addProblemSetup(goal, givens, unknowns, plan, pickColumn(column)),
      );
      return ok("Problem setup drawn.");
    }

    case "add_equation_sequence": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const steps = requiredString(args, "steps");
      if (isToolError(steps)) return steps;
      const annotations = optionalString(args, "annotations");
      if (isToolError(annotations)) return annotations;
      const title = optionalString(args, "title");
      if (isToolError(title)) return title;
      const column = optionalString(args, "column");
      if (isToolError(column)) return column;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title }, () =>
        board.addEquationSequence(steps, annotations, title, pickColumn(column)),
      );
      return ok("Equation sequence drawn.");
    }

    case "draw_equation_step": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const latex = requiredString(args, "latex");
      if (isToolError(latex)) return latex;
      const annotation = optionalString(args, "annotation");
      if (isToolError(annotation)) return annotation;
      const column = optionalString(args, "column");
      if (isToolError(column)) return column;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: latex }, () =>
        board.drawEquationStep(latex, annotation, pickColumn(column)),
      );
      return ok("Equation step drawn.");
    }

    case "add_text_note": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const text = requiredString(args, "text");
      if (isToolError(text)) return text;
      const size = optionalString(args, "size");
      if (isToolError(size)) return size;
      const column = optionalString(args, "column");
      if (isToolError(column)) return column;
      board.withDirectMeta({ owner: "tutor" }, () =>
        board.addTextNote(text, pickSize(size), pickColumn(column)),
      );
      return ok("Text note added.");
    }

    case "add_callout": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const text = requiredString(args, "text");
      if (isToolError(text)) return text;
      const style = requiredString(args, "style");
      if (isToolError(style)) return style;
      const ALLOWED_STYLES = ["hint", "correct", "wrong", "warning", "important", "remember"] as const;
      type CalloutStyle = typeof ALLOWED_STYLES[number];
      if (!ALLOWED_STYLES.includes(style as CalloutStyle)) {
        return fail(`Argument "style" must be one of: ${ALLOWED_STYLES.join(", ")}.`);
      }
      const column = optionalString(args, "column");
      if (isToolError(column)) return column;
      board.withDirectMeta({ owner: "tutor" }, () =>
        board.addCallout(text, style as CalloutStyle, pickColumn(column)),
      );
      return ok(`Callout (${style}) added.`);
    }

    case "add_student_attempt": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const text = requiredString(args, "text");
      if (isToolError(text)) return text;
      const column = optionalString(args, "column");
      if (isToolError(column)) return column;
      // Student attempts are conceptually student-owned even though the tutor
      // is the one calling the tool — preserve that semantic so neither agent
      // nor tutor accidentally overwrites student work.
      board.withDirectMeta({ owner: "student" }, () =>
        board.addStudentAttempt(text, pickColumn(column)),
      );
      return ok("Student attempt captured on board.");
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
      const stepLabel = optionalString(args, "step_label");
      if (isToolError(stepLabel)) return stepLabel;
      if (stepIndex === undefined && stepLabel === undefined) {
        return fail('Provide "step_label" (preferred) or "step_index" to identify the target step.');
      }
      // Label resolution happens inside TldrawCore.highlightStep — see
      // resolveEqIndex() there. We pass both so the renderer can prefer label.
      const ok2 = board.withDirectMeta({ owner: "tutor" }, () =>
        board.highlightStep({ step_label: stepLabel, step_index: stepIndex }, resolvedStyle),
      );
      if (!ok2) return fail("No matching equation step to highlight.");
      return ok("Step highlighted.");
    }

    case "cross_out_step": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const stepIndex = optionalNumber(args, "step_index");
      if (isToolError(stepIndex)) return stepIndex;
      const stepLabel = optionalString(args, "step_label");
      if (isToolError(stepLabel)) return stepLabel;
      if (stepIndex === undefined && stepLabel === undefined) {
        return fail('Provide "step_label" (preferred) or "step_index" to identify the target step.');
      }
      // Label resolution happens inside TldrawCore.crossOutStep.
      const ok2 = board.withDirectMeta({ owner: "tutor" }, () =>
        board.crossOutStep({ step_label: stepLabel, step_index: stepIndex }),
      );
      if (!ok2) return fail("No matching equation step to cross out.");
      return ok("Step crossed out.");
    }

    case "add_table": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const columns = requiredString(args, "columns");
      if (isToolError(columns)) return columns;
      const rows = requiredString(args, "rows");
      if (isToolError(rows)) return rows;
      const title = optionalString(args, "title");
      if (isToolError(title)) return title;
      const column = optionalString(args, "column");
      if (isToolError(column)) return column;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title }, () =>
        board.addTable(columns, rows, title, pickColumn(column)),
      );
      return ok("Table drawn.");
    }

    case "add_number_line": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const min = requiredNumber(args, "min");
      if (isToolError(min)) return min;
      const max = requiredNumber(args, "max");
      if (isToolError(max)) return max;
      const points = optionalString(args, "points");
      if (isToolError(points)) return points;
      const label = optionalString(args, "label");
      if (isToolError(label)) return label;
      const column = optionalString(args, "column");
      if (isToolError(column)) return column;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label }, () =>
        board.addNumberLine(min, max, points, label, pickColumn(column)),
      );
      return ok("Number line drawn.");
    }

    case "add_coordinate_axes": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const xMin = requiredNumber(args, "x_min");
      if (isToolError(xMin)) return xMin;
      const xMax = requiredNumber(args, "x_max");
      if (isToolError(xMax)) return xMax;
      const yMin = requiredNumber(args, "y_min");
      if (isToolError(yMin)) return yMin;
      const yMax = requiredNumber(args, "y_max");
      if (isToolError(yMax)) return yMax;
      const label = optionalString(args, "label");
      if (isToolError(label)) return label;
      const column = optionalString(args, "column");
      if (isToolError(column)) return column;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label }, () =>
        board.addCoordinateAxes(xMin, xMax, yMin, yMax, label, pickColumn(column)),
      );
      return ok("Coordinate axes drawn.");
    }

    case "plot_points": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const points = requiredString(args, "points");
      if (isToolError(points)) return points;
      const xMin = requiredNumber(args, "x_min");
      if (isToolError(xMin)) return xMin;
      const xMax = requiredNumber(args, "x_max");
      if (isToolError(xMax)) return xMax;
      const yMin = requiredNumber(args, "y_min");
      if (isToolError(yMin)) return yMin;
      const yMax = requiredNumber(args, "y_max");
      if (isToolError(yMax)) return yMax;
      const label = optionalString(args, "label");
      if (isToolError(label)) return label;
      const column = optionalString(args, "column");
      if (isToolError(column)) return column;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: label }, () =>
        board.plotPoints(points, xMin, xMax, yMin, yMax, label, pickColumn(column)),
      );
      return ok("Points plotted.");
    }

    case "add_worked_example_box": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      const title = requiredString(args, "title");
      if (isToolError(title)) return title;
      const body = requiredString(args, "body");
      if (isToolError(body)) return body;
      const column = optionalString(args, "column");
      if (isToolError(column)) return column;
      board.withDirectMeta({ owner: "tutor", tutorReferenceLabel: title }, () =>
        board.addWorkedExampleBox(title, body, pickColumn(column)),
      );
      return ok("Worked-example box drawn.");
    }

    case "clear_whiteboard": {
      const board = ensureBoard(ctx);
      if (isToolError(board)) return board;
      // clearWhiteboard only deletes — no new shapes — but wrap for symmetry.
      board.withDirectMeta({ owner: "tutor" }, () => board.clearWhiteboard());
      return ok("Whiteboard cleared.");
    }

    default:
      return fail(
        `Unknown whiteboard tool "${name}". Supported tools: start_new_problem, start_board_section, add_problem_setup, add_equation_sequence, draw_equation_step, add_text_note, add_callout, add_student_attempt, highlight_step, cross_out_step, add_table, add_number_line, add_coordinate_axes, plot_points, add_worked_example_box, add_function_graph, add_two_column_comparison, add_vector_diagram, add_process_map, clear_whiteboard.`,
      );
  }
}
