"use client";

// One hidden Desmos graphing calculator renders every graph on the board to an
// SVG, one graph at a time. The board shows the picture (crisp at any zoom,
// exported with board pictures, saved in snapshots) instead of a live
// calculator per graph. See lib/desmos-graph.ts for building the expressions.
//
// Commercial use of the Desmos API needs a Desmos partnership and its API key
// in NEXT_PUBLIC_DESMOS_API_KEY. Development falls back to the public demo key
// from Desmos's own docs; a production build without a key draws graphs the
// old way (TldrawCore's vector graphs), so nothing breaks.

import type { GraphSpec } from "@/lib/desmos-graph";

const DESMOS_VERSION = "v1.12";
const DEMO_KEY = "dcb31709b452b1cf9dc26972add0fda6";
const LOAD_TIMEOUT_MS = 20000;

type DesmosCalculator = {
  setBlank(): void;
  setMathBounds(bounds: GraphSpec["bounds"]): void;
  setExpressions(list: Array<Record<string, unknown>>): void;
  asyncScreenshot(options: Record<string, unknown>, callback: (data: string) => void): void;
  resize(): void;
  expressionAnalysis?: Record<string, { isError?: boolean; errorMessage?: string }>;
  destroy(): void;
};
type DesmosApi = { GraphingCalculator(el: HTMLElement, options: Record<string, unknown>): DesmosCalculator };

export function desmosApiKey(): string | null {
  const configured = process.env.NEXT_PUBLIC_DESMOS_API_KEY?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : DEMO_KEY;
}

let loading: Promise<DesmosApi> | null = null;
let failed = false;

/** Whether graphs should be drawn by Desmos right now (a browser, a key, and no earlier load failure). */
export function desmosAvailable(): boolean {
  return typeof window !== "undefined" && !failed && desmosApiKey() !== null;
}

function loadDesmos(): Promise<DesmosApi> {
  const existing = (window as unknown as { Desmos?: DesmosApi }).Desmos;
  if (existing) return Promise.resolve(existing);
  const key = desmosApiKey();
  if (!key) return Promise.reject(new Error("no Desmos API key"));
  loading ??= new Promise<DesmosApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.desmos.com/api/${DESMOS_VERSION}/calculator.js?apiKey=${encodeURIComponent(key)}`;
    script.async = true;
    const giveUp = (err: Error) => {
      window.clearTimeout(timer);
      failed = true;
      loading = null;
      reject(err);
    };
    const timer = window.setTimeout(() => giveUp(new Error("Desmos took too long to load")), LOAD_TIMEOUT_MS);
    script.onload = () => {
      const api = (window as unknown as { Desmos?: DesmosApi }).Desmos;
      if (!api) return giveUp(new Error("Desmos loaded without its API"));
      window.clearTimeout(timer);
      resolve(api);
    };
    script.onerror = () => giveUp(new Error("Desmos failed to load"));
    document.head.appendChild(script);
  });
  return loading;
}

export type DesmosRender = { svg: string; errors: Array<{ id: string; latex: string; message: string }> };

let calculator: DesmosCalculator | null = null;
let host: HTMLDivElement | null = null;
let queue: Promise<unknown> = Promise.resolve();

function decodeSvg(data: string): string {
  if (!data.startsWith("data:")) return data;
  const comma = data.indexOf(",");
  const body = data.slice(comma + 1);
  return data.slice(0, comma).includes(";base64") ? atob(body) : decodeURIComponent(body);
}

/** Draw a graph to SVG. Renders queue up; each takes a few milliseconds once Desmos has loaded. */
export function renderDesmosGraph(spec: GraphSpec, width: number, height: number): Promise<DesmosRender> {
  const job = queue.then(async () => {
    const Desmos = await loadDesmos();
    if (!calculator || !host?.isConnected) {
      host = document.createElement("div");
      host.setAttribute("aria-hidden", "true");
      host.style.cssText = "position:fixed;left:-20000px;top:0;pointer-events:none;";
      document.body.appendChild(host);
      calculator = Desmos.GraphingCalculator(host, {
        expressions: false,
        settingsMenu: false,
        zoomButtons: false,
        keypad: false,
        border: false,
        lockViewport: true,
        expressionsTopbar: false,
        pointsOfInterest: false,
        trace: false,
        links: false,
      });
    }
    const calc = calculator;
    host.style.width = `${width}px`;
    host.style.height = `${height}px`;
    calc.resize();
    calc.setBlank();
    calc.setMathBounds(spec.bounds);
    calc.setExpressions(spec.expressions.map((expression) => ({ ...expression })));
    const data = await new Promise<string>((resolve) =>
      calc.asyncScreenshot({ format: "svg", width, height, mode: "stretch", mathBounds: spec.bounds, showLabels: true }, (d) => resolve(String(d))),
    );
    const analysis = calc.expressionAnalysis ?? {};
    const errors = spec.expressions.flatMap((expression) => {
      const result = analysis[expression.id];
      return result?.isError ? [{ id: expression.id, latex: expression.latex, message: result.errorMessage ?? "Desmos could not graph this" }] : [];
    });
    return { svg: decodeSvg(data), errors };
  });
  queue = job.catch(() => undefined);
  return job;
}
