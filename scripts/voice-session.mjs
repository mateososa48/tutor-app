// A real spoken session through the app: headless Chrome, the QA account, the
// session page with ?debug=1&mic=1, and a WAV played as the microphone.
//
//   node scripts/voice-session.mjs student.wav [waitMs] [base]
//
// Build the WAV with macOS `say` + `afconvert -f WAVE -d LEI16@48000`, and pad
// the gaps with a ±8 LSB noise floor, never digital zeros (3.8 needs trailing
// audio to end a turn). The flags that let Chrome read the file on macOS are
// --disable-features=AudioServiceSandbox and --no-sandbox: without them the fake
// microphone is silently all zeros. Read the result on /admin or in
// session_events (the session id is printed).
import path from "node:path";
import puppeteer from "puppeteer-core";
const WAV = process.argv[2], WAIT = Number(process.argv[3] ?? 90000), BASE = process.argv[4] ?? "http://localhost:3300";
if (!WAV) throw new Error("usage: node scripts/voice-session.mjs student.wav [waitMs] [base]");
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${path.resolve(WAV)}`, "--autoplay-policy=no-user-gesture-required", "--window-size=1440,900", "--disable-features=AudioServiceSandbox", "--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const t0 = Date.now();
const log = [];
page.on("console", (m) => { const t = m.text(); if (/Gemini|error|Error/.test(t)) log.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${t.slice(0, 200)}`); });
page.on("pageerror", (e) => log.push(`pageerror ${e.message.slice(0, 200)}`));
await page.goto(`${BASE}/api/dev/qa-login?to=${encodeURIComponent("/session?debug=1&mic=1")}`, { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, WAIT));
const url = page.url();
console.log(JSON.stringify({ url, log }, null, 1));
await browser.close();
