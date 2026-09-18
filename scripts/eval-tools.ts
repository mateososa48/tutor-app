// Shared plumbing for the offline evals: the tool list the tutor sees, one
// runner that answers tool calls the way the live app does (board result, then
// [Board: …], then a changed [Tutor state]), the API key, arguments and a
// retry that waits out the free tier's rate limits.
import fs from "node:fs";
import type { FunctionDeclaration } from "@google/genai";
import { WHITEBOARD_TOOL_DECLARATIONS } from "../lib/whiteboard-tools";
import { dispatchWhiteboardTool } from "../lib/whiteboard-tool-dispatch";
import { TUTOR_TOOL_DECLARATIONS } from "../lib/tutor-tools";
import { SESSION_TOOL_DECLARATIONS } from "../lib/session-tools";
import { toolRole } from "../lib/board-items";
import { boardResultExtras, formatMemory, noteBoardWrite, rememberNote, type TutorPolicy } from "../lib/tutor-policy";
import { TutorRuntime } from "../lib/tutor-runtime";
import type { FakeBoard } from "./eval-board";

export const EVAL_TOOL_DECLARATIONS = [...WHITEBOARD_TOOL_DECLARATIONS, ...TUTOR_TOOL_DECLARATIONS, ...SESSION_TOOL_DECLARATIONS] as unknown as FunctionDeclaration[];

export type EvalToolResult = { ok: boolean; message: string; verdict?: string };

/**
 * `runtime` answers the tutor tools exactly as the live clients do, so the
 * eval sees check_answer and record_teaching_move the way a session does.
 * Its own policy is the one to pass as `policy`.
 */
export type EvalToolContext = { board: FakeBoard; policy: TutorPolicy; runtime: TutorRuntime; worksheet?: string; now?: number };

export function runEvalTool(name: string, args: Record<string, unknown>, ctx: EvalToolContext): EvalToolResult {
  const now = ctx.now ?? Date.now();
  const tutor = ctx.runtime.runTool(name, args, now);
  if (tutor) {
    if (!tutor.success) return { ok: false, message: `Error: ${tutor.error}` };
    const message = tutor.message ?? "Done";
    return { ok: true, message, verdict: /Verdict: (\w+)/.exec(message)?.[1] };
  }
  if (name === "remember_about_student") {
    rememberNote(ctx.policy, typeof args.note === "string" ? args.note : "");
    return { ok: true, message: `Noted. ${formatMemory(ctx.policy)}`.trim() };
  }
  if (name === "look_at_worksheet") {
    return ctx.worksheet
      ? { ok: true, message: `Here is the worksheet page, as text: ${ctx.worksheet}` }
      : { ok: false, message: "Error: No worksheet was uploaded in this session." };
  }
  const result = dispatchWhiteboardTool(name, args, { whiteboard: ctx.board.handle });
  if (!result.success) return { ok: false, message: `Error: ${result.error}` };
  if (toolRole(name) === "draw") noteBoardWrite(ctx.policy);
  // The same notes the live clients add: a changed [Tutor state] and any nudges.
  const extra = boardResultExtras(ctx.policy, now);
  return { ok: true, message: `${result.message ?? "Done"}.\n[Board: ${ctx.board.handle.getBoardSummary()}]${extra ? `\n${extra}` : ""}` };
}

export function readGeminiKey(): string {
  const env = fs.readFileSync(".env.local", "utf8");
  const key = env.split("\n").find((l) => l.startsWith("GEMINI_API_KEY="))?.slice("GEMINI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("GEMINI_API_KEY missing in .env.local");
  return key;
}

export function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// The free tier allows a handful of requests a minute: wait out 429s and
// overloads, but give up at once on quotas that never come back today.
export async function withRetry<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/limit: 0\b/.test(msg)) throw new Error(`No quota for this model on this API key: ${/model: ([\w.-]+)/.exec(msg)?.[1] ?? "unknown"}.`);
      if (/PerDay/.test(msg)) throw new Error(`Daily free-tier quota used up for ${/model: ([\w.-]+)/.exec(msg)?.[1] ?? "this model"}. It resets daily.`);
      // Rate limits, overloads, and dropped connections all clear up by waiting.
      const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
      const retryable = /429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|overloaded|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN/i.test(`${msg} ${cause}`);
      if (!retryable || i >= attempts - 1) throw err;
      const m = /retry in ([\d.]+)s/i.exec(msg);
      const wait = Math.min(90_000, Math.ceil((m ? Number(m[1]) : 15 * (i + 1)) * 1000) + 1500);
      process.stdout.write(`    (busy, waiting ${Math.round(wait / 1000)}s)\n`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
