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
export type PlanCall = { input: unknown; model: string; ms: number; usage?: Record<string, unknown>; toolUseId: string; reply: Msg; firstMs?: number };

const forcedTool = (model: string) => model.includes("haiku");

/**
 * One plan from one model, given the conversation so far (the first call has
 * one user message). With `onPartial` the reply is streamed and the JSON
 * written so far is handed over as it grows, so the first sentence can be
 * checked and said before the whole plan is done.
 */
export async function callPlanModel(spec: string, system: string, messages: Msg[], signal?: AbortSignal, onPartial?: (json: string) => void): Promise<PlanCall> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const started = Date.now();
  // "claude-sonnet-5-5@low": a model with its effort; "+fast" asks for fast
  // output where the model has it (Opus 5.5, Oct 31 2026; Sonnet refuses it).
  const fast = spec.endsWith("+fast");
  const [model, effortAsked] = spec.replace(/\+fast$/, "").split("@");
  const tool = forcedTool(model);
  const effort = effortAsked && ["low", "medium", "high"].includes(effortAsked) ? effortAsked : tool ? "low" : "medium";
  // Thinking off as each model spells it: Haiku "disabled", Sonnet
  // "between_tools", Opus only "adaptive" (it refuses the other two).
  const thinking = tool ? { type: "disabled" } : model.includes("opus") ? { type: "adaptive" } : { type: "between_tools" };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    // Fine-grained tool streaming: the plan's JSON arrives as it is written,
    // not in coarse bursts (Oct 31: first sentence about 0.5 s sooner).
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", ...(onPartial ? { "anthropic-beta": "fine-grained-tool-streaming-2025-05-14" } : {}) },
    body: JSON.stringify({
      model,
      max_tokens: 3000,
      output_config: { effort },
      thinking,
      ...(fast ? { speed: "fast" } : {}),
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      // Sonnet: the tool offered, not forced (its JSON-schema format allows
      // too few optional fields for the board's); the prompt says to answer
      // only with it, and a plan written as text is still read below.
      tools: [TURN_PLAN_TOOL],
      tool_choice: tool ? { type: "tool", name: TURN_PLAN_TOOL.name } : { type: "auto" },
      messages,
      ...(onPartial ? { stream: true } : {}),
    }),
    signal,
  });
  if (!r.ok) throw new Error(`${model} ${r.status} ${(await r.text().catch(() => "")).slice(0, 240)}`);
  let firstMs: number | undefined;
  const j = onPartial ? await readStream(r, (json) => { if (firstMs === undefined) firstMs = Date.now() - started; onPartial(json); }) : ((await r.json()) as Reply);
  const use = (j.content ?? []).find((b) => b.type === "tool_use" && b.name === TURN_PLAN_TOOL.name);
  if (use) {
    return { input: use.input, model: spec, ms: Date.now() - started, ...(firstMs !== undefined ? { firstMs } : {}), usage: j.usage, toolUseId: use.id ?? "", reply: { role: "assistant", content: [{ type: "tool_use", id: use.id, name: TURN_PLAN_TOOL.name, input: use.input }] } };
  }
  const text = (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  let input: unknown;
  try {
    input = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    throw new Error(`${model} gave text that is not JSON (${j.stop_reason}): ${text.slice(0, 120)}`);
  }
  return { input, model: spec, ms: Date.now() - started, usage: j.usage, toolUseId: "", reply: { role: "assistant", content: text } };
}

type Reply = { content?: Array<{ type: string; id?: string; name?: string; input?: unknown; text?: string }>; usage?: Record<string, unknown>; stop_reason?: string };

/**
 * A streamed reply put back together: the turn_plan tool's input (its JSON
 * arrives in pieces), or text, as the non-streamed reply would have had them.
 */
async function readStream(r: Response, onPartial: (json: string) => void): Promise<Reply> {
  const reader = r.body!.getReader();
  const decoder = new TextDecoder();
  const blocks: Array<{ type: string; id?: string; name?: string; json: string; text: string }> = [];
  let usage: Record<string, unknown> = {};
  let stop: string | undefined;
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(line.slice(5)) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (ev.type === "message_start") usage = { ...((ev.message as { usage?: Record<string, unknown> })?.usage ?? {}) };
      else if (ev.type === "content_block_start") {
        const b = ev.content_block as { type: string; id?: string; name?: string; text?: string };
        blocks[ev.index as number] = { type: b.type, id: b.id, name: b.name, json: "", text: b.text ?? "" };
      } else if (ev.type === "content_block_delta") {
        const blk = blocks[ev.index as number];
        const d = ev.delta as { type: string; partial_json?: string; text?: string };
        if (!blk) continue;
        if (d.type === "input_json_delta" && d.partial_json) {
          blk.json += d.partial_json;
          if (blk.type === "tool_use" && blk.name === TURN_PLAN_TOOL.name) onPartial(blk.json);
        } else if (d.type === "text_delta" && d.text) {
          blk.text += d.text;
          // A plan written as text (Sonnet, tool not forced) streams as text.
          if (blk.text.includes("{")) onPartial(blk.text.slice(blk.text.indexOf("{")));
        }
      } else if (ev.type === "message_delta") {
        usage = { ...usage, ...((ev.usage as Record<string, unknown>) ?? {}) };
        stop = (ev.delta as { stop_reason?: string })?.stop_reason ?? stop;
      } else if (ev.type === "error") {
        throw new Error(`stream error: ${JSON.stringify(ev.error).slice(0, 200)}`);
      }
    }
  }
  const content = blocks.filter(Boolean).map((b) => {
    if (b.type === "tool_use") {
      let input: unknown = {};
      try {
        input = b.json ? JSON.parse(b.json) : {};
      } catch {
        input = {};
      }
      return { type: "tool_use", id: b.id, name: b.name, input };
    }
    return { type: b.type, text: b.text };
  });
  return { content, usage, stop_reason: stop };
}

/** The follow-up turn that sends a rejected plan back with its issues. */
export function repairMessages(first: Msg[], call: PlanCall, issues: string[]): Msg[] {
  const why = `The code rejected this plan:\n- ${issues.join("\n- ")}\nFix exactly these and answer with the whole plan again. Keep what was right.`;
  if (call.toolUseId) {
    return [...first, call.reply, { role: "user", content: [{ type: "tool_result", tool_use_id: call.toolUseId, is_error: true, content: why }] }];
  }
  return [...first, call.reply, { role: "user", content: why }];
}
