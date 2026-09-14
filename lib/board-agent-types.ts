import {
  normalizeSemanticBoard,
  semanticBoardToPromptLines,
  summarizeSemanticBoard,
} from "./semantic-board";

export type BoardUpdateIntent =
  | "visual_explanation"
  | "exact_work"
  | "student_attempt"
  | "correction"
  | "cleanup"
  | "clear"
  | "summary";

export type BoardActionType =
  | "start_new_problem"
  | "start_section"
  | "problem_setup"
  | "equation_sequence"
  | "two_column_comparison"
  | "area_model"
  | "vector_diagram"
  | "process_map"
  | "text_note"
  | "function_graph"
  | "shape"
  | "table"
  | "number_line"
  | "coordinate_axes"
  | "plot_points"
  | "worked_example_box"
  | "student_attempt"
  | "highlight_step"
  | "cross_out_step"
  | "fraction"
  | "figure"
  | "angle"
  | "array"
  | "balance"
  | "bar_chart"
  | "sketch"
  | "tape_diagram"
  | "grid"
  | "vertical_arithmetic"
  | "long_division"
  | "transversal"
  | "freeform_text"
  | "freeform_shape"
  | "freeform_arrow"
  | "freeform_pen"
  | "freeform_note"
  | "freeform_draw"
  | "freeform_line"
  | "move_shape"
  | "delete_shape"
  | "align_shapes"
  | "update_text"
  | "clear_board";

export type BoardArtifactOwner = "tutor" | "student" | "board-agent";

export type BoardArtifactMeta = {
  jobId: string;
  role?: string;
  concept?: string;
  summary?: string;
  owner?: BoardArtifactOwner;
  tutorReferenceLabel?: string;
};

export type BoardAgentAction = {
  type: BoardActionType;
  role?: string;
  concept?: string;
  summary?: string;
  owner?: BoardArtifactOwner;
  tutorReferenceLabel?: string;
  column?: "left" | "right";
  title?: string;
  text?: string;
  size?: "heading" | "body" | "s" | "m" | "l" | "xl";
  color?:
    | "black"
    | "grey"
    | "light-violet"
    | "violet"
    | "blue"
    | "light-blue"
    | "yellow"
    | "orange"
    | "green"
    | "light-green"
    | "light-red"
    | "red"
    | "white";
  fill?: "none" | "semi" | "solid" | "pattern" | "fill" | "lined-fill";
  font?: "draw" | "sans" | "serif" | "mono";
  dash?: "draw" | "solid" | "dashed" | "dotted";
  spline?: "line" | "cubic";
  growY?: number;
  scale?: number;
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
  label?: string;
  shape?: "rectangle" | "ellipse" | "diamond" | "triangle" | "arrow";
  points?: Array<{ x: number; y: number }>;
  target_id?: string;
  target_ids?: string[];
  dx?: number;
  dy?: number;
  align?: "left" | "right" | "top" | "bottom" | "center-x" | "center-y";
  allow_student_owned?: boolean;
  allow_tutor_owned?: boolean;
  latex?: string;
  steps?: string;
  annotations?: string;
  expression?: string;
  x_min?: number;
  x_max?: number;
  y_min?: number;
  y_max?: number;
  min?: number;
  max?: number;
  rows?: string;
  columns?: string;
  body?: string;
  goal?: string;
  givens?: string;
  unknowns?: string;
  plan?: string;
  left_title?: string;
  left_body?: string;
  right_title?: string;
  right_body?: string;
  row_labels?: string;
  column_labels?: string;
  cells?: string;
  center_label?: string;
  vectors?: string;
  nodes?: string;
  connectors?: string;
  step_index?: number;
  step_label?: string;
  style?: "circle" | "underline" | "box";
};

export type BoardAgentArtifact = {
  label: string;
  summary: string;
  role?: string;
  concept?: string;
  owner?: BoardArtifactOwner;
  tutorReferenceLabel?: string;
};

export type BoardAgentPlan = {
  boardSummary: string;
  tutorCue: string;
  actions: BoardAgentAction[];
  artifactLabels: BoardAgentArtifact[];
  lintWarnings?: string[];
};

export type BoardRecentPlanSummary = {
  jobId: string;
  topicKey?: string;
  boardSummary: string;
  artifactLabels: string[];
};

export type BoardUpdateRequest = {
  jobId: string;
  intent: BoardUpdateIntent;
  teachingGoal: string;
  boardRequest: string;
  subject?: string;
  studentLevel?: string;
  knownFacts?: string;
  exactContent?: string;
  visualStyle?: "clean" | "rich" | "minimal";
  avoidRevealingAnswer?: boolean;
  urgency?: "normal" | "high";
  topicKey?: string;
  transcriptSummary?: string;
  boardSummary?: string;
  visibleShapes?: string[];
  eqItems?: string[];
  semanticArtifacts?: string[];
  recentBoardActions?: string[];
  recentPlans?: BoardRecentPlanSummary[];
  lintWarnings?: string[];
  screenshotDataUrl?: string;
  mode?: "initial" | "refine";
  priorPlanSummary?: string;
};

export type BoardUpdateReadyEvent = {
  jobId: string;
  boardSummary: string;
  tutorCue: string;
  artifactLabels: BoardAgentArtifact[];
};

const ACTION_TYPES = new Set<BoardActionType>([
  "start_new_problem",
  "start_section",
  "problem_setup",
  "equation_sequence",
  "two_column_comparison",
  "area_model",
  "vector_diagram",
  "process_map",
  "text_note",
  "function_graph",
  "shape",
  "table",
  "number_line",
  "coordinate_axes",
  "plot_points",
  "worked_example_box",
  "student_attempt",
  "highlight_step",
  "cross_out_step",
  "fraction",
  "figure",
  "angle",
  "array",
  "balance",
  "bar_chart",
  "sketch",
  "freeform_text",
  "freeform_shape",
  "freeform_arrow",
  "freeform_pen",
  "freeform_note",
  "freeform_draw",
  "freeform_line",
  "move_shape",
  "delete_shape",
  "align_shapes",
  "update_text",
  "clear_board",
]);

export const BOARD_AGENT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    boardSummary: {
      type: "string",
      description: "Concise semantic summary of what the board will show after the actions.",
    },
    tutorCue: {
      type: "string",
      description: "One sentence telling the live tutor how to reference the board pedagogically.",
    },
    artifactLabels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          summary: { type: "string" },
          role: { type: "string" },
          concept: { type: "string" },
          owner: { type: "string", enum: ["tutor", "student", "board-agent"] },
          tutorReferenceLabel: { type: "string" },
        },
        required: ["label", "summary"],
      },
    },
    actions: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          type: {
            type: "string",
            enum: Array.from(ACTION_TYPES),
          },
          title: { type: "string" },
          text: { type: "string" },
          label: { type: "string" },
          column: { type: "string", enum: ["left", "right"] },
          role: { type: "string" },
          concept: { type: "string" },
          summary: { type: "string" },
          tutorReferenceLabel: { type: "string" },
          owner: { type: "string", enum: ["tutor", "student", "board-agent"] },
          size: { type: "string", enum: ["heading", "body", "s", "m", "l", "xl"] },
          color: {
            type: "string",
            enum: [
              "black",
              "grey",
              "light-violet",
              "violet",
              "blue",
              "light-blue",
              "yellow",
              "orange",
              "green",
              "light-green",
              "light-red",
              "red",
              "white",
            ],
          },
          fill: {
            type: "string",
            enum: ["none", "semi", "solid", "pattern", "fill", "lined-fill"],
          },
          font: { type: "string", enum: ["draw", "sans", "serif", "mono"] },
          dash: { type: "string", enum: ["draw", "solid", "dashed", "dotted"] },
          spline: { type: "string", enum: ["line", "cubic"] },
          growY: { type: "number" },
          scale: { type: "number" },
          x: { type: "number" },
          y: { type: "number" },
          x2: { type: "number" },
          y2: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          shape: { type: "string", enum: ["rectangle", "ellipse", "diamond", "triangle", "arrow"] },
          points: {
            type: "array",
            maxItems: 80,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                x: { type: "number" },
                y: { type: "number" },
              },
              required: ["x", "y"],
            },
          },
          target_id: { type: "string" },
          target_ids: {
            type: "array",
            maxItems: 24,
            items: { type: "string" },
          },
          dx: { type: "number" },
          dy: { type: "number" },
          align: { type: "string", enum: ["left", "right", "top", "bottom", "center-x", "center-y"] },
          allow_student_owned: { type: "boolean" },
          allow_tutor_owned: { type: "boolean" },
          latex: { type: "string" },
          steps: { type: "string" },
          annotations: { type: "string" },
          expression: { type: "string" },
          x_min: { type: "number" },
          x_max: { type: "number" },
          y_min: { type: "number" },
          y_max: { type: "number" },
          min: { type: "number" },
          max: { type: "number" },
          rows: { type: "string" },
          columns: { type: "string" },
          body: { type: "string" },
          goal: { type: "string" },
          givens: { type: "string" },
          unknowns: { type: "string" },
          plan: { type: "string" },
          left_title: { type: "string" },
          left_body: { type: "string" },
          right_title: { type: "string" },
          right_body: { type: "string" },
          row_labels: { type: "string" },
          column_labels: { type: "string" },
          cells: { type: "string" },
          center_label: { type: "string" },
          vectors: { type: "string" },
          nodes: { type: "string" },
          connectors: { type: "string" },
          step_index: { type: "number" },
          step_label: { type: "string" },
          style: { type: "string", enum: ["circle", "underline", "box"] },
        },
        required: ["type"],
      },
    },
  },
  required: ["boardSummary", "tutorCue", "artifactLabels", "actions"],
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeAction(value: unknown): BoardAgentAction | null {
  const raw = asRecord(value);
  const type = asString(raw.type) as BoardActionType;
  if (!ACTION_TYPES.has(type)) return null;

  const action: BoardAgentAction = { type };
  for (const key of Object.keys(raw) as Array<keyof BoardAgentAction>) {
    const valueForKey = raw[key];
    if (valueForKey === undefined || valueForKey === null) continue;
    if (key === "points" && Array.isArray(valueForKey)) {
      action.points = valueForKey
        .map((point) => {
          const p = asRecord(point);
          const x = asNumber(p.x);
          const y = asNumber(p.y);
          return x === undefined || y === undefined ? null : { x, y };
        })
        .filter((point): point is { x: number; y: number } => Boolean(point))
        .slice(0, 80);
      continue;
    }
    if (key === "target_ids" && Array.isArray(valueForKey)) {
      action.target_ids = valueForKey.filter((id): id is string => typeof id === "string").slice(0, 24);
      continue;
    }
    if (key === "allow_student_owned" && typeof valueForKey === "boolean") {
      action.allow_student_owned = valueForKey;
      continue;
    }
    if (key === "allow_tutor_owned" && typeof valueForKey === "boolean") {
      action.allow_tutor_owned = valueForKey;
      continue;
    }
    if (typeof valueForKey === "string" || typeof valueForKey === "number") {
      (action as unknown as Record<string, string | number | undefined>)[String(key)] = valueForKey;
    }
  }
  return action;
}

export type ActionValidation = { action: BoardAgentAction | null; warnings: string[] };

const ALLOWED_SHAPES = new Set(["rectangle", "ellipse", "diamond", "triangle", "arrow"]);
const ALLOWED_HIGHLIGHT_STYLES = new Set(["circle", "underline", "box"]);
const ALLOWED_ALIGNS = new Set(["left", "right", "top", "bottom", "center-x", "center-y"]);

function hasString(raw: Record<string, unknown>, key: string): boolean {
  const value = raw[key];
  return typeof value === "string" && value.trim().length > 0;
}

function hasNumber(raw: Record<string, unknown>, key: string): boolean {
  const value = raw[key];
  return typeof value === "number" && Number.isFinite(value);
}

function hasTarget(raw: Record<string, unknown>): boolean {
  if (hasString(raw, "target_id")) return true;
  const ids = raw.target_ids;
  if (!Array.isArray(ids)) return false;
  return ids.some((id) => typeof id === "string" && id.trim().length > 0);
}

function hasStepRef(raw: Record<string, unknown>): boolean {
  return hasString(raw, "step_label") || hasNumber(raw, "step_index");
}

function checkRequiredStrings(
  raw: Record<string, unknown>,
  type: BoardActionType,
  keys: string[],
  warnings: string[],
): boolean {
  let ok = true;
  for (const key of keys) {
    if (!hasString(raw, key)) {
      warnings.push(`${type} missing required field: ${key}`);
      ok = false;
    }
  }
  return ok;
}

function checkRequiredNumbers(
  raw: Record<string, unknown>,
  type: BoardActionType,
  keys: string[],
  warnings: string[],
): boolean {
  let ok = true;
  for (const key of keys) {
    if (!hasNumber(raw, key)) {
      warnings.push(`${type} missing required numeric field: ${key}`);
      ok = false;
    }
  }
  return ok;
}

function checkRange(
  raw: Record<string, unknown>,
  type: BoardActionType,
  maxKey: string,
  minKey: string,
  warnings: string[],
): boolean {
  if (!hasNumber(raw, maxKey) || !hasNumber(raw, minKey)) return false;
  const maxVal = raw[maxKey] as number;
  const minVal = raw[minKey] as number;
  if (!(maxVal > minVal)) {
    warnings.push(`${type} requires ${maxKey} > ${minKey} (got ${maxKey}=${maxVal}, ${minKey}=${minVal})`);
    return false;
  }
  return true;
}

export function validateAction(value: unknown): ActionValidation {
  const raw = asRecord(value);
  const typeStr = asString(raw.type);
  if (!typeStr) {
    return { action: null, warnings: ["action missing required field: type"] };
  }
  if (!ACTION_TYPES.has(typeStr as BoardActionType)) {
    return { action: null, warnings: [`unknown action type: ${typeStr}`] };
  }
  const type = typeStr as BoardActionType;
  const warnings: string[] = [];
  let ok = true;

  switch (type) {
    case "start_new_problem":
    case "start_section":
      ok = checkRequiredStrings(raw, type, ["title"], warnings) && ok;
      break;
    case "problem_setup":
      ok = checkRequiredStrings(raw, type, ["goal"], warnings) && ok;
      break;
    case "equation_sequence":
      ok = checkRequiredStrings(raw, type, ["steps"], warnings) && ok;
      break;
    case "two_column_comparison":
      ok = checkRequiredStrings(
        raw,
        type,
        ["title", "left_title", "left_body", "right_title", "right_body"],
        warnings,
      ) && ok;
      break;
    case "area_model":
      ok = checkRequiredStrings(raw, type, ["title", "row_labels", "column_labels", "cells"], warnings) && ok;
      break;
    case "vector_diagram":
      ok = checkRequiredStrings(raw, type, ["title", "center_label", "vectors"], warnings) && ok;
      break;
    case "process_map":
      ok = checkRequiredStrings(raw, type, ["title", "nodes"], warnings) && ok;
      break;
    case "text_note":
      ok = checkRequiredStrings(raw, type, ["text"], warnings) && ok;
      break;
    case "function_graph": {
      ok = checkRequiredStrings(raw, type, ["expression"], warnings) && ok;
      const hasMin = hasNumber(raw, "x_min");
      const hasMax = hasNumber(raw, "x_max");
      if (!hasMin) {
        warnings.push(`${type} missing required numeric field: x_min`);
        ok = false;
      }
      if (!hasMax) {
        warnings.push(`${type} missing required numeric field: x_max`);
        ok = false;
      }
      if (hasMin && hasMax) {
        ok = checkRange(raw, type, "x_max", "x_min", warnings) && ok;
      }
      break;
    }
    case "shape": {
      const shapeVal = asString(raw.shape);
      if (!shapeVal || !ALLOWED_SHAPES.has(shapeVal)) {
        warnings.push(`shape missing or invalid required field: shape (one of ${Array.from(ALLOWED_SHAPES).join(", ")})`);
        ok = false;
      }
      break;
    }
    case "table":
      ok = checkRequiredStrings(raw, type, ["columns", "rows"], warnings) && ok;
      break;
    case "number_line": {
      const okMin = hasNumber(raw, "min");
      const okMax = hasNumber(raw, "max");
      if (!okMin) {
        warnings.push(`${type} missing required numeric field: min`);
        ok = false;
      }
      if (!okMax) {
        warnings.push(`${type} missing required numeric field: max`);
        ok = false;
      }
      if (okMin && okMax) {
        ok = checkRange(raw, type, "max", "min", warnings) && ok;
      }
      break;
    }
    case "coordinate_axes": {
      ok = checkRequiredNumbers(raw, type, ["x_min", "x_max", "y_min", "y_max"], warnings) && ok;
      if (hasNumber(raw, "x_min") && hasNumber(raw, "x_max")) {
        ok = checkRange(raw, type, "x_max", "x_min", warnings) && ok;
      }
      if (hasNumber(raw, "y_min") && hasNumber(raw, "y_max")) {
        ok = checkRange(raw, type, "y_max", "y_min", warnings) && ok;
      }
      break;
    }
    case "plot_points": {
      ok = checkRequiredStrings(raw, type, ["points"], warnings) && ok;
      ok = checkRequiredNumbers(raw, type, ["x_min", "x_max", "y_min", "y_max"], warnings) && ok;
      if (hasNumber(raw, "x_min") && hasNumber(raw, "x_max")) {
        ok = checkRange(raw, type, "x_max", "x_min", warnings) && ok;
      }
      if (hasNumber(raw, "y_min") && hasNumber(raw, "y_max")) {
        ok = checkRange(raw, type, "y_max", "y_min", warnings) && ok;
      }
      break;
    }
    case "worked_example_box":
      ok = checkRequiredStrings(raw, type, ["title", "body"], warnings) && ok;
      break;
    case "student_attempt":
      ok = checkRequiredStrings(raw, type, ["text"], warnings) && ok;
      break;
    case "highlight_step": {
      if (!hasStepRef(raw)) {
        warnings.push("highlight_step missing required field: step_label or step_index");
        ok = false;
      }
      const styleVal = asString(raw.style);
      if (!styleVal || !ALLOWED_HIGHLIGHT_STYLES.has(styleVal)) {
        warnings.push(`highlight_step missing or invalid required field: style (one of ${Array.from(ALLOWED_HIGHLIGHT_STYLES).join(", ")})`);
        ok = false;
      }
      break;
    }
    case "cross_out_step": {
      if (!hasStepRef(raw)) {
        warnings.push("cross_out_step missing required field: step_label or step_index");
        ok = false;
      }
      break;
    }
    // Diagram tools are only reachable through the direct tool dispatcher,
    // which validates their arguments itself; here they just need a type.
    case "fraction":
    case "figure":
    case "angle":
    case "array":
    case "balance":
    case "bar_chart":
    case "sketch":
      break;
    case "freeform_text": {
      if (!hasString(raw, "text") && !hasString(raw, "label")) {
        warnings.push("freeform_text missing required field: text or label");
        ok = false;
      }
      break;
    }
    case "freeform_shape": {
      const shapeVal = asString(raw.shape);
      if (!shapeVal || !ALLOWED_SHAPES.has(shapeVal)) {
        warnings.push(`freeform_shape missing or invalid required field: shape (one of ${Array.from(ALLOWED_SHAPES).join(", ")})`);
        ok = false;
      }
      break;
    }
    case "freeform_arrow":
      ok = checkRequiredNumbers(raw, type, ["x", "y", "x2", "y2"], warnings) && ok;
      break;
    case "freeform_pen": {
      const pts = raw.points;
      if (!Array.isArray(pts) || pts.length < 2) {
        warnings.push("freeform_pen missing required field: points (need at least 2 entries)");
        ok = false;
      } else {
        const valid = pts.filter((p) => {
          const r = asRecord(p);
          return hasNumber(r, "x") && hasNumber(r, "y");
        });
        if (valid.length < 2) {
          warnings.push("freeform_pen points must each have numeric x and y (need at least 2 valid points)");
          ok = false;
        }
      }
      break;
    }
    case "freeform_note": {
      if (!hasString(raw, "text") && !hasString(raw, "label")) {
        warnings.push("freeform_note missing required field: text");
        ok = false;
      }
      break;
    }
    case "freeform_draw": {
      const pts = raw.points;
      if (!Array.isArray(pts) || pts.length < 2) {
        warnings.push("freeform_draw missing required field: points (need at least 2 entries)");
        ok = false;
      } else {
        const valid = pts.filter((p) => {
          const r = asRecord(p);
          return hasNumber(r, "x") && hasNumber(r, "y");
        });
        if (valid.length < 2) {
          warnings.push("freeform_draw points must each have numeric x and y (need at least 2 valid points)");
          ok = false;
        }
      }
      break;
    }
    case "freeform_line": {
      const pts = raw.points;
      if (!Array.isArray(pts) || pts.length < 2) {
        warnings.push("freeform_line missing required field: points (need at least 2 entries)");
        ok = false;
      } else {
        const valid = pts.filter((p) => {
          const r = asRecord(p);
          return hasNumber(r, "x") && hasNumber(r, "y");
        });
        if (valid.length < 2) {
          warnings.push("freeform_line points must each have numeric x and y (need at least 2 valid points)");
          ok = false;
        }
      }
      break;
    }
    case "move_shape": {
      if (!hasTarget(raw)) {
        warnings.push("move_shape missing required field: target_id or target_ids");
        ok = false;
      }
      const dx = hasNumber(raw, "dx") ? (raw.dx as number) : 0;
      const dy = hasNumber(raw, "dy") ? (raw.dy as number) : 0;
      if (dx === 0 && dy === 0) {
        warnings.push("move_shape requires a non-zero dx or dy");
        ok = false;
      }
      break;
    }
    case "delete_shape": {
      if (!hasTarget(raw)) {
        warnings.push("delete_shape missing required field: target_id or target_ids");
        ok = false;
      }
      break;
    }
    case "align_shapes": {
      if (!hasTarget(raw)) {
        warnings.push("align_shapes missing required field: target_id or target_ids");
        ok = false;
      }
      const alignVal = asString(raw.align);
      if (!alignVal || !ALLOWED_ALIGNS.has(alignVal)) {
        warnings.push(`align_shapes missing or invalid required field: align (one of ${Array.from(ALLOWED_ALIGNS).join(", ")})`);
        ok = false;
      }
      break;
    }
    case "update_text": {
      if (!hasTarget(raw)) {
        warnings.push("update_text missing required field: target_id or target_ids");
        ok = false;
      }
      if (!hasString(raw, "text") && !hasString(raw, "label")) {
        warnings.push("update_text missing required field: text or label");
        ok = false;
      }
      break;
    }
    case "tape_diagram":
    case "grid":
    case "vertical_arithmetic":
    case "long_division":
    case "transversal":
    case "clear_board":
      // no required fields
      break;
    default: {
      // Exhaustiveness check — every BoardActionType must be handled above.
      const _exhaustive: never = type;
      void _exhaustive;
    }
  }

  if (!ok) {
    return { action: null, warnings };
  }

  const normalized = normalizeAction(raw);
  if (!normalized) {
    return { action: null, warnings: [...warnings, `${type} could not be normalized`] };
  }
  return { action: normalized, warnings: [] };
}

export function normalizeBoardAgentPlan(value: unknown): BoardAgentPlan {
  const raw = asRecord(value);
  const actions: BoardAgentAction[] = [];
  const lintWarnings: string[] = [];
  if (Array.isArray(raw.actions)) {
    for (let index = 0; index < raw.actions.length; index += 1) {
      if (actions.length >= 24) break;
      const result = validateAction(raw.actions[index]);
      if (result.action) {
        actions.push(result.action);
      }
      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          lintWarnings.push(`action[${index}]: ${warning}`);
        }
      }
    }
  }
  const artifactLabels = Array.isArray(raw.artifactLabels)
    ? raw.artifactLabels.map((item) => {
      const artifact = asRecord(item);
      return {
        label: asString(artifact.label, "board artifact"),
        summary: asString(artifact.summary, "Created board artifact."),
        role: asString(artifact.role) || undefined,
        concept: asString(artifact.concept) || undefined,
        owner: asString(artifact.owner) as BoardArtifactOwner || "board-agent",
        tutorReferenceLabel: asString(artifact.tutorReferenceLabel) || undefined,
      };
    }).slice(0, 16)
    : [];

  const plan: BoardAgentPlan = {
    boardSummary: asString(raw.boardSummary, "The board was updated."),
    tutorCue: asString(raw.tutorCue, "Refer to the updated board and ask one focused question."),
    artifactLabels,
    actions,
  };
  if (lintWarnings.length > 0) plan.lintWarnings = lintWarnings;
  return plan;
}

export function summarizeWhiteboardSnapshot(snapshot: unknown): {
  boardSummary: string;
  visibleShapes: string[];
  eqItems: string[];
  semanticArtifacts: string[];
  lintWarnings: string[];
} {
  const snap = asRecord(snapshot);
  const eqItemsRaw = Array.isArray(snap.eqItems) ? snap.eqItems : [];
  const eqItems = eqItemsRaw
    .filter((item) => asString(asRecord(item).role) !== "label")
    .slice(-16)
    .map((item, index) => {
    const raw = asRecord(item);
    const latex = asString(raw.latex, "(blank equation)");
    const annotation = asString(raw.annotation);
    return `Equation ${index}: ${latex}${annotation ? ` (${annotation})` : ""}`;
  });

  const visibleShapes: string[] = [];
  const store = asRecord(snap.store);
  const records = asRecord(store.records);
  for (const record of Object.values(records)) {
    const raw = asRecord(record);
    const id = asString(raw.id);
    const typeName = asString(raw.typeName);
    if (typeName !== "shape" && !id.startsWith("shape:")) continue;
    const type = asString(raw.type, "shape");
    const x = asNumber(raw.x);
    const y = asNumber(raw.y);
    const meta = asRecord(raw.meta);
    const owner = asString(meta.owner);
    const label = asString(meta.tutorReferenceLabel);
    const summary = asString(meta.summary);
    visibleShapes.push(
      [
        `${id || "(unknown id)"} ${type} at ${Math.round(x ?? 0)},${Math.round(y ?? 0)}`,
        owner ? `owner=${owner}` : "",
        label ? `label="${label}"` : "",
        summary ? `summary="${summary}"` : "",
      ].filter(Boolean).join(" "),
    );
    if (visibleShapes.length >= 24) break;
  }

  const pageState = asRecord(snap.pageState);
  const semanticBoard = normalizeSemanticBoard(snap.semanticBoard);
  const semanticSummary = summarizeSemanticBoard(semanticBoard);
  const semanticArtifacts = semanticBoardToPromptLines(semanticBoard);
  const boardSummary = [
    semanticBoard.artifacts.length > 0 ? semanticSummary : "",
    `${visibleShapes.length} tldraw shapes`,
    `${eqItems.length} equation overlays`,
    `page ${asNumber(pageState.pageIndex) ?? 1}`,
  ].filter(Boolean).join(", ");

  return {
    boardSummary,
    visibleShapes,
    eqItems,
    semanticArtifacts,
    lintWarnings: [],
  };
}
