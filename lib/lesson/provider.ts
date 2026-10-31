// The planning model's call (Oct 31 2026, Plan B B4/B9). Server only: it reads
// the API key. The plan arrives as JSON matching TURN_PLAN_TOOL's schema, so
// there is no prose to interpret, by whichever route the model takes:
// - Haiku 5.5: the turn_plan tool, forced (tool_choice);
// - Sonnet 5.5: refuses a forced tool ("tool_choice type tool … not
//   supported") and "thinking: disabled" (its off switch is
//   "between_tools"), so it answers with output_config.format json_schema.
// Checked against the live API on Oct 31 2026. A rejected plan goes back once
// with its issues, in the same conversation.

import { TURN_PLAN_TOOL } from "./plan";

export const ENGINE_MODELS = (process.env.ENGINE_MODELS || "claude-sonnet-5-5").split(",").map((s) => s.trim()).filter(Boolean);

type Msg = { role: "user" | "assistant"; content: unknown };
export type PlanCall = { input: unknown; model: string; ms: number; usage?: Record<string, unknown>; toolUseId: string; reply: Msg };

const forcedTool = (model: string) => model.includes("haiku");

/** One plan from one model, given the conversation so far (the first call has one user message). */
export async function callPlanModel(model: string, system: string, messages: Msg[], signal?: AbortSignal): Promise<PlanCall> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const started = Date.now();
  const tool = forcedTool(model);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 3000,
      output_config: { effort: tool ? "low" : "medium" },
      thinking: { type: tool ? "disabled" : "between_tools" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      // Sonnet: the tool offered, not forced (its JSON-schema format allows
      // too few optional fields for the board's); the prompt says to answer
      // only with it, and a plan written as text is still read below.
      tools: [TURN_PLAN_TOOL],
      tool_choice: tool ? { type: "tool", name: TURN_PLAN_TOOL.name } : { type: "auto" },
      messages,
    }),
    signal,
  });
  if (!r.ok) throw new Error(`${model} ${r.status} ${(await r.text().catch(() => "")).slice(0, 240)}`);
  const j = (await r.json()) as { content?: Array<{ type: string; id?: string; name?: string; input?: unknown; text?: string }>; usage?: Record<string, unknown>; stop_reason?: string };
  const use = (j.content ?? []).find((b) => b.type === "tool_use" && b.name === TURN_PLAN_TOOL.name);
  if (use) {
    return { input: use.input, model, ms: Date.now() - started, usage: j.usage, toolUseId: use.id ?? "", reply: { role: "assistant", content: [{ type: "tool_use", id: use.id, name: TURN_PLAN_TOOL.name, input: use.input }] } };
  }
  const text = (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  let input: unknown;
  try {
    input = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    throw new Error(`${model} gave text that is not JSON (${j.stop_reason}): ${text.slice(0, 120)}`);
  }
  return { input, model, ms: Date.now() - started, usage: j.usage, toolUseId: "", reply: { role: "assistant", content: text } };
}

/** The follow-up turn that sends a rejected plan back with its issues. */
export function repairMessages(first: Msg[], call: PlanCall, issues: string[]): Msg[] {
  const why = `The code rejected this plan:\n- ${issues.join("\n- ")}\nFix exactly these and answer with the whole plan again. Keep what was right.`;
  if (call.toolUseId) {
    return [...first, call.reply, { role: "user", content: [{ type: "tool_result", tool_use_id: call.toolUseId, is_error: true, content: why }] }];
  }
  return [...first, call.reply, { role: "user", content: why }];
}
