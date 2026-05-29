"use client";

// tldraw/katex CSS are imported in app/globals.css so they load with the page,
// not behind the dynamic chunk.

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
import {
  compressLegacySegments,
  type TLDefaultColorStyle,
  type TLDefaultDashStyle,
  type TLDefaultFillStyle,
  type TLDefaultFontStyle,
  type TLDefaultSizeStyle,
  type TLLineShapePoint,
} from "@tldraw/tlschema";
import { getIndices, type IndexKey } from "@tldraw/utils";
import katex from "katex";
import { createMathEvaluator } from "@/lib/math-expression";
import type { CalloutStyle } from "@/lib/whiteboard-tools";
import type { BoardAgentAction, BoardArtifactMeta } from "@/lib/board-agent-types";
import {
  applySemanticBoardAction,
  createEmptySemanticBoard,
  normalizeSemanticBoard,
  type SemanticBoard,
  type SemanticBoardActionContext,
} from "@/lib/semantic-board";

// Local alias so callers everywhere can use the full tldraw 5 color palette
// (13 colors) — widened from the old narrow 5-color tuple in Phase 6.
type TldrawColor = TLDefaultColorStyle;

// ── Layout constants ────────────────────────────────────────────────────────
const LEFT_X = 60;
const RIGHT_X = 640;
const START_Y = 70;
const HEADING_Y = 18;
const ROW_GAP = 16;
const EQ_H = 68;
const POINT_PATTERN = /^\(?\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*\)?(?:\s*:\s*(.+))?$/;

// ── Public handle type ──────────────────────────────────────────────────────
export interface WhiteboardSnapshot {
  store: unknown;
  eqItems: EqItem[];
  semanticBoard?: SemanticBoard;
  pageState: { pageIndex: number; pageTop: number; leftY: number; rightY: number };
}

export type StepTarget = { step_label?: string; step_index?: number };

export interface WhiteboardHandle {
  startNewProblem(title: string): void;
  startBoardSection(title: string, freshPage?: boolean): void;
  drawEquationStep(latex: string, annotation?: string, column?: "left" | "right"): void;
  addTextNote(text: string, size?: "heading" | "body", column?: "left" | "right"): void;
  addFunctionGraph(expression: string, xMin: number, xMax: number, label?: string, column?: "left" | "right"): void;
  drawShape(shape: string, label?: string, width?: number, height?: number, column?: "left" | "right"): void;
  addTable(columns: string, rows: string, title?: string, column?: "left" | "right"): void;
  addNumberLine(min: number, max: number, points?: string, label?: string, column?: "left" | "right"): void;
  addCoordinateAxes(xMin: number, xMax: number, yMin: number, yMax: number, label?: string, column?: "left" | "right"): void;
  plotPoints(points: string, xMin: number, xMax: number, yMin: number, yMax: number, label?: string, column?: "left" | "right"): void;
  addWorkedExampleBox(title: string, body: string, column?: "left" | "right"): void;
  addStudentAttempt(text: string, column?: "left" | "right"): void;
  addProblemSetup(goal: string, givens?: string, unknowns?: string, plan?: string, column?: "left" | "right"): void;
  addEquationSequence(steps: string, annotations?: string, title?: string, column?: "left" | "right"): void;
  /** @internal Low-level sticky note primitive. Use addCallout for semantic color selection. */
  addStickyNote(opts: {
    text: string;
    color?: TLDefaultColorStyle;
    font?: TLDefaultFontStyle;
    size?: TLDefaultSizeStyle;
    scale?: number;
    growY?: number;
    column?: "left" | "right";
  }): void;
  addCallout(text: string, style: CalloutStyle, column?: "left" | "right"): void;
  addTwoColumnComparison(title: string, leftTitle: string, leftBody: string, rightTitle: string, rightBody: string, column?: "left" | "right"): void;
  addAreaModel(title: string, rowLabels: string, columnLabels: string, cells: string, column?: "left" | "right"): void;
  addVectorDiagram(title: string, centerLabel: string, vectors: string, column?: "left" | "right"): void;
  addProcessMap(title: string, nodes: string, connectors?: string, column?: "left" | "right"): void;
  /**
   * Mark an equation step. Resolution: if `step_label` is given, walk eqRef
   * from newest to oldest and match where item.latex (case-insensitive)
   * contains the label OR item.meta?.tutorReferenceLabel exactly equals it;
   * first match wins. Fallback to numeric `step_index` (positional, 0-based).
   * Returns true on success, false if no match (and dev-warns).
   */
  highlightStep(target: StepTarget, style: "circle" | "underline" | "box"): boolean;
  /**
   * Cross out an equation step. Same resolution rules as `highlightStep`.
   */
  crossOutStep(target: StepTarget): boolean;
  applyBoardActions(actions: BoardAgentAction[], jobId: string): void;
  /**
   * Run `fn` with `jobMetaRef.current` set to a tutor-owned meta object.
   * Used by the direct-tool dispatcher so tutor-direct shapes get
   * `owner: "tutor"` and are protected against silent agent overwrites.
   */
  withDirectMeta<T>(
    meta: Pick<BoardArtifactMeta, "owner" | "tutorReferenceLabel">,
    fn: () => T,
  ): T;
  clearWhiteboard(): void;
  getSnapshot(): WhiteboardSnapshot | null;
  loadSnapshot(snap: WhiteboardSnapshot): void;
  /**
   * Best-effort JPEG screenshot of the current board, ~768px wide. Returns a
   * `data:image/jpeg;base64,...` data URL on success, or `null` if anything
   * fails (no editor, no shapes, export error). Never throws.
   *
   * Privacy: caller decides whether to send this anywhere; this method just
   * materializes the bytes in memory.
   */
  captureScreenshot(): Promise<string | null>;
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
  meta?: BoardArtifactMeta;
}

function compactArtifactMeta(meta: BoardArtifactMeta | null): BoardArtifactMeta | undefined {
  if (!meta) return undefined;
  const compact: BoardArtifactMeta = { jobId: meta.jobId };
  if (meta.role) compact.role = meta.role;
  if (meta.concept) compact.concept = meta.concept;
  if (meta.summary) compact.summary = meta.summary;
  if (meta.owner) compact.owner = meta.owner;
  if (meta.tutorReferenceLabel) compact.tutorReferenceLabel = meta.tutorReferenceLabel;
  return compact;
}

function targetShapeIds(action: BoardAgentAction): string[] {
  return Array.from(
    new Set([
      ...(action.target_ids ?? []),
      ...(action.target_id ? [action.target_id] : []),
    ].filter((id) => id.startsWith("shape:"))),
  );
}

function canMutateShape(
  shape: unknown,
  opts: { allow_student_owned?: boolean; allow_tutor_owned?: boolean } = {},
): boolean {
  const meta = (shape as { meta?: { owner?: unknown } }).meta;
  const owner = meta?.owner;
  if (owner === "student" && !opts.allow_student_owned) return false;
  if (owner === "tutor" && !opts.allow_tutor_owned) return false;
  return true;
}

function currentShapeIdSet(editor: Editor): Set<string> {
  try {
    return new Set(Array.from(editor.getCurrentPageShapeIds() as unknown as Iterable<string>));
  } catch {
    return new Set();
  }
}

function diffStringSet(after: Set<string>, before: Set<string>): string[] {
  const created: string[] = [];
  for (const id of after) {
    if (!before.has(id)) created.push(id);
  }
  return created;
}

// Walk eqRef newest→oldest, matching by latex substring (case-insensitive) or
// exact tutorReferenceLabel. Falls back to numeric index. Returns -1 if no match.
function resolveEqIndex(items: EqItem[], target: { step_label?: string; step_index?: number }): number {
  const label = target.step_label?.trim();
  if (label && label.length > 0) {
    const needle = label.toLowerCase();
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.meta?.tutorReferenceLabel === label) return i;
      if (item.latex.toLowerCase().includes(needle)) return i;
    }
    // explicit label miss — don't silently land on a positional index
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[TldrawCore] resolveEqIndex: no eqItem matched step_label="${label}"`);
    }
    return -1;
  }
  const idx = target.step_index;
  if (typeof idx === "number" && Number.isInteger(idx) && idx >= 0 && idx < items.length) {
    return idx;
  }
  if (process.env.NODE_ENV !== "production") {
    console.warn("[TldrawCore] resolveEqIndex: no step_label or valid step_index provided");
  }
  return -1;
}

function shapeSize(shape: unknown): { w: number; h: number } {
  const props = (shape as { props?: { w?: unknown; h?: unknown } }).props;
  return {
    w: typeof props?.w === "number" && Number.isFinite(props.w) ? props.w : 0,
    h: typeof props?.h === "number" && Number.isFinite(props.h) ? props.h : 0,
  };
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

  const fn = createMathEvaluator(expression);
  if (!fn) {
    ctx.fillStyle = "#b91c1c";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("Invalid graph expression", 16, 86);
    return canvas.toDataURL();
  }

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

function parseNumberLinePoints(input?: string): Array<{ value: number; label?: string }> {
  if (!input?.trim()) return [];
  const points: Array<{ value: number; label?: string }> = [];
  for (const raw of input.split(/[;\n,]/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const [valueRaw, labelRaw] = trimmed.split(":");
    const value = Number(valueRaw.trim());
    if (!Number.isFinite(value)) continue;
    points.push({ value, label: labelRaw?.trim() || undefined });
  }
  return points;
}

function parseCoordinatePoints(input: string): Array<{ x: number; y: number; label?: string }> {
  const points: Array<{ x: number; y: number; label?: string }> = [];
  const chunks = input.split(/[;\n]/).map((chunk) => chunk.trim()).filter(Boolean);

  for (const chunk of chunks) {
    const match = chunk.match(POINT_PATTERN);
    if (!match) continue;
    points.push({
      x: Number(match[1]),
      y: Number(match[2]),
      label: match[3]?.trim(),
    });
  }

  return points;
}

function formatTableText(columns: string, rows: string): string {
  const headers = columns.split("|").map((cell) => cell.trim()).filter(Boolean);
  const parsedRows = rows
    .split(/[;\n]/)
    .map((row) => row.split("|").map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));

  const widthCount = Math.max(headers.length, ...parsedRows.map((row) => row.length), 1);
  const normalizedHeaders = Array.from({ length: widthCount }, (_, i) => headers[i] ?? "");
  const widths = normalizedHeaders.map((header, i) =>
    Math.max(header.length, ...parsedRows.map((row) => (row[i] ?? "").length), 3)
  );

  const renderRow = (row: string[]) =>
    Array.from({ length: widthCount }, (_, i) => (row[i] ?? "").padEnd(widths[i])).join(" | ");

  const divider = widths.map((width) => "-".repeat(width)).join("-+-");
  return [renderRow(normalizedHeaders), divider, ...parsedRows.map(renderRow)].join("\n");
}

function splitPipeList(input: string): string[] {
  return input.split("|").map((part) => part.trim()).filter(Boolean);
}

function splitRows(input: string): string[][] {
  return input
    .split(/[;\n]/)
    .map((row) => splitPipeList(row))
    .filter((row) => row.length > 0);
}

function formatSetupLine(label: string, value?: string): string | null {
  if (!value?.trim()) return null;
  return `${label}: ${value.trim()}`;
}

function estimateWrappedLineCount(lines: string[], charsPerLine: number): number {
  return lines.reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)),
    0,
  );
}

function parseVectors(input: string): Array<{ direction: string; label: string }> {
  return input
    .split(/[;\n]/)
    .map((chunk) => {
      const [directionRaw, ...labelParts] = chunk.split(":");
      const direction = directionRaw.trim().toLowerCase();
      const label = labelParts.join(":").trim();
      return direction && label ? { direction, label } : null;
    })
    .filter((item): item is { direction: string; label: string } => Boolean(item));
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
  const cameraSyncCleanupRef = useRef<() => void>(() => {});
  const leftY = useRef(START_Y);
  const rightY = useRef(START_Y);
  const pageTop = useRef(0);
  const pageIndex = useRef(1);
  const [eqItems, setEqItems] = useState<EqItem[]>([]);
  const eqRef = useRef<EqItem[]>([]);
  const semanticBoardRef = useRef<SemanticBoard>(createEmptySemanticBoard());
  const jobMetaRef = useRef<BoardArtifactMeta | null>(null);
  // Post-batch camera-focus debounce for agent flows. The per-handle focus
  // calls inside individual draw methods stay (they handle the single-action
  // case); this debounce coalesces multi-action batches so the camera doesn't
  // thrash and so removing the artificial revealDelayMs doesn't make the focus
  // animation feel jarring.
  const focusDebounceRef = useRef<{ raf: number | null; timeout: ReturnType<typeof setTimeout> | null }>({
    raf: null,
    timeout: null,
  });

  const colX = (col: "left" | "right") => col === "right" ? RIGHT_X : LEFT_X;
  const colY = (col: "left" | "right") => col === "right" ? rightY : leftY;
  const currentMeta = useCallback(() => compactArtifactMeta(jobMetaRef.current) ?? {}, []);

  const recordDirectSemanticAction = useCallback((
    action: BoardAgentAction,
    context?: SemanticBoardActionContext,
  ) => {
    const meta = compactArtifactMeta(jobMetaRef.current);
    if (meta?.jobId !== "direct") return;
    semanticBoardRef.current = applySemanticBoardAction(
      semanticBoardRef.current,
      action,
      meta,
      context,
    );
  }, []);

  // Run `fn` with jobMetaRef set to `meta`, restoring null on exit. Synchronous
  // only — do not pass an async fn; the try/finally semantics assume the entire
  // shape-creation block runs before the meta is cleared.
  const withJobMeta = useCallback(<T,>(meta: BoardArtifactMeta | null, fn: () => T): T => {
    jobMetaRef.current = meta;
    try {
      return fn();
    } finally {
      jobMetaRef.current = null;
    }
  }, []);

  const syncOverlay = useCallback((editor: Editor) => {
    const { x, y, z = 1 } = editor.getCamera();
    if (overlayRef.current) {
      // tldraw converts page -> viewport as: (point + camera) * zoom.
      // Use an explicit matrix so LaTeX overlays track pan + zoom exactly.
      overlayRef.current.style.transform =
        `matrix(${z}, 0, 0, ${z}, ${x * z}, ${y * z})`;
    }
  }, []);

  const handleMount = useCallback((editor: Editor) => {
    cameraSyncCleanupRef.current();
    editorRef.current = editor;
    editor.setCurrentTool("hand");
    editor.setCamera({ x: 0, y: 0, z: 1 });
    syncOverlay(editor);
    const syncOnTick = () => syncOverlay(editor);
    const unsubscribeStore = editor.store.listen(() => syncOverlay(editor));
    editor.on("tick", syncOnTick);
    cameraSyncCleanupRef.current = () => {
      unsubscribeStore();
      editor.off("tick", syncOnTick);
    };
  }, [syncOverlay]);

  const focusOn = useCallback((editor: Editor, x: number, y: number, w = 420, h = 180) => {
    try {
      const viewport = editor.getViewportPageBounds();
      const zoom = editor.getZoomLevel() || 1;
      const isRightColumn = x >= RIGHT_X - 20;
      const hasRightColumnWork = rightY.current > pageTop.current + START_Y + ROW_GAP;
      const useTwoColumnFrame = isRightColumn || hasRightColumnWork;
      const focusX = useTwoColumnFrame ? LEFT_X - 16 : x;
      const focusY = useTwoColumnFrame
        ? Math.max(pageTop.current, Math.min(y, pageTop.current + START_Y) - 54)
        : Math.max(pageTop.current, y - 54);
      const focusW = useTwoColumnFrame
        ? Math.max(x + w - focusX, RIGHT_X + 560 - focusX)
        : w;
      const focusH = useTwoColumnFrame
        ? Math.max(h + 164, y + h - focusY + 96)
        : h + 108;
      const pad = 72 / zoom;
      const isVisible =
        focusX - pad >= viewport.minX &&
        focusY - pad >= viewport.minY &&
        focusX + focusW + pad <= viewport.maxX &&
        focusY + focusH + pad <= viewport.maxY;

      if (isVisible) return;

      editor.zoomToBounds(
        { x: focusX, y: focusY, w: focusW, h: focusH },
        { targetZoom: 1, inset: 64, animation: { duration: 220 } },
      );
    } catch {
      // Camera movement is a nicety; drawing should never fail because of it.
    }
  }, []);

  // Cancel any pending post-batch focus and reset both raf/timeout handles.
  const cancelPendingFocus = useCallback(() => {
    if (focusDebounceRef.current.raf !== null) {
      cancelAnimationFrame(focusDebounceRef.current.raf);
      focusDebounceRef.current.raf = null;
    }
    if (focusDebounceRef.current.timeout !== null) {
      clearTimeout(focusDebounceRef.current.timeout);
      focusDebounceRef.current.timeout = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cameraSyncCleanupRef.current();
      cameraSyncCleanupRef.current = () => {};
      cancelPendingFocus();
    };
  }, [cancelPendingFocus]);

  const createText = useCallback((
    editor: Editor,
    text: string,
    x: number,
    y: number,
    options?: {
      color?: TldrawColor;
      font?: TLDefaultFontStyle;
      size?: TLDefaultSizeStyle;
      width?: number;
      autoSize?: boolean;
    }
  ) => {
    editor.createShape({
      id: createShapeId(),
      type: "text",
      x,
      y,
      props: {
        richText: toRichText(text),
        size: options?.size ?? "m",
        font: options?.font ?? "sans",
        color: options?.color ?? "black",
        textAlign: "start",
        w: options?.width ?? 560,
        autoSize: options?.autoSize ?? false,
        scale: 1,
      },
      meta: currentMeta(),
    });
  }, [currentMeta]);

  const createLine = useCallback((
    editor: Editor,
    x: number,
    y: number,
    x2: number,
    y2: number,
    color: TldrawColor = "black"
  ) => {
    editor.createShape({
      id: createShapeId(),
      type: "arrow",
      x,
      y,
      props: {
        kind: "arc",
        start: { x: 0, y: 0 },
        end: { x: x2 - x, y: y2 - y },
        bend: 0,
        color,
        dash: "solid",
        size: "s",
        fill: "none",
        arrowheadStart: "none",
        arrowheadEnd: "none",
        richText: toRichText(""),
        labelColor: color,
        font: "sans",
        scale: 1,
        labelPosition: 0.5,
        elbowMidPoint: 0.5,
      },
      meta: currentMeta(),
    });
  }, [currentMeta]);

  const createArrow = useCallback((
    editor: Editor,
    x: number,
    y: number,
    x2: number,
    y2: number,
    label = "",
    color: TldrawColor = "black",
    options?: {
      font?: TLDefaultFontStyle;
      dash?: TLDefaultDashStyle;
    },
  ) => {
    editor.createShape({
      id: createShapeId(),
      type: "arrow",
      x,
      y,
      props: {
        kind: "arc",
        start: { x: 0, y: 0 },
        end: { x: x2 - x, y: y2 - y },
        bend: 0,
        color,
        dash: options?.dash ?? "solid",
        size: "m",
        fill: "none",
        arrowheadStart: "none",
        arrowheadEnd: "arrow",
        richText: toRichText(label),
        labelColor: color,
        font: options?.font ?? "draw",
        scale: 1,
        labelPosition: 0.5,
        elbowMidPoint: 0.5,
      },
      meta: currentMeta(),
    });
  }, [currentMeta]);

  const createBox = useCallback((
    editor: Editor,
    x: number,
    y: number,
    w: number,
    h: number,
    label = "",
    color: TldrawColor = "black",
    fill: TLDefaultFillStyle = "none",
    options?: {
      font?: TLDefaultFontStyle;
      dash?: TLDefaultDashStyle;
    },
  ) => {
    editor.createShape({
      id: createShapeId(),
      type: "geo",
      x,
      y,
      props: {
        geo: "rectangle",
        w,
        h,
        richText: toRichText(label),
        size: "m",
        color,
        fill,
        dash: options?.dash ?? "draw",
        font: options?.font ?? "draw",
        align: "middle",
        verticalAlign: "middle",
        labelColor: color,
        url: "",
        growY: 0,
        scale: 1,
      },
      meta: currentMeta(),
    });
  }, [currentMeta]);

  const createFreeformGeo = useCallback((
    editor: Editor,
    shape: "rectangle" | "ellipse" | "diamond" | "triangle",
    x: number,
    y: number,
    w: number,
    h: number,
    color: TldrawColor = "black",
    fill: TLDefaultFillStyle = "none",
    options?: {
      font?: TLDefaultFontStyle;
      dash?: TLDefaultDashStyle;
    },
  ) => {
    editor.createShape({
      id: createShapeId(),
      type: "geo",
      x,
      y,
      props: {
        geo: shape,
        w,
        h,
        richText: toRichText(""),
        size: "m",
        color,
        fill,
        dash: options?.dash ?? "draw",
        font: options?.font ?? "draw",
        align: "middle",
        verticalAlign: "middle",
        labelColor: color,
        url: "",
        growY: 0,
        scale: 1,
      },
      meta: currentMeta(),
    });
  }, [currentMeta]);

  // ── Phase 6 helpers (note / draw stroke / line) ───────────────────────────
  // Sticky note. Notes are intrinsically ~200×220 (size "m"), grow with text.
  // Width/height are not first-class props — do NOT pass them. The renderer
  // recomputes layout from font/size/scale/growY.
  const createNote = useCallback((
    editor: Editor,
    x: number,
    y: number,
    opts: {
      text: string;
      color?: TldrawColor;
      labelColor?: TldrawColor;
      font?: TLDefaultFontStyle;
      size?: TLDefaultSizeStyle;
      scale?: number;
      growY?: number;
      align?: "start" | "middle" | "end";
      verticalAlign?: "start" | "middle" | "end";
    },
  ) => {
    editor.createShape({
      id: createShapeId(),
      type: "note",
      x,
      y,
      props: {
        color: opts.color ?? "yellow",
        labelColor: opts.labelColor ?? "black",
        size: opts.size ?? "m",
        font: opts.font ?? "draw",
        // `null` tells tldraw to recompute on next render — DO NOT pass 0
        // (legacy meaning differs across migrations).
        fontSizeAdjustment: null,
        align: opts.align ?? "middle",
        verticalAlign: opts.verticalAlign ?? "middle",
        growY: opts.growY ?? 0,
        url: "",
        richText: toRichText(opts.text),
        scale: opts.scale ?? 1,
        textFirstEditedBy: null,
      },
      meta: currentMeta(),
    });
  }, [currentMeta]);

  // Real freehand stroke. Builds a single tldraw `draw` shape from a polyline.
  // `x`/`y` are the shape origin; if omitted/NaN, derived from min(points) and
  // points are rebased to shape-local coordinates. `z: 0.5` is the synthetic
  // pressure value tldraw uses for non-pen input.
  const createDrawStroke = useCallback((
    editor: Editor,
    x: number | undefined,
    y: number | undefined,
    points: Array<{ x: number; y: number }>,
    opts: {
      color?: TldrawColor;
      size?: TLDefaultSizeStyle;
      dash?: TLDefaultDashStyle;
      fill?: TLDefaultFillStyle;
      isClosed?: boolean;
    },
  ) => {
    if (points.length < 2) return;
    const baseX = typeof x === "number" && Number.isFinite(x)
      ? x
      : Math.min(...points.map((p) => p.x));
    const baseY = typeof y === "number" && Number.isFinite(y)
      ? y
      : Math.min(...points.map((p) => p.y));
    const rebased = points.map((p) => ({ x: p.x - baseX, y: p.y - baseY, z: 0.5 }));
    const segments = compressLegacySegments([
      { type: "free", points: rebased },
    ]);
    const isClosed = opts.isClosed ?? false;
    editor.createShape({
      id: createShapeId(),
      type: "draw",
      x: baseX,
      y: baseY,
      props: {
        color: opts.color ?? "black",
        fill: opts.fill ?? (isClosed ? "semi" : "none"),
        dash: opts.dash ?? "draw",
        size: opts.size ?? "m",
        segments,
        isComplete: true,
        isClosed,
        isPen: false,
        scale: 1,
        scaleX: 1,
        scaleY: 1,
      },
      meta: currentMeta(),
    });
  }, [currentMeta]);

  // Multi-point line/spline. Points keyed by fractional indices via `getIndices`.
  const createLineShape = useCallback((
    editor: Editor,
    x: number | undefined,
    y: number | undefined,
    points: Array<{ x: number; y: number }>,
    opts: {
      color?: TldrawColor;
      size?: TLDefaultSizeStyle;
      dash?: TLDefaultDashStyle;
      spline?: "line" | "cubic";
    },
  ) => {
    if (points.length < 2) return;
    const baseX = typeof x === "number" && Number.isFinite(x)
      ? x
      : Math.min(...points.map((p) => p.x));
    const baseY = typeof y === "number" && Number.isFinite(y)
      ? y
      : Math.min(...points.map((p) => p.y));
    const rebased = points.map((p) => ({ x: p.x - baseX, y: p.y - baseY }));
    // getIndices(n) returns n+1 keys (start + n more). We only need n keys, so
    // we request rebased.length - 1 additional keys and use them all.
    const indices: IndexKey[] = getIndices(rebased.length - 1);
    const pointMap: Record<string, TLLineShapePoint> = {};
    rebased.forEach((p, i) => {
      const index = indices[i];
      const id = `p${i + 1}`;
      pointMap[id] = { id, index, x: p.x, y: p.y };
    });
    editor.createShape({
      id: createShapeId(),
      type: "line",
      x: baseX,
      y: baseY,
      props: {
        color: opts.color ?? "black",
        dash: opts.dash ?? "solid",
        size: opts.size ?? "m",
        spline: opts.spline ?? "line",
        points: pointMap,
        scale: 1,
      },
      meta: currentMeta(),
    });
  }, [currentMeta]);

  const ensureColumnRoom = useCallback(
    (_editor: Editor, _column: "left" | "right", _height: number) => {
      // Infinite canvas — content grows downward forever. No page breaks.
    },
    [],
  );

  const drawAxes = useCallback((
    editor: Editor,
    x: number,
    y: number,
    w: number,
    h: number,
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    label?: string
  ) => {
    createBox(editor, x, y, w, h, "", "grey");
    const xAxisY = yMin <= 0 && yMax >= 0
      ? y + h - ((0 - yMin) / (yMax - yMin)) * h
      : y + h / 2;
    const yAxisX = xMin <= 0 && xMax >= 0
      ? x + ((0 - xMin) / (xMax - xMin)) * w
      : x + w / 2;

    createLine(editor, x, xAxisY, x + w, xAxisY, "grey");
    createLine(editor, yAxisX, y, yAxisX, y + h, "grey");
    createText(editor, `${xMin}`, x, y + h + 7, { color: "grey", size: "s", width: 60 });
    createText(editor, `${xMax}`, x + w - 36, y + h + 7, { color: "grey", size: "s", width: 60 });
    createText(editor, `${yMax}`, x + 6, y + 5, { color: "grey", size: "s", width: 60 });
    createText(editor, `${yMin}`, x + 6, y + h - 22, { color: "grey", size: "s", width: 60 });
    if (label) {
      createText(editor, label, x, y + h + 30, { color: "grey", size: "s", width: w });
    }
  }, [createBox, createLine, createText]);

  useImperativeHandle(ref, () => {
    const api: WhiteboardHandle = {
    clearWhiteboard() {
      const editor = editorRef.current;
      if (!editor) return;
      const shapes = editor.getCurrentPageShapes();
      if (shapes.length > 0) editor.deleteShapes(shapes.map(s => s.id));
      pageTop.current = 0;
      pageIndex.current = 1;
      leftY.current = START_Y;
      rightY.current = START_Y;
      eqRef.current = [];
      setEqItems([]);
      semanticBoardRef.current = createEmptySemanticBoard();
    },

    startNewProblem(title: string) {
      const editor = editorRef.current;
      if (!editor) return;
      const shapes = editor.getCurrentPageShapes();
      if (shapes.length > 0) editor.deleteShapes(shapes.map(s => s.id));
      pageTop.current = 0;
      pageIndex.current = 1;
      leftY.current = START_Y;
      rightY.current = START_Y;
      eqRef.current = [];
      setEqItems([]);
      semanticBoardRef.current = createEmptySemanticBoard(title);
      createFreeformGeo(editor, "rectangle", 36, 12, 1168, 52, "light-blue", "semi", {
        font: "sans",
        dash: "draw",
      });
      createLine(editor, 44, 66, 1194, 66, "blue");
      editor.createShape({
        id: createShapeId(),
        type: "text",
        x: LEFT_X,
        y: HEADING_Y,
        props: {
          richText: toRichText(title),
          size: "xl",
          font: "sans",
          color: "blue",
          textAlign: "start",
          w: 1200,
          autoSize: false,
          scale: 1,
        },
        meta: currentMeta(),
      });
      focusOn(editor, 36, 12, 1168, 110);
      recordDirectSemanticAction(
        { type: "start_new_problem", title },
        { bounds: { x: 36, y: 12, w: 1168, h: 110, column: "full", pageIndex: pageIndex.current } },
      );
    },

    startBoardSection(title: string, _freshPage?: boolean) {
      const editor = editorRef.current;
      if (!editor) return;
      const nextY = Math.max(leftY.current, rightY.current);
      leftY.current = nextY;
      rightY.current = nextY;
      ensureColumnRoom(editor, "left", 60);

      const y = Math.max(leftY.current, rightY.current);
      createFreeformGeo(editor, "rectangle", LEFT_X - 12, y - 6, 1144, 52, "light-violet", "semi", {
        font: "draw",
        dash: "draw",
      });
      createText(editor, title, LEFT_X, y, {
        size: "l",
        font: "draw",
        color: "violet",
        width: 1120,
      });
      createLine(editor, LEFT_X, y + 42, RIGHT_X + 520, y + 42, "violet");
      leftY.current = y + 58;
      rightY.current = y + 58;
      focusOn(editor, LEFT_X, y, 720, 70);
      recordDirectSemanticAction(
        { type: "start_section", title },
        { bounds: { x: LEFT_X, y, w: 720, h: 70, column: "full", pageIndex: pageIndex.current } },
      );
    },

    drawEquationStep(latex: string, annotation?: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      ensureColumnRoom(editor, col, EQ_H + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const id = uid();
      const item: EqItem = { id, latex, annotation, x, y, meta: compactArtifactMeta(jobMetaRef.current) };
      eqRef.current = [...eqRef.current, item];
      setEqItems((prev) => [...prev, item]);
      colY(col).current += EQ_H + ROW_GAP;
      focusOn(editor, x, y, 420, EQ_H);
      recordDirectSemanticAction(
        { type: "equation_sequence", steps: latex, annotations: annotation, column: col },
        { eqItemIds: [id], bounds: { x, y, w: 420, h: EQ_H, column: col, pageIndex: pageIndex.current } },
      );
    },

    addTextNote(text: string, size?: "heading" | "body", column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      const isHeading = size === "heading";
      const approxH = isHeading ? 32 : Math.max(24, Math.ceil(text.length / 52) * 20);
      ensureColumnRoom(editor, col, approxH + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      createText(editor, text, x, y, {
        size: isHeading ? "l" : "m",
        font: isHeading ? "serif" : "sans",
      });
      colY(col).current += approxH + ROW_GAP;
      focusOn(editor, x, y, 520, approxH);
      recordDirectSemanticAction(
        { type: "text_note", text, size: size ?? "body", column: col },
        { bounds: { x, y, w: 520, h: approxH, column: col, pageIndex: pageIndex.current } },
      );
    },

    addFunctionGraph(expression: string, xMin: number, xMax: number, label?: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "right";
      const W = 260, H = 170;
      ensureColumnRoom(editor, col, H + 48);
      const x = colX(col);
      const y = colY(col).current;

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
        meta: currentMeta(),
      });
      colY(col).current += H + ROW_GAP;
      focusOn(editor, x, y, W, H);

      if (label) {
        createText(editor, label, x, colY(col).current, {
          size: "s",
          color: "grey",
          width: W,
        });
        colY(col).current += 22 + ROW_GAP;
      }
      recordDirectSemanticAction(
        { type: "function_graph", expression, x_min: xMin, x_max: xMax, label, column: col },
        { bounds: { x, y, w: W, h: H, column: col, pageIndex: pageIndex.current } },
      );
    },

    drawShape(shape: string, label?: string, width?: number, height?: number, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";

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
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;

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
          meta: currentMeta(),
        });
        colY(col).current += 50 + ROW_GAP;
        focusOn(editor, x, y, w, 60);
        recordDirectSemanticAction(
          { type: "shape", shape: "arrow", label, width: w, height: h, column: col },
          { bounds: { x, y, w, h: 60, column: col, pageIndex: pageIndex.current } },
        );
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
          meta: currentMeta(),
        });
        colY(col).current += h + ROW_GAP;
        focusOn(editor, x, y, w, h);
        recordDirectSemanticAction(
          {
            type: "shape",
            shape: (shape === "ellipse" || shape === "diamond" || shape === "triangle") ? shape : "rectangle",
            label,
            width: w,
            height: h,
            column: col,
          },
          { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
        );
      }
    },

    addTable(columns: string, rows: string, title?: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      const tableText = formatTableText(columns, rows);
      const lineCount = tableText.split("\n").length + (title ? 2 : 0);
      const h = Math.max(96, lineCount * 24 + 26);
      const w = 560;
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;

      createBox(editor, x, y, w, h, "", "grey");
      if (title) {
        createText(editor, title, x + 16, y + 12, { size: "m", width: w - 32 });
      }
      createText(editor, tableText, x + 16, y + (title ? 42 : 16), {
        font: "mono",
        size: "s",
        width: w - 32,
      });
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "table", columns, rows, title, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    addNumberLine(min: number, max: number, points?: string, label?: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      const w = 520;
      const h = 112;
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const lineY = y + 52;

      if (label) createText(editor, label, x, y, { size: "m", width: w });
      editor.createShape({
        id: createShapeId(),
        type: "arrow",
        x,
        y: lineY,
        props: {
          kind: "arc",
          start: { x: 0, y: 0 },
          end: { x: w, y: 0 },
          bend: 0,
          color: "black",
          size: "m",
          dash: "solid",
          fill: "none",
          arrowheadStart: "arrow",
          arrowheadEnd: "arrow",
          richText: toRichText(""),
          labelColor: "black",
          font: "sans",
          scale: 1,
          labelPosition: 0.5,
          elbowMidPoint: 0.5,
        },
        meta: currentMeta(),
      });

      const tickCount = Math.min(8, Math.max(2, Math.round(max - min)));
      for (let i = 0; i <= tickCount; i++) {
        const value = min + ((max - min) * i) / tickCount;
        const px = x + ((value - min) / (max - min)) * w;
        createLine(editor, px, lineY - 9, px, lineY + 9);
        createText(editor, Number.isInteger(value) ? `${value}` : value.toFixed(1), px - 18, lineY + 16, {
          color: "grey",
          size: "s",
          width: 60,
        });
      }

      for (const point of parseNumberLinePoints(points)) {
        if (point.value < min || point.value > max) continue;
        const px = x + ((point.value - min) / (max - min)) * w;
        editor.createShape({
          id: createShapeId(),
          type: "geo",
          x: px - 6,
          y: lineY - 6,
          props: {
            geo: "ellipse",
            w: 12,
            h: 12,
            richText: toRichText(""),
            size: "m",
            color: "red",
            fill: "solid",
            dash: "solid",
            font: "sans",
            align: "middle",
            verticalAlign: "middle",
            labelColor: "red",
            url: "",
            growY: 0,
            scale: 1,
          },
          meta: currentMeta(),
        });
        if (point.label) {
          createText(editor, point.label, px - 28, lineY - 36, { color: "red", size: "s", width: 90 });
        }
      }

      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "number_line", min, max, text: points, label, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    addCoordinateAxes(xMin: number, xMax: number, yMin: number, yMax: number, label?: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "right";
      const w = 300;
      const h = 220;
      ensureColumnRoom(editor, col, h + 52);
      const x = colX(col);
      const y = colY(col).current;
      drawAxes(editor, x, y, w, h, xMin, xMax, yMin, yMax, label);
      colY(col).current += h + (label ? 52 : 28);
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "coordinate_axes", x_min: xMin, x_max: xMax, y_min: yMin, y_max: yMax, label, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    plotPoints(points: string, xMin: number, xMax: number, yMin: number, yMax: number, label?: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "right";
      const w = 300;
      const h = 220;
      ensureColumnRoom(editor, col, h + 52);
      const x = colX(col);
      const y = colY(col).current;
      drawAxes(editor, x, y, w, h, xMin, xMax, yMin, yMax, label);

      for (const point of parseCoordinatePoints(points)) {
        if (point.x < xMin || point.x > xMax || point.y < yMin || point.y > yMax) continue;
        const px = x + ((point.x - xMin) / (xMax - xMin)) * w;
        const py = y + h - ((point.y - yMin) / (yMax - yMin)) * h;
        editor.createShape({
          id: createShapeId(),
          type: "geo",
          x: px - 5,
          y: py - 5,
          props: {
            geo: "ellipse",
            w: 10,
            h: 10,
            richText: toRichText(""),
            size: "m",
            color: "red",
            fill: "solid",
            dash: "solid",
            font: "sans",
            align: "middle",
            verticalAlign: "middle",
            labelColor: "red",
            url: "",
            growY: 0,
            scale: 1,
          },
          meta: currentMeta(),
        });
        if (point.label) {
          createText(editor, point.label, px + 8, py - 20, { color: "red", size: "s", width: 90 });
        }
      }

      colY(col).current += h + (label ? 52 : 28);
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "plot_points", text: points, x_min: xMin, x_max: xMax, y_min: yMin, y_max: yMax, label, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    addWorkedExampleBox(title: string, body: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      const w = 560;
      const h = Math.max(118, Math.ceil(body.length / 54) * 22 + 54);
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      createBox(editor, x, y, w, h, "", "blue", "semi");
      createText(editor, title, x + 16, y + 12, { color: "blue", size: "m", width: w - 32 });
      createText(editor, body, x + 16, y + 44, { size: "m", width: w - 32 });
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "worked_example_box", title, body, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    addStudentAttempt(text: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      const w = 560;
      const h = Math.max(92, Math.ceil(text.length / 54) * 22 + 48);
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      createBox(editor, x, y, w, h, "", "green", "semi");
      createText(editor, "Student attempt", x + 16, y + 12, { color: "green", size: "s", width: w - 32 });
      createText(editor, text, x + 16, y + 38, { size: "m", width: w - 32 });
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "student_attempt", text, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    addStickyNote(opts) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const NOTE_H = 220;
      ensureColumnRoom(editor, col, NOTE_H + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      createNote(editor, x, y, {
        text: opts.text,
        color: opts.color,
        font: opts.font,
        size: opts.size,
        scale: opts.scale,
        growY: opts.growY,
      });
      colY(col).current += NOTE_H + ROW_GAP;
      focusOn(editor, x, y, 220, NOTE_H);
      recordDirectSemanticAction(
        {
          type: "freeform_note",
          text: opts.text,
          color: opts.color,
          font: opts.font,
          size: opts.size,
          column: col,
        },
        { bounds: { x, y, w: 220, h: NOTE_H, column: col, pageIndex: pageIndex.current } },
      );
    },

    addCallout(text: string, style: CalloutStyle, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      const NOTE_H = 220;
      ensureColumnRoom(editor, col, NOTE_H + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;

      const colorMap: Record<CalloutStyle, TldrawColor> = {
        hint: "yellow",
        correct: "green",
        wrong: "red",
        warning: "orange",
        important: "violet",
        remember: "light-blue",
      };

      createNote(editor, x, y, {
        text,
        color: colorMap[style],
        font: "draw",
        size: "m",
      });
      colY(col).current += NOTE_H + ROW_GAP;
      focusOn(editor, x, y, 220, NOTE_H);
      recordDirectSemanticAction(
        { type: "freeform_note", text, color: colorMap[style], font: "draw", size: "m", column: col },
        { bounds: { x, y, w: 220, h: NOTE_H, column: col, pageIndex: pageIndex.current } },
      );
    },

    addProblemSetup(goal: string, givens?: string, unknowns?: string, plan?: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      const lines = [
        formatSetupLine("Goal", goal),
        formatSetupLine("Givens", givens),
        formatSetupLine("Unknown", unknowns),
        formatSetupLine("Plan", plan),
      ].filter((line): line is string => Boolean(line));
      const w = 560;
      const lineCount = estimateWrappedLineCount(lines, 38);
      const h = Math.max(154, lineCount * 32 + 88);
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;

      createBox(editor, x, y, w, h, "", "blue", "semi");
      createText(editor, "Problem setup", x + 16, y + 12, { color: "blue", size: "s", width: w - 32 });
      createText(editor, lines.join("\n"), x + 16, y + 40, { size: "m", width: w - 32 });
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "problem_setup", goal, givens, unknowns, plan, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    addEquationSequence(steps: string, annotations?: string, title?: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      const stepList = splitPipeList(steps ?? "");
      const annotationList = annotations ? splitPipeList(annotations) : [];
      const titleHeight = title ? 38 : 0;
      const totalHeight = titleHeight + stepList.length * (EQ_H + ROW_GAP);
      ensureColumnRoom(editor, col, totalHeight);
      const x = colX(col);
      let y = colY(col).current;

      if (title) {
        createText(editor, title, x, y, { color: "grey", size: "s", width: 520 });
        y += titleHeight;
      }

      const items: EqItem[] = stepList.map((latex, index) => {
        const item: EqItem = {
          id: uid(),
          latex,
          annotation: annotationList[index],
          x,
          y: y + index * (EQ_H + ROW_GAP),
          meta: compactArtifactMeta(jobMetaRef.current),
        };
        return item;
      });

      if (items.length > 0) {
        eqRef.current = [...eqRef.current, ...items];
        setEqItems((prev) => [...prev, ...items]);
        y = items[items.length - 1].y + EQ_H + ROW_GAP;
      }

      colY(col).current = y;
      focusOn(editor, x, colY(col).current - totalHeight, 520, totalHeight);
      recordDirectSemanticAction(
        { type: "equation_sequence", steps, annotations, title, column: col },
        {
          eqItemIds: items.map((item) => item.id),
          bounds: { x, y: colY(col).current - totalHeight, w: 520, h: totalHeight, column: col, pageIndex: pageIndex.current },
        },
      );
    },

    addTwoColumnComparison(title: string, leftTitle: string, leftBody: string, rightTitle: string, rightBody: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      const w = 560;
      const boxGap = 16;
      const boxW = (w - boxGap) / 2;
      const bodyLines = Math.max(
        Math.ceil(leftBody.length / 28),
        Math.ceil(rightBody.length / 28),
        leftBody.split("\n").length,
        rightBody.split("\n").length,
      );
      const h = Math.max(150, bodyLines * 22 + 78);
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;

      createText(editor, title, x, y, { size: "m", width: w });
      createBox(editor, x, y + 34, boxW, h - 34, "", "red", "semi");
      createBox(editor, x + boxW + boxGap, y + 34, boxW, h - 34, "", "green", "semi");
      createText(editor, leftTitle, x + 12, y + 46, { color: "red", size: "s", width: boxW - 24 });
      createText(editor, rightTitle, x + boxW + boxGap + 12, y + 46, { color: "green", size: "s", width: boxW - 24 });
      createText(editor, leftBody, x + 12, y + 72, { size: "s", width: boxW - 24 });
      createText(editor, rightBody, x + boxW + boxGap + 12, y + 72, { size: "s", width: boxW - 24 });
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "two_column_comparison", title, left_title: leftTitle, left_body: leftBody, right_title: rightTitle, right_body: rightBody, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    addAreaModel(title: string, rowLabels: string, columnLabels: string, cells: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "right";
      const rows = splitPipeList(rowLabels);
      const cols = splitPipeList(columnLabels);
      const cellRows = splitRows(cells);
      const rowCount = Math.max(rows.length, cellRows.length, 1);
      const colCount = Math.max(cols.length, ...cellRows.map((row) => row.length), 1);
      const labelW = 74;
      const headerH = 38;
      const cellW = Math.max(72, Math.min(108, Math.floor((520 - labelW) / colCount)));
      const cellH = 46;
      const gridW = labelW + colCount * cellW;
      const gridH = headerH + rowCount * cellH;
      const h = gridH + 58;
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const gx = x;
      const gy = y + 42;

      createText(editor, title, x, y, { size: "m", width: gridW });
      createBox(editor, gx, gy, gridW, gridH, "", "grey");
      for (let c = 0; c <= colCount; c++) {
        const px = gx + labelW + c * cellW;
        createLine(editor, px, gy, px, gy + gridH, "grey");
      }
      for (let r = 0; r <= rowCount; r++) {
        const py = gy + headerH + r * cellH;
        createLine(editor, gx, py, gx + gridW, py, "grey");
      }
      cols.slice(0, colCount).forEach((label, c) => {
        createText(editor, label, gx + labelW + c * cellW + 8, gy + 9, { size: "s", width: cellW - 16 });
      });
      rows.slice(0, rowCount).forEach((label, r) => {
        createText(editor, label, gx + 8, gy + headerH + r * cellH + 13, { size: "s", width: labelW - 16 });
      });
      for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < colCount; c++) {
          const value = cellRows[r]?.[c] ?? "";
          if (value) {
            createText(editor, value, gx + labelW + c * cellW + 8, gy + headerH + r * cellH + 13, {
              size: "s",
              width: cellW - 16,
            });
          }
        }
      }

      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, gridW, h);
      recordDirectSemanticAction(
        { type: "area_model", title, row_labels: rowLabels, column_labels: columnLabels, cells, column: col },
        { bounds: { x, y, w: gridW, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    addVectorDiagram(title: string, centerLabel: string, vectors: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "right";
      const parsed = parseVectors(vectors);
      const offsets: Record<string, [number, number]> = {
        up: [0, -112],
        down: [0, 112],
        left: [-132, 0],
        right: [132, 0],
        "up-right": [96, -88],
        "up-left": [-96, -88],
        "down-right": [96, 88],
        "down-left": [-96, 88],
      };
      const w = 560;
      const h = 270;
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const cx = x + w / 2;
      const cy = y + 148;

      createText(editor, title, x, y, { size: "m", width: w });
      createBox(editor, cx - 62, cy - 32, 124, 64, centerLabel, "black", "none");
      for (const vector of parsed) {
        const [dx, dy] = offsets[vector.direction] ?? [0, 0];
        createArrow(editor, cx, cy, cx + dx, cy + dy, vector.label, vector.direction.includes("down") ? "red" : "blue");
      }

      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "vector_diagram", title, center_label: centerLabel, vectors, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    addProcessMap(title: string, nodes: string, connectors?: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "right";
      const nodeList = splitPipeList(nodes);
      const connectorList = splitPipeList(connectors ?? "");
      const w = 560;
      const h = 142;
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const gap = 24;
      const nodeW = Math.max(78, Math.floor((w - gap * (nodeList.length - 1)) / Math.max(nodeList.length, 1)));
      const nodeH = 52;
      const nodeY = y + 62;

      createText(editor, title, x, y, { size: "m", width: w });
      nodeList.forEach((node, index) => {
        const nodeX = x + index * (nodeW + gap);
        createBox(editor, nodeX, nodeY, nodeW, nodeH, node, "blue", "semi");
        if (index < nodeList.length - 1) {
          const startX = nodeX + nodeW + 4;
          const endX = nodeX + nodeW + gap - 4;
          createArrow(editor, startX, nodeY + nodeH / 2, endX, nodeY + nodeH / 2, "", "grey");
          const connector = connectorList[index];
          if (connector) {
            createText(editor, connector, startX, nodeY + nodeH / 2 - 28, { color: "grey", size: "s", width: gap + 42 });
          }
        }
      });

      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "process_map", title, nodes, connectors, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    // highlightStep / crossOutStep signature:
    //   (target: { step_label?: string; step_index?: number }, ...) => boolean
    // Resolution:
    //   1. If step_label present, walk eqRef NEWEST→OLDEST and match where
    //      item.latex.toLowerCase().includes(label.toLowerCase()) OR
    //      item.meta?.tutorReferenceLabel === step_label. First match wins.
    //   2. Else fall back to step_index (0-based positional).
    //   3. If neither, console.warn in dev and return false.
    highlightStep(target: StepTarget, style: "circle" | "underline" | "box") {
      const idx = resolveEqIndex(eqRef.current, target);
      if (idx < 0) return false;
      const item = eqRef.current[idx];
      const updated = { ...item, highlight: style };
      eqRef.current = eqRef.current.map((e, i) => i === idx ? updated : e);
      setEqItems((prev) => prev.map((e, i) => i === idx ? updated : e));
      recordDirectSemanticAction(
        { type: "highlight_step", step_label: target.step_label, step_index: target.step_index, style },
        { eqItemIds: [item.id], bounds: { x: item.x, y: item.y, w: 420, h: EQ_H, pageIndex: pageIndex.current } },
      );
      return true;
    },

    crossOutStep(target: StepTarget) {
      const idx = resolveEqIndex(eqRef.current, target);
      if (idx < 0) return false;
      const item = eqRef.current[idx];
      const updated = { ...item, crossOut: true };
      eqRef.current = eqRef.current.map((e, i) => i === idx ? updated : e);
      setEqItems((prev) => prev.map((e, i) => i === idx ? updated : e));
      recordDirectSemanticAction(
        { type: "cross_out_step", step_label: target.step_label, step_index: target.step_index },
        { eqItemIds: [item.id], bounds: { x: item.x, y: item.y, w: 420, h: EQ_H, pageIndex: pageIndex.current } },
      );
      return true;
    },

    withDirectMeta(meta, fn) {
      return withJobMeta(
        {
          jobId: "direct",
          owner: meta.owner ?? "tutor",
          tutorReferenceLabel: meta.tutorReferenceLabel,
        },
        fn,
      );
    },

    applyBoardActions(actions: BoardAgentAction[], jobId: string) {
      const editor = editorRef.current;
      if (!editor) return;
      // Cancel any prior pending post-batch focus before starting a fresh
      // batch — a new applyBoardActions call always supersedes a stale focus
      // intent from a previous batch.
      cancelPendingFocus();
      // Snapshot the page's shape IDs before the batch so we can compute the
      // union bounding box of newly added shapes for the debounced focus.
      let preBatchIds: Set<string> | null = null;
      try {
        preBatchIds = new Set(
          (editor.getCurrentPageShapeIds() as unknown as Iterable<string>),
        );
      } catch {
        preBatchIds = null;
      }
      // Only schedule the post-batch focus for multi-action batches or
      // freeform actions — single templated actions already drive their own
      // focus inside the per-handle methods.
      const hasFreeform = actions.some(
        (a) =>
          a.type === "freeform_text" ||
          a.type === "freeform_shape" ||
          a.type === "freeform_arrow" ||
          a.type === "freeform_pen" ||
          a.type === "freeform_draw" ||
          a.type === "freeform_line" ||
          a.type === "freeform_note",
      );
      const shouldDebouncedFocus = actions.length >= 2 || hasFreeform;
      for (const action of actions) {
        const meta: BoardArtifactMeta = {
          jobId,
          role: action.role,
          concept: action.concept,
          summary: action.summary,
          owner: action.owner ?? "board-agent",
          tutorReferenceLabel: action.tutorReferenceLabel ?? action.label ?? action.title,
        };
        const shapeIdsBeforeAction = currentShapeIdSet(editor);
        const eqIdsBeforeAction = new Set(eqRef.current.map((item) => item.id));
        withJobMeta(meta, () => {
          switch (action.type) {
            case "clear_board":
              api.clearWhiteboard();
              break;
            case "start_new_problem":
              api.startNewProblem(action.title ?? action.text ?? "New problem");
              break;
            case "start_section":
              api.startBoardSection(action.title ?? action.text ?? "Board work");
              break;
            case "problem_setup":
              api.addProblemSetup(
                action.goal ?? action.text ?? action.title ?? "Goal",
                action.givens,
                action.unknowns,
                action.plan,
                action.column,
              );
              break;
            case "equation_sequence":
              api.addEquationSequence(action.steps ?? action.latex ?? "", action.annotations, action.title, action.column);
              break;
            case "two_column_comparison":
              api.addTwoColumnComparison(
                action.title ?? "Compare",
                action.left_title ?? "Attempt",
                action.left_body ?? "",
                action.right_title ?? "Repair",
                action.right_body ?? "",
                action.column,
              );
              break;
            case "area_model":
              api.addAreaModel(
                action.title ?? "Model",
                action.row_labels ?? "",
                action.column_labels ?? "",
                action.cells ?? "",
                action.column,
              );
              break;
            case "vector_diagram":
              api.addVectorDiagram(
                action.title ?? "Diagram",
                action.center_label ?? action.label ?? "object",
                action.vectors ?? "",
                action.column,
              );
              break;
            case "process_map":
              api.addProcessMap(action.title ?? "Map", action.nodes ?? action.text ?? "", action.connectors, action.column);
              break;
            case "text_note":
              api.addTextNote(action.text ?? action.label ?? action.title ?? "", action.size === "heading" ? "heading" : "body", action.column);
              break;
            case "function_graph":
              api.addFunctionGraph(
                action.expression ?? "x",
                action.x_min ?? -5,
                action.x_max ?? 5,
                action.label,
                action.column,
              );
              break;
            case "shape":
              api.drawShape(action.shape ?? "rectangle", action.label ?? action.text, action.width, action.height, action.column);
              break;
            case "table":
              api.addTable(action.columns ?? "Item | Value", action.rows ?? "", action.title, action.column);
              break;
            case "number_line":
              api.addNumberLine(action.min ?? -5, action.max ?? 5, action.points ? JSON.stringify(action.points) : action.text, action.label, action.column);
              break;
            case "coordinate_axes":
              api.addCoordinateAxes(
                action.x_min ?? -5,
                action.x_max ?? 5,
                action.y_min ?? -5,
                action.y_max ?? 5,
                action.label,
                action.column,
              );
              break;
            case "plot_points":
              api.plotPoints(
                action.text ?? "",
                action.x_min ?? -5,
                action.x_max ?? 5,
                action.y_min ?? -5,
                action.y_max ?? 5,
                action.label,
                action.column,
              );
              break;
            case "worked_example_box":
              api.addWorkedExampleBox(action.title ?? "Key idea", action.body ?? action.text ?? "", action.column);
              break;
            case "student_attempt":
              api.addStudentAttempt(action.text ?? action.body ?? "", action.column);
              break;
            case "highlight_step":
              api.highlightStep(
                { step_label: action.step_label, step_index: action.step_index },
                action.style ?? "box",
              );
              break;
            case "cross_out_step":
              api.crossOutStep({
                step_label: action.step_label,
                step_index: action.step_index,
              });
              break;
            case "freeform_text":
              createText(editor, action.text ?? action.label ?? "", action.x ?? colX(action.column ?? "left"), action.y ?? colY(action.column ?? "left").current, {
                color: action.color,
                size: action.size === "s" || action.size === "m" || action.size === "l" || action.size === "xl" ? action.size : "m",
                width: action.width,
              });
              focusOn(editor, action.x ?? LEFT_X, action.y ?? START_Y, action.width ?? 360, 80);
              break;
            case "freeform_shape": {
              const shape = (action.shape ?? "rectangle") as "rectangle" | "ellipse" | "diamond" | "triangle" | "arrow";
              if (shape === "arrow") {
                api.drawShape("arrow", action.label ?? action.text, action.width, action.height, action.column);
                break;
              }
              const hasCoords = typeof action.x === "number" && typeof action.y === "number";
              if (hasCoords) {
                const w = action.width ?? 120;
                const h = action.height ?? 90;
                createFreeformGeo(
                  editor,
                  shape,
                  action.x!,
                  action.y!,
                  w,
                  h,
                  action.color ?? "black",
                  action.fill ?? "none",
                  { font: action.font, dash: action.dash },
                );
                focusOn(editor, action.x!, action.y!, w + 40, h + 40);
              } else {
                api.drawShape(shape, undefined, action.width, action.height, action.column);
              }
              break;
            }
            case "freeform_arrow":
              createArrow(
                editor,
                action.x ?? LEFT_X,
                action.y ?? START_Y,
                action.x2 ?? (action.x ?? LEFT_X) + 180,
                action.y2 ?? (action.y ?? START_Y),
                action.label ?? action.text ?? "",
                action.color ?? "black",
                { font: action.font, dash: action.dash },
              );
              focusOn(editor, action.x ?? LEFT_X, action.y ?? START_Y, Math.abs((action.x2 ?? 180) - (action.x ?? 0)) + 80, 100);
              break;
            // Phase 6: `freeform_pen` previously produced N short arrow shapes
            // per stroke. It now routes through `createDrawStroke` to produce
            // ONE real tldraw `draw` shape with the full point list — cleaner
            // freehand at the cost of per-segment color control. Kept as an
            // alias for back-compat; prefer `freeform_draw` going forward.
            case "freeform_pen":
            case "freeform_draw": {
              const pts = action.points ?? [];
              if (pts.length < 2) break;
              createDrawStroke(editor, action.x, action.y, pts, {
                color: action.color ?? "black",
                size:
                  action.size === "s" || action.size === "m" || action.size === "l" || action.size === "xl"
                    ? action.size
                    : "m",
                dash: action.dash ?? "draw",
                fill: action.fill,
                isClosed: action.fill === "solid" || action.fill === "semi",
              });
              const minX = Math.min(...pts.map((p) => p.x));
              const minY = Math.min(...pts.map((p) => p.y));
              const maxX = Math.max(...pts.map((p) => p.x));
              const maxY = Math.max(...pts.map((p) => p.y));
              focusOn(editor, minX, minY, Math.max(80, maxX - minX), Math.max(80, maxY - minY));
              break;
            }
            case "freeform_line": {
              const pts = action.points ?? [];
              if (pts.length < 2) break;
              createLineShape(editor, action.x, action.y, pts, {
                color: action.color ?? "black",
                size:
                  action.size === "s" || action.size === "m" || action.size === "l" || action.size === "xl"
                    ? action.size
                    : "m",
                dash: action.dash ?? "solid",
                spline: action.spline ?? "line",
              });
              const minX = Math.min(...pts.map((p) => p.x));
              const minY = Math.min(...pts.map((p) => p.y));
              const maxX = Math.max(...pts.map((p) => p.x));
              const maxY = Math.max(...pts.map((p) => p.y));
              focusOn(editor, minX, minY, Math.max(80, maxX - minX), Math.max(80, maxY - minY));
              break;
            }
            case "freeform_note": {
              const noteCol = action.column ?? "left";
              const x = typeof action.x === "number" ? action.x : colX(noteCol);
              const y = typeof action.y === "number" ? action.y : colY(noteCol).current;
              const text = action.text ?? action.label ?? "";
              createNote(editor, x, y, {
                text,
                color: action.color ?? "yellow",
                labelColor: "black",
                font: action.font ?? "draw",
                size:
                  action.size === "s" || action.size === "m" || action.size === "l" || action.size === "xl"
                    ? action.size
                    : "m",
                scale: action.scale ?? 1,
                growY: action.growY ?? 0,
              });
              // If we fell back to the column cursor, advance it so subsequent
              // templated actions in this batch don't collide with the note.
              if (typeof action.x !== "number" || typeof action.y !== "number") {
                colY(noteCol).current += 220 + ROW_GAP;
              }
              focusOn(editor, x, y, 220, 220);
              break;
            }
            case "delete_shape": {
              const mutateOpts = {
                allow_student_owned: action.allow_student_owned,
                allow_tutor_owned: action.allow_tutor_owned,
              };
              const ids = targetShapeIds(action).filter((id) => {
                const shape = editor.getShape(id as Parameters<typeof editor.getShape>[0]);
                return shape && canMutateShape(shape, mutateOpts);
              });
              if (ids.length > 0) {
                editor.deleteShapes(ids as unknown as Parameters<typeof editor.deleteShapes>[0]);
              }
              break;
            }
            case "move_shape": {
              const dx = action.dx ?? 0;
              const dy = action.dy ?? 0;
              if (dx === 0 && dy === 0) break;
              const mutateOpts = {
                allow_student_owned: action.allow_student_owned,
                allow_tutor_owned: action.allow_tutor_owned,
              };
              for (const id of targetShapeIds(action)) {
                const shape = editor.getShape(id as Parameters<typeof editor.getShape>[0]);
                if (!shape || !canMutateShape(shape, mutateOpts)) continue;
                editor.updateShape({
                  id: shape.id,
                  type: shape.type,
                  x: shape.x + dx,
                  y: shape.y + dy,
                } as Parameters<typeof editor.updateShape>[0]);
              }
              break;
            }
            case "update_text": {
              const text = action.text ?? action.label ?? "";
              const mutateOpts = {
                allow_student_owned: action.allow_student_owned,
                allow_tutor_owned: action.allow_tutor_owned,
              };
              for (const id of targetShapeIds(action)) {
                const shape = editor.getShape(id as Parameters<typeof editor.getShape>[0]);
                if (!shape || !canMutateShape(shape, mutateOpts)) continue;
                editor.updateShape({
                  id: shape.id,
                  type: shape.type,
                  props: {
                    ...shape.props,
                    richText: toRichText(text),
                  },
                } as Parameters<typeof editor.updateShape>[0]);
              }
              break;
            }
            case "align_shapes": {
              type EditorShape = NonNullable<ReturnType<typeof editor.getShape>>;
              const mutateOpts = {
                allow_student_owned: action.allow_student_owned,
                allow_tutor_owned: action.allow_tutor_owned,
              };
              const targets = targetShapeIds(action)
                .map((id) => editor.getShape(id as Parameters<typeof editor.getShape>[0]))
                .filter((shape): shape is EditorShape => Boolean(shape) && canMutateShape(shape, mutateOpts));
              if (targets.length < 2) break;

              const dims = targets.map((shape) => ({ shape, ...shapeSize(shape) }));
              const align = action.align ?? "left";
              const value =
                align === "right"
                  ? Math.max(...dims.map(({ shape, w }) => shape.x + w))
                  : align === "bottom"
                    ? Math.max(...dims.map(({ shape, h }) => shape.y + h))
                    : align === "center-x"
                      ? dims.reduce((sum, { shape, w }) => sum + shape.x + w / 2, 0) / dims.length
                      : align === "center-y"
                        ? dims.reduce((sum, { shape, h }) => sum + shape.y + h / 2, 0) / dims.length
                        : align === "top"
                          ? Math.min(...dims.map(({ shape }) => shape.y))
                          : Math.min(...dims.map(({ shape }) => shape.x));

              for (const { shape, w, h } of dims) {
                const x =
                  align === "right" ? value - w :
                  align === "center-x" ? value - w / 2 :
                  align === "left" ? value :
                  shape.x;
                const y =
                  align === "bottom" ? value - h :
                  align === "center-y" ? value - h / 2 :
                  align === "top" ? value :
                  shape.y;
                editor.updateShape({
                  id: shape.id,
                  type: shape.type,
                  x,
                  y,
                } as Parameters<typeof editor.updateShape>[0]);
              }
              break;
            }
          }
        });
        const createdShapeIds = diffStringSet(currentShapeIdSet(editor), shapeIdsBeforeAction);
        const createdEqIds = eqRef.current
          .map((item) => item.id)
          .filter((eqId) => !eqIdsBeforeAction.has(eqId));
        semanticBoardRef.current = applySemanticBoardAction(
          semanticBoardRef.current,
          action,
          meta,
          {
            shapeIds: createdShapeIds,
            eqItemIds: createdEqIds,
          },
        );
      }
      // Post-batch debounced camera focus on the newly added shapes' bounding
      // box. Skip for single templated actions (their own focusOn call wins)
      // and bail silently if the editor doesn't expose the IDs we need.
      if (shouldDebouncedFocus && preBatchIds) {
        focusDebounceRef.current.raf = requestAnimationFrame(() => {
          focusDebounceRef.current.raf = null;
          focusDebounceRef.current.timeout = setTimeout(() => {
            focusDebounceRef.current.timeout = null;
            const ed = editorRef.current;
            if (!ed) return;
            try {
              const allIds = ed.getCurrentPageShapeIds() as unknown as Iterable<string>;
              const newIds: string[] = [];
              for (const id of allIds) {
                if (!preBatchIds.has(id)) newIds.push(id);
              }
              if (newIds.length === 0) return;
              type ShapeId = Parameters<typeof ed.getShapePageBounds>[0];
              let minX = Infinity;
              let minY = Infinity;
              let maxX = -Infinity;
              let maxY = -Infinity;
              for (const id of newIds) {
                const b = ed.getShapePageBounds(id as ShapeId);
                if (!b) continue;
                if (b.minX < minX) minX = b.minX;
                if (b.minY < minY) minY = b.minY;
                if (b.maxX > maxX) maxX = b.maxX;
                if (b.maxY > maxY) maxY = b.maxY;
              }
              if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;
              focusOn(ed, minX, minY, Math.max(60, maxX - minX), Math.max(60, maxY - minY));
            } catch {
              // Camera focus is a nicety; never throw from the post-batch pass.
            }
          }, 150);
        });
      }
    },

    getSnapshot() {
      const editor = editorRef.current;
      if (!editor) return null;
      let store: unknown = null;
      try {
        store = editor.store.getStoreSnapshot();
      } catch {}
      return {
        store,
        eqItems: [...eqRef.current],
        semanticBoard: semanticBoardRef.current,
        pageState: {
          pageIndex: pageIndex.current,
          pageTop: pageTop.current,
          leftY: leftY.current,
          rightY: rightY.current,
        },
      };
    },

    async captureScreenshot(): Promise<string | null> {
      // Best-effort. Every failure path returns null; never throws.
      try {
        const editor = editorRef.current;
        if (!editor) return null;
        const shapes = editor.getCurrentPageShapes();
        if (!shapes || shapes.length === 0) return null;
        // tldraw 5: editor.toImageDataUrl returns { url, width, height }.
        // scale ~0.4 against a default 2x pixelRatio aims for ~768px wide for
        // typical board widths. JPEG quality 0.6 keeps the payload small
        // (~40-80KB) so we don't bloat the board-agent request.
        const result = await editor.toImageDataUrl(shapes.map((s) => s.id), {
          format: "jpeg",
          quality: 0.6,
          scale: 0.4,
          background: true,
          padding: 16,
        });
        const url = (result && typeof result === "object" ? (result as { url?: unknown }).url : undefined);
        if (typeof url === "string" && url.startsWith("data:image/")) {
          return url;
        }
        return null;
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[TldrawCore] captureScreenshot failed", err);
        }
        return null;
      }
    },

    loadSnapshot(snap: WhiteboardSnapshot) {
      const editor = editorRef.current;
      if (!editor || !snap) return;
      if (snap.store) {
        try {
          editor.store.loadStoreSnapshot(
            snap.store as Parameters<typeof editor.store.loadStoreSnapshot>[0],
          );
        } catch {}
      }
      pageIndex.current = snap.pageState?.pageIndex ?? 1;
      pageTop.current = snap.pageState?.pageTop ?? 0;
      leftY.current = snap.pageState?.leftY ?? START_Y;
      rightY.current = snap.pageState?.rightY ?? START_Y;
      const items = snap.eqItems ?? [];
      eqRef.current = items;
      setEqItems(items);
      semanticBoardRef.current = normalizeSemanticBoard(snap.semanticBoard);
      // Defensive: ensure post-resume direct calls go through withDirectMeta
      // cleanly. (No prior path should leak meta across resume, but a snapshot
      // reload is a natural reset point so we make it explicit.)
      jobMetaRef.current = null;
    },
    };
    return api;
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Tldraw
        onMount={handleMount}
        hideUi
      />
      <div
        ref={overlayRef}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      >
        {eqItems.map((item) => (
          <EqBlock key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
});

export default TldrawCore;
