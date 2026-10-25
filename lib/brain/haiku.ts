// The teaching brain's model call (the LiveKit voice path, Oct 2026): Claude
// Haiku 5.5 through the Messages API, streamed, on ANTHROPIC_API_KEY (direct,
// never the AI Gateway). Server/Node only: the agent and the bench call it.
//
// Settings as lib/illustration/model.ts read them from Anthropic's docs (Oct
// 15 2026): `claude-haiku-5-5`, `output_config.effort` low, thinking
// disabled, no temperature/top_p (a 400 on these models). Tools and the system
// prompt are cached (one breakpoint on the system block caches both), and a
// second breakpoint on the last finished turn caches the conversation so far.
//
// One call per student line: the reply's words stream first, then its board
// calls. No tool result goes back to the model in the same turn (that would be
// a second model step and a second reply); the next line's note carries the
// board as it stands.

import type { ToolDeclaration } from "../whiteboard-tools";

export const BRAIN_MODEL = "claude-haiku-5-5";

/** Dollars a million tokens (Anthropic pricing, Oct 2026; ≤100k context). */
const PRICE = { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };

export type BrainImage = { mimeType: string; base64: string };
export type BrainTurn = {
  /** What the student said (or the opening). */
  student: string;
  /** What the tutor said back, as heard (an interrupted reply is cut where it stopped). */
  tutor: string;
  /** Board moves the tutor made, in words ("draw_fraction 1/2 and 2/4"). */
  moves?: string[];
  /** Pictures that came with the student's line (a worksheet). */
  images?: BrainImage[];
};

export type BrainUsage = { input: number; output: number; cacheRead: number; cacheWrite: number };
export type BrainEvent =
  | { type: "text"; text: string }
  | { type: "tool"; id: string; name: string; args: Record<string, unknown> }
  | { type: "done"; stopReason: string | null; usage: BrainUsage; firstTokenMs: number | null; ms: number; model: string; attempt: number };

export function brainCost(u: BrainUsage): number {
  return (u.input * PRICE.in + u.output * PRICE.out + u.cacheRead * PRICE.cacheRead + u.cacheWrite * PRICE.cacheWrite) / 1e6;
}

/** The tools in Anthropic's format. */
export function anthropicTools(decls: ToolDeclaration[]): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return decls.map((d) => ({ name: d.name, description: d.description, input_schema: d.parameters as Record<string, unknown> }));
}

export type Block =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type Message = { role: "user" | "assistant"; content: Block[] };

/**
 * The conversation as messages: the last `keep` turns (the opening is always
 * kept: it carries the worksheet), then the new line with its private note.
 */
export function brainMessages(turns: BrainTurn[], line: string, note: string, opts: { keep?: number; lineImages?: BrainImage[] } = {}): Message[] {
  const keep = opts.keep ?? 10;
  const recent = turns.length > keep ? [turns[0], ...turns.slice(-(keep - 1))] : turns;
  const out: Message[] = [];
  const img = (i: BrainImage): Block => ({ type: "image", source: { type: "base64", media_type: i.mimeType, data: i.base64 } });
  recent.forEach((t, i) => {
    if (i === 1 && turns.length > keep) out.push({ role: "user", content: [{ type: "text", text: "(Earlier turns are left out here.)" }] }, { role: "assistant", content: [{ type: "text", text: "(continuing)" }] });
    out.push({ role: "user", content: [...(t.images ?? []).map(img), { type: "text", text: t.student.trim() || "(the student is quiet)" }] });
    const moves = t.moves?.length ? `\n(Board moves: ${t.moves.join("; ")})` : "";
    out.push({ role: "assistant", content: [{ type: "text", text: (t.tutor.trim() || "(said nothing)") + moves }] });
  });
  // Cache everything up to the last finished turn.
  const last = out[out.length - 1];
  if (last) {
    const block = last.content[last.content.length - 1];
    if (block?.type === "text") block.cache_control = { type: "ephemeral" };
  }
  out.push({ role: "user", content: [...(opts.lineImages ?? []).map(img), { type: "text", text: `${line.trim() || "(the student is quiet)"}\n\n[${note.trim()}]` }] });
  return out;
}

export type BrainRequest = {
  system: string;
  tools: ReturnType<typeof anthropicTools>;
  messages: Message[];
  signal?: AbortSignal;
  model?: string;
  maxTokens?: number;
  /** Force one tool before anything else (the check-first step: the app's checker owns right and wrong). */
  forceTool?: string;
  /** Start a second request when the first has said nothing by then (ms); the first to speak wins. */
  hedgeMs?: number;
  apiKey?: string;
};

type SseEvent = { type: string; [k: string]: unknown };

async function* sse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (!data) continue;
      try {
        yield JSON.parse(data) as SseEvent;
      } catch {
        // a broken event is skipped
      }
    }
  }
}

async function open(req: BrainRequest, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const key = req.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: req.model ?? BRAIN_MODEL,
      max_tokens: req.maxTokens ?? 1200,
      stream: true,
      output_config: { effort: "low" },
      // Sonnet 5.5 refuses "disabled" and turns thinking off with "between_tools" (its 400, Oct 24 2026).
      thinking: { type: /^claude-sonnet/.test(req.model ?? BRAIN_MODEL) ? "between_tools" : "disabled" },
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      tools: req.tools,
      ...(req.forceTool ? { tool_choice: { type: "tool", name: req.forceTool } } : {}),
      messages: req.messages,
    }),
    signal,
  });
  if (!r.ok || !r.body) throw new Error(`${req.model ?? BRAIN_MODEL} ${r.status} ${(await r.text().catch(() => "")).slice(0, 300)}`);
  return r.body;
}

/**
 * One reply: text deltas as they come, each tool call once its input is
 * complete, then `done`. Aborting `signal` (the student interrupted) stops it.
 */
export async function* streamBrain(req: BrainRequest): AsyncGenerator<BrainEvent> {
  const started = Date.now();
  const controllers: AbortController[] = [];
  const outer = req.signal;
  const abortAll = () => controllers.forEach((c) => c.abort());
  outer?.addEventListener("abort", abortAll, { once: true });

  // A request whose first event is its iterator's head; the hedge races two.
  const start = (attempt: number) => {
    const c = new AbortController();
    controllers.push(c);
    return open(req, c.signal).then(async (body) => {
      const it = sse(body);
      // Wait for real content (a text delta or a tool block), not just message_start.
      const head: SseEvent[] = [];
      for (;;) {
        const n = await it.next();
        if (n.done) break;
        head.push(n.value);
        if (n.value.type === "content_block_start" || n.value.type === "content_block_delta" || n.value.type === "error") break;
      }
      return { it, head, attempt, c };
    });
  };

  type Won = Awaited<ReturnType<typeof start>>;
  const won: Won = await new Promise<Won>((resolve, reject) => {
    let settled = false;
    let failures = 0;
    let launched = 0;
    const go = () => {
      const attempt = ++launched;
      start(attempt).then(
        (r) => {
          if (settled) return r.c.abort();
          settled = true;
          for (const c of controllers) if (c !== r.c) c.abort();
          resolve(r);
        },
        (err) => {
          if (outer?.aborted) return reject(err);
          failures++;
          if (failures >= 2 || (launched >= 2 && failures >= launched)) {
            if (!settled) reject(err);
            return;
          }
          if (launched < 2) go();
        },
      );
    };
    go();
    if (req.hedgeMs) setTimeout(() => { if (!settled && launched < 2 && !outer?.aborted) go(); }, req.hedgeMs);
  });

  const usage: BrainUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let stopReason: string | null = null;
  let firstTokenMs: number | null = null;
  const blocks = new Map<number, { type: string; id?: string; name?: string; json: string }>();
  const handle = function* (ev: SseEvent): Generator<BrainEvent> {
    if (ev.type === "message_start") {
      const u = ((ev.message as { usage?: Record<string, number> })?.usage) ?? {};
      usage.input = u.input_tokens ?? 0;
      usage.cacheRead = u.cache_read_input_tokens ?? 0;
      usage.cacheWrite = u.cache_creation_input_tokens ?? 0;
    } else if (ev.type === "content_block_start") {
      const b = ev.content_block as { type: string; id?: string; name?: string; text?: string };
      blocks.set(ev.index as number, { type: b.type, id: b.id, name: b.name, json: "" });
      if (b.type === "text" && b.text) {
        firstTokenMs ??= Date.now() - started;
        yield { type: "text", text: b.text };
      }
    } else if (ev.type === "content_block_delta") {
      const d = ev.delta as { type: string; text?: string; partial_json?: string };
      const b = blocks.get(ev.index as number);
      if (d.type === "text_delta" && d.text) {
        firstTokenMs ??= Date.now() - started;
        yield { type: "text", text: d.text };
      } else if (d.type === "input_json_delta" && b) {
        b.json += d.partial_json ?? "";
      }
    } else if (ev.type === "content_block_stop") {
      const b = blocks.get(ev.index as number);
      if (b?.type === "tool_use" && b.name) {
        let args: Record<string, unknown> = {};
        try {
          args = b.json.trim() ? (JSON.parse(b.json) as Record<string, unknown>) : {};
        } catch {
          args = {};
        }
        firstTokenMs ??= Date.now() - started;
        yield { type: "tool", id: b.id ?? `t${ev.index}`, name: b.name, args };
      }
    } else if (ev.type === "message_delta") {
      stopReason = ((ev.delta as { stop_reason?: string })?.stop_reason) ?? stopReason;
      const u = (ev.usage as Record<string, number>) ?? {};
      if (typeof u.output_tokens === "number") usage.output = u.output_tokens;
    } else if (ev.type === "error") {
      throw new Error(`brain stream error: ${JSON.stringify(ev.error).slice(0, 200)}`);
    }
  };

  try {
    for (const ev of won.head) yield* handle(ev);
    for (let n = await won.it.next(); !n.done; n = await won.it.next()) yield* handle(n.value);
  } finally {
    outer?.removeEventListener("abort", abortAll);
  }
  yield { type: "done", stopReason, usage, firstTokenMs, ms: Date.now() - started, model: req.model ?? BRAIN_MODEL, attempt: won.attempt };
}
