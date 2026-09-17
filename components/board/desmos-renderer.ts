"use client";

// One hidden Desmos graphing calculator renders every graph on the board to an
// SVG, one graph at a time. The board shows the picture (crisp at any zoom,
// exported with board pictures) instead of a live calculator per graph. See
// lib/desmos-spec.ts for the spec and lib/desmos-graph.ts for building one.
//
// Commercial use of the Desmos API needs a Desmos partnership and its API key
// in NEXT_PUBLIC_DESMOS_API_KEY. Development falls back to the public demo key
// from Desmos's own docs; a production build without a key draws graphs the
// old way (TldrawCore's vector graphs), so nothing breaks.
//
// Hardened Sept 17 2026: every render sends every setting (one graph used to
// inherit the last one's), gets ids no earlier render used, and gives up on a
// screenshot after 6 s (the calculator is then rebuilt). A failed load is
// final for the page: TldrawCore redraws the graphs waiting on it as vectors,
// and draws new ones that way from the start.
// Dev switches: ?nodesmos=1 behaves as if there were no key, ?desmosfail=1
// fails the load after a moment, ?desmosbreak=1 fails every drawing after a
// good load, ?desmostools=none keeps number lines, charts and figures vector.

import { DEFAULT_GRAPH_SETTINGS, isGraphTable, prefixIds, type GraphBounds, type GraphSize, type GraphSpec } from "@/lib/desmos-spec";

const DESMOS_VERSION = "v1.12";
const DEMO_KEY = "dcb31709b452b1cf9dc26972add0fda6";
const LOAD_TIMEOUT_MS = 20000;
const SCREENSHOT_TIMEOUT_MS = 6000;
const ANALYSIS_WAIT_MS = 400;

type Analysis = Record<string, { isError?: boolean; errorMessage?: string }>;
type DesmosCalculator = {
  setBlank(): void;
  setMathBounds(bounds: GraphBounds): void;
  setExpressions(list: Array<Record<string, unknown>>): void;
  updateSettings(settings: Record<string, unknown>): void;
  asyncScreenshot(options: Record<string, unknown>, callback: (data: string) => void): void;
  resize(): void;
  observe(event: string, callback: () => void): void;
  unobserve(event: string): void;
  expressionAnalysis?: Analysis;
  destroy(): void;
};
type DesmosApi = { GraphingCalculator(el: HTMLElement, options: Record<string, unknown>): DesmosCalculator };

export type DesmosStatus = "idle" | "loading" | "ready" | "failed" | "unavailable";

/** A development-only URL parameter (?nodesmos=1, ?desmosfail=1, ?desmostools=none). */
export function devParam(name: string): string | null {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

function devSwitch(name: string): boolean {
  return devParam(name) === "1";
}

export function desmosApiKey(): string | null {
  if (devSwitch("nodesmos")) return null;
  const configured = process.env.NEXT_PUBLIC_DESMOS_API_KEY?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : DEMO_KEY;
}

let status: DesmosStatus = "idle";
let failure = "";
let loading: Promise<DesmosApi> | null = null;
const listeners = new Set<(status: DesmosStatus) => void>();

function setStatus(next: DesmosStatus) {
  if (status === next) return;
  status = next;
  for (const listener of [...listeners]) {
    try {
      listener(next);
    } catch {
      // a listener's problem is its own
    }
  }
}

/** Once Desmos has loaded, or for good failed or turned out not to be here. */
export function whenDesmosSettled(): Promise<DesmosStatus> {
  const settled = (s: DesmosStatus) => s === "ready" || s === "failed" || s === "unavailable";
  const now = desmosStatus();
  if (settled(now)) return Promise.resolve(now);
  return new Promise((resolve) => {
    const stop = onDesmosStatus((s) => {
      if (!settled(s)) return;
      stop();
      resolve(s);
    });
  });
}

/** Where loading stands: idle until the first graph (or a preload) asks for Desmos. */
export function desmosStatus(): DesmosStatus {
  if (status === "idle" && typeof window !== "undefined" && desmosApiKey() === null) return "unavailable";
  return status;
}

/** Why the load failed, for the tutor's board summary. */
export function desmosFailure(): string {
  return failure;
}

/** Called on every status change; returns the unsubscribe. */
export function onDesmosStatus(listener: (status: DesmosStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether graphs should be drawn by Desmos right now (a browser, a key, and no failed load). */
export function desmosAvailable(): boolean {
  const s = desmosStatus();
  return typeof window !== "undefined" && s !== "failed" && s !== "unavailable";
}

function loadDesmos(): Promise<DesmosApi> {
  const existing = (window as unknown as { Desmos?: DesmosApi }).Desmos;
  if (existing) {
    setStatus("ready");
    return Promise.resolve(existing);
  }
  if (status === "failed") return Promise.reject(new Error(failure || "Desmos did not load"));
  const key = desmosApiKey();
  if (!key) {
    setStatus("unavailable");
    return Promise.reject(new Error("no Desmos API key"));
  }
  loading ??= new Promise<DesmosApi>((resolve, reject) => {
    setStatus("loading");
    const giveUp = (err: Error) => {
      window.clearTimeout(timer);
      failure = err.message;
      setStatus("failed");
      reject(err);
    };
    const timer = window.setTimeout(() => giveUp(new Error("Desmos took too long to load")), LOAD_TIMEOUT_MS);
    if (devSwitch("desmosfail")) {
      window.clearTimeout(timer);
      window.setTimeout(() => giveUp(new Error("Desmos failed to load (?desmosfail=1)")), 1500);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://www.desmos.com/api/${DESMOS_VERSION}/calculator.js?apiKey=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => {
      const api = (window as unknown as { Desmos?: DesmosApi }).Desmos;
      if (!api) return giveUp(new Error("Desmos loaded without its API"));
      window.clearTimeout(timer);
      setStatus("ready");
      resolve(api);
    };
    script.onerror = () => giveUp(new Error("Desmos failed to load"));
    document.head.appendChild(script);
  });
  return loading;
}

/** The Desmos API itself, for a live calculator (Explore). Rejects when Desmos is not here or failed to load. */
export function loadDesmosApi(): Promise<{ GraphingCalculator(el: HTMLElement, options: Record<string, unknown>): unknown }> {
  return loadDesmos();
}

/**
 * Start loading Desmos when the browser is idle, before the first graph needs
 * it (the script is 4.3 MB). Sessions call this; the landing page never does.
 */
export function preloadDesmos(): void {
  if (typeof window === "undefined" || desmosStatus() !== "idle") return;
  const start = () => void loadDesmos().catch(() => undefined);
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(start, { timeout: 5000 });
  else window.setTimeout(start, 1500);
}

export type DesmosRender = { svg: string; errors: Array<{ id: string; latex: string; message: string }> };

let calculator: DesmosCalculator | null = null;
let host: HTMLDivElement | null = null;
let queue: Promise<unknown> = Promise.resolve();
let renderSeq = 0;

function decodeSvg(data: string): string {
  if (!data.startsWith("data:")) return data;
  const comma = data.indexOf(",");
  const body = data.slice(comma + 1);
  return data.slice(0, comma).includes(";base64") ? atob(body) : decodeURIComponent(body);
}

function dropCalculator() {
  try {
    calculator?.destroy();
  } catch {
    // already gone
  }
  host?.remove();
  calculator = null;
  host = null;
}

function hiddenCalculator(Desmos: DesmosApi): { calc: DesmosCalculator; el: HTMLDivElement } {
  if (!calculator || !host?.isConnected) {
    dropCalculator();
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
  return { calc: calculator, el: host };
}

function screenshot(calc: DesmosCalculator, size: GraphSize, bounds: GraphBounds): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Desmos took too long to draw")), SCREENSHOT_TIMEOUT_MS);
    calc.asyncScreenshot({ format: "svg", width: size.w, height: size.h, mode: "stretch", mathBounds: bounds, showLabels: true }, (data) => {
      window.clearTimeout(timer);
      resolve(String(data ?? ""));
    });
  });
}

// Desmos fills expressionAnalysis by the time the screenshot is ready (probe,
// Sept 16); if none of this render's ids is there yet, wait a moment for it.
function analysisFor(calc: DesmosCalculator, ids: string[]): Promise<Analysis> {
  const current = () => calc.expressionAnalysis ?? {};
  if (ids.length === 0 || ids.some((id) => current()[id])) return Promise.resolve(current());
  return new Promise<Analysis>((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      try {
        calc.unobserve("expressionAnalysis.chalk");
      } catch {
        // the calculator was dropped
      }
      resolve(current());
    };
    const timer = window.setTimeout(done, ANALYSIS_WAIT_MS);
    calc.observe("expressionAnalysis.chalk", () => {
      if (ids.some((id) => current()[id])) done();
    });
  });
}

/** Draw a graph to SVG at `size` (the spec's own by default). Renders queue up; each takes a few milliseconds once Desmos has loaded. */
export function renderDesmosGraph(spec: GraphSpec, size: GraphSize = spec.size): Promise<DesmosRender> {
  const job = queue.then(async () => {
    const Desmos = await loadDesmos();
    if (devSwitch("desmosbreak")) throw new Error("Desmos could not draw it (?desmosbreak=1)");
    const { calc, el } = hiddenCalculator(Desmos);
    el.style.width = `${size.w}px`;
    el.style.height = `${size.h}px`;
    calc.resize();
    calc.setBlank();
    calc.updateSettings({ ...DEFAULT_GRAPH_SETTINGS, ...spec.settings });
    calc.setMathBounds(spec.bounds);
    const prefix = `g${++renderSeq}_`;
    calc.setExpressions(prefixIds(spec.expressions, prefix) as unknown as Array<Record<string, unknown>>);
    let data: string;
    try {
      data = await screenshot(calc, size, spec.bounds);
    } catch (err) {
      // A calculator that stopped answering is replaced for the next graph.
      dropCalculator();
      throw err;
    }
    const expressions = spec.expressions.filter((item) => !isGraphTable(item));
    const analysis = await analysisFor(calc, expressions.map((e) => `${prefix}${e.id}`));
    const errors = expressions.flatMap((expression) => {
      const result = analysis[`${prefix}${expression.id}`];
      return result?.isError ? [{ id: expression.id, latex: "latex" in expression ? expression.latex : "", message: result.errorMessage ?? "Desmos could not graph this" }] : [];
    });
    return { svg: decodeSvg(data), errors };
  });
  queue = job.catch(() => undefined);
  return job;
}
