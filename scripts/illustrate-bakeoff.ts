// The illustration bake-off (Oct 14 2026). Ten moments a tutor would draw
// (scripts/illustrate-cases.ts) are drawn by several approaches, and every
// picture lands in one gallery to compare:
//
//   base  today's tools: a model picks from the Live whiteboard tools, the
//         real board draws the calls (/dev/board, needs the dev server)
//   svg   an illustrator model writes the whole picture as SVG
//   scene an illustrator model writes a scene (lib/illustration/scene.ts),
//         icons only; our layout draws it
//   defs  as scene, but it may also draw its own small objects (defs)
//   fast  a small fast model writes the defs scene (could the voice model
//         itself do it, with no illustrator?)
//   image an image model paints it
//
//   npx tsx scripts/illustrate-bakeoff.ts --label r1 [--arms svg,scene] [--cases marbles,pizza]
//     [--model gemini-3.5-flash@GEMINI_API_KEY,claude-sonnet-5-5] [--base 3300]
//
// Output: bench/illustrate/<label>/ (gitignored): per case and arm the raw
// reply, the SVG or PNG, timing; gallery.html with every picture; meta.json.

import fs from "node:fs";
import path from "node:path";
import { ILLUSTRATION_CASES, type IllustrationCase } from "./illustrate-cases";
import { parseScene, renderScene } from "../lib/illustration/scene";
import { BOARD_ICON_NAMES } from "../lib/board-icon-names.generated";
import { liveWhiteboardDeclarations } from "../lib/whiteboard-tools";

const ROOT = path.resolve(__dirname, "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => [m[1], m[2].trim().replace(/^"|"$/g, "")]),
);

const args = process.argv.slice(2);
const opt = (name: string, dflt?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const LABEL = opt("label", "r1")!;
const ARMS = (opt("arms", "base,svg,scene,defs,fast,image") ?? "").split(",").filter(Boolean);
const CASES = opt("cases") ? ILLUSTRATION_CASES.filter((c) => opt("cases")!.split(",").includes(c.id)) : ILLUSTRATION_CASES;
/** model@KEY for the illustrator arms; several spread the calls round robin. */
const MODELS = (opt("model", "gemini-3.5-flash@GEMINI_API_KEY,gemini-3.5-flash@GEMINI_API_KEY_2") ?? "").split(",");
const FAST = opt("fast", "gemini-3.5-flash-lite@GEMINI_API_KEY_2")!;
const BASE_MODEL = opt("basemodel", "gemini-3.6-flash@GEMINI_API_KEY")!;
const IMAGE_MODEL = opt("imagemodel", "gemini-3.1-flash-image@GEMINI_API_KEY")!;
const BOARD = opt("base", "3300")!;
/** Store this run's results under another arm name (the same arm on another model). */
const AS = opt("as");
const OUT = path.join(ROOT, "bench", "illustrate", LABEL);
fs.mkdirSync(OUT, { recursive: true });

// ── Prompts ─────────────────────────────────────────────────────────────

function context(c: IllustrationCase): string {
  const convo = c.conversation.map((l) => `${l.who === "tutor" ? "Tutor" : "Student"}: ${l.text}`).join("\n");
  return [
    `You draw one picture on a math tutor's shared whiteboard, in a live lesson with a ${c.grade} student. The tutor has just said "let me draw that out" and is waiting for it, so it has to be right the first time.`,
    "",
    "The conversation so far:",
    convo,
    "",
    `On the board already: ${c.board}`,
    "",
    `Draw: ${c.what}`,
    `What the student should notice: ${c.why}`,
    c.withhold ? `Do not show: ${c.withhold}. The tutor asks for it next, and a picture that shows it spoils the question.` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const DESIGN = `How the picture should be:
- One idea, the one above. Nothing decorative.
- Quantities exactly as stated: count every object; equal parts are exactly equal.
- Words are labels of one to four words, never sentences. Numbers the student already has are fine.
- The board's look: white, outlines in ink #1d1d21 (2.5px), the sky blue #3d9cff to point things out, green #15803d sparingly, red #e5484d only to cross out. Friendly and clean, like a good teacher's board, not clip art.
- Readable on a phone: labels at least 15px, objects at least 24px.`;

const SVG_FORMAT = `Reply with one SVG and nothing else: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H"> with W at most 720 and H at most 480. Text in font-family "IBM Plex Sans". Wrap each meaningful part in <g data-part="name"> so the tutor can point at it.`;

const ICONS = BOARD_ICON_NAMES.join(" ");

const SCENE_DOC = (defs: boolean) => `Reply with one JSON scene and nothing else. A layout engine places everything, so you never give coordinates. The scene:
{ "title"?: string,
  ${defs ? `"defs"?: { name: { "svg": "<small SVG body in a 24x24 box>", "w": 24, "h": 24 } },  // your own objects, when no icon fits\n  ` : ""}"root": node,
  "arrows"?: [{ "from": id, "to": id, "label"?: string }],
  "brackets"?: [{ "over": id or [ids], "side": "top"|"bottom"|"left"|"right", "label"?: string }] }
A node is one of:
  { "type": "row" | "column", "children": [nodes], "gap"?: px, "id"? }
  { "type": "items", "icon": name, "count": n, "per_row"?: n, "crossed"?: n (the last n get a red X), "highlight"?: n (the first n get a sky halo), "size"?: "s"|"m"|"l", "id"? }
  { "type": "icon", "icon": name, "size"?, "id"? }
  { "type": "container", "shape": "box"|"jar"|"bag"|"plate"|"circle"|"none", "child": node, "label"?: string, "label_side"?: "top"|"bottom", "id"? }
  { "type": "label", "text": string, "size"?, "tone"?: "ink"|"pencil"|"sky"|"green"|"red", "id"? }
  { "type": "bar", "parts": [{ "value"?: n, "label"?: string, "shade"?: bool }], "total_label"?: string, "id"? }   // equal parts unless values are given
  { "type": "grid", "rows": n, "cols": n, "shaded"?: n, "top_label"?: string, "side_label"?: string, "id"? }
  { "type": "pie", "slices": n, "shaded"?: n, "style"?: "plain"|"pizza", "label"?: string, "id"? }   // exactly equal slices
  { "type": "balance", "left": node, "right": node, "tilt"?: -1|0|1, "id"? }
  { "type": "axis", "min": n, "max": n, "step"?: n, "orientation"?: "horizontal"|"vertical", "unit"?: string, "marks"?: [{ "at": n, "icon"?: name, "label"?: string }], "id"? }
  ${defs ? `{ "type": "custom", "use": defName, "size"?, "id"? }\n  ` : ""}{ "type": "spacer", "w"?: px, "h"?: px }
Icons (use these names${defs ? ", or a name from your defs" : ""}): ${ICONS}

Example (not this lesson): 8 apples shared into 2 baskets, each basket labelled:
{"root":{"type":"row","gap":40,"children":[{"type":"container","shape":"box","id":"b1","label":"Basket 1","child":{"type":"items","icon":"apple","count":4,"per_row":2}},{"type":"container","shape":"box","id":"b2","label":"Basket 2","child":{"type":"items","icon":"apple","count":4,"per_row":2}}]},"brackets":[{"over":["b1","b2"],"side":"top","label":"8 apples"}]}`;

const BASE_PROMPT = (c: IllustrationCase) => `${context(c).replace("You draw one picture", "You are the tutor. You draw one picture")}

Draw it now with your whiteboard tools, in one to three calls. The board above is already there; add to it.`;

const IMAGE_PROMPT = (c: IllustrationCase) => `${context(c)}

${DESIGN}
Paint it as a clean flat illustration on a white whiteboard, simple shapes, short labels in a plain sans font. Landscape, 3:2.`;

// ── Model calls ─────────────────────────────────────────────────────────

type Reply = { text: string; ms: number; usage?: unknown; images?: string[]; calls?: Array<{ name: string; args: Record<string, unknown> }>; error?: string };

async function gemini(spec: string, body: Record<string, unknown>): Promise<Reply> {
  const [model, keyName] = spec.split("@");
  const key = env[keyName ?? "GEMINI_API_KEY"];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const t0 = Date.now();
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const ms = Date.now() - t0;
    const j = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean; inlineData?: { data: string }; functionCall?: { name: string; args: Record<string, unknown> } }> } }>;
      usageMetadata?: unknown;
      error?: { code: number; message: string };
    };
    if (j.error) {
      if ((j.error.code === 429 || j.error.code === 503) && !/per day|daily/i.test(j.error.message) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
        continue;
      }
      return { text: "", ms, error: `${j.error.code}: ${j.error.message.slice(0, 200)}` };
    }
    const parts = j.candidates?.[0]?.content?.parts ?? [];
    return {
      text: parts.filter((p) => p.text && !p.thought).map((p) => p.text).join(""),
      ms,
      usage: j.usageMetadata,
      images: parts.filter((p) => p.inlineData).map((p) => p.inlineData!.data),
      calls: parts.filter((p) => p.functionCall).map((p) => p.functionCall!),
    };
  }
  return { text: "", ms: 0, error: "gave up after retries" };
}

// Claude through the Messages API, per the Oct 2026 docs (platform.claude.com):
// `output_config.effort` (low … max; Haiku 5.5 defaults to medium), thinking on
// by default and counted in max_tokens, `thinking: {"type": "disabled"}` allowed
// at low/medium/high on Haiku 5.5, no temperature/top_p/top_k (a 400 on these
// models), and the system prompt cached (Haiku 5.5 caches from 512 tokens).
// A spec is model[:effort[:off]], e.g. "claude-haiku-5-5:low:off".
async function claude(spec: string, system: string, user: string): Promise<Reply> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return { text: "", ms: 0, error: "no ANTHROPIC_API_KEY in .env.local" };
  const [model, effort, off] = spec.split(":");
  const body: Record<string, unknown> = {
    model,
    max_tokens: 8000,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  };
  if (effort) body.output_config = { effort };
  if (off === "off") body.thinking = { type: "disabled" };
  for (let attempt = 0; attempt < 4; attempt++) {
    const t0 = Date.now();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    const ms = Date.now() - t0;
    const j = (await res.json()) as { content?: Array<{ type: string; text?: string }>; usage?: unknown; stop_reason?: string; error?: { type?: string; message: string } };
    if (j.error) {
      if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
        continue;
      }
      return { text: "", ms, error: `${res.status} ${j.error.message.slice(0, 200)}` };
    }
    const text = (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return { text, ms, usage: { ...(j.usage as object), stop_reason: j.stop_reason }, error: j.stop_reason === "refusal" ? "refusal" : undefined };
  }
  return { text: "", ms: 0, error: "gave up after retries" };
}

async function illustrator(spec: string, system: string, user: string, json: boolean): Promise<Reply> {
  if (spec.startsWith("claude")) return claude(spec, system, user);
  return gemini(spec, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { ...(json ? { responseMimeType: "application/json" } : {}), thinkingConfig: { thinkingLevel: "low" } },
  });
}

// ── The arms ────────────────────────────────────────────────────────────

type Result = { caseId: string; arm: string; model: string; ms: number; file?: string; svg?: string; png?: string; problems?: string[]; error?: string; calls?: unknown; usage?: unknown };

function cleanSvg(text: string): string | null {
  const m = /<svg[\s\S]*<\/svg>/i.exec(text);
  if (!m) return null;
  return m[0].replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son[a-z]+="[^"]*"/gi, "");
}

let turn = 0;
const nextModel = () => MODELS[turn++ % MODELS.length];

async function runArm(c: IllustrationCase, arm: string): Promise<Result> {
  const r = await runArmInner(c, arm);
  return AS ? { ...r, arm: AS } : r;
}

async function runArmInner(c: IllustrationCase, arm: string): Promise<Result> {
  const base = `${c.id}.${AS ?? arm}`;
  const save = (ext: string, data: string | Buffer) => {
    fs.writeFileSync(path.join(OUT, `${base}.${ext}`), data);
    return `${base}.${ext}`;
  };
  if (arm === "svg") {
    const model = nextModel();
    const r = await illustrator(model, `${DESIGN}\n\n${SVG_FORMAT}`, context(c), false);
    save("raw.txt", r.text || r.error || "");
    const svg = cleanSvg(r.text);
    return { caseId: c.id, arm, model, ms: r.ms, usage: r.usage, error: r.error ?? (svg ? undefined : "no SVG in the reply"), svg: svg ? save("svg", svg) : undefined };
  }
  if (arm === "scene" || arm === "defs" || arm === "fast") {
    const model = arm === "fast" ? FAST : nextModel();
    const r = await illustrator(model, `${DESIGN}\n\n${SCENE_DOC(arm !== "scene")}`, context(c), true);
    save("raw.txt", r.text || r.error || "");
    const scene = parseScene(r.text);
    if (!scene) return { caseId: c.id, arm, model, ms: r.ms, error: r.error ?? "no scene in the reply" };
    if (arm === "scene") delete scene.defs;
    const out = renderScene(scene);
    fs.writeFileSync(path.join(OUT, `${base}.usage.json`), JSON.stringify(r.usage ?? null));
    save("scene.json", JSON.stringify(scene, null, 1));
    return { caseId: c.id, arm, model, ms: r.ms, usage: r.usage, svg: save("svg", out.svg), problems: out.problems };
  }
  if (arm === "image") {
    const r = await gemini(IMAGE_MODEL, { contents: [{ role: "user", parts: [{ text: IMAGE_PROMPT(c) }] }], generationConfig: { responseModalities: ["IMAGE"] } });
    if (!r.images?.length) return { caseId: c.id, arm, model: IMAGE_MODEL, ms: r.ms, error: r.error ?? "no image" };
    return { caseId: c.id, arm, model: IMAGE_MODEL, ms: r.ms, png: save("png", Buffer.from(r.images[0], "base64")) };
  }
  if (arm === "base") {
    const tools = liveWhiteboardDeclarations().filter((d) => !/^(look_at|remember|set_plan|start_new_problem|erase|point_at|circle_item|highlight|cross_out)/.test(d.name));
    const r = await gemini(BASE_MODEL, {
      contents: [{ role: "user", parts: [{ text: BASE_PROMPT(c) }] }],
      tools: [{ functionDeclarations: tools }],
      toolConfig: { functionCallingConfig: { mode: "ANY" } },
      generationConfig: { thinkingConfig: { thinkingLevel: "low" } },
    });
    save("calls.json", JSON.stringify(r.calls ?? [], null, 1));
    if (!r.calls?.length) return { caseId: c.id, arm, model: BASE_MODEL, ms: r.ms, error: r.error ?? "no tool calls" };
    const png = await shootBoard(r.calls, path.join(OUT, `${base}.png`));
    return { caseId: c.id, arm, model: BASE_MODEL, ms: r.ms, calls: r.calls, png: png ? `${base}.png` : undefined, error: png ? undefined : "board did not draw" };
  }
  return { caseId: c.id, arm, model: "", ms: 0, error: `unknown arm ${arm}` };
}

// The real board draws today's tool calls, cropped to what it drew.
async function shootBoard(calls: Array<{ name: string; args: Record<string, unknown> }>, file: string): Promise<boolean> {
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.goto(`http://localhost:${BOARD}/api/dev/qa-login?to=${encodeURIComponent("/dev/board?script=[]")}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => Boolean((window as unknown as { __chalkDispatch?: unknown }).__chalkDispatch), { timeout: 60000 });
    for (const call of calls) {
      await page.evaluate((n, a) => (window as unknown as { __chalkDispatch: (n: string, a: unknown) => unknown }).__chalkDispatch(n, a), call.name, call.args);
    }
    const shot = await page.evaluate(async () => {
      const board = (window as unknown as { __chalkBoard: { exportImage: (w: number) => Promise<{ url: string } | null> } }).__chalkBoard;
      await new Promise((r) => setTimeout(r, 2500));
      const img = await board.exportImage(1400);
      return img?.url ?? null;
    });
    if (!shot) return false;
    fs.writeFileSync(file, Buffer.from(shot.split(",")[1], "base64"));
    return true;
  } finally {
    await browser.close();
  }
}

// ── Run ─────────────────────────────────────────────────────────────────

async function main() {
  const metaFile = path.join(OUT, "meta.json");
  const results: Result[] = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : [];
  for (const c of CASES) {
    await Promise.all(
      ARMS.map(async (arm) => {
        try {
          const r = await runArm(c, arm);
          const i = results.findIndex((x) => x.caseId === c.id && x.arm === r.arm);
          if (i >= 0) results[i] = r;
          else results.push(r);
          console.log(`${c.id.padEnd(9)} ${arm.padEnd(6)} ${String(r.ms).padStart(6)} ms ${r.error ? "ERROR " + r.error : "ok"}${r.problems?.length ? " · " + r.problems.join("; ") : ""}`);
        } catch (err) {
          console.log(`${c.id} ${arm} THREW ${(err as Error).message}`);
        }
      }),
    );
    fs.writeFileSync(metaFile, JSON.stringify(results, null, 1));
  }
  writeGallery(results);
}

function writeGallery(results: Result[]) {
  const arms = [...new Set(results.map((r) => r.arm))];
  let html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"><style>body{font-family:'IBM Plex Sans',sans-serif;margin:24px;background:#fafafa}h2{margin:32px 0 4px}p{margin:0 0 10px;color:#555;max-width:900px}.row{display:flex;gap:16px;flex-wrap:wrap}.cell{background:#fff;border:1px solid #e3e3e8;border-radius:10px;padding:10px;width:440px}.cell .h{font:12px monospace;color:#888;margin-bottom:6px}.pic{width:420px;height:300px;display:flex;align-items:center;justify-content:center}.pic svg,.pic img{max-width:420px;max-height:300px;width:auto;height:auto}</style></head><body>`;
  for (const c of ILLUSTRATION_CASES) {
    const row = results.filter((r) => r.caseId === c.id);
    if (!row.length) continue;
    html += `<h2>${c.id}</h2><p><b>Draw:</b> ${c.what}<br><b>Notice:</b> ${c.why}${c.withhold ? `<br><b>Withhold:</b> ${c.withhold}` : ""}</p><div class="row">`;
    for (const arm of arms) {
      const r = row.find((x) => x.arm === arm);
      if (!r) continue;
      const svg = r.svg ? fs.readFileSync(path.join(OUT, r.svg), "utf8").replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(?:width|height)="[^"]*"/g, "")) : null;
      const pic = r.error ? `<div style="color:#c00">${r.error}</div>` : svg ? svg : r.png ? `<img src="${r.png}">` : "";
      html += `<div class="cell" data-case="${c.id}" data-arm="${arm}"><div class="h">${arm} · ${r.model} · ${(r.ms / 1000).toFixed(1)} s${r.problems?.length ? " · ⚠ " + r.problems.length : ""}</div><div class="pic">${pic}</div></div>`;
    }
    html += `</div>`;
  }
  fs.writeFileSync(path.join(OUT, "gallery.html"), html + "</body></html>");
  console.log("gallery:", path.join(OUT, "gallery.html"));
}

// --dump <dir>: write each case's exact illustrator prompts (system and user,
// per arm) to files, so another illustrator (a Claude agent) can answer them.
if (opt("dump")) {
  const dir = path.resolve(opt("dump")!);
  fs.mkdirSync(dir, { recursive: true });
  for (const c of CASES) {
    fs.writeFileSync(path.join(dir, `${c.id}.user.txt`), context(c));
  }
  fs.writeFileSync(path.join(dir, "system.svg.txt"), `${DESIGN}\n\n${SVG_FORMAT}`);
  fs.writeFileSync(path.join(dir, "system.scene.txt"), `${DESIGN}\n\n${SCENE_DOC(false)}`);
  fs.writeFileSync(path.join(dir, "system.defs.txt"), `${DESIGN}\n\n${SCENE_DOC(true)}`);
  console.log("prompts in", dir);
} else if (args.includes("--rerender")) {
  // Draw every saved scene again with the current layout (no model calls).
  const metaFile = path.join(OUT, "meta.json");
  const results: Result[] = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  for (const r of results) {
    const file = path.join(OUT, `${r.caseId}.${r.arm}.scene.json`);
    if (!fs.existsSync(file)) continue;
    const out = renderScene(JSON.parse(fs.readFileSync(file, "utf8")));
    fs.writeFileSync(path.join(OUT, `${r.caseId}.${r.arm}.svg`), out.svg);
    r.problems = out.problems;
  }
  fs.writeFileSync(metaFile, JSON.stringify(results, null, 1));
  writeGallery(results);
} else if (opt("ingest")) {
  // --ingest <dir> --arm <name>: read <case>.<svg|json> answers from dir and render them like a model's.
  ingest(path.resolve(opt("ingest")!), opt("arm", "claude")!);
} else {
  main();
}

function ingest(dir: string, arm: string) {
  const metaFile = path.join(OUT, "meta.json");
  const results: Result[] = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : [];
  for (const c of CASES) {
    const base = `${c.id}.${arm}`;
    let r: Result;
    const svgFile = path.join(dir, `${c.id}.svg`);
    const jsonFile = path.join(dir, `${c.id}.json`);
    if (fs.existsSync(svgFile)) {
      const svg = cleanSvg(fs.readFileSync(svgFile, "utf8"));
      if (svg) fs.writeFileSync(path.join(OUT, `${base}.svg`), svg);
      r = { caseId: c.id, arm, model: "claude agent", ms: 0, svg: svg ? `${base}.svg` : undefined, error: svg ? undefined : "no SVG" };
    } else if (fs.existsSync(jsonFile)) {
      const scene = parseScene(fs.readFileSync(jsonFile, "utf8"));
      if (scene) {
        const out = renderScene(scene);
        fs.writeFileSync(path.join(OUT, `${base}.svg`), out.svg);
        fs.writeFileSync(path.join(OUT, `${base}.scene.json`), JSON.stringify(scene, null, 1));
        r = { caseId: c.id, arm, model: "claude agent", ms: 0, svg: `${base}.svg`, problems: out.problems };
      } else r = { caseId: c.id, arm, model: "claude agent", ms: 0, error: "no scene" };
    } else continue;
    const i = results.findIndex((x) => x.caseId === c.id && x.arm === arm);
    if (i >= 0) results[i] = r;
    else results.push(r);
  }
  fs.writeFileSync(metaFile, JSON.stringify(results, null, 1));
  writeGallery(results);
}
