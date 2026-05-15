"use client";

import "tldraw/tldraw.css";
import "katex/dist/katex.min.css";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { Tldraw, AssetRecordType } from "tldraw";
import { Editor, createShapeId, toRichText } from "@tldraw/editor";
import katex from "katex";

// ── Layout constants ────────────────────────────────────────────────────────
const LEFT_X = 60;
const RIGHT_X = 720;
const START_Y = 70;
const HEADING_Y = 18;
const ROW_GAP = 16;
const EQ_H = 68;

// ── Public handle type ──────────────────────────────────────────────────────
export interface WhiteboardHandle {
  startNewProblem(title: string): void;
  drawEquationStep(latex: string, annotation?: string, column?: "left" | "right"): void;
  addTextNote(text: string, size?: "heading" | "body", column?: "left" | "right"): void;
  addFunctionGraph(expression: string, xMin: number, xMax: number, label?: string, column?: "left" | "right"): void;
  drawShape(shape: string, label?: string, width?: number, height?: number, column?: "left" | "right"): void;
  highlightStep(index: number, style: "circle" | "underline" | "box"): void;
  crossOutStep(index: number): void;
  clearWhiteboard(): void;
}

// ── Internal equation overlay item ─────────────────────────────────────────
interface EqItem {
  id: string;
  latex: string;
  annotation?: string;
  x: number;
  y: number;
  crossOut?: boolean;
  highlight?: "circle" | "underline" | "box";
}

// ── ID generator ────────────────────────────────────────────────────────────
let _n = 0;
const uid = () => String(++_n);

// ── Graph renderer → canvas data URL ────────────────────────────────────────
function graphDataURL(expression: string, xMin: number, xMax: number): string {
  const W = 260, H = 170;
  const canvas = document.createElement("canvas");
  canvas.width = W * 2; canvas.height = H * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  ctx.fillStyle = "#fafafa"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#e0e0e0"; ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  let fn: ((x: number) => number) | null = null;
  try {
    fn = new Function(
      "x",
      `const {sin,cos,tan,asin,acos,atan,exp,log,sqrt,abs,pow,PI,E}=Math; return (${expression})`
    ) as (x: number) => number;
  } catch { return canvas.toDataURL(); }

  const pts: { x: number; y: number }[] = [];
  let yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i <= 200; i++) {
    const x = xMin + ((xMax - xMin) * i) / 200;
    try {
      const y = fn(x);
      if (isFinite(y)) { pts.push({ x, y }); yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
    } catch { /* skip discontinuities */ }
  }
  if (!pts.length) return canvas.toDataURL();

  const pad = (yMax - yMin) * 0.12 || 1;
  const yLo = yMin - pad, yHi = yMax + pad;
  const px = (x: number) => ((x - xMin) / (xMax - xMin)) * W;
  const py = (y: number) => H - ((y - yLo) / (yHi - yLo)) * H;

  ctx.strokeStyle = "#c0c0c0"; ctx.lineWidth = 1;
  const axY = yLo <= 0 && yHi >= 0 ? py(0) : -1;
  const axX = xMin <= 0 && xMax >= 0 ? px(0) : -1;
  if (axY >= 0) { ctx.beginPath(); ctx.moveTo(0, axY); ctx.lineTo(W, axY); ctx.stroke(); }
  if (axX >= 0) { ctx.beginPath(); ctx.moveTo(axX, 0); ctx.lineTo(axX, H); ctx.stroke(); }

  ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 2; ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(px(p.x), py(p.y)) : ctx.lineTo(px(p.x), py(p.y)));
  ctx.stroke();
  return canvas.toDataURL("image/png");
}

// ── Equation block (KaTeX HTML overlay) ────────────────────────────────────
function EqBlock({ item }: { item: EqItem }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(item.latex, ref.current, { throwOnError: false, displayMode: true });
    } catch {
      if (ref.current) ref.current.textContent = item.latex;
    }
  }, [item.latex]);

  return (
    <div style={{ position: "absolute", left: item.x, top: item.y }}>
      <div style={{ position: "relative", display: "inline-block" }}>
        <span
          ref={ref}
          style={{ fontSize: "1.45rem", color: "#383838", display: "block", padding: "6px 4px" }}
        />

        {item.annotation && (
          <span
            style={{
              position: "absolute",
              left: "calc(100% + 10px)",
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 14,
              fontStyle: "italic",
              fontWeight: 500,
              color: "oklch(0.55 0.16 25)",
              whiteSpace: "nowrap",
            }}
          >
            {item.annotation}
          </span>
        )}

        {item.crossOut && (
          <div
            style={{
              position: "absolute",
              top: "calc(50% - 1px)",
              left: -4,
              right: -4,
              height: 2,
              background: "oklch(0.55 0.16 25)",
              opacity: 0.85,
              transform: "rotate(-1.5deg)",
              transformOrigin: "left center",
              borderRadius: 1,
            }}
          />
        )}

        {item.highlight === "underline" && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 2,
              background: "oklch(0.55 0.16 25)",
              borderRadius: 1,
              opacity: 0.85,
            }}
          />
        )}

        {item.highlight === "box" && (
          <div
            style={{
              position: "absolute",
              inset: "-6px -10px",
              border: "1.5px dashed oklch(0.55 0.16 25)",
              borderRadius: 6,
              opacity: 0.85,
            }}
          />
        )}

        {item.highlight === "circle" && (
          <svg
            style={{
              position: "absolute",
              inset: "-12px -18px",
              width: "calc(100% + 36px)",
              height: "calc(100% + 24px)",
              overflow: "visible",
            }}
            fill="none"
          >
            <ellipse
              cx="50%"
              cy="50%"
              rx="48%"
              ry="45%"
              stroke="oklch(0.55 0.16 25)"
              strokeWidth={2}
              opacity={0.85}
              strokeDasharray="4 1.5"
            />
          </svg>
        )}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
const TldrawCore = forwardRef<WhiteboardHandle>(function TldrawCore(_, ref) {
  const editorRef = useRef<Editor | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const leftY = useRef(START_Y);
  const rightY = useRef(START_Y);
  const [eqItems, setEqItems] = useState<EqItem[]>([]);
  const eqRef = useRef<EqItem[]>([]);

  const colX = (col: "left" | "right") => col === "right" ? RIGHT_X : LEFT_X;
  const colY = (col: "left" | "right") => col === "right" ? rightY : leftY;

  const syncOverlay = useCallback((editor: Editor) => {
    const cam = editor.getCamera();
    if (overlayRef.current) {
      overlayRef.current.style.transform =
        `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`;
    }
  }, []);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    editor.setCurrentTool("hand");
    editor.setCamera({ x: 0, y: 0, z: 1 });
    syncOverlay(editor);
    const unsub = editor.store.listen(() => syncOverlay(editor));
    return unsub;
  }, [syncOverlay]);

  useImperativeHandle(ref, () => ({
    clearWhiteboard() {
      const editor = editorRef.current;
      if (!editor) return;
      const shapes = editor.getCurrentPageShapes();
      if (shapes.length > 0) editor.deleteShapes(shapes.map(s => s.id));
      leftY.current = START_Y;
      rightY.current = START_Y;
      eqRef.current = [];
      setEqItems([]);
    },

    startNewProblem(title: string) {
      const editor = editorRef.current;
      if (!editor) return;
      const shapes = editor.getCurrentPageShapes();
      if (shapes.length > 0) editor.deleteShapes(shapes.map(s => s.id));
      leftY.current = START_Y;
      rightY.current = START_Y;
      eqRef.current = [];
      setEqItems([]);
      editor.createShape({
        id: createShapeId(),
        type: "text",
        x: LEFT_X,
        y: HEADING_Y,
        props: {
          richText: toRichText(title),
          size: "xl",
          font: "sans",
          color: "black",
          textAlign: "start",
          w: 1200,
          autoSize: false,
          scale: 1,
        },
      });
    },

    drawEquationStep(latex: string, annotation?: string, column?: "left" | "right") {
      const col = column ?? "left";
      const x = colX(col);
      const y = colY(col).current;
      const id = uid();
      const item: EqItem = { id, latex, annotation, x, y };
      eqRef.current = [...eqRef.current, item];
      setEqItems((prev) => [...prev, item]);
      colY(col).current += EQ_H + ROW_GAP;
    },

    addTextNote(text: string, size?: "heading" | "body", column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      const x = colX(col);
      const y = colY(col).current;
      const isHeading = size === "heading";
      const approxH = isHeading ? 32 : Math.max(24, Math.ceil(text.length / 52) * 20);
      editor.createShape({
        id: createShapeId(),
        type: "text",
        x,
        y,
        props: {
          richText: toRichText(text),
          size: isHeading ? "l" : "m",
          font: isHeading ? "serif" : "sans",
          color: "black",
          textAlign: "start",
          w: 560,
          autoSize: true,
          scale: 1,
        },
      });
      colY(col).current += approxH + ROW_GAP;
    },

    addFunctionGraph(expression: string, xMin: number, xMax: number, label?: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "right";
      const x = colX(col);
      const y = colY(col).current;
      const W = 260, H = 170;

      const dataUrl = graphDataURL(expression, xMin, xMax);
      const assetId = AssetRecordType.createId();
      editor.createAssets([{
        id: assetId,
        typeName: "asset",
        type: "image",
        props: {
          name: "graph.png",
          src: dataUrl,
          w: W,
          h: H,
          mimeType: "image/png",
          isAnimated: false,
        },
        meta: {},
      }]);
      editor.createShape({
        id: createShapeId(),
        type: "image",
        x,
        y,
        props: {
          assetId,
          w: W,
          h: H,
          playing: false,
          url: "",
          crop: null,
          flipX: false,
          flipY: false,
        },
      });
      colY(col).current += H + ROW_GAP;

      if (label) {
        editor.createShape({
          id: createShapeId(),
          type: "text",
          x,
          y: colY(col).current,
          props: {
            richText: toRichText(label),
            size: "s",
            font: "sans",
            color: "grey",
            textAlign: "start",
            w: W,
            autoSize: true,
            scale: 1,
          },
        });
        colY(col).current += 22 + ROW_GAP;
      }
    },

    drawShape(shape: string, label?: string, width?: number, height?: number, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      const x = colX(col);
      const y = colY(col).current;

      const defaults: Record<string, [number, number]> = {
        rectangle: [160, 90],
        ellipse: [120, 90],
        diamond: [130, 80],
        triangle: [160, 110],
        arrow: [180, 50],
      };
      const [dw, dh] = defaults[shape] ?? [160, 90];
      const w = width ?? dw;
      const h = height ?? dh;

      if (shape === "arrow") {
        editor.createShape({
          id: createShapeId(),
          type: "arrow",
          x,
          y: y + 20,
          props: {
            kind: "arc",
            start: { x: 0, y: 0 },
            end: { x: w, y: 0 },
            bend: 0,
            color: "black",
            size: "m",
            dash: "draw",
            fill: "none",
            arrowheadStart: "none",
            arrowheadEnd: "arrow",
            richText: toRichText(label ?? ""),
            labelColor: "black",
            font: "sans",
            scale: 1,
            labelPosition: 0.5,
            elbowMidPoint: 0.5,
          },
        });
        colY(col).current += 50 + ROW_GAP;
      } else {
        type GeoType = "rectangle" | "ellipse" | "diamond" | "triangle";
        const geoMap: Record<string, GeoType> = {
          rectangle: "rectangle",
          ellipse: "ellipse",
          diamond: "diamond",
          triangle: "triangle",
        };
        editor.createShape({
          id: createShapeId(),
          type: "geo",
          x,
          y,
          props: {
            geo: geoMap[shape] ?? "rectangle",
            w,
            h,
            richText: toRichText(label ?? ""),
            size: "m",
            color: "black",
            fill: "none",
            dash: "draw",
            font: "sans",
            align: "middle",
            verticalAlign: "middle",
            labelColor: "black",
            url: "",
            growY: 0,
            scale: 1,
          },
        });
        colY(col).current += h + ROW_GAP;
      }
    },

    highlightStep(index: number, style: "circle" | "underline" | "box") {
      const item = eqRef.current[index];
      if (!item) return;
      const updated = { ...item, highlight: style };
      eqRef.current = eqRef.current.map((e, i) => i === index ? updated : e);
      setEqItems((prev) => prev.map((e, i) => i === index ? updated : e));
    },

    crossOutStep(index: number) {
      const item = eqRef.current[index];
      if (!item) return;
      const updated = { ...item, crossOut: true };
      eqRef.current = eqRef.current.map((e, i) => i === index ? updated : e);
      setEqItems((prev) => prev.map((e, i) => i === index ? updated : e));
    },
  }));

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Tldraw
        onMount={handleMount}
        hideUi
      />
      <div
        ref={overlayRef}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", transformOrigin: "0 0" }}
      >
        {eqItems.map((item) => (
          <EqBlock key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
});

export default TldrawCore;
