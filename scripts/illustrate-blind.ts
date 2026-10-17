// Blind sheets for rating the illustration bake-off (Oct 14 2026). For each
// case, every arm's picture goes on one page under a shuffled letter, the
// page is photographed, and the letter → arm key is kept apart, so raters
// judge pictures, not approaches.
//
//   npx tsx scripts/illustrate-blind.ts --label g1
//
// Writes bench/illustrate/<label>/blind/<case>.png and key.json.

import fs from "node:fs";
import path from "node:path";
import { ILLUSTRATION_CASES } from "./illustrate-cases";

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const label = args[args.indexOf("--label") + 1] ?? "g1";
const DIR = path.join(ROOT, "bench", "illustrate", label);
const OUT = path.join(DIR, "blind");
fs.mkdirSync(OUT, { recursive: true });

type Result = { caseId: string; arm: string; svg?: string; png?: string; error?: string };
const results: Result[] = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));

// A fixed shuffle per case, so a rerun gives the same letters.
function shuffle<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const key: Record<string, Record<string, string>> = {};
  try {
    for (const [ci, c] of ILLUSTRATION_CASES.entries()) {
      const row = results.filter((r) => r.caseId === c.id && !r.error && (r.svg || r.png));
      if (!row.length) continue;
      const order = shuffle(row, 1000 + ci * 7919);
      key[c.id] = {};
      let cells = "";
      order.forEach((r, i) => {
        const letter = String.fromCharCode(65 + i);
        key[c.id][letter] = r.arm;
        const pic = r.svg
          ? fs.readFileSync(path.join(DIR, r.svg), "utf8").replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(?:width|height)="[^"]*"/g, ""))
          : `<img src="file://${path.join(DIR, r.png!)}">`;
        cells += `<div class="cell"><div class="l">${letter}</div><div class="pic">${pic}</div></div>`;
      });
      const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"><style>body{margin:0;padding:20px;background:#f2f2f4;font-family:'IBM Plex Sans',sans-serif;width:1520px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.cell{background:#fff;border-radius:10px;padding:12px;border:1px solid #ddd}.l{font-weight:700;font-size:22px;color:#333;margin-bottom:6px}.pic{height:330px;display:flex;align-items:center;justify-content:center}.pic svg,.pic img{max-width:100%;max-height:330px;width:auto;height:auto}</style></head><body><div class="grid">${cells}</div></body></html>`;
      const file = path.join(OUT, `${c.id}.html`);
      fs.writeFileSync(file, html);
      const page = await browser.newPage();
      await page.setViewport({ width: 1560, height: 900, deviceScaleFactor: 1.5 });
      await page.goto("file://" + file, { waitUntil: "networkidle0" });
      await page.screenshot({ path: path.join(OUT, `${c.id}.png`), fullPage: true });
      await page.close();
      console.log(c.id, Object.keys(key[c.id]).length, "pictures");
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, "key.json"), JSON.stringify(key, null, 1));
}

main();
