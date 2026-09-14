// usage: node shot.mjs <url> <out.png> [width] [height] [dpr] [waitMs] [fullPage] [scrollY]
import puppeteer from "puppeteer-core";
const [url, out, w = "1440", h = "900", dpr = "1", wait = "1500", full = "0", scrollY = "0"] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: +dpr });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 300)); });
await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
if (+scrollY) await page.evaluate((y) => window.scrollTo(0, y), +scrollY);
await new Promise((r) => setTimeout(r, +wait));
await page.screenshot({ path: out, fullPage: full === "1" });
console.log("saved", out, await page.title());
await browser.close();
