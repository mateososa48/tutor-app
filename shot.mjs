import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { execSync } from 'child_process';

const url = process.argv[2];
const label = process.argv[3] || 'full';
const scrollY = parseInt(process.argv[4] || '0', 10);
const width = parseInt(process.argv[5] || '1440', 10);
const height = parseInt(process.argv[6] || '900', 10);

const dir = '/Users/mateososaalbrecht/tutor-app/temporary screenshots';
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const n = readdirSync(dir).filter(f => f.startsWith('screenshot-')).length + 1;
const outPath = `${dir}/screenshot-${n}-${label}.png`;

let chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(chrome)) {
  chrome = execSync('ls ~/.cache/puppeteer/chrome/*/chrome-mac-*/Google\\ Chrome\\ for\\ Testing.app/Contents/MacOS/* 2>/dev/null | head -1').toString().trim();
}
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width, height });
await page.goto(url, { waitUntil: 'networkidle2' });
if (scrollY > 0) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), scrollY);
}
await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: outPath, fullPage: false });
await browser.close();
console.log('Saved:', outPath);
