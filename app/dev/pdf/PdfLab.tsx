"use client";

import { useState } from "react";
import { readFileAsBase64 } from "@/lib/file-processor";
import { MAX_PDF_PAGES, renderPdfPages, type PdfPages } from "@/lib/worksheet-pages";

type Result = { name: string; ms: number; kb: number; pages: PdfPages } | { name: string; error: string };

export default function PdfLab() {
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);

  async function onFiles(list: FileList | null) {
    if (!list) return;
    setBusy(true);
    for (const file of Array.from(list)) {
      try {
        const base64 = await readFileAsBase64(file);
        const started = performance.now();
        const pages = await renderPdfPages({ id: `${file.name}:${file.size}:${file.lastModified}`, base64 });
        const kb = Math.round(pages.pages.reduce((sum, p) => sum + p.base64.length * 0.75, 0) / 1024);
        setResults((prev) => [...prev, { name: file.name, ms: Math.round(performance.now() - started), kb, pages }]);
      } catch (err) {
        setResults((prev) => [...prev, { name: file.name, error: err instanceof Error ? err.message : String(err) }]);
      }
    }
    setBusy(false);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", color: "#121215" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>PDF pages</h1>
      <p style={{ margin: "0 0 16px", color: "#5b5b66" }}>
        The first {MAX_PDF_PAGES} pages of each PDF become JPEGs, as a session sends them to the tutor.
      </p>
      <input id="pdf-input" type="file" accept="application/pdf" multiple disabled={busy} onChange={(e) => void onFiles(e.target.files)} />
      <div data-testid="pdf-results" style={{ marginTop: 20, display: "grid", gap: 24 }}>
        {results.map((r, i) => (
          <section key={i}>
            {"error" in r ? (
              <p style={{ color: "#b3261e" }}>{r.name}: {r.error}</p>
            ) : (
              <>
                <p data-summary style={{ margin: "0 0 8px" }}>
                  {r.name}: {r.pages.pages.length} of {r.pages.pageCount} pages in {r.ms} ms, {r.kb} KB
                </p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {r.pages.pages.map((p, n) => (
                    <figure key={n} style={{ margin: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`data:${p.mimeType};base64,${p.base64}`} alt={`page ${n + 1}`} style={{ width: 180, border: "1px solid #e5e5ea" }} />
                      <figcaption style={{ fontSize: 12, color: "#5b5b66" }}>
                        page {n + 1}, {p.width} × {p.height}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
