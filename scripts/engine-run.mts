// Runs acceptance trajectories through the real session page with the tutoring
// engine on (Oct 31 2026, Plan B). Headless Chrome signs in as the QA account,
// fills the intake (with the worksheet when the case has one), types each
// student line, waits until the turn is planned, drawn and said, and saves the
// board picture and the engine's own record of every turn. Judging is done
// afterwards by Claude Code subagents from the saved packets.
//
//   npx tsx scripts/engine-run.mts --label e1 [--cases T01,T02,T05] [--runs 5] [--base http://localhost:3300] [--width 1440]
//
// Output: bench/runs/engine-<label>/<case>-r<n>/ (record.json, turn PNGs).

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { CASES as MAIN_CASES, HELDOUT, NOVICES, PICTURES, REAL, studentPrompt, studentSystem, type BenchCase } from "./bench-cases";

// Every simulated student the bench has, by id.
const BENCH_CASES: BenchCase[] = [...MAIN_CASES, ...NOVICES, ...HELDOUT, ...PICTURES, ...REAL];

for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z_0-9]+)=(.*)$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg("base", "http://localhost:3300")!;
const LABEL = arg("label", "dev")!;
const RUNS = Number(arg("runs", "1"));
const WIDTH = Number(arg("width", "1440"));
const HEIGHT = WIDTH < 600 ? 844 : 900;
const MODEL = arg("model");
// "engine" (the tutoring engine, ?engine=1) or "live" (today's Gemini Live tutor), on the same lines.
const TUTOR = arg("tutor", "engine") as "engine" | "live";
// Spoken: every line after the intake is said into the microphone (macOS `say`).
const SPOKEN = process.argv.includes("--spoken");

/** A line as 48 kHz speech, base64 WAV, from macOS `say` (math read as words). */
function speech(line: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "say-"));
  const said = line.replace(/(\d)\/(\d)/g, "$1 over $2").replace(/\^2/g, " squared").replace(/-(\d)/g, "minus $1").replace(/\*/g, " times ");
  execFileSync("say", ["-v", "Samantha", "-o", path.join(dir, "a.aiff"), said]);
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@48000", "-c", "1", path.join(dir, "a.aiff"), path.join(dir, "a.wav")]);
  return fs.readFileSync(path.join(dir, "a.wav")).toString("base64");
}

/** The page's microphone becomes room tone, with __speak(wav) to say a line into it. */
const FAKE_MIC = `(() => {
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => {
    if (!c || !c.audio) return real(c);
    const ctx = new AudioContext({ sampleRate: 48000 });
    const dest = ctx.createMediaStreamDestination();
    const n = ctx.createBuffer(1, 48000, 48000);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() - 0.5) * 0.0006;
    const room = ctx.createBufferSource(); room.buffer = n; room.loop = true; room.connect(dest); room.start();
    window.__speak = async (b64) => {
      await ctx.resume();
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const buf = await ctx.decodeAudioData(bytes.buffer);
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(dest); src.start();
      return new Promise((ok) => { src.onended = () => ok(buf.duration); });
    };
    return dest.stream;
  };
})();`;
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export type Case = { id: string; intake: string; file?: string; lines: string[]; student?: BenchCase };

// Simulated students (scripts/bench-cases.ts): Haiku 5.5 plays a kid from a
// hidden brief, sees the conversation and a picture of the board, and answers
// what the tutor actually asked (the scripted lines above never do).
const STUDENT_MODEL = arg("student-model", "claude-haiku-5-5")!;
const MAX_TURNS = Number(arg("turns", "8"));
function studentCases(ids: string[]): Case[] {
  const found = BENCH_CASES.filter((c) => ids.includes(c.id));
  const missing = ids.filter((id) => !found.some((c) => c.id === id));
  if (missing.length) throw new Error(`no simulated student ${missing.join(", ")}; known: ${BENCH_CASES.map((c) => c.id).join(", ")}`);
  return found.map((c) => ({ id: `S-${c.id}`, intake: c.topic, ...(c.worksheet ? { file: `bench/assets/${c.worksheet.file}` } : {}), lines: [], student: c }));
}
async function studentSays(c: BenchCase, history: Array<{ student: string; tutor: string }>, board: string, picture: string | null): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const transcript = history.map((t) => `You (${c.name}): ${t.student}\nTutor: ${t.tutor || "(said nothing)"}`).join("\n");
  const content: unknown[] = [];
  if (picture) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: picture } });
  content.push({ type: "text", text: studentPrompt(transcript, board, Boolean(picture)) });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: STUDENT_MODEL, max_tokens: 200, output_config: { effort: "low" }, thinking: { type: "disabled" }, system: studentSystem(c), messages: [{ role: "user", content }] }),
  });
  if (!r.ok) throw new Error(`student ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { content?: Array<{ type: string; text?: string }> };
  const raw = (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  return raw.replace(/^\s*(student|you|[a-z]+)\s*:\s*/i, "").replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ").trim() || "ok";
}
export const CASES: Case[] = [
  {
    id: "T01",
    intake: "A bike rental costs $3 to start plus $5 per hour. My budget is $23. What is the most hours I can rent it?",
    lines: ["I got 4 hours because 5 times 4 plus 3 is 24, which is under 23. Is my reasoning right?", "oh ok so it costs 23 exactly"],
  },
  {
    id: "T02",
    intake: "Question 1 on my worksheet. I did 12 times 5 and got 60.",
    file: "bench/assets/geometry-worksheet.png",
    lines: ["Can you draw the triangle inside its rectangle?", "My worksheet says 5, not 10. I only see a rectangle.", "Please draw a diagonal from bottom left to top right."],
  },
  {
    id: "T05",
    intake: "Algebra 1: x^2 - 5x + 6 = 0. I factored (x-2)(x-3) and found 2 and 3. Why can there be two answers?",
    lines: ["I already know how to factor. Why are there two solutions?", "The product is zero. At 2 the first factor is 0; at 3 the second is 0. Can you show the graph?", "The table values for x 1, 2, 3, 4 are 2, 0, 0, 2. Please show the curve."],
  },
  {
    id: "T03",
    intake: "Find the area of a right triangle with base 12 cm and height 5 cm.",
    lines: ["I did 12 times 5 and got 60.", "why do I need to half it?"],
  },
  {
    id: "T04",
    intake: "Why does 3(x - 2) = 3x - 6?",
    lines: ["Why does the 3 multiply the minus 2 too?", "I only see one bag. And why are the marbles negative?", "Can you use repeated addition instead?"],
  },
  {
    id: "T08",
    intake: "42 - 27. I get 25 because I subtract the smaller digit from the larger. I feel bad at math.",
    lines: ["26? 9 minus 3 is 6 and 2 minus 0 is 2. I dont know. Can you show blocks?", "I already answered 26. Please show me slowly.", "23 minus 9 is 14. How does that help with 42 minus 27?"],
  },
  {
    id: "T09",
    intake: "1/2 + 1/3 = 2/5 because I add tops and bottoms. I dont understand denominators.",
    lines: ["I know two halves make a whole now. Why cant I add the denominators on my original problem?", "so is it 3/6 plus 2/6?"],
  },
  {
    id: "T10",
    intake: "Why is a negative times a negative a positive? Like -3 times -2.",
    lines: ["I dont have any debts to remove if I start at zero. Can you prove it using distribution and put the equations on the board?", "ok so the -3 times 2 part is -6, and the whole thing has to be 0"],
  },
  {
    id: "T11",
    intake: "53 - 28. I don't get why we borrow.",
    lines: ["Because 3 ones is not enough to take 8 ones. I trade one ten for ten ones without changing the total. Thanks, I understand."],
  },
  {
    id: "T12",
    intake: "A bag has 3 red and 2 blue marbles. I draw two without putting the first back. What is the chance both are red? I think it's (3/5)^2.",
    lines: ["After a red is removed, there are 2 red and 2 blue, so the second chance is 2/4 = 1/2.", "Why multiply the chances?", "What changes if we replace the first marble?"],
  },
  {
    id: "T13",
    intake: "y = -2x + 3. Make a table for x = 0, 1, 2 and graph it.",
    lines: ["The values are 3, 1, and -1. So the points are (0,3), (1,1), (2,-1).", "why do we connect them with a line?", "what about y = 2x + 3?"],
  },
  {
    id: "T18",
    intake: "Question 1. I know the formula is one half base times height.",
    file: "bench/assets/geometry-worksheet.png",
    lines: ["so is it 30?"],
  },
];

const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

type EngineTurn = { turnId: string; line: string; ms: number; earlyMs?: number; speech: string[]; said: string[]; ops: string[]; receipts: unknown[]; log?: Record<string, unknown> };

async function engineTurns(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __chalkEngine?: { turns: unknown[] } }).__chalkEngine?.turns.length ?? 0);
}

/** Wait until turn `n` exists and the engine has been idle for a moment. */
async function settle(page: Page, n: number, timeoutMs = 90_000) {
  const t0 = Date.now();
  let idleSince = 0;
  while (Date.now() - t0 < timeoutMs) {
    const s = await page.evaluate(() => {
      const e = (window as unknown as { __chalkEngine?: { turns: unknown[]; isBusy(): boolean } }).__chalkEngine;
      return e ? { turns: e.turns.length, busy: e.isBusy() } : null;
    });
    if (s && s.turns >= n && !s.busy) {
      if (!idleSince) idleSince = Date.now();
      if (Date.now() - idleSince > 1500) return Date.now() - t0;
    } else idleSince = 0;
    await wait(300);
  }
  throw new Error(`turn ${n} did not settle in ${timeoutMs} ms`);
}

async function snap(page: Page, dir: string, name: string) {
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
  const board = await page.evaluate(async () => {
    const b = (window as unknown as { __chalkBoard?: { exportImage?: (w: number) => Promise<string | { url: string } | null>; getBoardSummary?: (c?: boolean) => string } }).__chalkBoard;
    const out = (await b?.exportImage?.(1200)) ?? null;
    const img = typeof out === "string" ? out : out?.url ?? null;
    return { img, summary: b?.getBoardSummary?.() ?? "" };
  });
  if (board.img) fs.writeFileSync(path.join(dir, `${name}-board.jpg`), Buffer.from(board.img.split(",")[1], "base64"));
  return board.summary;
}

async function runCase(browser: Browser, c: Case, dir: string) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });
  if (SPOKEN) await page.evaluateOnNewDocument(FAKE_MIC);
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });
  const to = encodeURIComponent(TUTOR === "live" ? "/session?ready=1" : `/session?engine=1&ready=1${MODEL ? `&engineModel=${MODEL}` : ""}`);
  await page.goto(`${BASE}/api/dev/qa-login?to=${to}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#intake-topic", { timeout: 60_000 });
  await page.type("#intake-topic", c.intake);
  if (c.file) {
    const input = await page.waitForSelector('input[type="file"]', { timeout: 10_000 });
    await (input as unknown as { uploadFile(p: string): Promise<void> }).uploadFile(path.resolve(c.file));
    await page.waitForFunction((name: string) => document.body.innerText.includes(name), { timeout: 15_000 }, path.basename(c.file));
  }
  const start = await page.waitForSelector("xpath/.//button[contains(., 'Start session')]");
  await start!.click();
  if (TUTOR === "live") return runLive(page, c, dir, consoleErrors);
  await page.waitForFunction(() => Boolean((window as unknown as { __chalkEngine?: unknown }).__chalkEngine), { timeout: 60_000 });
  const sessionId = /\/session\/([^?/]+)/.exec(page.url())?.[1] ?? "";
  const summaries: string[] = [];
  const waits: number[] = [];
  let error: string | null = null;
  try {
    waits.push(await settle(page, 1));
    summaries.push(await snap(page, dir, "t1"));
    // A simulated student makes up its lines as it goes; a scripted case has them.
    const history: Array<{ student: string; tutor: string }> = [];
    const said = async () => ((await page.evaluate(() => (window as unknown as { __chalkEngine: { turns: Array<{ said: string[] }> } }).__chalkEngine.turns.at(-1)?.said ?? [])) as string[]).join(" ");
    if (c.student) history.push({ student: c.intake, tutor: await said() });
    const lines = c.student ? Array.from({ length: MAX_TURNS }, () => "") : c.lines;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (c.student) {
        const summary = await page.evaluate(() => (window as unknown as { __chalkBoard?: { getBoardSummary?: (c?: boolean) => string } }).__chalkBoard?.getBoardSummary?.(true) ?? "");
        const pic = fs.existsSync(path.join(dir, `t${i + 1}-board.jpg`)) ? fs.readFileSync(path.join(dir, `t${i + 1}-board.jpg`)).toString("base64") : null;
        line = await studentSays(c.student, history, summary, pic);
        c.lines.push(line);
        const lastMove = await page.evaluate(() => (window as unknown as { __chalkEngine: { turns: Array<{ log?: { move?: string } }> } }).__chalkEngine.turns.at(-1)?.log?.move);
        if (lastMove === "close") break;
      }
      const before = await engineTurns(page);
      if (SPOKEN) {
        // Said into the microphone; the turn starts once the ear hears the end of it.
        await page.evaluate((b64: string) => (window as unknown as { __speak: (b: string) => Promise<number> }).__speak(b64), speech(line));
      } else {
        if (!(await page.$('input[placeholder="Type to the tutor…"]'))) {
          await page.click('button[aria-label="Type to the tutor"]');
          await page.waitForSelector('input[placeholder="Type to the tutor…"]');
        }
        await page.type('input[placeholder="Type to the tutor…"]', line);
        await page.keyboard.press("Enter");
      }
      waits.push(await settle(page, before + 1));
      summaries.push(await snap(page, dir, `t${i + 2}`));
      if (c.student) history.push({ student: line, tutor: await said() });
    }
  } catch (err) {
    error = (err as Error).message;
  }
  // Saved whole or partial: a stalled turn is traced from its session id.
  const turns = (await page.evaluate(() => (window as unknown as { __chalkEngine?: { turns: unknown[] } }).__chalkEngine?.turns ?? [])) as EngineTurn[];
  const record = { case: c.id, sessionId, base: BASE, width: WIDTH, intake: c.intake, file: c.file ?? null, lines: c.lines, turns, summaries, waits, consoleErrors, ...(error ? { error } : {}) };
  fs.writeFileSync(path.join(dir, "record.json"), JSON.stringify(record, null, 2));
  await page.close();
  if (error) throw new Error(`${error} (session ${sessionId})`);
  return record;
}

type Live = { dev: { lastAudioAt: number; lastToolAt: number; lines: string[]; tools: string[] }; devQuiet(ms: number): boolean };
const liveState = (page: Page) => page.evaluate(() => {
  const l = (window as unknown as { __chalkLive?: Live }).__chalkLive;
  return l ? { lines: l.dev.lines.length, tools: l.dev.tools.length, audioAt: l.dev.lastAudioAt, quiet: l.devQuiet(4000) } : null;
});

/** Today's tutor on the same lines: a turn is over once it has spoken and then been quiet for 4 s. */
async function runLive(page: Page, c: Case, dir: string, consoleErrors: string[]) {
  await page.waitForFunction(() => Boolean((window as unknown as { __chalkLive?: unknown }).__chalkLive), { timeout: 60_000 });
  const sessionId = /\/session\/([^?/]+)/.exec(page.url())?.[1] ?? "";
  const turns: EngineTurn[] = [];
  const summaries: string[] = [];
  const waits: number[] = [];
  let error: string | null = null;
  const settleLive = async (sentAt: number) => {
    const t0 = Date.now();
    let firstAudio = 0;
    while (Date.now() - t0 < 90_000) {
      const s = await liveState(page);
      if (s && s.audioAt > sentAt && !firstAudio) firstAudio = s.audioAt - sentAt;
      if (s && s.audioAt > sentAt && s.quiet) return { wait: Date.now() - t0, firstAudio };
      await wait(300);
    }
    throw new Error("live turn did not settle in 90 s");
  };
  const take = async (line: string, from: { lines: number; tools: number }, wait0: { wait: number; firstAudio: number }, i: number) => {
    const all = (await page.evaluate(() => {
      const l = (window as unknown as { __chalkLive: Live }).__chalkLive;
      return { lines: l.dev.lines, tools: l.dev.tools };
    })) as { lines: string[]; tools: string[] };
    turns.push({ turnId: `t${i}`, line, ms: wait0.firstAudio, speech: [], said: [all.lines.slice(from.lines).join("").replace(/\s+/g, " ").trim()], ops: all.tools.slice(from.tools), receipts: [] });
    waits.push(wait0.wait);
  };
  try {
    let from = { lines: 0, tools: 0 };
    await take(c.intake, from, await settleLive(Date.now() - 60_000), 1);
    summaries.push(await snap(page, dir, "t1"));
    for (const [i, line] of c.lines.entries()) {
      const s = (await liveState(page))!;
      from = { lines: s.lines, tools: s.tools };
      if (!(await page.$('input[placeholder="Type to the tutor…"]'))) {
        await page.click('button[aria-label="Type to the tutor"]');
        await page.waitForSelector('input[placeholder="Type to the tutor…"]');
      }
      await page.type('input[placeholder="Type to the tutor…"]', line);
      const sentAt = await page.evaluate(() => Date.now());
      await page.keyboard.press("Enter");
      await take(line, from, await settleLive(sentAt), i + 2);
      summaries.push(await snap(page, dir, `t${i + 2}`));
    }
  } catch (err) {
    error = (err as Error).message;
  }
  const record = { case: c.id, tutor: "live", sessionId, base: BASE, width: WIDTH, intake: c.intake, file: c.file ?? null, lines: c.lines, turns, summaries, waits, consoleErrors, ...(error ? { error } : {}) };
  fs.writeFileSync(path.join(dir, "record.json"), JSON.stringify(record, null, 2));
  await page.close();
  if (error) throw new Error(`${error} (session ${sessionId})`);
  return record;
}

const only = arg("cases")?.split(",");
const studentIds = arg("students")?.split(",");
const cases = studentIds ? studentCases(studentIds) : CASES.filter((c) => !only || only.includes(c.id));
const root = path.join("bench/runs", `engine-${LABEL}`);
fs.mkdirSync(root, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
try {
  for (const c of cases) {
    for (let r = 1; r <= RUNS; r++) {
      const dir = path.join(root, `${c.id}-r${r}`);
      fs.mkdirSync(dir, { recursive: true });
      const t0 = Date.now();
      try {
        const rec = await runCase(browser, c, dir);
        const fallbacks = rec.turns.filter((t) => t.log?.fallback).length;
        console.log(`${c.id} r${r}: ${rec.turns.length} turns in ${Math.round((Date.now() - t0) / 1000)} s, waits ${rec.waits.map((w) => (w / 1000).toFixed(1)).join("/")} s, fallbacks ${fallbacks}, session ${rec.sessionId}`);
        for (const t of rec.turns) console.log(`   ${t.turnId} [${t.log?.move ?? "?"}] first ${t.earlyMs ? `${(t.earlyMs / 1000).toFixed(1)} s early` : `${(t.ms / 1000).toFixed(1)} s`} | ${t.said.join(" ").slice(0, 200)}  ops: ${t.ops.join(", ").slice(0, 140)}`);
      } catch (err) {
        console.log(`${c.id} r${r}: FAILED ${(err as Error).message}`);
      }
    }
  }
} finally {
  await browser.close();
}
