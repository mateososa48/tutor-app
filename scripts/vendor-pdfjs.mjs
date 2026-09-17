// Copies pdf.js's worker into public/vendor, where lib/worksheet-pages.ts
// loads it from. Run after upgrading pdfjs-dist, then bump PDFJS_VERSION.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "node_modules/pdfjs-dist/package.json"), "utf8"));
const from = path.join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const to = path.join(root, "public/vendor/pdf.worker.min.mjs");
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to);
const pages = fs.readFileSync(path.join(root, "lib/worksheet-pages.ts"), "utf8");
const pinned = /PDFJS_VERSION = "([^"]+)"/.exec(pages)?.[1];
console.log(`Copied pdf.js ${pkg.version} worker to public/vendor (${Math.round(fs.statSync(to).size / 1024)} KB).`);
if (pinned !== pkg.version) {
  console.error(`lib/worksheet-pages.ts pins ${pinned}; set PDFJS_VERSION to ${pkg.version} so browsers fetch the new worker.`);
  process.exit(1);
}
