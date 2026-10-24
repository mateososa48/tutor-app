// A spoken session on the LiveKit voice path, headless, through the real
// intake: Chrome plays a WAV as the microphone, types the topic, presses Start
// session, and screenshots the session as it goes. Prints the audible gaps the
// page measured (the student's last loud mic frame, or a typed line, to the
// tutor's first sound: lib/livekit-tutor.ts) and any page errors.
//
//   node scripts/livekit-voice-test.mjs student.wav outDir "ratios: 2 cups make 12 cookies" [seconds] [base] [extra query]
//
// Make the WAV with macOS `say` + `afconvert -f WAVE -d LEI16@48000`, with
// quiet noise (never digital zeros) between the lines, and adult or synthetic
// voices only. Read the agent's side in the `npm run livekit` output.
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
const [WAV, OUT, TOPIC, SECS = "140", BASE = "http://localhost:3350", EXTRA = ""] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${path.resolve(WAV)}`, "--autoplay-policy=no-user-gesture-required", "--window-size=1440,900", "--disable-features=AudioServiceSandbox", "--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
await page.goto(`${BASE}/api/dev/qa-login?to=${encodeURIComponent(`/session?ready=1&voice=livekit${EXTRA}`)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
const box = await page.waitForSelector('textarea[placeholder="Adding fractions, question 4"], input[placeholder="Adding fractions, question 4"]', { timeout: 30000 });
await box.type(TOPIC);
const [btn] = await page.$$("xpath/.//button[contains(., 'Start session')]");
await btn.click();
const t0 = Date.now();
const total = Number(SECS) * 1000;
for (let at = 20; at * 1000 < total; at += 20) {
  await new Promise((r) => setTimeout(r, at * 1000 - (Date.now() - t0)));
  await page.screenshot({ path: `${OUT}/t${at}.png` });
}
await new Promise((r) => setTimeout(r, Math.max(0, total - (Date.now() - t0))));
const gaps = await page.evaluate(() => window.__livekitTutor?.gaps ?? null);
await page.screenshot({ path: `${OUT}/final.png` });
console.log(JSON.stringify({ url: page.url(), gaps, errors: errors.slice(0, 12) }, null, 1));
await browser.close();
