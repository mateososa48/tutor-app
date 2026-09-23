// Photographs real boards for the landing page.
//
//   node scripts/landing-shots.mjs [http://localhost:3000] [--only compare,slope]
//
// `--only` shoots just those scenes and keeps every other entry already in
// shots.generated.ts, so adding a scene does not re-photograph the rest.
// Needs the dev server running (the scenes live at /dev/landing, dev only)
// and Google Chrome installed (CHROME_PATH overrides the location). Each scene
// in components/landing/lesson.ts is replayed on the real whiteboard, framed
// to its content, and saved at 2x to public/landing/. The sizes land in
// components/landing/shots.generated.ts so next/image knows them.

import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const onlyAt = args.indexOf("--only");
const ONLY = onlyAt >= 0 ? new Set(args[onlyAt + 1].split(",")) : null;
const BASE = args.find((a, i) => !a.startsWith("--") && i !== onlyAt + 1) ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT_DIR = "public/landing";
const DPR = 2;

// `content` shots are trimmed to the drawing's pixels with some air around it;
// `viewport` shots are the whole board as the hero frame shows it. `count`
// stops a scene after that many calls.
const SCENES = [
  { key: "steps", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28 },
  { key: "hint", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28 },
  { key: "worksheet", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28, settle: 5000 },
  { key: "graph", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28, settle: 5000 },
  { key: "figure", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28, settle: 5000 },
  { key: "icons", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28, settle: 1800 },
  { key: "fraction", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28, settle: 1800 },
  // Sept 22: the combined how-it-works section. They settle 7.5 s so the
// tutor's pen, which hides after 6 s idle, is gone from the picture. `seq` also photographs the
  // board after each of those call counts, every frame cropped to the finished
  // board's rectangle, so a section can play the lesson back call by call.
  { key: "compare", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28, settle: 7500, seq: [2, 4, 6, 9] },
  { key: "negatives", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28, settle: 7500 },
  { key: "slope", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28, settle: 7500 },
  { key: "percent", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28, settle: 7500 },
  { key: "area", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28, settle: 7500 },
  { key: "solved", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28, settle: 7500 },
  { key: "ratio", frame: "content", viewport: { width: 1200, height: 760 }, pad: 28, settle: 7500 },
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
          resolve({ dataUrl: out.toDataURL("image/png"), width: out.width, height: out.height, rect: [x0, y0, out.width, out.height] });
        };
        img.src = data;
      }),
    [`data:image/png;base64,${pngBase64}`, padPx],
  );
}

// Crop a PNG to a given rectangle (device pixels).
async function crop(page, pngBase64, rect) {
  return page.evaluate(
    ([data, [x0, y0, w, h]]) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const out = document.createElement("canvas");
          out.width = w;
          out.height = h;
          const ctx = out.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, x0, y0, w, h, 0, 0, w, h);
          resolve(out.toDataURL("image/png"));
        };
        img.src = data;
      }),
    [`data:image/png;base64,${pngBase64}`, rect],
  );
}

async function openScene(browser, scene, count) {
  const page = await browser.newPage();
  await page.setViewport({ ...scene.viewport, deviceScaleFactor: DPR });
  page.on("pageerror", (e) => console.log(`  page error: ${e.message}`));
  const n = count ?? scene.count;
  const target = `/dev/landing?scene=${scene.key}&step=120${n ? `&count=${n}` : ""}`;
  await page.goto(`${BASE}/api/dev/qa-login?to=${encodeURIComponent(target)}`, { waitUntil: "networkidle2", timeout: 90000 });
  await page.waitForFunction(
    () => document.body.dataset.sceneDone === "1" && document.body.dataset.writing !== "1",
    { timeout: 90000 },
  );
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await new Promise((r) => setTimeout(r, scene.settle ?? 900));
  return page;
}

// Photographs the board after `count` calls through the camera and crop of
// the finished board, so every frame of a sequence lines up with the last.
async function shootFrame(browser, scene, count, camera, rect) {
  const page = await openScene(browser, scene, count);
  await page.addStyleTag({ content: ".tl-watermark_SEE-LICENSE{display:none!important}" });
  await page.evaluate(async (cam) => {
    window.__chalkEditor.setCamera(cam);
    await new Promise((r) => setTimeout(r, 300));
  }, camera);
  const raw = await page.screenshot({ encoding: "base64" });
  const dataUrl = await crop(page, raw, rect);
  const file = `${scene.file ?? scene.key}-${count}.png`;
  fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(dataUrl.split(",")[1], "base64"));
  await page.close();
  return file;
}

async function shoot(browser, scene) {
  const page = await openScene(browser, scene);
  let camera = null;
  let rect = null;

  const file = `${scene.file ?? scene.key}.png`;
  const out = path.join(OUT_DIR, file);
  let width = scene.viewport.width * DPR;
  let height = scene.viewport.height * DPR;

  if (scene.frame === "content") {
    // Zoom 1 with the drawing at the top left, the badge hidden, then trim.
    await page.addStyleTag({ content: ".tl-watermark_SEE-LICENSE{display:none!important}" });
    camera = await page.evaluate(async () => {
      const editor = window.__chalkEditor;
      const b = editor.getCurrentPageBounds();
      const cam = { x: -b.minX + 40, y: -b.minY + 40, z: 1 };
      editor.setCamera(cam);
      await new Promise((r) => setTimeout(r, 300));
      return cam;
    });
    const raw = await page.screenshot({ encoding: "base64" });
    const trimmed = await trim(page, raw, scene.pad * DPR);
    if (!trimmed) throw new Error(`${scene.key}: nothing drawn`);
    fs.writeFileSync(out, Buffer.from(trimmed.dataUrl.split(",")[1], "base64"));
    width = trimmed.width;
    height = trimmed.height;
    rect = trimmed.rect;
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
  const frames = [];
  for (const n of scene.seq ?? []) frames.push(`/landing/${await shootFrame(browser, scene, n, camera, rect)}`);
  return { key: scene.key, src: `/landing/${file}`, width, height, frames };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--font-render-hinting=none"],
});
// Keep what is already generated when only some scenes are reshot.
const GENERATED = "components/landing/shots.generated.ts";
const shots = {};
if (ONLY && fs.existsSync(GENERATED)) {
  for (const m of fs.readFileSync(GENERATED, "utf8").matchAll(/^  (\w+): (\{.*\}),$/gm)) {
    shots[m[1]] = Function(`return (${m[2]})`)();
  }
}
try {
  for (const scene of SCENES) {
    if (ONLY && !ONLY.has(scene.key)) continue;
    const shot = await shoot(browser, scene);
    shots[shot.key] = { src: shot.src, width: shot.width, height: shot.height, ...(shot.frames.length ? { frames: shot.frames } : {}) };
    console.log(`${shot.key}: ${shot.src} ${shot.width}x${shot.height}`);
  }
} finally {
  await browser.close();
}

const lines = Object.entries(shots).map(
  ([k, v]) =>
    `  ${k}: { src: "${v.src}", width: ${v.width}, height: ${v.height}${v.frames ? `, frames: [${v.frames.map((f) => `"${f}"`).join(", ")}]` : ""} },`,
);
fs.writeFileSync(
  GENERATED,
  `// Generated by scripts/landing-shots.mjs. Do not edit; rerun the script.\nexport const SHOTS = {\n${lines.join("\n")}\n} as const;\n`,
);
console.log("wrote components/landing/shots.generated.ts");
