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
import puppeteer, { type Browser, type Page } from "puppeteer-core";

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
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export type Case = { id: string; intake: string; file?: string; lines: string[] };
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
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });
  const to = encodeURIComponent(`/session?engine=1&ready=1${MODEL ? `&engineModel=${MODEL}` : ""}`);
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
  await page.waitForFunction(() => Boolean((window as unknown as { __chalkEngine?: unknown }).__chalkEngine), { timeout: 60_000 });
  const sessionId = /\/session\/([^?/]+)/.exec(page.url())?.[1] ?? "";
  const summaries: string[] = [];
  const waits: number[] = [];
  let error: string | null = null;
  try {
    waits.push(await settle(page, 1));
    summaries.push(await snap(page, dir, "t1"));
    for (const [i, line] of c.lines.entries()) {
      const before = await engineTurns(page);
      if (!(await page.$('input[placeholder="Type to the tutor…"]'))) {
        await page.click('button[aria-label="Type to the tutor"]');
        await page.waitForSelector('input[placeholder="Type to the tutor…"]');
      }
      await page.type('input[placeholder="Type to the tutor…"]', line);
      await page.keyboard.press("Enter");
      waits.push(await settle(page, before + 1));
      summaries.push(await snap(page, dir, `t${i + 2}`));
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

const only = arg("cases")?.split(",");
const cases = CASES.filter((c) => !only || only.includes(c.id));
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
