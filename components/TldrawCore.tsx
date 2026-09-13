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
import { Tldraw, type TLComponents } from "tldraw";
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
import {
  angleLabelPoint,
  arcPolyline,
  densifyPolyline,
  dividerAngles,
  edgeLabelPoint,
  figureVertices,
  formatTick,
  fractionLatex,
  fractionText,
  niceMax,
  niceStep,
  parseLineMarks,
  sectorPolygon,
  tickValues,
  vertexLabelPoint,
  wholesNeeded,
  type AngleDrawing,
  type ArrayDrawing,
  type BalanceDrawing,
  type BarChartDrawing,
  type FigureDrawing,
  type FractionDrawing,
  type NumberLineDrawing,
  type Pt,
  type SketchDrawing,
} from "@/lib/board-diagrams";
import type { CalloutStyle } from "@/lib/whiteboard-tools";
import type { BoardAgentAction, BoardArtifactMeta } from "@/lib/board-agent-types";
import {
  applySemanticBoardAction,
  createEmptySemanticBoard,
  normalizeSemanticBoard,
  summarizeSemanticBoard,
  type SemanticBoard,
  type SemanticBoardActionContext,
} from "@/lib/semantic-board";

// Local alias so callers everywhere can use the full tldraw 5 color palette
// (13 colors) — widened from the old narrow 5-color tuple in Phase 6.
type TldrawColor = TLDefaultColorStyle;

// ── Layout constants ────────────────────────────────────────────────────────
const LEFT_X = 60;
const RIGHT_X = 640;
const START_Y = 108;
const HEADING_Y = 18;
const ROW_GAP = 16;
const EQ_H = 52;
const EQ_ROW_GAP = 8;
const POINT_PATTERN = /\(\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*\)(?:\s*:\s*([^,;\n(]+))?/g;

// ── Board style ─────────────────────────────────────────────────────────────
// One pen for the tutor (blue), ink for structure (black), pencil grey for the
// student's work and quiet labels. Diagrams use solid strokes; only
// draw_sketch keeps tldraw's hand-drawn wobble.
const INK: TldrawColor = "black";
const PEN: TldrawColor = "blue";
const PENCIL: TldrawColor = "grey";
// Marker palette. Each new diagram, and each series inside one (two
// fractions, five bars, three forces), takes the next pen so nothing that
// should be told apart shares a colour. Structure stays in ink.
const MARKERS: TldrawColor[] = ["blue", "violet", "green", "orange", "red", "light-blue"];
const MARKER_HEX: Record<string, string> = {
  blue: "#4465e9",
  violet: "#ae3ec9",
  green: "#099268",
  orange: "#e16919",
  red: "#e03131",
  "light-blue": "#4ba1f1",
};
const CORRECT_HEX = "#099268";
const WRONG_HEX = "#e03131";
const DIAGRAM_W = 520;
// tldraw text metrics: theme font size 16px × size multiplier, line height 1.35.
const FONT_PX: Record<TLDefaultSizeStyle, number> = { s: 18, m: 24, l: 36, xl: 44 };
const LINE_HEIGHT = 1.35;
const FONT_FAMILY: Record<TLDefaultFontStyle, string> = {
  draw: "var(--tl-font-draw)",
  sans: "var(--tl-font-sans)",
  serif: "var(--tl-font-serif)",
  mono: "var(--tl-font-mono)",
};

// Measure wrapped text the way tldraw lays it out, so boxes fit their
// contents instead of guessing from character counts.
function measureText(
  editor: Editor,
  text: string,
  font: TLDefaultFontStyle,
  size: TLDefaultSizeStyle,
  maxWidth: number | null,
): { w: number; h: number } {
  const lineH = FONT_PX[size] * LINE_HEIGHT;
  try {
    const m = editor.textMeasure.measureText(text, {
      fontFamily: FONT_FAMILY[font],
      fontSize: FONT_PX[size],
      lineHeight: LINE_HEIGHT,
      fontWeight: "normal",
      fontStyle: "normal",
      padding: "0px",
      maxWidth,
    });
    return { w: Math.ceil(m.w), h: Math.max(lineH, Math.ceil(m.h)) };
  } catch {
    const width = maxWidth ?? 560;
    const lines = text
      .split("\n")
      .reduce((n, line) => n + Math.max(1, Math.ceil((line.length * FONT_PX[size] * 0.55) / width)), 0);
    return { w: width, h: lines * lineH };
  }
}

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
  addNumberLine(opts: NumberLineDrawing): void;
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
  // Picture tools. Inputs are parsed and validated by the dispatcher.
  drawFraction(opts: FractionDrawing): void;
  drawFigure(opts: FigureDrawing): void;
  drawAngle(opts: AngleDrawing): void;
  drawArray(opts: ArrayDrawing): void;
  drawBalance(opts: BalanceDrawing): void;
  drawBarChart(opts: BarChartDrawing): void;
  drawSketch(opts: SketchDrawing): void;
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
  getBoardSummary(): string;
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
  // "label" items are typeset captions on diagrams (a fraction under a pie);
  // they are never equation steps, so highlight/cross-out skip them.
  role?: "label";
  color?: string;
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
      if (item.role === "label") continue;
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
  const stepIndices = items.map((item, i) => (item.role === "label" ? -1 : i)).filter((i) => i >= 0);
  if (typeof idx === "number" && Number.isInteger(idx) && idx >= 0 && idx < stepIndices.length) {
    return stepIndices[idx];
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

// "(1,1):A, (3,4):B; (-2, 2)" — commas separate points as well as the two
// coordinates, so match tuples directly instead of splitting the string.
function parseCoordinatePoints(input: string): Array<{ x: number; y: number; label?: string }> {
  const points: Array<{ x: number; y: number; label?: string }> = [];
  for (const match of input.matchAll(POINT_PATTERN)) {
    points.push({
      x: Number(match[1]),
      y: Number(match[2]),
      label: match[3]?.trim() || undefined,
    });
    if (points.length >= 24) break;
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

type FocusRect = { x: number; y: number; w: number; h: number };
function unionRect(a: FocusRect, b: FocusRect): FocusRect {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.w, b.x + b.w);
  const maxY = Math.max(a.y + a.h, b.y + b.h);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
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
      // Labels render inline so they carry no display-mode margins and can be
      // centred beside a diagram; steps keep display mode.
      katex.render(item.latex, ref.current, { throwOnError: false, displayMode: item.role !== "label" });
    } catch {
      if (ref.current) ref.current.textContent = item.latex;
    }
  }, [item.latex]);

  return (
    <div style={{ position: "absolute", left: item.x, top: item.y }}>
      <div style={{ position: "relative", display: "inline-block" }}>
        <span
          ref={ref}
          style={{ fontSize: "1.45rem", color: item.color ?? "#383838", display: "block", padding: "2px 4px" }}
        />

        {item.annotation && (
          <span
            style={{
              position: "absolute",
              left: "calc(100% + 18px)",
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 13,
              fontStyle: "normal",
              fontWeight: 400,
              color: "oklch(0.55 0.005 220)",
              whiteSpace: "nowrap",
              letterSpacing: "0.01em",
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
              background: WRONG_HEX,
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
              background: CORRECT_HEX,
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
              border: `1.5px dashed ${CORRECT_HEX}`,
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
              stroke={CORRECT_HEX}
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
function DotGridBackground() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          "radial-gradient(circle, oklch(75% 0.008 220) 1px, transparent 1px)",
        backgroundSize: "16px 16px",
        backgroundColor: "#ffffff",
      }}
    />
  );
}

const TLDRAW_COMPONENTS: TLComponents = { Background: DotGridBackground };

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
  // Which marker the next diagram picks up; reset when the board is cleared.
  const markerRef = useRef(0);
  const takePens = useCallback((n: number): TldrawColor[] => {
    const count = Math.max(1, n);
    const base = markerRef.current;
    markerRef.current += count;
    return Array.from({ length: count }, (_, i) => MARKERS[(base + i) % MARKERS.length]);
  }, []);
  // Post-batch camera-focus debounce for agent flows. The per-handle focus
  // calls inside individual draw methods stay (they handle the single-action
  // case); this debounce coalesces multi-action batches so the camera doesn't
  // thrash and so removing the artificial revealDelayMs doesn't make the focus
  // animation feel jarring.
  const focusDebounceRef = useRef<{ raf: number | null; timeout: ReturnType<typeof setTimeout> | null }>({
    raf: null,
    timeout: null,
  });
  // Accumulates the union of focus rects during a burst of draws so the camera
  // makes ONE move that frames everything just drawn, instead of thrashing.
  const pendingFocusRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

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
      const FOCUS_CTX = 120;
      const focusX = useTwoColumnFrame ? LEFT_X - 16 : x;
      const focusY = Math.max(pageTop.current, y - FOCUS_CTX);
      // Frame the element's neighborhood. Track the actual content width instead
      // of always spanning both full columns (the old RIGHT_X + 560 minimum is
      // what forced the camera to zoom way out).
      const focusW = useTwoColumnFrame
        ? Math.max(x + w - focusX, 700)
        : w;
      const focusH = useTwoColumnFrame
        ? Math.max(h + FOCUS_CTX + 96, h + 164)
        : h + 108;
      const pad = 72 / zoom;
      // "Visible" also means readable: if the student zoomed far out, new
      // content must still bring the camera back to a legible zoom.
      const READABLE_ZOOM = 0.8;
      const isVisible =
        zoom >= READABLE_ZOOM &&
        focusX - pad >= viewport.minX &&
        focusY - pad >= viewport.minY &&
        focusX + focusW + pad <= viewport.maxX &&
        focusY + focusH + pad <= viewport.maxY;

      if (isVisible) return;

      // Coalesce a burst of draws: accumulate the union of focus rects and make a
      // single camera move on the next frame, then clamp so text stays readable.
      const rect: FocusRect = { x: focusX, y: focusY, w: focusW, h: focusH };
      pendingFocusRef.current = pendingFocusRef.current
        ? unionRect(pendingFocusRef.current, rect)
        : rect;
      if (focusDebounceRef.current.raf !== null) {
        cancelAnimationFrame(focusDebounceRef.current.raf);
      }
      focusDebounceRef.current.raf = requestAnimationFrame(() => {
        focusDebounceRef.current.raf = null;
        const f = pendingFocusRef.current;
        pendingFocusRef.current = null;
        if (!f) return;
        try {
          editor.zoomToBounds(f, { targetZoom: 1, inset: 64, animation: { duration: 260 } });
          const MIN_ZOOM = 0.8;
          if (editor.getZoomLevel() < MIN_ZOOM) {
            const cam = editor.getCamera();
            editor.setCamera({ ...cam, z: MIN_ZOOM }, { animation: { duration: 160 } });
          }
        } catch {
          // Editor may be mid-teardown; a missed camera move is harmless.
        }
      });
    } catch {
      // Camera movement is a nicety; drawing should never fail because of it.
    }
  }, []);

  // Cancel any pending post-batch focus and reset both raf/timeout handles.
  const cancelPendingFocus = useCallback(() => {
    pendingFocusRef.current = null;
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
      align?: "start" | "middle" | "end";
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
        font: options?.font ?? "draw",
        color: options?.color ?? "black",
        textAlign: options?.align ?? "start",
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
      size?: TLDefaultSizeStyle;
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
        size: options?.size ?? "m",
        color,
        fill,
        dash: options?.dash ?? "solid",
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
    const rebased = densifyPolyline(points).map((p) => ({ x: p.x - baseX, y: p.y - baseY, z: 0.5 }));
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

  // Axes with arrowheads, ticks at a readable step, end labels, no outer box.
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
    const xAxisY = yMin <= 0 && yMax >= 0 ? y + h - ((0 - yMin) / (yMax - yMin)) * h : y + h;
    const yAxisX = xMin <= 0 && xMax >= 0 ? x + ((0 - xMin) / (xMax - xMin)) * w : x;
    const axis = (x1: number, y1: number, x2: number, y2: number) => {
      editor.createShape({
        id: createShapeId(),
        type: "arrow",
        x: x1,
        y: y1,
        props: {
          kind: "arc",
          start: { x: 0, y: 0 },
          end: { x: x2 - x1, y: y2 - y1 },
          bend: 0,
          color: INK,
          dash: "solid",
          size: "s",
          fill: "none",
          arrowheadStart: "arrow",
          arrowheadEnd: "arrow",
          richText: toRichText(""),
          labelColor: INK,
          font: "sans",
          scale: 1,
          labelPosition: 0.5,
          elbowMidPoint: 0.5,
        },
        meta: currentMeta(),
      });
    };
    axis(x - 12, xAxisY, x + w + 12, xAxisY);
    axis(yAxisX, y - 12, yAxisX, y + h + 12);
    for (const v of tickValues(xMin, xMax, niceStep(xMin, xMax, 8))) {
      if (v === 0) continue;
      const gx = x + ((v - xMin) / (xMax - xMin)) * w;
      createLine(editor, gx, xAxisY - 5, gx, xAxisY + 5, INK);
    }
    for (const v of tickValues(yMin, yMax, niceStep(yMin, yMax, 6))) {
      if (v === 0) continue;
      const gy = y + h - ((v - yMin) / (yMax - yMin)) * h;
      createLine(editor, yAxisX - 5, gy, yAxisX + 5, gy, INK);
    }
    const tick = (text: string, tx: number, ty: number, width: number, align: "start" | "middle" | "end" = "middle") =>
      createText(editor, text, tx, ty, { color: PENCIL, size: "s", font: "sans", width, align });
    tick(`${xMin}`, x - 24, xAxisY + 8, 48);
    tick(`${xMax}`, x + w - 24, xAxisY + 8, 48);
    tick(`${yMax}`, yAxisX + 8, y - 8, 60, "start");
    tick(`${yMin}`, yAxisX + 8, y + h - 20, 60, "start");
    tick("x", x + w + 16, xAxisY - 12, 24, "start");
    tick("y", yAxisX - 26, y - 22, 24, "start");
    if (label) {
      createText(editor, label, x, y + h + 30, { color: PENCIL, size: "s", font: "sans", width: w, align: "middle" });
    }
  }, [createLine, createText, currentMeta]);

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
      markerRef.current = 0;
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
      markerRef.current = 0;
      semanticBoardRef.current = createEmptySemanticBoard(title);
      // Ink heading with a thin pencil rule, the way a board title is written.
      const measured = measureText(editor, title, "sans", "xl", 1120);
      editor.createShape({
        id: createShapeId(),
        type: "text",
        x: LEFT_X,
        y: HEADING_Y,
        props: {
          richText: toRichText(title),
          size: "xl",
          font: "sans",
          color: INK,
          textAlign: "start",
          w: 1120,
          autoSize: false,
          scale: 1,
        },
        meta: currentMeta(),
      });
      const titleW = Math.min(1120, Math.max(240, measured.w + 8));
      const ruleY = HEADING_Y + measured.h + 8;
      createLine(editor, LEFT_X, ruleY, LEFT_X + titleW, ruleY, PENCIL);
      leftY.current = Math.max(START_Y, ruleY + 28);
      rightY.current = leftY.current;
      focusOn(editor, LEFT_X, HEADING_Y, titleW, ruleY + 28 - HEADING_Y);
      recordDirectSemanticAction(
        { type: "start_new_problem", title },
        { bounds: { x: LEFT_X, y: HEADING_Y, w: titleW, h: 80, column: "full", pageIndex: pageIndex.current } },
      );
    },

    startBoardSection(title: string, _freshPage?: boolean) {
      const editor = editorRef.current;
      if (!editor) return;
      const nextY = Math.max(leftY.current, rightY.current);
      leftY.current = nextY;
      rightY.current = nextY;
      ensureColumnRoom(editor, "left", 60);

      const y = Math.max(leftY.current, rightY.current) + 8;
      const measured = measureText(editor, title, "sans", "l", 1120);
      createText(editor, title, LEFT_X, y, { size: "l", font: "sans", color: INK, width: 1120 });
      const sectionW = Math.min(1120, Math.max(200, measured.w + 8));
      const ruleY = y + measured.h + 6;
      createLine(editor, LEFT_X, ruleY, LEFT_X + sectionW, ruleY, PENCIL);
      leftY.current = ruleY + 24;
      rightY.current = ruleY + 24;
      focusOn(editor, LEFT_X, y, sectionW, ruleY + 24 - y);
      recordDirectSemanticAction(
        { type: "start_section", title },
        { bounds: { x: LEFT_X, y, w: sectionW, h: 60, column: "full", pageIndex: pageIndex.current } },
      );
    },

    drawEquationStep(latex: string, annotation?: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      ensureColumnRoom(editor, col, EQ_H + EQ_ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const id = uid();
      const item: EqItem = { id, latex, annotation, x, y, meta: compactArtifactMeta(jobMetaRef.current) };
      eqRef.current = [...eqRef.current, item];
      setEqItems((prev) => [...prev, item]);
      colY(col).current += EQ_H + EQ_ROW_GAP;
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
      const font: TLDefaultFontStyle = isHeading ? "sans" : "draw";
      const fontSize: TLDefaultSizeStyle = isHeading ? "l" : "m";
      const approxH = measureText(editor, text, font, fontSize, 560).h;
      ensureColumnRoom(editor, col, approxH + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      createText(editor, text, x, y, { size: fontSize, font, color: INK, width: 560 });
      colY(col).current += approxH + ROW_GAP;
      focusOn(editor, x, y, 560, approxH);
      recordDirectSemanticAction(
        { type: "text_note", text, size: size ?? "body", column: col },
        { bounds: { x, y, w: 520, h: approxH, column: col, pageIndex: pageIndex.current } },
      );
    },

    addFunctionGraph(expression: string, xMin: number, xMax: number, label?: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "right";
      const W = 300;
      const H = 220;
      const fn = createMathEvaluator(expression);

      // Sample the curve, then pick a y-range that is padded, includes the
      // x-axis when it is nearby, and lands on round numbers.
      const samples: Pt[] = [];
      let yMin = Infinity;
      let yMax = -Infinity;
      if (fn) {
        for (let i = 0; i <= 120; i++) {
          const sx = xMin + ((xMax - xMin) * i) / 120;
          try {
            const sy = fn(sx);
            if (Number.isFinite(sy)) {
              samples.push({ x: sx, y: sy });
              yMin = Math.min(yMin, sy);
              yMax = Math.max(yMax, sy);
            }
          } catch {
            // discontinuity; skip the sample
          }
        }
      }
      if (samples.length < 2) {
        yMin = -5;
        yMax = 5;
      }
      const pad = (yMax - yMin) * 0.12 || 1;
      let yLo = yMin - pad;
      let yHi = yMax + pad;
      const span = yHi - yLo;
      if (yLo > 0 && yLo < span) yLo = 0;
      if (yHi < 0 && -yHi < span) yHi = 0;
      const ys = niceStep(yLo, yHi, 6);
      yLo = Math.floor(yLo / ys) * ys;
      yHi = Math.ceil(yHi / ys) * ys;

      const extra = label ? 76 : 48;
      ensureColumnRoom(editor, col, H + extra);
      const x = colX(col);
      const y = colY(col).current;
      drawAxes(editor, x, y, W, H, xMin, xMax, yLo, yHi, label);

      const px = (v: number) => x + ((v - xMin) / (xMax - xMin)) * W;
      const py = (v: number) => y + H - ((v - yLo) / (yHi - yLo)) * H;
      const pen = takePens(1)[0];
      let run: Pt[] = [];
      const flush = () => {
        if (run.length >= 2) {
          createLineShape(editor, undefined, undefined, run, { color: pen, size: "m", dash: "solid", spline: "line" });
        }
        run = [];
      };
      samples.forEach((s, i) => {
        const prev = samples[i - 1];
        // A jump bigger than most of the range is an asymptote, not a curve.
        if (prev && Math.abs(s.y - prev.y) > (yHi - yLo) * 0.8) flush();
        run.push({ x: px(s.x), y: py(s.y) });
      });
      flush();
      if (!fn) {
        createText(editor, "Could not read that expression", x, y + H / 2 - 12, { color: "red", size: "s", font: "sans", width: W, align: "middle" });
      }

      colY(col).current += H + extra;
      focusOn(editor, x, y, W, H + extra);
      recordDirectSemanticAction(
        { type: "function_graph", expression, x_min: xMin, x_max: xMax, label, column: col },
        { bounds: { x, y, w: W, h: H + extra, column: col, pageIndex: pageIndex.current } },
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

    addNumberLine(opts: NumberLineDrawing) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const { min, max } = opts;
      const step = opts.step ?? niceStep(min, max);
      const w = DIAGRAM_W;
      const PAD = 26; // arrow overhang past the first and last tick
      const hasJumps = opts.jumps.length > 0;
      const hasTopLabels = opts.marks.some((m) => m.label) || opts.intervals.some((iv) => iv.label);
      const top = hasJumps ? 74 : hasTopLabels ? 44 : 18;
      const h = top + 46 + (opts.label ? 30 : 0);
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const lineY = y + top;
      const px = (v: number) => x + PAD + ((v - min) / (max - min)) * (w - PAD * 2);

      const arrow = (x1: number, x2: number, opt: {
        color: TldrawColor;
        size: TLDefaultSizeStyle;
        startHead: boolean;
        endHead: boolean;
        bend?: number;
        label?: string;
        dy?: number;
      }) => {
        editor.createShape({
          id: createShapeId(),
          type: "arrow",
          x: x1,
          y: lineY + (opt.dy ?? 0),
          props: {
            kind: "arc",
            start: { x: 0, y: 0 },
            end: { x: x2 - x1, y: 0 },
            bend: opt.bend ?? 0,
            color: opt.color,
            dash: "solid",
            size: opt.size,
            fill: "none",
            arrowheadStart: opt.startHead ? "arrow" : "none",
            arrowheadEnd: opt.endHead ? "arrow" : "none",
            richText: toRichText(opt.label ?? ""),
            labelColor: opt.color,
            font: "sans",
            scale: 1,
            labelPosition: 0.5,
            elbowMidPoint: 0.5,
          },
          meta: currentMeta(),
        });
      };
      const pens = takePens(opts.intervals.length + opts.marks.length + opts.jumps.length);
      const intervalPen = (i: number) => pens[i % pens.length];
      const markPen = (i: number) => pens[(opts.intervals.length + i) % pens.length];
      const jumpPen = (i: number) => pens[(opts.intervals.length + opts.marks.length + i) % pens.length];
      const dot = (cx: number, open: boolean, color: TldrawColor) =>
        createFreeformGeo(editor, "ellipse", cx - 7, lineY - 7, 14, 14, color, open ? "semi" : "fill", { dash: "solid" });

      // Shaded ranges go under everything else.
      opts.intervals.forEach((iv, i) => {
        const from = Math.max(min, iv.from);
        const to = Math.min(max, iv.to);
        if (!(to > from)) return;
        const rayLeft = iv.from < min;
        const rayRight = iv.to > max;
        const x1 = rayLeft ? x : px(from);
        const x2 = rayRight ? x + w : px(to);
        arrow(x1, x2, { color: intervalPen(i), size: "l", startHead: rayLeft, endHead: rayRight });
        if (iv.label) {
          createText(editor, iv.label, (x1 + x2) / 2 - 90, lineY - 40, { color: intervalPen(i), size: "s", font: "sans", width: 180, align: "middle" });
        }
      });

      // The axis, then ticks with labels.
      arrow(x, x + w, { color: INK, size: "m", startHead: true, endHead: true });
      for (const v of tickValues(min, max, step)) {
        const tx = px(v);
        createLine(editor, tx, lineY - 8, tx, lineY + 8, INK);
        createText(editor, formatTick(v, step), tx - 32, lineY + 14, { color: PENCIL, size: "s", font: "sans", width: 64, align: "middle" });
      }

      // Interval endpoints (open = hollow), then marked values.
      opts.intervals.forEach((iv, i) => {
        if (iv.from >= min && iv.from <= max) dot(px(iv.from), iv.openFrom, intervalPen(i));
        if (iv.to >= min && iv.to <= max) dot(px(iv.to), iv.openTo, intervalPen(i));
      });
      opts.marks.forEach((m, i) => {
        dot(px(m.value), false, markPen(i));
        if (m.label) {
          createText(editor, m.label, px(m.value) - 70, lineY - 40, { color: markPen(i), size: "s", font: "sans", width: 140, align: "middle" });
        }
      });

      // Hop arrows arc above the line; a negative bend curves upward.
      opts.jumps.forEach((j, i) => {
        const x1 = px(j.from);
        const x2 = px(j.to);
        arrow(x1, x2, { color: jumpPen(i), size: "s", startHead: false, endHead: true, bend: x2 > x1 ? -46 : 46, label: j.label, dy: -8 });
      });

      if (opts.label) {
        createText(editor, opts.label, x, lineY + 44, { color: PENCIL, size: "s", font: "sans", width: w, align: "middle" });
      }

      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        {
          type: "number_line",
          min,
          max,
          text: opts.marks.map((m) => (m.label ? `${m.value}:${m.label}` : `${m.value}`)).join(", "),
          label: opts.label,
          column: col,
        },
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
      colY(col).current += h + (label ? 76 : 48);
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
      const pen = takePens(1)[0];

      for (const point of parseCoordinatePoints(points)) {
        if (point.x < xMin || point.x > xMax || point.y < yMin || point.y > yMax) continue;
        const px = x + ((point.x - xMin) / (xMax - xMin)) * w;
        const py = y + h - ((point.y - yMin) / (yMax - yMin)) * h;
        createFreeformGeo(editor, "ellipse", px - 6, py - 6, 12, 12, pen, "fill", { dash: "solid" });
        if (point.label) {
          createText(editor, point.label, px + 8, py - 26, { color: pen, size: "s", font: "sans", width: 120 });
        }
      }

      colY(col).current += h + (label ? 76 : 48);
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
      const PADDING = 18;
      const innerW = w - PADDING * 2;
      const titleH = measureText(editor, title, "sans", "m", innerW).h;
      const bodyH = measureText(editor, body, "draw", "m", innerW).h;
      const h = PADDING + titleH + 10 + bodyH + PADDING;
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      createBox(editor, x, y, w, h, "", INK, "semi");
      createText(editor, title, x + PADDING, y + PADDING, { color: PEN, size: "m", font: "sans", width: innerW });
      createText(editor, body, x + PADDING, y + PADDING + titleH + 10, { size: "m", font: "draw", color: INK, width: innerW });
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
      // The student's words in pencil with a small "you" tag, the way a tutor
      // jots down what the student said rather than boxing it as an exhibit.
      const textW = 460;
      const measured = measureText(editor, text, "draw", "m", textW);
      const usedW = Math.min(textW, measured.w);
      const w = usedW + 96;
      const h = Math.max(32, measured.h);
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      createText(editor, text, x, y, { size: "m", font: "draw", color: PENCIL, width: textW });
      // Tag drawn as a box plus its own text: a geo label would grow the box.
      createBox(editor, x + usedW + 14, y + 3, 58, 28, "", PENCIL, "solid");
      createText(editor, "you", x + usedW + 14, y + 5, { size: "s", font: "sans", color: PENCIL, width: 58, align: "middle" });
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
      const PADDING = 18;
      const innerW = w - PADDING * 2;
      const LABEL_H = 30;
      const bodyH = measureText(editor, lines.join("\n"), "draw", "m", innerW).h;
      const h = PADDING + LABEL_H + bodyH + PADDING;
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;

      createBox(editor, x, y, w, h, "", INK, "semi");
      createText(editor, "Problem setup", x + PADDING, y + PADDING - 2, { color: PEN, size: "s", font: "sans", width: innerW });
      createText(editor, lines.join("\n"), x + PADDING, y + PADDING + LABEL_H, { size: "m", font: "draw", color: INK, width: innerW });
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
      const totalHeight = titleHeight + stepList.length * (EQ_H + EQ_ROW_GAP);
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
          y: y + index * (EQ_H + EQ_ROW_GAP),
          meta: compactArtifactMeta(jobMetaRef.current),
        };
        return item;
      });

      if (items.length > 0) {
        eqRef.current = [...eqRef.current, ...items];
        setEqItems((prev) => [...prev, ...items]);
        if (stepList.length >= 2) {
          const firstY = items[0].y + 12;
          const lastY = items[items.length - 1].y + EQ_H - 12;
          createLine(editor, x - 14, firstY, x - 14, lastY, "light-violet");
        }
        y = items[items.length - 1].y + EQ_H + EQ_ROW_GAP;
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
      const bodyH = Math.max(
        measureText(editor, leftBody, "draw", "s", boxW - 24).h,
        measureText(editor, rightBody, "draw", "s", boxW - 24).h,
      );
      const h = 34 + 38 + bodyH + 16;
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
      const D = Math.SQRT1_2;
      const unit: Record<string, [number, number]> = {
        up: [0, -1],
        down: [0, 1],
        left: [-1, 0],
        right: [1, 0],
        "up-right": [D, -D],
        "up-left": [-D, -D],
        "down-right": [D, D],
        "down-left": [-D, D],
      };
      const w = DIAGRAM_W;
      const BOX = 64;
      const LEN = 90;
      const reach = BOX / 2 + LEN + 42; // arrow plus its label
      const h = 40 + reach * 2 + 8;
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const cx = x + w / 2;
      const cy = y + 40 + reach;

      createText(editor, title, x, y, { size: "m", font: "sans", color: INK, width: w });
      createBox(editor, cx - BOX / 2, cy - BOX / 2, BOX, BOX, "", INK, "semi");
      createText(editor, centerLabel, cx - 70, cy - 12, { size: "s", font: "sans", color: INK, width: 140, align: "middle" });
      const pens = takePens(parsed.length);
      parsed.forEach((vector, i) => {
        const dir = unit[vector.direction];
        if (!dir) return;
        const pen = pens[i];
        const [ux, uy] = dir;
        // Start on the box edge, not at the centre, so arrows read as forces on the object.
        const edge = BOX / 2 / Math.max(Math.abs(ux), Math.abs(uy));
        const sx = cx + ux * edge;
        const sy = cy + uy * edge;
        const tx = cx + ux * (edge + LEN);
        const ty = cy + uy * (edge + LEN);
        createArrow(editor, sx, sy, tx, ty, "", pen, { dash: "solid" });
        const tw = measureText(editor, vector.label, "sans", "s", null).w;
        const labelW = Math.max(60, tw + 12);
        const lx = cx + ux * (edge + LEN + 14);
        const ly = cy + uy * (edge + LEN + 14);
        createText(editor, vector.label, lx + ux * (labelW / 2) - labelW / 2, ly + uy * 12 - 12, { size: "s", font: "sans", color: pen, width: labelW, align: "middle" });
      });

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

    // ── Pictures ────────────────────────────────────────────────────────────
    // Every picture: a clean diagram in ink and pen, typeset or sans labels,
    // one caption line in pencil. Placed in the column flow like everything
    // else so the camera and the semantic board treat it as one artifact.

    drawFraction(opts: FractionDrawing) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const R = 64;
      const BAR_W = 180;
      const BAR_H = 52;
      const GAP = 28;
      const GROUP_GAP = 36;
      const LABEL_W = 56; // typeset fraction beside each model
      const modelH = opts.model === "circle" ? R * 2 : BAR_H;
      const h = modelH + (opts.label ? 36 : 0);
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x0 = colX(col);
      const y0 = colY(col).current;
      const items: EqItem[] = [];
      const pens = takePens(opts.fractions.length);
      let cursor = x0;
      let right = x0;

      opts.fractions.forEach((f, index) => {
        const pen = pens[index];
        if (index > 0) cursor += GROUP_GAP;
        const groupStart = cursor;
        const wholes = wholesNeeded(f);
        for (let k = 0; k < wholes; k++) {
          if (k > 0) cursor += GAP;
          const shadedHere = Math.max(0, Math.min(f.d, f.n - k * f.d));
          if (opts.model === "circle") {
            const cx = cursor + R;
            const cy = y0 + R;
            for (let i = 0; i < shadedHere; i++) {
              const pts = f.d === 1
                ? arcPolyline(cx, cy, R, -90, 270)
                : sectorPolygon(cx, cy, R, -90 + (360 * i) / f.d, -90 + (360 * (i + 1)) / f.d);
              createDrawStroke(editor, undefined, undefined, pts, { color: pen, fill: "solid", dash: "solid", size: "s", isClosed: true });
            }
            createFreeformGeo(editor, "ellipse", cursor, y0, R * 2, R * 2, INK, "none", { dash: "solid" });
            for (const a of dividerAngles(f.d)) {
              const rad = (a * Math.PI) / 180;
              createLine(editor, cx, cy, cx + R * Math.cos(rad), cy + R * Math.sin(rad), INK);
            }
            cursor += R * 2;
          } else {
            const cellW = BAR_W / f.d;
            for (let i = 0; i < f.d; i++) {
              const shaded = i < shadedHere;
              createBox(editor, cursor + i * cellW, y0, cellW, BAR_H, "", shaded ? pen : INK, shaded ? "solid" : "none");
            }
            cursor += BAR_W;
          }
        }
        void groupStart;
        // "= 3/4" beside the model, vertically centred on it.
        items.push({
          id: uid(),
          latex: `= ${fractionLatex(f)}`,
          x: cursor + 12,
          y: y0 + modelH / 2 - (f.d === 1 ? 16 : 27),
          role: "label",
          color: MARKER_HEX[pen],
          meta: compactArtifactMeta(jobMetaRef.current),
        });
        cursor += 12 + LABEL_W;
        right = cursor;
      });

      if (items.length > 0) {
        eqRef.current = [...eqRef.current, ...items];
        setEqItems((prev) => [...prev, ...items]);
      }
      const w = Math.max(right - x0, 160);
      if (opts.label) {
        const captionW = Math.max(w, 360);
        createText(editor, opts.label, x0 + w / 2 - captionW / 2, y0 + modelH + 10, { color: PENCIL, size: "s", font: "sans", width: captionW, align: "middle" });
      }
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x0, y0, w, h);
      recordDirectSemanticAction(
        { type: "fraction", text: opts.fractions.map(fractionText).join(" and "), label: opts.label, column: col },
        { eqItemIds: items.map((item) => item.id), bounds: { x: x0, y: y0, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    drawFigure(opts: FigureDrawing) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const PAD = 48;
      const fw = opts.figure === "rectangle" ? 260 : opts.figure === "square" ? 200 : opts.figure === "circle" ? 180 : 230;
      const fh = opts.figure === "rectangle" ? 150 : opts.figure === "square" ? 200 : opts.figure === "circle" ? 180 : 170;
      const w = fw + PAD * 2;
      const h = fh + PAD * 2 + (opts.label ? 22 : 0);
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const ox = x + PAD;
      const oy = y + PAD;
      const labelAt = (text: string, p: Pt, color: TldrawColor, width = 140) =>
        createText(editor, text, p.x - width / 2, p.y - 12, { color, size: "s", font: "sans", width, align: "middle" });
      const pens = takePens(opts.sideLabels.length + opts.angleLabels.length + (opts.radiusLabel ? 1 : 0) + (opts.diameterLabel ? 1 : 0));
      let penIdx = 0;
      const nextPen = () => pens[penIdx++ % pens.length];

      if (opts.figure === "circle") {
        const cx = ox + fw / 2;
        const cy = oy + fh / 2;
        const r = fw / 2;
        createFreeformGeo(editor, "ellipse", ox, oy, fw, fh, INK, "none", { dash: "solid" });
        createFreeformGeo(editor, "ellipse", cx - 4, cy - 4, 8, 8, INK, "fill", { dash: "solid" });
        if (opts.diameterLabel) {
          const pen = nextPen();
          createLine(editor, cx - r, cy, cx + r, cy, pen);
          labelAt(opts.diameterLabel, { x: cx, y: cy + 20 }, pen);
        }
        if (opts.radiusLabel) {
          const pen = nextPen();
          createLine(editor, cx, cy, cx + r, cy, pen);
          labelAt(opts.radiusLabel, { x: cx + r / 2, y: cy - 18 }, pen);
        }
      } else {
        const pts = figureVertices(opts.figure, fw, fh).map((p) => ({ x: p.x + ox, y: p.y + oy }));
        createLineShape(editor, undefined, undefined, [...pts, pts[0]], { color: INK, size: "m", dash: "solid" });
        if (opts.markRightAngle && opts.figure !== "triangle") {
          const v = pts[0];
          const s = 16;
          createLineShape(editor, undefined, undefined, [{ x: v.x, y: v.y - s }, { x: v.x + s, y: v.y - s }, { x: v.x + s, y: v.y }], { color: INK, size: "s", dash: "solid" });
        }
        opts.sideLabels.slice(0, pts.length).forEach((text, i) => {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const tw = measureText(editor, text, "sans", "s", null).w;
          // Push horizontal-edge labels down by half a line, vertical-edge
          // labels out by half their width, slanted edges by a mix.
          const offset = 10 + Math.abs((b.x - a.x) / len) * 12 + Math.abs((b.y - a.y) / len) * (tw / 2);
          labelAt(text, edgeLabelPoint(pts, i, offset), nextPen(), Math.max(60, tw + 12));
        });
        opts.vertexLabels.slice(0, pts.length).forEach((text, i) => labelAt(text, vertexLabelPoint(pts, i, 22), INK, 60));
        opts.angleLabels.slice(0, pts.length).forEach((text, i) => labelAt(text, angleLabelPoint(pts, i, 36), nextPen(), 80));
      }

      if (opts.label) {
        createText(editor, opts.label, x, y + fh + PAD * 2 - 6, { color: PENCIL, size: "s", font: "sans", width: w, align: "middle" });
      }
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "figure", text: opts.figure, label: opts.label, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    drawAngle(opts: AngleDrawing) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const L = 190;
      const deg = opts.degrees;
      const rad = (-deg * Math.PI) / 180;
      const ex = Math.cos(rad) * L;
      const ey = Math.sin(rad) * L;
      const PAD = 40;
      const minX = Math.min(0, ex);
      const maxX = Math.max(L, ex);
      const minY = Math.min(0, ey);
      const maxY = Math.max(0, ey);
      const w = maxX - minX + PAD * 2;
      const h = maxY - minY + PAD * 2 + (opts.caption ? 22 : 0);
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const vx = x + PAD - minX;
      const vy = y + PAD - minY;
      const pen = takePens(1)[0];
      const ray = (tx: number, ty: number) => {
        editor.createShape({
          id: createShapeId(),
          type: "arrow",
          x: vx,
          y: vy,
          props: {
            kind: "arc",
            start: { x: 0, y: 0 },
            end: { x: tx - vx, y: ty - vy },
            bend: 0,
            color: INK,
            dash: "solid",
            size: "m",
            fill: "none",
            arrowheadStart: "none",
            arrowheadEnd: "arrow",
            richText: toRichText(""),
            labelColor: INK,
            font: "sans",
            scale: 1,
            labelPosition: 0.5,
            elbowMidPoint: 0.5,
          },
          meta: currentMeta(),
        });
      };
      ray(vx + L, vy);
      ray(vx + ex, vy + ey);
      if (deg === 90) {
        const s = 18;
        createLineShape(editor, undefined, undefined, [{ x: vx + s, y: vy }, { x: vx + s, y: vy - s }, { x: vx, y: vy - s }], { color: pen, size: "s", dash: "solid" });
      } else {
        createDrawStroke(editor, undefined, undefined, arcPolyline(vx, vy, 46, 0, -deg, 4), { color: pen, size: "s", dash: "solid", fill: "none", isClosed: false });
      }
      createFreeformGeo(editor, "ellipse", vx - 4, vy - 4, 8, 8, INK, "fill", { dash: "solid" });
      const mid = (-deg / 2) * (Math.PI / 180);
      const lr = deg === 90 ? 48 : 72;
      createText(editor, opts.label ?? `${deg}°`, vx + Math.cos(mid) * lr - 40, vy + Math.sin(mid) * lr - 12, { color: pen, size: "s", font: "sans", width: 80, align: "middle" });
      if (opts.caption) {
        createText(editor, opts.caption, x, y + h - 22, { color: PENCIL, size: "s", font: "sans", width: w, align: "middle" });
      }
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "angle", text: `${deg}°`, label: opts.caption, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    drawArray(opts: ArrayDrawing) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const SP = 30;
      const DOT = 14;
      const LEFT = 40;
      const TOP = 30;
      const gridW = opts.columns * SP;
      const gridH = opts.rows * SP;
      const w = LEFT + gridW + 8;
      const h = TOP + gridH + 8 + (opts.label ? 30 : 0);
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const ox = x + LEFT;
      const oy = y + TOP;
      const split = Boolean(opts.splitAfterColumn || opts.splitAfterRow);
      const pens = takePens(split ? 2 : 1);
      for (let r = 0; r < opts.rows; r++) {
        for (let c = 0; c < opts.columns; c++) {
          const second = opts.splitAfterColumn ? c >= opts.splitAfterColumn : opts.splitAfterRow ? r >= opts.splitAfterRow : false;
          createFreeformGeo(editor, "ellipse", ox + c * SP + (SP - DOT) / 2, oy + r * SP + (SP - DOT) / 2, DOT, DOT, second ? pens[1] : pens[0], "fill", { dash: "solid" });
        }
      }
      const count = (text: string, lx: number, ly: number, width: number) =>
        createText(editor, text, lx, ly, { color: PENCIL, size: "s", font: "sans", width, align: "middle" });
      if (opts.splitAfterColumn) {
        const sx = ox + opts.splitAfterColumn * SP;
        createLineShape(editor, undefined, undefined, [{ x: sx, y: oy - 6 }, { x: sx, y: oy + gridH + 6 }], { color: INK, size: "s", dash: "dashed" });
        count(`${opts.splitAfterColumn}`, ox, y, opts.splitAfterColumn * SP);
        count(`${opts.columns - opts.splitAfterColumn}`, sx, y, (opts.columns - opts.splitAfterColumn) * SP);
      } else {
        count(`${opts.columns}`, ox, y, gridW);
      }
      if (opts.splitAfterRow) {
        const sy = oy + opts.splitAfterRow * SP;
        createLineShape(editor, undefined, undefined, [{ x: ox - 6, y: sy }, { x: ox + gridW + 6, y: sy }], { color: INK, size: "s", dash: "dashed" });
        count(`${opts.splitAfterRow}`, x, oy + (opts.splitAfterRow * SP) / 2 - 12, LEFT - 10);
        count(`${opts.rows - opts.splitAfterRow}`, x, sy + ((opts.rows - opts.splitAfterRow) * SP) / 2 - 12, LEFT - 10);
      } else {
        count(`${opts.rows}`, x, oy + gridH / 2 - 12, LEFT - 10);
      }
      if (opts.label) {
        createText(editor, opts.label, x, oy + gridH + 12, { color: PENCIL, size: "s", font: "sans", width: w, align: "middle" });
      }
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "array", text: `${opts.rows} × ${opts.columns}`, label: opts.label, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    drawBalance(opts: BalanceDrawing) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const w = DIAGRAM_W;
      const BEAM = 380;
      const PAN_W = 210;
      const TILE_W = 46;
      const TILE_H = 40;
      const TILE_GAP = 6;
      const V = 100; // pan depth below the beam end
      const tilt = opts.tilt === "left" ? 1 : opts.tilt === "right" ? -1 : 0;
      const dy = tilt * 18;
      const cyOffset = 74;
      const h = cyOffset + 18 + V + 8 + (opts.label ? 30 : 0);
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const cx = x + w / 2;
      const cy = y + cyOffset;
      const leftEnd: Pt = { x: cx - BEAM / 2, y: cy + dy };
      const rightEnd: Pt = { x: cx + BEAM / 2, y: cy - dy };
      const pen = takePens(1)[0];

      // Pans first so the beam draws over them; tiles last so they sit on top
      // of the strings.
      const pan = (end: Pt, tiles: string[]) => {
        const panY = end.y + V;
        createLineShape(editor, undefined, undefined, [end, { x: end.x - PAN_W / 2, y: panY }], { color: INK, size: "s", dash: "solid" });
        createLineShape(editor, undefined, undefined, [end, { x: end.x + PAN_W / 2, y: panY }], { color: INK, size: "s", dash: "solid" });
        createLineShape(editor, undefined, undefined, [{ x: end.x - PAN_W / 2 - 6, y: panY }, { x: end.x + PAN_W / 2 + 6, y: panY }], { color: INK, size: "m", dash: "solid" });
        const perRow = 4;
        tiles.forEach((tile, i) => {
          const row = Math.floor(i / perRow);
          const inRow = Math.min(perRow, tiles.length - row * perRow);
          const rowW = inRow * TILE_W + (inRow - 1) * TILE_GAP;
          const tx = end.x - rowW / 2 + (i % perRow) * (TILE_W + TILE_GAP);
          const ty = panY - 2 - (row + 1) * (TILE_H + 2);
          const isVariable = /[a-z]/i.test(tile);
          // Tile label as its own text so short labels never wrap inside the
          // geo shape's padding.
          createBox(editor, tx, ty, TILE_W, TILE_H, "", isVariable ? pen : INK, isVariable ? "solid" : "semi");
          createText(editor, tile, tx - 10, ty + TILE_H / 2 - 12, { color: isVariable ? pen : INK, size: "s", font: "sans", width: TILE_W + 20, align: "middle" });
        });
      };
      pan(leftEnd, opts.left);
      pan(rightEnd, opts.right);

      createFreeformGeo(editor, "triangle", cx - 28, cy + 4, 56, 44, INK, "solid", { dash: "solid" });
      createLineShape(editor, undefined, undefined, [leftEnd, rightEnd], { color: INK, size: "l", dash: "solid" });
      createFreeformGeo(editor, "ellipse", cx - 6, cy - 6, 12, 12, INK, "fill", { dash: "solid" });

      if (opts.label) {
        createText(editor, opts.label, x, y + h - 26, { color: PENCIL, size: "s", font: "sans", width: w, align: "middle" });
      }
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "balance", text: `${opts.left.join(" + ")} = ${opts.right.join(" + ")}`, label: opts.label, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    drawBarChart(opts: BarChartDrawing) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const w = 440;
      const CHART_H = 200;
      const PAD_L = 64;
      const PAD_B = 34;
      const PAD_T = opts.label ? 44 : 16;
      const h = PAD_T + CHART_H + PAD_B + 4;
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const baseY = y + PAD_T + CHART_H;
      const maxV = niceMax(Math.max(0, ...opts.values));
      const n = opts.categories.length;
      const slot = (w - PAD_L - 12) / n;
      const barW = Math.min(64, slot * 0.62);
      const pens = takePens(n);

      if (opts.label) createText(editor, opts.label, x, y, { color: INK, size: "m", font: "sans", width: w });
      createLineShape(editor, undefined, undefined, [{ x: x + PAD_L, y: y + PAD_T - 4 }, { x: x + PAD_L, y: baseY }, { x: x + w, y: baseY }], { color: INK, size: "s", dash: "solid" });
      for (const v of [0, maxV / 2, maxV]) {
        const gy = baseY - (v / maxV) * CHART_H;
        createLine(editor, x + PAD_L - 6, gy, x + PAD_L, gy, INK);
        const text = v === maxV && opts.unit ? `${formatTick(v, maxV / 2)} ${opts.unit}` : formatTick(v, maxV / 2);
        createText(editor, text, x - 40, gy - 12, { color: PENCIL, size: "s", font: "sans", width: PAD_L + 30, align: "end" });
      }
      opts.categories.forEach((cat, i) => {
        const v = Math.max(0, opts.values[i] ?? 0);
        const bh = (v / maxV) * CHART_H;
        const bx = x + PAD_L + i * slot + (slot - barW) / 2;
        if (bh > 0) createBox(editor, bx, baseY - bh, barW, bh, "", pens[i], "solid");
        createText(editor, `${opts.values[i]}`, bx - 20, baseY - bh - 26, { color: INK, size: "s", font: "sans", width: barW + 40, align: "middle" });
        createText(editor, cat, bx - (slot - barW) / 2, baseY + 8, { color: PENCIL, size: "s", font: "sans", width: slot, align: "middle" });
      });
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "bar_chart", text: opts.categories.map((c, i) => `${c}=${opts.values[i]}`).join(", "), label: opts.label, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    drawSketch(opts: SketchDrawing) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const w = opts.width;
      const h = opts.height + (opts.label ? 30 : 0);
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const sx = opts.width / 100;
      const sy = opts.height / 100;
      const pens = takePens(opts.strokes.filter((stroke) => stroke.closed).length);
      let closedIdx = 0;
      for (const stroke of opts.strokes) {
        const pts = stroke.points.map((p) => ({ x: x + p.x * sx, y: y + p.y * sy }));
        createDrawStroke(editor, undefined, undefined, stroke.closed ? [...pts, pts[0]] : pts, {
          color: stroke.closed ? pens[closedIdx++ % pens.length] : INK,
          fill: stroke.closed ? "solid" : "none",
          dash: "draw",
          size: "m",
          isClosed: stroke.closed,
        });
      }
      for (const l of opts.labels) {
        createText(editor, l.text, x + l.x * sx - 70, y + l.y * sy - 12, { color: PENCIL, size: "s", font: "sans", width: 140, align: "middle" });
      }
      if (opts.label) {
        createText(editor, opts.label, x, y + opts.height + 8, { color: PENCIL, size: "s", font: "sans", width: w, align: "middle" });
      }
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "sketch", text: `${opts.strokes.length} strokes`, label: opts.label, column: col },
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
              api.addNumberLine({
                min: action.min ?? -5,
                max: action.max ?? 5,
                marks: parseLineMarks(action.text),
                intervals: [],
                jumps: [],
                label: action.label,
                column: action.column,
              });
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

    getBoardSummary() {
      return summarizeSemanticBoard(semanticBoardRef.current);
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
        components={TLDRAW_COMPONENTS}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
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
