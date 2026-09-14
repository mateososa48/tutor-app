// Photographs real boards for the landing page.
//
//   node scripts/landing-shots.mjs [http://localhost:3000]
//
// Needs the dev server running (the scenes live at /dev/landing, dev only)
// and Google Chrome installed (CHROME_PATH overrides the location). Each scene
// in components/landing/lesson.ts is replayed on the real whiteboard, framed
// to its content, and saved at 2x to public/landing/. The sizes land in
// components/landing/shots.generated.ts so next/image knows them.

import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT_DIR = "public/landing";
const DPR = 2;

// `content` shots are trimmed to the drawing's pixels with some air around it;
// `viewport` shots are the whole board as the hero frame shows it. `count`
// stops a scene after that many calls.
const SCENES = [
  { key: "steps", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28 },
  { key: "hint", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28 },
  { key: "worksheet", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28 },
  { key: "hero", file: "session-board", frame: "viewport", viewport: { width: 1068, height: 640 }, count: 5 },
];

// Crop a PNG to its non-white pixels, in the browser (no image library needed).
async function trim(page, pngBase64, padPx) {
  return page.evaluate(
    ([data, pad]) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0);
          const { data: px } = ctx.getImageData(0, 0, c.width, c.height);
          let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
          for (let y = 0; y < c.height; y++) {
            for (let x = 0; x < c.width; x++) {
              const i = (y * c.width + x) * 4;
              if (px[i] < 246 || px[i + 1] < 246 || px[i + 2] < 246) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          if (maxX < 0) return resolve(null);
          const x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad);
          const x1 = Math.min(c.width, maxX + 1 + pad), y1 = Math.min(c.height, maxY + 1 + pad);
          const out = document.createElement("canvas");
          out.width = x1 - x0;
          out.height = y1 - y0;
          out.getContext("2d").drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
          resolve({ dataUrl: out.toDataURL("image/png"), width: out.width, height: out.height });
        };
        img.src = data;
      }),
    [`data:image/png;base64,${pngBase64}`, padPx],
  );
}

async function shoot(browser, scene) {
  const page = await browser.newPage();
  await page.setViewport({ ...scene.viewport, deviceScaleFactor: DPR });
  page.on("pageerror", (e) => console.log(`  page error: ${e.message}`));
  const target = `/dev/landing?scene=${scene.key}&step=120${scene.count ? `&count=${scene.count}` : ""}`;
  await page.goto(`${BASE}/api/dev/qa-login?to=${encodeURIComponent(target)}`, { waitUntil: "networkidle2", timeout: 90000 });
  await page.waitForFunction(
    () => document.body.dataset.sceneDone === "1" && document.body.dataset.writing !== "1",
    { timeout: 90000 },
  );
  // The Next.js dev badge is not part of the product.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await new Promise((r) => setTimeout(r, 900));

  const file = `${scene.file ?? scene.key}.png`;
  const out = path.join(OUT_DIR, file);
  let width = scene.viewport.width * DPR;
  let height = scene.viewport.height * DPR;

  if (scene.frame === "content") {
    // Zoom 1 with the drawing at the top left, the badge hidden, then trim.
    await page.addStyleTag({ content: ".tl-watermark_SEE-LICENSE{display:none!important}" });
    await page.evaluate(async () => {
      const editor = window.__chalkEditor;
      const b = editor.getCurrentPageBounds();
      editor.setCamera({ x: -b.minX + 40, y: -b.minY + 40, z: 1 });
      await new Promise((r) => setTimeout(r, 300));
    });
    const raw = await page.screenshot({ encoding: "base64" });
    const trimmed = await trim(page, raw, scene.pad * DPR);
    if (!trimmed) throw new Error(`${scene.key}: nothing drawn`);
    fs.writeFileSync(out, Buffer.from(trimmed.dataUrl.split(",")[1], "base64"));
    width = trimmed.width;
    height = trimmed.height;
  } else {
    // Frame the whole drawing, as the live board does once it settles.
    await page.evaluate(async () => {
      const editor = window.__chalkEditor;
      editor.zoomToBounds(editor.getCurrentPageBounds(), { inset: 48, targetZoom: 1 });
      await new Promise((r) => setTimeout(r, 400));
    });
    await page.screenshot({ path: out });
  }
  await page.close();
  return { key: scene.key, src: `/landing/${file}`, width, height };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--font-render-hinting=none"],
});
const shots = {};
try {
  for (const scene of SCENES) {
    const shot = await shoot(browser, scene);
    shots[shot.key] = { src: shot.src, width: shot.width, height: shot.height };
    console.log(`${shot.key}: ${shot.src} ${shot.width}x${shot.height}`);
  }
} finally {
  await browser.close();
}

const lines = Object.entries(shots).map(([k, v]) => `  ${k}: { src: "${v.src}", width: ${v.width}, height: ${v.height} },`);
fs.writeFileSync(
  "components/landing/shots.generated.ts",
  `// Generated by scripts/landing-shots.mjs. Do not edit; rerun the script.\nexport const SHOTS = {\n${lines.join("\n")}\n} as const;\n`,
);
console.log("wrote components/landing/shots.generated.ts");
