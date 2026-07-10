import type { ToolCallResult } from "./gemini-live";

export type { ToolCallResult };

export const ok = (message?: string): ToolCallResult => ({ success: true, message });
export const fail = (error: string): ToolCallResult => ({ success: false, error });

export const TOOL_STRING_LIMITS: Record<string, number> = {
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
