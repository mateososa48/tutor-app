// PDF pages as pictures (Sept 16 2026). Gemini Live reads images, not PDFs,
// so an uploaded worksheet reached the tutor as "Skipped unsupported file
// type". pdf.js turns the first pages into JPEGs in the browser; it loads only
// when a PDF is attached. Its worker is vendored into public/vendor by
// `npm run vendor:pdfjs` (scripts/vendor-pdfjs.mjs), like the voice engine.

import type { FilePage, UploadedFile } from "./file-processor";

export const PDFJS_VERSION = "6.3.289";
export const PDF_WORKER_URL = `/vendor/pdf.worker.min.mjs?v=${PDFJS_VERSION}`;
export const MAX_PDF_PAGES = 6;
const PAGE_WIDTH = 1600;
const JPEG_QUALITY = 0.82;

type PdfJs = typeof import("pdfjs-dist");
let loading: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  loading ??= import("pdfjs-dist").then((mod) => {
    mod.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
    return mod;
  });
  return loading;
}

export type PdfPages = { pages: FilePage[]; pageCount: number };

const cache = new Map<string, Promise<PdfPages>>();

function toBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function render(base64: string): Promise<PdfPages> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: toBytes(base64) });
  const doc = await task.promise;
  try {
    const pages: FilePage[] = [];
    const count = Math.min(doc.numPages, MAX_PDF_PAGES);
    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, PAGE_WIDTH / natural.width) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d canvas");
      // JPEG has no transparency: paper is white.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const url = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      pages.push({ base64: url.slice(url.indexOf(",") + 1), mimeType: "image/jpeg", width: canvas.width, height: canvas.height });
      page.cleanup();
    }
    return { pages, pageCount: doc.numPages };
  } finally {
    await task.destroy();
  }
}

/** The first pages of a PDF as JPEGs, rendered once per file id. */
export function renderPdfPages(file: Pick<UploadedFile, "id" | "base64">): Promise<PdfPages> {
  let job = cache.get(file.id);
  if (!job) {
    job = render(file.base64);
    cache.set(file.id, job);
    job.catch(() => cache.delete(file.id));
  }
  return job;
}

/**
 * The same files, PDFs with their page pictures added. A PDF that cannot be
 * read keeps no pages (the tutor is told it could not be read).
 */
export async function withPdfPages(files: UploadedFile[]): Promise<UploadedFile[]> {
  return Promise.all(
    files.map(async (file) => {
      if (file.mimeType !== "application/pdf" || file.pages) return file;
      try {
        const { pages, pageCount } = await renderPdfPages(file);
        return { ...file, pages, pageCount };
      } catch (err) {
        console.warn("[worksheet] could not read", file.name, err);
        return { ...file, pages: [], pageCount: 0 };
      }
    }),
  );
}
