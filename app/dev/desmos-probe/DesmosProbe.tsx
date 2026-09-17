"use client";

// Asks the loaded Desmos API a series of questions through the same path the
// board uses (one hidden calculator, asyncScreenshot to SVG) and shows the
// answers. window.__probe holds the JSON summary for scripts.

import { useEffect, useState } from "react";
import { desmosApiKey } from "@/components/board/desmos-renderer";

type Bounds = { left: number; right: number; bottom: number; top: number };
type Analysis = Record<string, { isError?: boolean; errorMessage?: string }>;
type Helper = { numericValue?: number; observe(prop: string, cb: () => void): void };
type Calc = {
  setBlank(): void;
  setMathBounds(b: Bounds): void;
  setExpressions(list: Array<Record<string, unknown>>): void;
  updateSettings(s: Record<string, unknown>): void;
  asyncScreenshot(o: Record<string, unknown>, cb: (d: string | undefined) => void): void;
  resize(): void;
  destroy(): void;
  expressionAnalysis?: Analysis;
  observe(prop: string, cb: () => void): void;
  unobserve(prop: string): void;
  HelperExpression(e: { latex: string }): Helper;
  getExpressions(): Array<Record<string, unknown>>;
};
type DesmosApi = {
  GraphingCalculator(el: HTMLElement, o: Record<string, unknown>): Calc;
  LabelOrientations?: Record<string, string>;
  Styles?: Record<string, string>;
};
type Result = { id: string; title: string; pass: boolean; note: string; svg?: string | null };

const BOUNDS: Bounds = { left: -5, right: 5, bottom: -4, top: 4 };
const HIDDEN_OPTIONS = {
  expressions: false, settingsMenu: false, zoomButtons: false, keypad: false, border: false,
  lockViewport: true, expressionsTopbar: false, pointsOfInterest: false, trace: false, links: false,
};
// Desmos's own defaults, sent in full so one render's settings never leak into the next.
const DEFAULT_SETTINGS = {
  showGrid: true, showXAxis: true, showYAxis: true, xAxisNumbers: true, yAxisNumbers: true,
  xAxisStep: 0, yAxisStep: 0, xAxisMinorSubdivisions: 0, yAxisMinorSubdivisions: 0,
  xAxisArrowMode: "NONE", yAxisArrowMode: "NONE", xAxisLabel: "", yAxisLabel: "",
  degreeMode: false, polarMode: false, xAxisScale: "linear", yAxisScale: "linear",
  fontSize: 16, projectorMode: false,
};

function loadDesmos(): Promise<DesmosApi> {
  const w = window as unknown as { Desmos?: DesmosApi };
  if (w.Desmos) return Promise.resolve(w.Desmos);
  const key = desmosApiKey();
  if (!key) return Promise.reject(new Error("no Desmos key"));
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.desmos.com/api/v1.12/calculator.js?apiKey=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => (w.Desmos ? resolve(w.Desmos) : reject(new Error("no API after load")));
    script.onerror = () => reject(new Error("script failed"));
    document.head.appendChild(script);
  });
}

function decodeSvg(data: string): string {
  if (!data.startsWith("data:")) return data;
  const comma = data.indexOf(",");
  const body = data.slice(comma + 1);
  return data.slice(0, comma).includes(";base64") ? atob(body) : decodeURIComponent(body);
}

// Desmos may mint fresh ids per screenshot; compare pictures without them.
const norm = (svg: string | null | undefined) => (svg ?? "").replace(/\s(id|clip-path|mask|filter)="[^"]*"/g, "").replace(/url\(#[^)]*\)/g, "");
const differs = (a: string | null | undefined, b: string | null | undefined) => norm(a) !== norm(b);
const textIn = (svg: string | null | undefined, text: string) => (svg ?? "").includes(text);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function shot(calc: Calc, bounds: Bounds, timeoutMs = 5000, w = 320, h = 240): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    calc.asyncScreenshot({ format: "svg", width: w, height: h, mode: "stretch", mathBounds: bounds, showLabels: true }, (d) => {
      window.clearTimeout(timer);
      resolve(d === undefined ? "" : decodeSvg(String(d)));
    });
  });
}

async function render(calc: Calc, expressions: Array<Record<string, unknown>>, settings: Record<string, unknown> = {}, bounds = BOUNDS) {
  calc.setBlank();
  calc.updateSettings({ ...DEFAULT_SETTINGS, ...settings });
  calc.setMathBounds(bounds);
  calc.setExpressions(expressions);
  const svg = await shot(calc, bounds);
  return { svg, analysis: { ...(calc.expressionAnalysis ?? {}) } as Analysis };
}

const isErr = (a: Analysis, id: string) => Boolean(a[id]?.isError);
const errText = (a: Analysis, id: string) => a[id]?.errorMessage ?? "";

async function runProbe(Desmos: DesmosApi, onResult: (r: Result) => void) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:320px;height:240px;";
  document.body.appendChild(host);
  const calc = Desmos.GraphingCalculator(host, HIDDEN_OPTIONS);
  const line = [{ id: "c", latex: "y=\\sin(x)+0.5x", color: "#2d70b3" }];

  // P0: is a picture stable across two renders?
  const base = await render(calc, line);
  const again = await render(calc, line);
  onResult({ id: "P0", title: "Same graph twice gives the same SVG (ids ignored)", pass: !differs(base.svg, again.svg), note: `length ${base.svg?.length}`, svg: base.svg });

  // P1: every updateSettings key changes the picture.
  const settings: Array<[string, Record<string, unknown>, string?]> = [
    ["showGrid", { showGrid: false }],
    ["showXAxis", { showXAxis: false }],
    ["showYAxis", { showYAxis: false }],
    ["xAxisNumbers", { xAxisNumbers: false }],
    ["yAxisNumbers", { yAxisNumbers: false }],
    ["xAxisStep", { xAxisStep: 2 }],
    ["xAxisMinorSubdivisions", { xAxisMinorSubdivisions: 2 }],
    ["xAxisArrowMode", { xAxisArrowMode: "BOTH" }],
    ["xAxisLabel", { xAxisLabel: "Time (s)" }, "Time (s)"],
    ["yAxisLabel", { yAxisLabel: "Height" }, "Height"],
    ["degreeMode", { degreeMode: true }],
    ["polarMode", { polarMode: true }],
    ["fontSize", { fontSize: 24 }],
    ["projectorMode", { projectorMode: true }],
    ["xAxisScale", { xAxisScale: "logarithmic" }],
  ];
  for (const [key, s, text] of settings) {
    const r = await render(calc, line, s);
    const pass = differs(r.svg, base.svg) && (!text || textIn(r.svg, text));
    onResult({ id: `P1.${key}`, title: `updateSettings ${JSON.stringify(s)} shows in the SVG`, pass, note: text ? `text "${text}" ${textIn(r.svg, text) ? "found" : "missing"}` : "", svg: r.svg });
  }
  // P1b: does setBlank reset graph settings, or do they leak into the next graph?
  calc.setBlank();
  calc.updateSettings({ showGrid: false });
  calc.setExpressions(line);
  await shot(calc, BOUNDS);
  calc.setBlank();
  calc.setMathBounds(BOUNDS);
  calc.setExpressions(line);
  const leaked = await shot(calc, BOUNDS);
  onResult({ id: "P1b", title: "setBlank alone resets showGrid (no leak)", pass: !differs(leaked, base.svg), note: differs(leaked, base.svg) ? "settings leak: send them all every render" : "", svg: leaked });

  // P2: labels.
  const labelled = (extra: Record<string, unknown>) => [{ id: "p", latex: "(1,1)", label: "rise 4", showLabel: true, ...extra }];
  const plain = await render(calc, labelled({}));
  onResult({ id: "P2a", title: "A plain point label is in the SVG", pass: textIn(plain.svg, "rise 4"), note: "", svg: plain.svg });
  const math = await render(calc, [{ id: "p", latex: "(1,1)", label: "`\\frac{1}{2}`", showLabel: true }]);
  onResult({ id: "P2b", title: "Backtick math in a label renders as math", pass: !textIn(math.svg, "frac") && !textIn(math.svg, "`"), note: textIn(math.svg, "frac") ? "raw LaTeX shown" : "", svg: math.svg });
  const big = await render(calc, labelled({ labelSize: "2" }));
  onResult({ id: "P2c", title: "labelSize \"2\" changes the label", pass: differs(big.svg, plain.svg), note: "", svg: big.svg });
  const above = await render(calc, labelled({ labelOrientation: "above" }));
  const below = await render(calc, labelled({ labelOrientation: "below" }));
  const official = Desmos.LabelOrientations?.ABOVE;
  const aboveOfficial = official ? await render(calc, labelled({ labelOrientation: official })) : null;
  onResult({ id: "P2d", title: "Lowercase labelOrientation is honoured", pass: differs(above.svg, below.svg) && (!aboveOfficial || !differs(above.svg, aboveOfficial.svg)), note: `LabelOrientations.ABOVE = ${JSON.stringify(official)}`, svg: below.svg });
  const tiny = await render(calc, labelled({ pointSize: 0.01 }));
  onResult({ id: "P2e", title: "pointSize 0.01 keeps its label", pass: textIn(tiny.svg, "rise 4"), note: "", svg: tiny.svg });
  const hidden = await render(calc, labelled({ hidden: true }));
  onResult({ id: "P2f", title: "A hidden point still shows its label", pass: textIn(hidden.svg, "rise 4"), note: textIn(hidden.svg, "rise 4") ? "label survives hidden" : "hidden hides the label too", svg: hidden.svg });
  const clear = await render(calc, labelled({ pointOpacity: 0 }));
  onResult({ id: "P2g", title: "pointOpacity 0 keeps its label", pass: textIn(clear.svg, "rise 4"), note: textIn(clear.svg, "rise 4") ? "" : "opacity 0 hides the label (use pointSize 0.01)", svg: clear.svg });
  const interp = await render(calc, [{ id: "m", latex: "m=2" }, { id: "p", latex: "(1,m)", label: "slope ${m}", showLabel: true }]);
  onResult({ id: "P2h", title: "${m} in a label shows the value", pass: textIn(interp.svg, "slope 2"), note: "", svg: interp.svg });

  // P3: open points.
  const open = await render(calc, [{ id: "p", latex: "(1,1)", pointStyle: Desmos.Styles?.OPEN ?? "OPEN", pointSize: 14 }]);
  const solid = await render(calc, [{ id: "p", latex: "(1,1)", pointStyle: Desmos.Styles?.POINT ?? "POINT", pointSize: 14 }]);
  onResult({ id: "P3", title: "pointStyle OPEN draws differently from POINT", pass: differs(open.svg, solid.svg), note: `Styles.OPEN = ${JSON.stringify(Desmos.Styles?.OPEN)}`, svg: open.svg });

  // P4: one expression for many ticks.
  const ticks = await render(calc, [{ id: "t", latex: "x=[-4,-2,0,2,4]\\left\\{-0.3\\le y\\le0.3\\right\\}", color: "#121215" }], { showGrid: false });
  onResult({ id: "P4", title: "List broadcasting draws several restricted ticks", pass: !isErr(ticks.analysis, "t") && differs(ticks.svg, (await render(calc, [], { showGrid: false })).svg), note: errText(ticks.analysis, "t"), svg: ticks.svg });

  // P5: parametric, polygon, segment.
  const para = await render(calc, [{ id: "q", latex: "(t,t^2)", parametricDomain: { min: "0", max: "2" } }]);
  onResult({ id: "P5a", title: "Parametric with parametricDomain", pass: !isErr(para.analysis, "q") && differs(para.svg, (await render(calc, [])).svg), note: errText(para.analysis, "q"), svg: para.svg });
  const poly = await render(calc, [{ id: "g", latex: "\\operatorname{polygon}((0,0),(3,0),(0,2))", fillOpacity: 0.2 }]);
  onResult({ id: "P5b", title: "\\operatorname{polygon} draws", pass: !isErr(poly.analysis, "g"), note: errText(poly.analysis, "g"), svg: poly.svg });
  const seg = await render(calc, [{ id: "s", latex: "\\operatorname{segment}((0,0),(3,2))" }]);
  onResult({ id: "P5c", title: "\\operatorname{segment} draws without the geometry flag", pass: !isErr(seg.analysis, "s"), note: errText(seg.analysis, "s"), svg: seg.svg });

  // P6: tables.
  const table = await render(calc, [{ id: "tb", type: "table", columns: [{ latex: "x_1", values: ["1", "2", "3", "4"] }, { latex: "y_1", values: ["2", "4", "5", "8"], points: true, lines: true, color: "#c74440" }] }], {}, { left: -1, right: 6, bottom: -1, top: 9 });
  onResult({ id: "P6", title: "A table expression plots its points", pass: differs(table.svg, (await render(calc, [], {}, { left: -1, right: 6, bottom: -1, top: 9 })).svg), note: JSON.stringify(table.analysis.tb ?? {}), svg: table.svg });

  // P7: regression and reading a value back.
  calc.setBlank();
  calc.updateSettings(DEFAULT_SETTINGS);
  calc.setMathBounds({ left: -1, right: 6, bottom: -1, top: 9 });
  calc.setExpressions([
    { id: "tb", type: "table", columns: [{ latex: "x_1", values: ["1", "2", "3", "4"] }, { latex: "y_1", values: ["2", "4", "6", "8"] }] },
    { id: "r", latex: "y_1\\sim mx_1+b" },
  ]);
  const helper = calc.HelperExpression({ latex: "m" });
  await wait(600);
  const regSvg = await shot(calc, { left: -1, right: 6, bottom: -1, top: 9 });
  const m = helper.numericValue;
  onResult({ id: "P7", title: "Regression y₁ ~ m x₁ + b fits m ≈ 2", pass: typeof m === "number" && Math.abs(m - 2) < 1e-6 && !isErr(calc.expressionAnalysis ?? {}, "r"), note: `m = ${m}`, svg: regSvg });

  // P8: statistics plots.
  for (const [name, latex] of [
    ["histogram", "\\operatorname{histogram}([1,2,2,3,3,3,4],1)"],
    ["histogram (bare)", "histogram([1,2,2,3,3,3,4],1)"],
    ["dotplot", "\\operatorname{dotplot}([1,2,2,3,3,3,4])"],
    ["boxplot", "\\operatorname{boxplot}([1,2,3,4,5,6,9])"],
  ] as const) {
    const blank = (await render(calc, [], {}, { left: 0, right: 10, bottom: -1, top: 5 })).svg;
    const r = await render(calc, [{ id: "d", latex }], {}, { left: 0, right: 10, bottom: -1, top: 5 });
    onResult({ id: `P8.${name}`, title: `${name} draws in the SVG`, pass: !isErr(r.analysis, "d") && differs(r.svg, blank), note: errText(r.analysis, "d"), svg: r.svg });
  }

  // P9: a slider variable.
  const slider = await render(calc, [{ id: "m", latex: "m=1", sliderBounds: { min: "-5", max: "5", step: "0.5" } }, { id: "l", latex: "y=mx" }]);
  onResult({ id: "P9", title: "Slider m=1 with sliderBounds, y = mx draws", pass: !isErr(slider.analysis, "m") && !isErr(slider.analysis, "l"), note: errText(slider.analysis, "m"), svg: slider.svg });

  // P11: when is expressionAnalysis fresh?
  calc.setBlank();
  calc.setExpressions([{ id: "bad", latex: "y=\\frac{1}{" }]);
  const immediate = Boolean(calc.expressionAnalysis?.bad?.isError);
  const observed = await new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => { calc.unobserve("expressionAnalysis"); resolve(Boolean(calc.expressionAnalysis?.bad?.isError)); }, 1500);
    calc.observe("expressionAnalysis", () => {
      if (calc.expressionAnalysis?.bad) { window.clearTimeout(timer); calc.unobserve("expressionAnalysis"); resolve(Boolean(calc.expressionAnalysis.bad.isError)); }
    });
  });
  await shot(calc, BOUNDS);
  const afterShot = Boolean(calc.expressionAnalysis?.bad?.isError);
  onResult({ id: "P11", title: "A broken expression is reported (immediately / observed / after screenshot)", pass: observed || afterShot, note: `immediate ${immediate}, observed ${observed}, after screenshot ${afterShot}` });

  // P12: an id reused after an error.
  const first = await render(calc, [{ id: "e1", latex: "y=\\frac{1}{" }]);
  const second = await render(calc, [{ id: "e1", latex: "y=x" }]);
  onResult({ id: "P12", title: "Reusing an id after an error reads fresh (no stale error)", pass: isErr(first.analysis, "e1") && !isErr(second.analysis, "e1"), note: `first ${isErr(first.analysis, "e1")}, second ${isErr(second.analysis, "e1")}`, svg: second.svg });

  // P13: a screenshot from a calculator whose host is not in the page.
  const loose = document.createElement("div");
  loose.style.cssText = "width:320px;height:240px;";
  const looseCalc = Desmos.GraphingCalculator(loose, HIDDEN_OPTIONS);
  looseCalc.setExpressions(line);
  const detached = await shot(looseCalc, BOUNDS, 4000);
  looseCalc.destroy();
  onResult({ id: "P13", title: "A detached host still screenshots (no hang)", pass: detached !== null, note: detached === null ? "hung: needs a timeout and an attached host" : `length ${detached.length}` });

  // P16–P18: shapes the number line and figures will be built from.
  const numberLine = await render(calc, [
    { id: "axis", latex: "y=0\\left\\{-4\\le x\\le4\\right\\}", color: "#121215", lineWidth: 2.5 },
    { id: "tk", latex: "x=[-4,-3,-2,-1,0,1,2,3,4]\\left\\{-0.12\\le y\\le0.12\\right\\}", color: "#121215", lineWidth: 2 },
    { id: "iv", latex: "y=0\\left\\{1\\le x\\le3\\right\\}", color: "#3d9cff", lineWidth: 9, lineOpacity: 0.55 },
    { id: "a", latex: "(1,0)", pointStyle: "POINT", color: "#3d9cff", pointSize: 12, label: "1", showLabel: true, labelOrientation: "below" },
    { id: "b", latex: "(3,0)", pointStyle: "OPEN", color: "#3d9cff", pointSize: 12, label: "3", showLabel: true, labelOrientation: "below" },
    { id: "hop", latex: "(-3+4t,1.2\\cdot4t(1-t))", parametricDomain: { min: "0", max: "1" }, color: "#ae3ec9", lineWidth: 2.5 },
    { id: "hl", latex: "(-1,1.3)", pointSize: 0.01, label: "+4", showLabel: true, labelOrientation: "above" },
    { id: "head", latex: "\\operatorname{polygon}((1,0.05),(0.72,0.22),(0.88,0.36))", color: "#ae3ec9", fillOpacity: 1, lineWidth: 0.5 },
  ], { showGrid: false, showYAxis: false, showXAxis: false, xAxisNumbers: false, yAxisNumbers: false }, { left: -4.6, right: 4.6, bottom: -0.9, top: 1.8 });
  onResult({ id: "P16", title: "Number line built from primitives (look)", pass: Object.keys(numberLine.analysis).every((k) => !numberLine.analysis[k]?.isError), note: Object.entries(numberLine.analysis).filter(([, v]) => v?.isError).map(([k, v]) => `${k}: ${v?.errorMessage}`).join("; "), svg: numberLine.svg });
  const tri = await render(calc, [
    { id: "t", latex: "\\operatorname{polygon}((0,0),(6,0),(0,8))", color: "#121215", fillOpacity: 0, lineWidth: 2.5 },
    { id: "sq", latex: "\\operatorname{polygon}((0,0),(0.6,0),(0.6,0.6),(0,0.6))", color: "#121215", fillOpacity: 0, lineWidth: 1.5 },
    { id: "l1", latex: "(3,-0.6)", pointSize: 0.01, label: "6 cm", showLabel: true },
    { id: "l2", latex: "(-0.8,4)", pointSize: 0.01, label: "8 cm", showLabel: true },
    { id: "l3", latex: "(3.6,4.4)", pointSize: 0.01, label: "x", showLabel: true },
  ], { showGrid: false, showXAxis: false, showYAxis: false, xAxisNumbers: false, yAxisNumbers: false }, { left: -2, right: 8, bottom: -1.5, top: 9 });
  onResult({ id: "P17", title: "Right triangle with leg and hypotenuse labels (look)", pass: textIn(tri.svg, "6 cm") && textIn(tri.svg, "8 cm"), note: "", svg: tri.svg });

  calc.destroy();
  host.remove();
}

async function secretCheck(Desmos: DesmosApi, el: HTMLDivElement): Promise<Result> {
  const calc = Desmos.GraphingCalculator(el, { expressions: true, settingsMenu: false, keypad: false, border: true });
  calc.setExpressions([
    { id: "shown", latex: "y=x" },
    { id: "hidden", latex: "y=x^2+123456", secret: true },
  ]);
  await wait(800);
  const listText = el.querySelector(".dcg-expressionlist, .dcg-exppanel")?.textContent ?? el.textContent ?? "";
  const visible = listText.includes("123456");
  return { id: "P10", title: "secret: true keeps an expression out of a visible list", pass: !visible, note: visible ? "secret expression shows in the list" : "hidden from the list" };
}

export default function DesmosProbe() {
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState("loading Desmos…");

  useEffect(() => {
    let cancelled = false;
    const all: Result[] = [];
    const push = (r: Result) => {
      if (cancelled) return;
      all.push(r);
      setResults([...all]);
      (window as unknown as { __probe?: unknown }).__probe = all.map(({ id, title, pass, note }) => ({ id, title, pass, note }));
    };
    (async () => {
      try {
        const Desmos = await loadDesmos();
        setStatus("running…");
        await runProbe(Desmos, push);
        const el = document.getElementById("probe-secret") as HTMLDivElement | null;
        if (el) push(await secretCheck(Desmos, el));
        if (!cancelled) setStatus("done");
      } catch (err) {
        if (!cancelled) setStatus(`failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const passed = results.filter((r) => r.pass).length;
  return (
    <main style={{ padding: "24px 20px", fontFamily: "ui-sans-serif, system-ui", color: "#121215", background: "#fafafa", minHeight: "100dvh" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Desmos probe</h1>
      <p id="probe-status" style={{ margin: "6px 0 18px", color: "#5b5b66" }}>
        {status} · {passed}/{results.length} pass
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {results.map((r) => (
          <section key={r.id} style={{ background: "#fff", border: `1px solid ${r.pass ? "#cfe3d4" : "#f0c9c9"}`, borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
              <strong>{r.id}</strong>
              <span style={{ color: r.pass ? "#1a7f37" : "#c62828", fontWeight: 600 }}>{r.pass ? "pass" : "fail"}</span>
            </div>
            <div style={{ fontSize: 13, margin: "4px 0 8px" }}>{r.title}</div>
            {r.note ? <div style={{ fontSize: 12, color: "#5b5b66", marginBottom: 8, wordBreak: "break-word" }}>{r.note}</div> : null}
            {r.svg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(r.svg)}`} style={{ width: "100%", border: "1px solid #eee", borderRadius: 6 }} />
            ) : null}
          </section>
        ))}
      </div>
      <div id="probe-secret" style={{ width: 420, height: 260, marginTop: 20 }} />
    </main>
  );
}
