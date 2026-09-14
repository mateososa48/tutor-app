import type { ToolCallResult } from "./live-types";

export type { ToolCallResult };

export const ok = (message?: string): ToolCallResult => ({ success: true, message });
export const fail = (error: string): ToolCallResult => ({ success: false, error });

export const TOOL_STRING_LIMITS: Record<string, number> = {
  target: 160,
  targets: 400,
  total_label: 80,
  height_label: 80,
  mark_points: 300,
  slope_run: 40,
  operands: 120,
  operation: 20,
  result: 40,
  carries: 40,
  partial_products: 200,
  dividend: 24,
  divisor: 24,
  quotient: 24,
  mark_angles: 40,
  adjacent_label: 40,
  second_label: 40,
  label_style: 20,
  second_expression: 200,
  icon: 40,
  second_icon: 40,
  teaching_goal: 240,
  board_request: 2000,
  subject: 80,
  student_level: 80,
  known_facts: 1600,
  exact_content: 2000,
  visual_style: 20,
  urgency: 20,
  intent: 40,
  reason: 240,
  mode: 40,
  title: 160,
  latex: 600,
  annotation: 160,
  text: 1200,
  body: 1600,
  goal: 320,
  givens: 800,
  unknowns: 320,
  plan: 600,
  steps: 1600,
  annotations: 800,
  columns: 320,
  rows: 1600,
  points: 800,
  label: 160,
  expression: 240,
  step_label: 200,
  style: 20,
  column: 20,
  size: 20,
  font: 20,
  color: 20,
  fraction: 40,
  second_fraction: 40,
  model: 20,
  intervals: 400,
  jumps: 400,
  figure: 20,
  side_labels: 200,
  vertex_labels: 80,
  angle_labels: 120,
  radius_label: 80,
  diameter_label: 80,
  caption: 160,
  left: 200,
  right: 200,
  tilt: 20,
  categories: 200,
  values: 200,
  unit: 40,
  strokes: 2000,
  labels: 400,
  row_labels: 200,
  column_labels: 200,
  cells: 800,
  note: 300,
};

export function limitString(key: string, value: string): string | ToolCallResult {
  const limit = TOOL_STRING_LIMITS[key] ?? 1000;
  if (value.length > limit) {
    return fail(`Argument "${key}" must be ${limit} characters or fewer.`);
  }
  return value;
}

export function requiredString(args: Record<string, unknown>, key: string): string | ToolCallResult {
  const value = args[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    return fail(`Missing required string argument "${key}".`);
  }
  return limitString(key, value.trim());
}

export function optionalString(args: Record<string, unknown>, key: string): string | undefined | ToolCallResult {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return fail(`Optional argument "${key}" must be a string.`);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return limitString(key, trimmed);
}

export function optionalBoolean(args: Record<string, unknown>, key: string): boolean | undefined | ToolCallResult {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  return fail(`Optional argument "${key}" must be a boolean.`);
}

export function requiredNumber(args: Record<string, unknown>, key: string): number | ToolCallResult {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fail(`Missing or invalid required number argument "${key}".`);
}

export function optionalNumber(args: Record<string, unknown>, key: string): number | undefined | ToolCallResult {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fail(`Optional argument "${key}" must be a finite number.`);
}

export function isToolError<T>(value: T | ToolCallResult): value is ToolCallResult {
  return typeof value === "object" && value !== null && "success" in value && value.success === false;
}
