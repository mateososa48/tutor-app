// How Gemini Live runs each tool (Sept 23 2026).
//
// gemini-3.8-live makes a tool NON_BLOCKING unless its declaration says
// otherwise, and answers every result WHEN_IDLE: once the tutor has finished
// talking, each board result starts it talking again. Twelve probe turns on
// Sept 23 (scripts/live-model-probe.ts, BEHAVIOR=none|blocking) measured:
// - the model's own defaults: after a wrong answer, 2 of 2 runs added extra
//   turns ("…") after the reply;
// - every tool BLOCKING: 5 of 5 spoke once, first words at 1.4–4.0 s;
// - async with SILENT successes (below): no faster, and 1 of 5 checked,
//   drew, ringed and ended the turn without a word.
// So on 3.8 every tool blocks, the way 3.1 always behaved, and the async
// design stays opt-in (`?tools=async`) until a real session shows it helps:
// the tools whose result decides the words block (check_answer's verdict,
// look_at_board / look_at_worksheet's picture); everything else runs while it
// talks, a result that worked is filed SILENT, and a refusal or a
// "Careful:" warning comes back WHEN_IDLE so it can fix the board.
// 3.1 and older have no async tools, and the extended-thinking model is
// NON_BLOCKING only and rejects `scheduling`, so both are sent exactly what
// they always were.

export type LiveToolMode = "legacy" | "async-only" | "scheduled";

export function liveToolMode(model: string): LiveToolMode {
  if (/thinking/.test(model)) return "async-only";
  if (/gemini-(?:[12]\.|3\.[0-7](?:\D|$))/.test(model)) return "legacy";
  return "scheduled";
}

/** Tools whose result the tutor must hear before it speaks, even with async tools on. */
export const BLOCKING_TOOLS: ReadonlySet<string> = new Set(["check_answer", "look_at_board", "look_at_worksheet"]);

export function withToolBehavior<T extends { name?: string }>(declarations: T[], model: string, asyncTools = false): Array<T & { behavior?: "BLOCKING" | "NON_BLOCKING" }> {
  if (liveToolMode(model) !== "scheduled") return declarations;
  return declarations.map((d) => ({ ...d, behavior: !asyncTools || BLOCKING_TOOLS.has(d.name ?? "") ? "BLOCKING" : "NON_BLOCKING" }));
}

export type ToolScheduling = "SILENT" | "WHEN_IDLE";

export function toolScheduling(model: string, name: string, result: { success: boolean; message?: string }, asyncTools = false): ToolScheduling | undefined {
  if (!asyncTools || liveToolMode(model) !== "scheduled" || BLOCKING_TOOLS.has(name)) return undefined;
  if (!result.success) return "WHEN_IDLE";
  if (/\bCareful:/.test(result.message ?? "")) return "WHEN_IDLE";
  return "SILENT";
}

/** `?tools=async` turns the async design on for one tab. */
export function resolveAsyncTools(search: { get(name: string): string | null } | null | undefined): boolean {
  return search?.get("tools")?.trim().toLowerCase() === "async";
}
