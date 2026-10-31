// Uploaded work, read once into problems with their givens (Oct 31 2026, Plan B
// B2a). In session o8rpq1 the triangle's height was 5 cm on the worksheet and
// 10 cm by the time a picture was asked for: the dimensions were a paraphrase
// passed from model to model. Here the sheet is read once, each problem keeps
// its exact statement and its given sizes as facts with ids (F1, F2…), and
// every later drawing is built from those facts, never from a retelling.
//
// Server only (reads the API key). Claude reads the picture through a forced
// tool, so the result is JSON. A number the model could not read is left out,
// not guessed; the student can correct a fact, which makes a new revision.

import type { Fact, ProblemRecord } from "./types";
import { mathIn } from "./state";

export const SOURCE_MODEL = process.env.SOURCE_MODEL || "claude-haiku-5-5";

const TOOL = {
  name: "worksheet_problems",
  description: "Every problem on the worksheet, in order, as printed.",
  input_schema: {
    type: "object",
    properties: {
      problems: {
        type: "array",
        items: {
          type: "object",
          properties: {
            number: { type: "string", description: "Its number on the sheet (\"1\", \"2a\")." },
            statement: { type: "string", description: "The problem exactly as printed." },
            math: { type: "string", description: "Its equation or expression, when it has one (\"3x + 7 = 22\")." },
            givens: {
              type: "array",
              description: "Every number the problem gives, including ones written on its figure, with what it measures and its unit. Leave out any you cannot read clearly.",
              items: {
                type: "object",
                properties: { name: { type: "string", description: "What it is: \"base\", \"height\", \"length\", \"width\", \"price per hour\"." }, value: { type: "number" }, unit: { type: "string" } },
                required: ["name", "value"],
              },
            },
            figure: { type: "string", description: "The figure in a few words, when there is one (\"right triangle, right angle at bottom right, base along the bottom, height on the right side\")." },
          },
          required: ["number", "statement", "givens"],
        },
      },
    },
    required: ["problems"],
  },
} as const;

export type SourceFile = { label: string; name: string; mimeType: string; base64: string };

/**
 * The picture's real type, read from its first bytes: a PNG saved as ".jpg"
 * is labelled image/jpeg by the browser, and the API refuses the mismatch
 * (Oct 31: a worksheet upload read as nothing, and the tutor said it saw no picture).
 */
export function sniffImageType(base64: string, claimed: string): string {
  const head = base64.slice(0, 16);
  if (head.startsWith("iVBORw0KGgo")) return "image/png";
  if (head.startsWith("/9j/")) return "image/jpeg";
  if (head.startsWith("R0lGOD")) return "image/gif";
  if (head.startsWith("UklGR")) return "image/webp";
  return claimed === "image/jpg" ? "image/jpeg" : claimed;
}

/** The problems on the uploaded pictures, or [] when they could not be read. */
export async function extractSourceProblems(files: SourceFile[], signal?: AbortSignal): Promise<ProblemRecord[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  const images = files.filter((f) => /^image\/(png|jpe?g|gif|webp)$/.test(f.mimeType)).slice(0, 4);
  if (!key || !images.length) return [];
  const content = [
    ...images.map((f) => ({ type: "image", source: { type: "base64", media_type: sniffImageType(f.base64, f.mimeType), data: f.base64 } })),
    { type: "text", text: "Read every problem on this worksheet. Copy each statement exactly, and list every number it gives (on the figure too) with what it measures and its unit." },
  ];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: SOURCE_MODEL,
      max_tokens: 2500,
      output_config: { effort: "low" },
      thinking: { type: SOURCE_MODEL.includes("haiku") ? "disabled" : "between_tools" },
      tools: [TOOL],
      tool_choice: SOURCE_MODEL.includes("haiku") ? { type: "tool", name: TOOL.name } : { type: "auto" },
      messages: [{ role: "user", content }],
    }),
    signal,
  });
  if (!r.ok) throw new Error(`${SOURCE_MODEL} ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  const j = (await r.json()) as { content?: Array<{ type: string; name?: string; input?: { problems?: unknown[] } }> };
  const use = (j.content ?? []).find((b) => b.type === "tool_use" && b.name === TOOL.name);
  const raw = Array.isArray(use?.input?.problems) ? use!.input!.problems : [];
  let factN = 0;
  return raw.slice(0, 20).map((p, i): ProblemRecord => {
    const o = (p ?? {}) as { number?: unknown; statement?: unknown; math?: unknown; givens?: unknown; figure?: unknown };
    const number = String(o.number ?? i + 1).trim();
    const statement = String(o.statement ?? "").trim().slice(0, 400);
    const source = { kind: "worksheet" as const, file: images[0].label, question: number };
    const givens: Fact[] = (Array.isArray(o.givens) ? o.givens : [])
      .map((g) => g as { name?: unknown; value?: unknown; unit?: unknown })
      .filter((g) => typeof g.value === "number" && Number.isFinite(g.value))
      .slice(0, 12)
      .map((g) => ({ id: `F${++factN}`, name: String(g.name ?? "value").slice(0, 40), value: g.value as number, ...(typeof g.unit === "string" && g.unit.trim() ? { unit: g.unit.trim().slice(0, 12) } : {}), source }));
    const math = typeof o.math === "string" && o.math.trim() ? o.math.trim() : mathIn(statement) ?? undefined;
    const figure = typeof o.figure === "string" && o.figure.trim() ? ` [figure: ${o.figure.trim().slice(0, 160)}]` : "";
    return { id: `P${i + 1}`, revision: 1, statement: `${number}. ${statement}${figure}`, ...(math ? { math } : {}), givens, source, status: "open" };
  }).filter((p) => p.statement.length > 3);
}

/** The problem the student named in their words ("question 1", "number 2", "the second one"), or null. */
export function namedProblem(text: string, problems: ProblemRecord[], bare = false): string | null {
  const t = text.toLowerCase();
  if (!problems.length) return null;
  const ord = !bare && !/\b(?:one|problem|question)\b/.test(t) ? -1 : ["first", "second", "third", "fourth", "fifth", "sixth"].findIndex((w) => new RegExp(`\\b${w}\\b`).test(t));
  // A bare "2" is a pick only while none is chosen; mid-problem it is an answer.
  const m = /\b(?:question|number|problem|no\.?|#)\s*(\d+[a-z]?)\b/.exec(t) ?? (bare ? /^\s*(\d+[a-z]?)\s*[.!]?\s*$/.exec(t) : null);
  const want = m ? m[1] : ord >= 0 ? String(ord + 1) : null;
  if (!want) return null;
  const hit = problems.find((p) => p.source.kind === "worksheet" && p.source.question === want) ?? problems[Number(want) - 1];
  return hit?.id ?? null;
}
