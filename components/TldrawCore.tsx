"use client";

// tldraw/katex CSS are imported in app/globals.css so they load with the page,
// not behind the dynamic chunk.

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { Tldraw, renderPlaintextFromRichText, type TLComponents } from "tldraw";
import { Editor, createShapeId, toRichText } from "@tldraw/editor";
import { InstancePresenceRecordType, type TLInstancePresence, type TLShapeId } from "@tldraw/tlschema";
import {
  formatBoardItems,
  isHeadingItem,
  itemLabelFrom,
  resolveItemTarget,
  ringPoints,
  type BoardItem,
  type ItemBounds,
} from "@/lib/board-items";
import { planReveal, pointsShown, polylineLength, typedPrefix, type RevealInput, type RevealStep } from "@/lib/board-reveal";
import { TutorPenOverlayUtil } from "@/components/board/TutorPenOverlay";
import { MathShapeUtil, measureMath, type MathHighlight, type TLMathShape } from "@/components/board/MathShape";
import { IconShapeUtil, type TLIconShape } from "@/components/board/IconShape";

const OVERLAY_UTILS = [TutorPenOverlayUtil];
const SHAPE_UTILS = [MathShapeUtil, IconShapeUtil];
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
  clamp,
  altitude,
  formatNumber,
  isSolidFigure,
  type TapeDrawing,
  type GridDrawing,
  type VerticalDrawing,
  type LongDivisionDrawing,
  type TransversalDrawing,
  type GraphExtras,
  type FigureKind,
  type IconsDrawing,
  autoTickStyle,
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
  /** Board items (b1, b2, …) so a resumed session keeps its ids. */
  items?: BoardItem[];
  itemSeq?: number;
}

export type StepTarget = { step_label?: string; step_index?: number };

export interface WhiteboardHandle {
  startNewProblem(title: string): void;
  startBoardSection(title: string, freshPage?: boolean): void;
  drawEquationStep(latex: string, annotation?: string, column?: "left" | "right"): void;
  addTextNote(text: string, size?: "heading" | "body", column?: "left" | "right"): void;
  addFunctionGraph(expression: string, xMin: number, xMax: number, label?: string, column?: "left" | "right", extras?: GraphExtras): void;
  drawShape(shape: string, label?: string, width?: number, height?: number, column?: "left" | "right"): void;
  addTable(columns: string, rows: string, title?: string, column?: "left" | "right"): void;
  addNumberLine(opts: NumberLineDrawing): void;
  addCoordinateAxes(xMin: number, xMax: number, yMin: number, yMax: number, label?: string, column?: "left" | "right"): void;
  plotPoints(points: string, xMin: number, xMax: number, yMin: number, yMax: number, label?: string, column?: "left" | "right", connect?: boolean): void;
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
  /** Item bookkeeping around one tool call: everything created between begin and end becomes one board item. */
  beginItem(tool: string): ItemToken;
  endItem(token: ItemToken, label: string | null, owner?: "tutor" | "student"): string | null;
  /** The tutor's pointer glides to an item and rests there. Returns the item or null. */
  pointAt(target: string): BoardItem | null;
  /** Ring an item: a laser ring that fades, or a marker ring that stays. */
  circleItem(target: string, keep: boolean): BoardItem | null;
  /** Erase items by id or label. Returns the labels erased. */
  eraseItems(targets: string[]): string[];
  /** Erase everything except headings and the newest `keep` items. */
  eraseOlder(keep: number): string[];
  // Math pictures added Sept 14 2026.
  drawTapeDiagram(opts: TapeDrawing): void;
  drawGrid(opts: GridDrawing): void;
  writeVertical(opts: VerticalDrawing): void;
  drawLongDivision(opts: LongDivisionDrawing): void;
  drawTransversal(opts: TransversalDrawing): void;
  /** Rows of real things (apples, coins…) with optional groups, crossed-out ones, and a second row. */
  drawIcons(opts: IconsDrawing): void;
  /** The board as a JPEG data URL with its pixel size (or null when empty). */
  exportImage(maxWidth?: number): Promise<{ url: string; width: number; height: number } | null>;
}

export type ItemToken = { tool: string; shapes: Set<string>; eqs: Set<string> };

// ── Legacy equation overlay item ────────────────────────────────────────────
// Typeset math is a "math" shape in the store now (components/board/MathShape).
// Old snapshots still carry these; loadSnapshot turns them into shapes.
export interface EqItem {
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
  /** 0..1 while being "written"; undefined once fully shown */
  reveal?: number;
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
type MathLine = { id: string; latex: string; role?: "" | "label"; meta?: BoardArtifactMeta };

function resolveEqIndex(items: MathLine[], target: { step_label?: string; step_index?: number }): number {
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
  if (idx === -1 && stepIndices.length > 0) return stepIndices[stepIndices.length - 1];
  if (typeof idx === "number" && Number.isInteger(idx) && idx >= 0 && idx < stepIndices.length) {
    return stepIndices[idx];
  }
  if (process.env.NODE_ENV !== "production") {
    console.warn("[TldrawCore] resolveEqIndex: no step_label or valid step_index provided");
  }
  return -1;
}

// Repeat each corner (a bend of more than ~35°) a few times. The freehand
// stroke renderer streamlines its input, which turns sharp corners into
// petals; repeated points make it stop and turn.
function sharpenCorners(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length < 3) return points;
  const out: Array<{ x: number; y: number }> = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const a1 = Math.atan2(p.y - prev.y, p.x - prev.x);
    const a2 = Math.atan2(next.y - p.y, next.x - p.x);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = Math.PI * 2 - d;
    const corner = i === 0 || i === n - 1 || d > (35 * Math.PI) / 180;
    out.push(p);
    if (corner) out.push({ x: p.x, y: p.y }, { x: p.x, y: p.y }, { x: p.x, y: p.y });
  }
  return out;
}

function shapeSize(shape: unknown): { w: number; h: number } {
  const props = (shape as { props?: { w?: unknown; h?: unknown } }).props;
  return {
    w: typeof props?.w === "number" && Number.isFinite(props.w) ? props.w : 0,
    h: typeof props?.h === "number" && Number.isFinite(props.h) ? props.h : 0,
  };
}

// ── ID generator ────────────────────────────────────────────────────────────

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
// ── Main component ──────────────────────────────────────────────────────────
// A plain white board. The dot grid read as clutter next to real diagrams.
function PlainBackground() {
  return <div style={{ position: "absolute", inset: 0, backgroundColor: "#ffffff" }} />;
}

const TLDRAW_COMPONENTS: TLComponents = { Background: PlainBackground };

export type TldrawCoreProps = {
  /** True while queued writing is still appearing on the board. */
  onWriting?: (busy: boolean) => void;
  /** Let tldraw take keyboard focus on mount (default). The landing page demo turns this off. */
  autoFocus?: boolean;
};

const TldrawCore = forwardRef<WhiteboardHandle, TldrawCoreProps>(function TldrawCore({ onWriting, autoFocus = true }, ref) {
  const editorRef = useRef<Editor | null>(null);
  const leftY = useRef(START_Y);
  const rightY = useRef(START_Y);
  const pageTop = useRef(0);
  const pageIndex = useRef(1);
  // Typeset math shapes in creation order (newest last), for step lookups.
  const mathOrderRef = useRef<string[]>([]);
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
  // Board items (b1, b2, …) and the tutor's presence (cursor + laser rings).
  const itemsRef = useRef<BoardItem[]>([]);
  const itemSeqRef = useRef(0);
  const presenceIdRef = useRef<TLInstancePresence["id"] | null>(null);
  const cursorAnimRef = useRef<number | null>(null);
  const scribbleAnimRef = useRef<number | null>(null);
  // The reveal queue: tool calls appear one after another, written not pasted.
  type RevealJob =
    | { kind: "reveal"; steps: RevealStep[]; restAt: ItemBounds | null }
    | { kind: "action"; run: () => void; wait: number };
  const revealQueueRef = useRef<RevealJob[]>([]);
  const revealActiveRef = useRef(false);
  const revealRafRef = useRef<number | null>(null);
  const revealWaitersRef = useRef<Array<() => void>>([]);
  const strokePointsRef = useRef<Map<string, Array<{ x: number; y: number }>>>(new Map());
  const revealTextRef = useRef<Map<string, string>>(new Map());
  const onWritingRef = useRef(onWriting);
  const handleRef = useRef<WhiteboardHandle | null>(null);
  const writingRef = useRef(false);
  useEffect(() => {
    onWritingRef.current = onWriting;
  }, [onWriting]);
  const cursorHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scribbleTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const colX = (col: "left" | "right") => col === "right" ? RIGHT_X : LEFT_X;
  const colY = (col: "left" | "right") => col === "right" ? rightY : leftY;
  const currentMeta = useCallback(() => compactArtifactMeta(jobMetaRef.current) ?? {}, []);

  // A typeset line as a shape: measured first so its box fits, then created.
  const createMath = useCallback((
    editor: Editor,
    opts: {
      latex: string;
      x: number;
      y?: number;
      centerY?: number;
      annotation?: string;
      display?: boolean;
      role?: "" | "label";
      color?: string;
      crossOut?: boolean;
      highlight?: MathHighlight;
      meta?: BoardArtifactMeta;
    },
  ): { id: TLShapeId; w: number; h: number; mathW: number } => {
    const display = opts.display ?? true;
    const m = measureMath(opts.latex, display, opts.annotation ?? "");
    const y = opts.centerY !== undefined ? opts.centerY - m.h / 2 : (opts.y ?? 0);
    const id = createShapeId();
    editor.createShape<TLMathShape>({
      id,
      type: "math",
      x: opts.x,
      y,
      props: {
        w: m.w,
        h: m.h,
        mathW: m.mathW,
        latex: opts.latex,
        color: opts.color ?? "#383838",
        display,
        annotation: opts.annotation ?? "",
        crossOut: opts.crossOut ?? false,
        highlight: opts.highlight ?? "",
        reveal: 1,
        role: opts.role ?? "",
      },
      meta: opts.meta ?? currentMeta(),
    });
    mathOrderRef.current = [...mathOrderRef.current, id];
    return { id, w: m.w, h: m.h, mathW: m.mathW };
  }, [currentMeta]);

  // Equation lines in creation order, as light records for step lookups.
  const mathLines = useCallback((editor: Editor): Array<MathLine & { shape: TLMathShape }> => {
    const out: Array<MathLine & { shape: TLMathShape }> = [];
    mathOrderRef.current = mathOrderRef.current.filter((id) => editor.getShape(id as TLShapeId));
    for (const id of mathOrderRef.current) {
      const shape = editor.getShape(id as TLShapeId) as TLMathShape | undefined;
      if (!shape || shape.type !== "math") continue;
      out.push({ id, latex: shape.props.latex, role: shape.props.role, meta: shape.meta as BoardArtifactMeta, shape });
    }
    return out;
  }, []);

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

  // ── Tutor presence: a collaborator cursor tldraw draws for us ──────────────
  const TUTOR_COLOR = "#2988f2";
  const ensurePresence = useCallback((editor: Editor): TLInstancePresence | null => {
    try {
      const existing = presenceIdRef.current ? (editor.store.get(presenceIdRef.current) as TLInstancePresence | undefined) : undefined;
      if (existing) return existing;
      const id = InstancePresenceRecordType.createId("tutor");
      const record = InstancePresenceRecordType.create({
        id,
        currentPageId: editor.getCurrentPageId(),
        userId: "tutor",
        userName: "Tutor",
        color: TUTOR_COLOR,
        cursor: null,
        lastActivityTimestamp: Date.now(),
        chatMessage: "",
        scribbles: [],
        selectedShapeIds: [],
        brush: null,
        screenBounds: null,
        followingUserId: null,
        camera: null,
        meta: {},
      });
      editor.store.put([record]);
      presenceIdRef.current = id;
      return editor.store.get(id) as TLInstancePresence;
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.warn("[TldrawCore] presence", err);
      return null;
    }
  }, []);

  const patchPresence = useCallback((editor: Editor, patch: Partial<TLInstancePresence>) => {
    const rec = ensurePresence(editor);
    if (!rec) return;
    editor.store.put([{ ...rec, ...patch, currentPageId: editor.getCurrentPageId(), lastActivityTimestamp: Date.now() }]);
  }, [ensurePresence]);

  const scheduleCursorHide = useCallback((editor: Editor, ms = 6000) => {
    if (cursorHideRef.current) clearTimeout(cursorHideRef.current);
    cursorHideRef.current = setTimeout(() => {
      cursorHideRef.current = null;
      if (editorRef.current === editor) patchPresence(editor, { cursor: null });
    }, ms);
  }, [patchPresence]);

  // Glide the pointer to a page point. A hidden pointer fades in from just
  // below-right of the target so it reads as "the tutor reached over".
  const moveCursor = useCallback((editor: Editor, x: number, y: number, duration = 420, done?: () => void) => {
    const rec = ensurePresence(editor);
    if (!rec) return;
    if (cursorAnimRef.current !== null) cancelAnimationFrame(cursorAnimRef.current);
    if (cursorHideRef.current) {
      clearTimeout(cursorHideRef.current);
      cursorHideRef.current = null;
    }
    const from = rec.cursor ? { x: rec.cursor.x, y: rec.cursor.y } : { x: x + 90, y: y + 70 };
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / Math.max(1, duration));
      const e = 1 - Math.pow(1 - p, 3);
      patchPresence(editor, { cursor: { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e, type: "default", rotation: 0 } });
      if (p < 1) {
        cursorAnimRef.current = requestAnimationFrame(step);
      } else {
        cursorAnimRef.current = null;
        scheduleCursorHide(editor);
        done?.();
      }
    };
    cursorAnimRef.current = requestAnimationFrame(step);
  }, [ensurePresence, patchPresence, scheduleCursorHide]);

  // A laser stroke drawn point by point under the pointer, held, then gone.
  const tutorScribble = useCallback((editor: Editor, points: Array<{ x: number; y: number }>, opts?: { duration?: number; hold?: number; size?: number }) => {
    const rec = ensurePresence(editor);
    if (!rec || points.length < 2) return;
    const duration = opts?.duration ?? 620;
    const hold = opts?.hold ?? 2800;
    const id = `tutor-scribble-${Date.now()}-${Math.round(Math.random() * 1e4)}`;
    const base = { id, size: opts?.size ?? 5, color: "accent" as const, opacity: 0.9, state: "active" as const, delay: 0, shrink: 0, taper: false };
    const others = () => ((editor.store.get(rec.id) as TLInstancePresence | undefined)?.scribbles ?? []).filter((sc) => sc.id !== id);
    // The stroke owns its own frame loop: a later cursor move must not cut
    // it short, or the hold and fade below would never be scheduled.
    if (cursorAnimRef.current !== null) cancelAnimationFrame(cursorAnimRef.current);
    cursorAnimRef.current = null;
    if (scribbleAnimRef.current !== null) cancelAnimationFrame(scribbleAnimRef.current);
    if (cursorHideRef.current) {
      clearTimeout(cursorHideRef.current);
      cursorHideRef.current = null;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const n = Math.max(2, Math.round(points.length * p));
      const head = points[n - 1];
      const steering = cursorAnimRef.current === null;
      patchPresence(editor, {
        scribbles: [...others(), { ...base, points: points.slice(0, n).map((pt) => ({ x: pt.x, y: pt.y, z: 0.5 })) }],
        ...(steering ? { cursor: { x: head.x, y: head.y, type: "default" as const, rotation: 0 } } : {}),
      });
      if (p < 1) {
        scribbleAnimRef.current = requestAnimationFrame(step);
        return;
      }
      scribbleAnimRef.current = null;
      if (steering) scheduleCursorHide(editor);
      const t1 = setTimeout(() => {
        patchPresence(editor, { scribbles: [...others(), { ...base, opacity: 0.35, state: "stopping", points: points.map((pt) => ({ x: pt.x, y: pt.y, z: 0.5 })) }] });
        const t2 = setTimeout(() => patchPresence(editor, { scribbles: others() }), 420);
        scribbleTimersRef.current.push(t2);
      }, hold);
      scribbleTimersRef.current.push(t1);
    };
    scribbleAnimRef.current = requestAnimationFrame(step);
  }, [ensurePresence, patchPresence, scheduleCursorHide]);

  // ── Reveal runtime ──────────────────────────────────────────────────────────
  const plainOf = useCallback((editor: Editor, richText: unknown): string => {
    try {
      return richText ? renderPlaintextFromRichText(editor, richText as Parameters<typeof renderPlaintextFromRichText>[1]) : "";
    } catch {
      return "";
    }
  }, []);


  const lineIndicesFor = (n: number): IndexKey[] => getIndices(Math.max(1, n - 1));

  // One frame of one step. `p` runs 0..1; the step's own state (original
  // props) is read from the shape on the first frame.
  const applyStep = useCallback((editor: Editor, step: RevealStep, p: number, state: { last?: number; fill?: string; closed?: boolean }) => {
    const shape = editor.getShape(step.id as TLShapeId);
    if (!shape) return;
    const props = shape.props as Record<string, unknown>;
    const run = (fn: () => void) => editor.run(fn, { history: "ignore" });
    if (step.kind === "eq") {
      const r = p >= 1 ? 1 : p;
      if (state.last !== undefined && Math.abs(state.last - r) < 0.02 && p < 1) return;
      state.last = r;
      run(() => editor.updateShapes([{ id: shape.id, type: "math", opacity: 1, props: { reveal: r } }] as unknown as Parameters<Editor["updateShapes"]>[0]));
      return;
    }
    if (step.kind === "text") {
      const full = revealTextRef.current.get(step.id) ?? plainOf(editor, props.richText);
      const text = typedPrefix(full, p);
      if (state.last === text.length && p < 1) return;
      state.last = text.length;
      run(() => editor.updateShapes([{ id: shape.id, type: shape.type, opacity: 1, props: { richText: toRichText(p >= 1 ? full : text) } }] as unknown as Parameters<Editor["updateShapes"]>[0]));
      return;
    }
    if (step.kind === "stroke") {
      const pts = strokePointsRef.current.get(step.id);
      if (!pts || pts.length < 2) {
        run(() => editor.updateShapes([{ id: shape.id, type: shape.type, opacity: 1 }]));
        return;
      }
      if (state.fill === undefined) {
        state.fill = String(props.fill ?? "none");
        state.closed = Boolean(props.isClosed);
      }
      const n = pointsShown(pts.length, p);
      if (state.last === n && p < 1) return;
      state.last = n;
      const done = p >= 1;
      run(() => editor.updateShapes([{
        id: shape.id,
        type: "draw",
        opacity: 1,
        props: {
          segments: compressLegacySegments([{ type: "free", points: (done ? pts : pts.slice(0, n)).map((pt) => ({ x: pt.x, y: pt.y, z: 0.5 })) }]),
          isClosed: done ? state.closed : false,
          fill: (done ? state.fill : "none") as TLDefaultFillStyle,
        },
      }]));
      return;
    }
    if (step.kind === "line") {
      const pts = strokePointsRef.current.get(step.id);
      if (!pts || pts.length < 2) {
        run(() => editor.updateShapes([{ id: shape.id, type: shape.type, opacity: 1 }]));
        return;
      }
      const n = pointsShown(pts.length, p);
      if (state.last === n && p < 1) return;
      state.last = n;
      const shown = pts.slice(0, n);
      const indices = lineIndicesFor(shown.length);
      const pointMap: Record<string, { id: string; index: IndexKey; x: number; y: number }> = {};
      shown.forEach((pt, i) => {
        const id = `a${i + 1}`;
        pointMap[id] = { id, index: indices[i], x: pt.x, y: pt.y };
      });
      run(() => editor.updateShapes([{ id: shape.id, type: "line", opacity: 1, props: { points: pointMap } }]));
      return;
    }
    // box / fade: a quick fade-in
    const op = Math.min(1, Math.max(0, p));
    if (state.last !== undefined && Math.abs(state.last - op) < 0.08 && p < 1) return;
    state.last = op;
    run(() => editor.updateShapes([{ id: shape.id, type: shape.type, opacity: op }]));
  }, [plainOf]);

  // Where the pen is at time `p` of a step, in page coordinates.
  const penAt = useCallback((editor: Editor, step: RevealStep, p: number): { x: number; y: number } | null => {
    const shape = editor.getShape(step.id as TLShapeId);
    if (!shape) return null;
    const b = editor.getShapePageBounds(shape.id);
    if (!b) return null;
    if (step.kind === "eq") {
      const mw = (shape.props as { mathW?: number }).mathW ?? b.w;
      return { x: b.x + mw * p, y: b.y + b.h * 0.7 };
    }
    if (step.kind === "stroke" || step.kind === "line") {
      const pts = strokePointsRef.current.get(step.id);
      if (pts && pts.length > 1) {
        const n = pointsShown(pts.length, p);
        const pt = pts[n - 1];
        return { x: shape.x + pt.x, y: shape.y + pt.y };
      }
      return { x: b.x + b.w * p, y: b.y + b.h * p };
    }
    if (step.kind === "text") {
      const props = shape.props as { font?: TLDefaultFontStyle; size?: TLDefaultSizeStyle };
      const full = revealTextRef.current.get(step.id) ?? "";
      const lineH = props.size ? FONT_PX[props.size] * LINE_HEIGHT : 28;
      const lines = Math.max(1, Math.round(b.h / lineH));
      const pos = p * lines;
      const line = Math.min(lines - 1, Math.floor(pos));
      const frac = pos - line;
      const lineW = Math.min(b.w, Math.max(40, (full.length / lines) * 9.5));
      return { x: b.x + lineW * frac, y: b.y + line * lineH + lineH * 0.75 };
    }
    return { x: b.x + b.w * Math.min(1, p * 1.2), y: b.y + b.h * Math.min(1, p * 1.2) };
  }, []);

  const finishReveal = useCallback(() => {
    revealActiveRef.current = false;
    revealRafRef.current = null;
    if (writingRef.current) {
      writingRef.current = false;
      onWritingRef.current?.(false);
    }
    const waiters = revealWaitersRef.current;
    revealWaitersRef.current = [];
    for (const w of waiters) w();
  }, []);

  const runQueue = useCallback(function runQueue() {
    if (revealActiveRef.current) return;
    const editor = editorRef.current;
    const job = revealQueueRef.current.shift();
    if (!editor || !job) {
      finishReveal();
      return;
    }
    revealActiveRef.current = true;
    if (job.kind === "action") {
      try {
        job.run();
      } catch (err) {
        if (process.env.NODE_ENV !== "production") console.warn("[TldrawCore] queued action", err);
      }
      const t = setTimeout(() => {
        revealActiveRef.current = false;
        runQueue();
      }, job.wait);
      scribbleTimersRef.current.push(t);
      return;
    }
    const steps = job.steps;
    if (steps.length === 0) {
      revealActiveRef.current = false;
      runQueue();
      return;
    }
    if (cursorAnimRef.current !== null) cancelAnimationFrame(cursorAnimRef.current);
    cursorAnimRef.current = null;
    if (cursorHideRef.current) {
      clearTimeout(cursorHideRef.current);
      cursorHideRef.current = null;
    }
    const GAP_BIG = 40;
    let i = 0;
    let phase: "lead" | "draw" = "lead";
    let phaseStart = performance.now();
    let waitUntil = 0;
    let leadMs = 0;
    let leadInit = false;
    let state: { last?: number; fill?: string; closed?: boolean } = {};
    const rec = ensurePresence(editor);
    let leadFrom: { x: number; y: number } | null = rec?.cursor ? { x: rec.cursor.x, y: rec.cursor.y } : null;
    const finishJob = () => {
      // Rest the pen just under what was written, then let it fade.
      if (job.restAt) moveCursor(editor, job.restAt.x + Math.min(job.restAt.w, 160) * 0.6, job.restAt.y + job.restAt.h + 16, 300);
      else scheduleCursorHide(editor);
      revealActiveRef.current = false;
      runQueue();
    };
    // Small pieces (ticks, dots, short labels) jump straight in and several
    // can finish in one frame; only big pieces get a pen glide and a pause.
    const frame = (now: number) => {
      for (let guard = 0; guard < 8; guard++) {
        const step = steps[i];
        if (!step) {
          finishJob();
          return;
        }
        if (phase === "lead") {
          if (now < waitUntil) break;
          const target = penAt(editor, step, 0);
          if (!target) {
            i++;
            state = {};
            continue;
          }
          const from = leadFrom ?? { x: target.x + 60, y: target.y + 40 };
          if (!leadInit) {
            const dist = Math.hypot(target.x - from.x, target.y - from.y);
            leadMs = step.duration > 200 && dist > 40 ? Math.min(130, dist * 0.6) : 0;
            phaseStart = now;
            leadInit = true;
          }
          const lp = leadMs <= 0 ? 1 : Math.min(1, (now - phaseStart) / leadMs);
          const e = 1 - Math.pow(1 - lp, 3);
          patchPresence(editor, { cursor: { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, type: "default", rotation: 0 } });
          if (lp < 1) break;
          phase = "draw";
          phaseStart = now;
          state = {};
          leadInit = false;
        }
        const p = step.duration <= 0 ? 1 : Math.min(1, (now - phaseStart) / step.duration);
        applyStep(editor, step, p, state);
        const pen = penAt(editor, step, p);
        if (pen) patchPresence(editor, { cursor: { x: pen.x, y: pen.y, type: "default", rotation: 0 } });
        if (p < 1) break;
        leadFrom = pen;
        i++;
        phase = "lead";
        state = {};
        const next = steps[i];
        const gap = next && next.duration > 200 ? GAP_BIG : 0;
        waitUntil = now + gap;
        if (gap > 0 || !next || next.duration > 120) break;
      }
      revealRafRef.current = requestAnimationFrame(frame);
    };
    revealRafRef.current = requestAnimationFrame(frame);
  }, [applyStep, ensurePresence, finishReveal, moveCursor, patchPresence, penAt, scheduleCursorHide]);

  const enqueue = useCallback((job: RevealJob) => {
    revealQueueRef.current.push(job);
    if (!writingRef.current) {
      writingRef.current = true;
      onWritingRef.current?.(true);
    }
    runQueue();
  }, [runQueue]);

  const resetReveal = useCallback(() => {
    revealQueueRef.current = [];
    if (revealRafRef.current !== null) cancelAnimationFrame(revealRafRef.current);
    finishReveal();
    strokePointsRef.current.clear();
    revealTextRef.current.clear();
  }, [finishReveal]);

  const awaitRevealIdle = useCallback((): Promise<void> => {
    if (!revealActiveRef.current && revealQueueRef.current.length === 0) return Promise.resolve();
    return new Promise((resolve) => revealWaitersRef.current.push(resolve));
  }, []);

  // Hide everything a tool call just created and queue it to be written.
  const revealItem = useCallback((editor: Editor, item: BoardItem, restAt: ItemBounds | null) => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const inputs: RevealInput[] = [];
    const hide: Array<{ id: TLShapeId; type: string }> = [];
    for (const sid of item.shapeIds) {
      const shape = editor.getShape(sid as TLShapeId);
      if (!shape) continue;
      const b = editor.getShapePageBounds(shape.id);
      const x = b?.x ?? shape.x;
      const y = b?.y ?? shape.y;
      const props = shape.props as Record<string, unknown>;
      const plain = "richText" in props ? plainOf(editor, props.richText) : "";
      if (shape.type === "math") {
        inputs.push({ id: shape.id, kind: "eq", x, y, chars: String(props.latex ?? "").length });
      } else if (shape.type === "draw") {
        const pts = strokePointsRef.current.get(shape.id);
        inputs.push({ id: shape.id, kind: "stroke", x, y, length: pts ? polylineLength(pts) : 240 });
      } else if (shape.type === "line") {
        const pts = strokePointsRef.current.get(shape.id);
        inputs.push({ id: shape.id, kind: "line", x, y, length: pts ? polylineLength(pts) : 240 });
      } else if (plain.length > 0 && (shape.type === "text" || shape.type === "note" || shape.type === "geo")) {
        revealTextRef.current.set(shape.id, plain);
        inputs.push({ id: shape.id, kind: "text", x, y, chars: plain.length });
      } else if (shape.type === "geo") {
        inputs.push({ id: shape.id, kind: "box", x, y });
      } else {
        inputs.push({ id: shape.id, kind: "fade", x, y });
      }
      hide.push({ id: shape.id, type: shape.type });
    }
    if (inputs.length === 0) return;
    const steps = planReveal(inputs);
    editor.run(() => {
      if (hide.length > 0) editor.updateShapes(hide.map((h) => ({ id: h.id, type: h.type, opacity: 0 })) as unknown as Parameters<Editor["updateShapes"]>[0]);
      const maths = hide.filter((h) => h.type === "math");
      if (maths.length > 0) editor.updateShapes(maths.map((h) => ({ id: h.id, type: "math", props: { reveal: 0 } })) as unknown as Parameters<Editor["updateShapes"]>[0]);
    }, { history: "ignore" });
    enqueue({ kind: "reveal", steps, restAt });
  }, [enqueue, plainOf]);

  const itemBounds = useCallback((editor: Editor, item: BoardItem): ItemBounds | null => {
    let box: ItemBounds | null = null;
    const add = (b: ItemBounds) => {
      if (!box) {
        box = { ...b };
        return;
      }
      const x = Math.min(box.x, b.x);
      const y = Math.min(box.y, b.y);
      const r = Math.max(box.x + box.w, b.x + b.w);
      const btm = Math.max(box.y + box.h, b.y + b.h);
      box = { x, y, w: r - x, h: btm - y };
    };
    for (const id of item.shapeIds) {
      const shape = editor.getShape(id as TLShapeId);
      const b = editor.getShapePageBounds(id as TLShapeId);
      if (!shape || !b) continue;
      if (shape.type === "text") {
        // A caption's text box is much wider than its words; measure the words
        // and place them by the shape's alignment so rings hug the text.
        const props = shape.props as { richText?: unknown; font?: TLDefaultFontStyle; size?: TLDefaultSizeStyle; textAlign?: string; w?: number; autoSize?: boolean };
        try {
          // While a line is still being written its text is partial; the
          // reveal keeps the full text, so bounds never come out empty.
          const plain = revealTextRef.current.get(shape.id) ?? (props.richText ? renderPlaintextFromRichText(editor, props.richText as Parameters<typeof renderPlaintextFromRichText>[1]) : "");
          if (plain && props.font && props.size && !props.autoSize) {
            const m = measureText(editor, plain, props.font, props.size, b.w);
            const w = Math.min(b.w, m.w + 8);
            const x = props.textAlign === "middle" ? b.x + (b.w - w) / 2 : props.textAlign === "end" ? b.x + b.w - w : b.x;
            add({ x, y: b.y, w, h: Math.min(b.h, m.h + 4) });
            continue;
          }
        } catch {
          // fall through to the raw bounds
        }
      }
      add({ x: b.x, y: b.y, w: b.w, h: b.h });
    }
    return box;
  }, []);

  useEffect(() => {
    const timers = scribbleTimersRef.current;
    return () => {
      if (cursorAnimRef.current !== null) cancelAnimationFrame(cursorAnimRef.current);
      if (scribbleAnimRef.current !== null) cancelAnimationFrame(scribbleAnimRef.current);
      if (revealRafRef.current !== null) cancelAnimationFrame(revealRafRef.current);
      if (cursorHideRef.current) clearTimeout(cursorHideRef.current);
      for (const t of timers) clearTimeout(t);
    };
  }, []);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __chalkEditor?: Editor }).__chalkEditor = editor;
      (window as unknown as { __chalkBoard?: WhiteboardHandle | null }).__chalkBoard = handleRef.current;
    }
    editor.setCurrentTool("hand");
    editor.setCamera({ x: 0, y: 0, z: 1 });
  }, []);

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
      /** Keep corners crisp: the freehand renderer rounds them off otherwise. */
      sharp?: boolean;
    },
  ) => {
    if (points.length < 2) return;
    if (opts.sharp) points = sharpenCorners(points);
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
    const id = createShapeId();
    strokePointsRef.current.set(id, rebased);
    editor.createShape({
      id,
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
    const id = createShapeId();
    strokePointsRef.current.set(id, rebased);
    editor.createShape({
      id,
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
      resetReveal();
      const shapes = editor.getCurrentPageShapes();
      if (shapes.length > 0) editor.deleteShapes(shapes.map(s => s.id));
      pageTop.current = 0;
      pageIndex.current = 1;
      leftY.current = START_Y;
      rightY.current = START_Y;
      mathOrderRef.current = [];
      markerRef.current = 0;
      semanticBoardRef.current = createEmptySemanticBoard();
      itemsRef.current = [];
    },

    startNewProblem(title: string) {
      const editor = editorRef.current;
      if (!editor) return;
      resetReveal();
      const shapes = editor.getCurrentPageShapes();
      if (shapes.length > 0) editor.deleteShapes(shapes.map(s => s.id));
      pageTop.current = 0;
      pageIndex.current = 1;
      leftY.current = START_Y;
      rightY.current = START_Y;
      mathOrderRef.current = [];
      markerRef.current = 0;
      semanticBoardRef.current = createEmptySemanticBoard(title);
      itemsRef.current = [];
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
      const line = createMath(editor, { latex, annotation, x, y, display: true });
      // Tall lines (stacked fractions, cases) take the room they need.
      const pitch = Math.max(EQ_H, line.h + 6);
      colY(col).current += pitch + EQ_ROW_GAP;
      focusOn(editor, x, y, Math.max(420, line.w), pitch);
      recordDirectSemanticAction(
        { type: "equation_sequence", steps: latex, annotations: annotation, column: col },
        { shapeIds: [line.id], bounds: { x, y, w: Math.max(420, line.w), h: EQ_H, column: col, pageIndex: pageIndex.current } },
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

    addFunctionGraph(expression: string, xMin: number, xMax: number, label?: string, column?: "left" | "right", extras?: GraphExtras) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "right";
      const W = 300;
      const H = 220;
      const fn = createMathEvaluator(expression);
      const fn2 = extras?.secondExpression ? createMathEvaluator(extras.secondExpression) : null;

      // Sample the curve(s), then pick a y-range that is padded, includes the
      // x-axis when it is nearby, and lands on round numbers.
      const samples: Pt[] = [];
      const samples2: Pt[] = [];
      let yMin = Infinity;
      let yMax = -Infinity;
      const sampleInto = (f: (v: number) => number, into: Pt[]) => {
        for (let i = 0; i <= 120; i++) {
          const sx = xMin + ((xMax - xMin) * i) / 120;
          try {
            const sy = f(sx);
            if (Number.isFinite(sy)) {
              into.push({ x: sx, y: sy });
              yMin = Math.min(yMin, sy);
              yMax = Math.max(yMax, sy);
            }
          } catch {
            // discontinuity; skip the sample
          }
        }
      };
      if (fn) sampleInto(fn, samples);
      if (fn2) sampleInto(fn2, samples2);
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
      if (fn2 && samples2.length >= 2) {
        const pen2 = takePens(1)[0];
        let run2: Pt[] = [];
        const flush2 = () => {
          if (run2.length >= 2) createLineShape(editor, undefined, undefined, run2, { color: pen2, size: "m", dash: "solid", spline: "line" });
          run2 = [];
        };
        samples2.forEach((s2, i) => {
          const prev = samples2[i - 1];
          if (prev && Math.abs(s2.y - prev.y) > (yHi - yLo) * 0.8) flush2();
          if (s2.y >= yLo && s2.y <= yHi) run2.push({ x: px(s2.x), y: py(s2.y) });
          else flush2();
        });
        flush2();
        // Where the curves cross: a sign change of the difference, refined.
        if (fn) {
          const diff = (v: number) => {
            try {
              const d = fn(v) - fn2(v);
              return Number.isFinite(d) ? d : NaN;
            } catch {
              return NaN;
            }
          };
          let found = 0;
          for (let i = 1; i <= 240 && found < 3; i++) {
            let a = xMin + ((xMax - xMin) * (i - 1)) / 240;
            let b = xMin + ((xMax - xMin) * i) / 240;
            let da = diff(a);
            let db = diff(b);
            if (!Number.isFinite(da) || !Number.isFinite(db) || da * db > 0) continue;
            for (let k = 0; k < 30; k++) {
              const m = (a + b) / 2;
              const dm = diff(m);
              if (!Number.isFinite(dm)) break;
              if (da * dm <= 0) {
                b = m;
                db = dm;
              } else {
                a = m;
                da = dm;
              }
            }
            const ix = (a + b) / 2;
            let iy = NaN;
            try {
              iy = fn(ix);
            } catch {
              // no point
            }
            if (!Number.isFinite(iy) || iy < yLo || iy > yHi) continue;
            found++;
            const gx = px(ix);
            const gy = py(iy);
            createFreeformGeo(editor, "ellipse", gx - 6, gy - 6, 12, 12, INK, "fill", { dash: "solid" });
            createText(editor, `(${formatNumber(ix)}, ${formatNumber(iy)})`, gx + 9, gy + 3, { color: INK, size: "s", font: "sans", width: 130 });
          }
        }
      }
      if (!fn) {
        createText(editor, "Could not read that expression", x, y + H / 2 - 12, { color: "red", size: "s", font: "sans", width: W, align: "middle" });
      }

      // Marked points and a slope triangle ride on the same axes.
      if (extras && (extras.markPoints.length > 0 || extras.slopeRun)) {
        const mpens = takePens(extras.markPoints.length + (extras.slopeRun ? 1 : 0));
        extras.markPoints.forEach((pt, i) => {
          const gx = px(pt.x);
          const gy = py(pt.y);
          const mp = mpens[i % mpens.length];
          createFreeformGeo(editor, "ellipse", gx - 6, gy - 6, 12, 12, mp, "fill", { dash: "solid" });
          if (pt.label) createText(editor, pt.label, gx + 9, gy + 3, { color: mp, size: "s", font: "sans", width: 140 });
        });
        if (extras.slopeRun && fn) {
          const { x1, x2 } = extras.slopeRun;
          let y1 = NaN;
          let y2 = NaN;
          try {
            y1 = fn(x1);
            y2 = fn(x2);
          } catch {
            // off the curve
          }
          if (Number.isFinite(y1) && Number.isFinite(y2)) {
            const sp = mpens[mpens.length - 1];
            const ax = px(x1);
            const ay = py(y1);
            const bx = px(x2);
            const by = py(y2);
            createLineShape(editor, undefined, undefined, [{ x: ax, y: ay }, { x: bx, y: ay }], { color: sp, size: "s", dash: "dashed" });
            createLineShape(editor, undefined, undefined, [{ x: bx, y: ay }, { x: bx, y: by }], { color: sp, size: "s", dash: "dashed" });
            createFreeformGeo(editor, "ellipse", ax - 5, ay - 5, 10, 10, sp, "fill", { dash: "solid" });
            createFreeformGeo(editor, "ellipse", bx - 5, by - 5, 10, 10, sp, "fill", { dash: "solid" });
            createText(editor, `run ${formatNumber(x2 - x1)}`, (ax + bx) / 2 - 45, by < ay ? ay + 14 : ay - 34, { color: sp, size: "s", font: "sans", width: 90, align: "middle" });
            createText(editor, `rise ${formatNumber(y2 - y1)}`, bx + 8, (ay + by) / 2 - 12, { color: sp, size: "s", font: "sans", width: 100 });
          }
        }
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
      const second = opts.secondMin !== undefined && opts.secondMax !== undefined && opts.secondMax !== opts.secondMin;
      const SECOND_DY = 70;
      const h = top + 46 + (second ? SECOND_DY : 0) + (opts.label ? 30 : 0);
      const tickStyle = opts.labelStyle ?? autoTickStyle(step);
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
      const dot = (cx: number, open: boolean, color: TldrawColor, dy = 0) =>
        createFreeformGeo(editor, "ellipse", cx - 7, lineY - 7 + dy, 14, 14, color, open ? "semi" : "fill", { dash: "solid" });

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
        createText(editor, formatTick(v, step, tickStyle), tx - 32, lineY + 14, { color: PENCIL, size: "s", font: "sans", width: 64, align: "middle" });
      }
      if (second) {
        // A double number line: same positions, a second scale of values.
        const y2 = lineY + SECOND_DY;
        const sMin = opts.secondMin as number;
        const sMax = opts.secondMax as number;
        arrow(x, x + w, { color: INK, size: "m", startHead: true, endHead: true, dy: SECOND_DY });
        for (const v of tickValues(min, max, step)) {
          const tx = px(v);
          const mapped = sMin + ((v - min) / (max - min)) * (sMax - sMin);
          createLine(editor, tx, y2 - 8, tx, y2 + 8, INK);
          createText(editor, formatNumber(mapped), tx - 32, y2 + 14, { color: PENCIL, size: "s", font: "sans", width: 64, align: "middle" });
        }
        if (opts.secondLabel) createText(editor, opts.secondLabel, x + w + 4, y2 - 12, { color: PENCIL, size: "s", font: "sans", width: 120 });
      }

      // Interval endpoints (open = hollow), then marked values.
      opts.intervals.forEach((iv, i) => {
        if (iv.from >= min && iv.from <= max) dot(px(iv.from), iv.openFrom, intervalPen(i));
        if (iv.to >= min && iv.to <= max) dot(px(iv.to), iv.openTo, intervalPen(i));
      });
      // Repeated values stack upward: a dot plot.
      const stacked = new Map<number, { count: number; first: number }>();
      opts.marks.forEach((m, i) => {
        const entry = stacked.get(m.value) ?? { count: 0, first: i };
        const k = entry.count;
        stacked.set(m.value, { count: k + 1, first: entry.first });
        dot(px(m.value), false, markPen(entry.first), -k * 16);
        if (m.label && k === 0) {
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
        createText(editor, opts.label, x, lineY + 44 + (second ? SECOND_DY : 0), { color: PENCIL, size: "s", font: "sans", width: w, align: "middle" });
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

    plotPoints(points: string, xMin: number, xMax: number, yMin: number, yMax: number, label?: string, column?: "left" | "right", connect?: boolean) {
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

      const placed: Pt[] = [];
      for (const point of parseCoordinatePoints(points)) {
        if (point.x < xMin || point.x > xMax || point.y < yMin || point.y > yMax) continue;
        const px = x + ((point.x - xMin) / (xMax - xMin)) * w;
        const py = y + h - ((point.y - yMin) / (yMax - yMin)) * h;
        placed.push({ x: px, y: py });
        createFreeformGeo(editor, "ellipse", px - 6, py - 6, 12, 12, pen, "fill", { dash: "solid" });
        if (point.label) {
          createText(editor, point.label, px + 8, py - 26, { color: pen, size: "s", font: "sans", width: 120 });
        }
      }
      if (connect && placed.length >= 2) {
        // Join the points in order and close the shape.
        createLineShape(editor, undefined, undefined, placed.length >= 3 ? [...placed, placed[0]] : placed, { color: pen, size: "m", dash: "solid", spline: "line" });
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

      let cy = y;
      const created = stepList.map((latex, index) => {
        const line = createMath(editor, { latex, annotation: annotationList[index], x, y: cy, display: true });
        cy += Math.max(EQ_H, line.h + 6) + EQ_ROW_GAP;
        return line;
      });

      if (created.length > 0) {
        if (stepList.length >= 2) {
          createLine(editor, x - 14, y + 12, x - 14, cy - EQ_ROW_GAP - 12, "light-violet");
        }
        y = cy;
      }

      colY(col).current = y;
      focusOn(editor, x, colY(col).current - totalHeight, 520, totalHeight);
      recordDirectSemanticAction(
        { type: "equation_sequence", steps, annotations, title, column: col },
        {
          shapeIds: created.map((line) => line.id),
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
      const labelIds: string[] = [];
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
              createDrawStroke(editor, undefined, undefined, pts, { color: pen, fill: "solid", dash: "solid", size: "s", isClosed: true, sharp: true });
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
        const label = createMath(editor, {
          latex: `= ${fractionLatex(f)}`,
          x: cursor + 12,
          centerY: y0 + modelH / 2,
          role: "label",
          display: false,
          color: MARKER_HEX[pen],
        });
        labelIds.push(label.id);
        cursor += 12 + Math.max(LABEL_W, label.w);
        right = cursor;
      });

      const w = Math.max(right - x0, 160);
      if (opts.label) {
        const captionW = Math.max(w, 360);
        createText(editor, opts.label, x0 + w / 2 - captionW / 2, y0 + modelH + 10, { color: PENCIL, size: "s", font: "sans", width: captionW, align: "middle" });
      }
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x0, y0, w, h);
      recordDirectSemanticAction(
        { type: "fraction", text: opts.fractions.map(fractionText).join(" and "), label: opts.label, column: col },
        { shapeIds: labelIds, bounds: { x: x0, y: y0, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    drawFigure(opts: FigureDrawing) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const PAD = 48;
      const SIZE: Record<FigureKind, [number, number]> = {
        rectangle: [260, 150], square: [200, 200], circle: [180, 180], triangle: [230, 170], right_triangle: [230, 170],
        parallelogram: [260, 140], trapezoid: [250, 140], rhombus: [230, 150], pentagon: [200, 200], hexagon: [210, 190],
        rectangular_prism: [270, 176], cube: [205, 190], cylinder: [150, 200],
      };
      const [fw, fh] = SIZE[opts.figure] ?? [230, 170];
      const w = fw + PAD * 2;
      const h = fh + PAD * 2 + (opts.label ? 22 : 0);
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const ox = x + PAD;
      const oy = y + PAD;
      const labelAt = (text: string, p: Pt, color: TldrawColor, width = 140) =>
        createText(editor, text, p.x - width / 2, p.y - 12, { color, size: "s", font: "sans", width, align: "middle" });
      const pens = takePens(opts.sideLabels.length + opts.angleLabels.length + (opts.radiusLabel ? 1 : 0) + (opts.diameterLabel ? 1 : 0) + (opts.heightLabel ? 1 : 0));
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
      } else if (opts.figure === "cylinder") {
        const rx = fw / 2;
        const ry = fw * 0.17;
        const cx = ox + rx;
        const topY = oy + ry;
        const botY = oy + fh - ry;
        const ell = (cy: number, a0: number, a1: number) => {
          const pts: Pt[] = [];
          for (let i = 0; i <= 18; i++) {
            const a = a0 + ((a1 - a0) * i) / 18;
            pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
          }
          return pts;
        };
        createLineShape(editor, undefined, undefined, [...ell(topY, 0, Math.PI * 2), ell(topY, 0, 0)[0]], { color: INK, size: "m", dash: "solid", spline: "cubic" });
        createLineShape(editor, undefined, undefined, ell(botY, 0, Math.PI), { color: INK, size: "m", dash: "solid", spline: "cubic" });
        createLineShape(editor, undefined, undefined, ell(botY, Math.PI, Math.PI * 2), { color: INK, size: "s", dash: "dashed", spline: "cubic" });
        createLine(editor, ox, topY, ox, botY, INK);
        createLine(editor, ox + fw, topY, ox + fw, botY, INK);
        if (opts.sideLabels[0]) {
          const pen = nextPen();
          createLine(editor, cx, topY, cx + rx, topY, pen);
          labelAt(opts.sideLabels[0], { x: cx + rx / 2, y: topY - 18 }, pen, 90);
        }
        if (opts.sideLabels[1]) {
          const pen = nextPen();
          labelAt(opts.sideLabels[1], { x: ox + fw + 34, y: (topY + botY) / 2 }, pen, 70);
        }
      } else if (isSolidFigure(opts.figure)) {
        // Cabinet projection: front face, then the back face shifted up and right.
        const dx = opts.figure === "cube" ? 55 : 70;
        const dy = opts.figure === "cube" ? 40 : 46;
        const bw = fw - dx;
        const bh = fh - dy;
        const F = { x: ox, y: oy + dy };
        const B = { x: ox + dx, y: oy };
        const seg = (a: Pt, b: Pt, dash: TLDefaultDashStyle = "solid") =>
          createLineShape(editor, undefined, undefined, [a, b], { color: INK, size: dash === "solid" ? "m" : "s", dash });
        // front face
        seg({ x: F.x, y: F.y }, { x: F.x + bw, y: F.y });
        seg({ x: F.x + bw, y: F.y }, { x: F.x + bw, y: F.y + bh });
        seg({ x: F.x + bw, y: F.y + bh }, { x: F.x, y: F.y + bh });
        seg({ x: F.x, y: F.y + bh }, { x: F.x, y: F.y });
        // top and right faces
        seg({ x: F.x, y: F.y }, { x: B.x, y: B.y });
        seg({ x: F.x + bw, y: F.y }, { x: B.x + bw, y: B.y });
        seg({ x: B.x, y: B.y }, { x: B.x + bw, y: B.y });
        seg({ x: F.x + bw, y: F.y + bh }, { x: B.x + bw, y: B.y + bh });
        seg({ x: B.x + bw, y: B.y }, { x: B.x + bw, y: B.y + bh });
        // hidden edges
        seg({ x: F.x, y: F.y + bh }, { x: B.x, y: B.y + bh }, "dashed");
        seg({ x: B.x, y: B.y }, { x: B.x, y: B.y + bh }, "dashed");
        seg({ x: B.x, y: B.y + bh }, { x: B.x + bw, y: B.y + bh }, "dashed");
        if (opts.sideLabels[0]) labelAt(opts.sideLabels[0], { x: F.x + bw / 2, y: F.y + bh + 18 }, nextPen(), 100);
        if (opts.sideLabels[1]) labelAt(opts.sideLabels[1], { x: F.x + bw + dx / 2 + 26, y: F.y + bh - dy / 2 + 12 }, nextPen(), 90);
        if (opts.sideLabels[2]) labelAt(opts.sideLabels[2], { x: F.x - 34, y: F.y + bh / 2 }, nextPen(), 70);
      } else {
        const pts = figureVertices(opts.figure, fw, fh).map((p) => ({ x: p.x + ox, y: p.y + oy }));
        createLineShape(editor, undefined, undefined, [...pts, pts[0]], { color: INK, size: "m", dash: "solid" });
        if (opts.markRightAngle && (opts.figure === "right_triangle" || opts.figure === "square" || opts.figure === "rectangle")) {
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
        if (opts.heightLabel) {
          const alt = altitude(pts);
          if (alt) {
            const pen = nextPen();
            const onEdge = Math.abs(alt.apex.x - pts[0].x) < 1 || Math.abs(alt.apex.x - pts[1].x) < 1;
            const left = Math.min(pts[0].x, pts[1].x);
            const right = Math.max(pts[0].x, pts[1].x);
            // Label on the roomier side so it clears a slanted edge.
            const sx = alt.foot.x - left > right - alt.foot.x ? -1 : 1;
            if (!onEdge) {
              createLineShape(editor, undefined, undefined, [alt.apex, alt.foot], { color: pen, size: "s", dash: "dashed" });
              const m = 11;
              createLineShape(editor, undefined, undefined, [{ x: alt.foot.x, y: alt.foot.y - m }, { x: alt.foot.x + m * sx, y: alt.foot.y - m }, { x: alt.foot.x + m * sx, y: alt.foot.y }], { color: INK, size: "s", dash: "solid" });
            }
            labelAt(opts.heightLabel, { x: alt.apex.x + 30 * sx, y: (alt.apex.y + alt.foot.y) / 2 }, pen, 80);
          }
        }
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

    drawTapeDiagram(opts: TapeDrawing) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const SEG_H = 42;
      const GAP = 14;
      const maxSeg = Math.max(1, ...opts.rows.map((r) => r.segments.length));
      const SEG_W = clamp(Math.floor(360 / maxSeg), 44, 92);
      const nameW = opts.rows.some((r) => r.name)
        ? Math.max(...opts.rows.map((r) => (r.name ? measureText(editor, r.name, "sans", "s", null).w : 0))) + 18
        : 0;
      const totalW = opts.rows.some((r) => r.total)
        ? Math.max(...opts.rows.map((r) => (r.total ? measureText(editor, `= ${r.total}`, "sans", "s", null).w : 0))) + 18
        : 0;
      const braceW = opts.totalLabel ? measureText(editor, opts.totalLabel, "sans", "s", null).w + 36 : 0;
      const rowsH = opts.rows.length * SEG_H + (opts.rows.length - 1) * GAP;
      const w = nameW + maxSeg * SEG_W + totalW + braceW + 8;
      const h = rowsH + (opts.label ? 34 : 0) + 8;
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const pens = takePens(opts.rows.length);
      opts.rows.forEach((row, ri) => {
        const ry = y + ri * (SEG_H + GAP);
        if (row.name) createText(editor, row.name, x, ry + 9, { color: INK, size: "s", font: "sans", width: nameW - 12, align: "end" });
        row.segments.forEach((segment, si) => {
          createBox(editor, x + nameW + si * SEG_W, ry, SEG_W, SEG_H, segment.text, segment.shaded ? pens[ri] : INK, segment.shaded ? "solid" : "none", { font: "sans", size: "s", dash: "solid" });
        });
        if (row.total) {
          createText(editor, `= ${row.total}`, x + nameW + row.segments.length * SEG_W + 10, ry + 9, { color: pens[ri], size: "s", font: "sans", width: totalW });
        }
      });
      if (opts.totalLabel) {
        const bx = x + nameW + maxSeg * SEG_W + totalW + 10;
        createLineShape(editor, undefined, undefined, [{ x: bx, y }, { x: bx + 10, y }, { x: bx + 10, y: y + rowsH }, { x: bx, y: y + rowsH }], { color: INK, size: "s", dash: "solid" });
        createText(editor, opts.totalLabel, bx + 18, y + rowsH / 2 - 12, { color: INK, size: "s", font: "sans", width: braceW - 18 });
      }
      if (opts.label) createText(editor, opts.label, x, y + rowsH + 12, { color: PENCIL, size: "s", font: "sans", width: w, align: "middle" });
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "tape_diagram", label: opts.label, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    drawGrid(opts: GridDrawing) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const CELL = clamp(Math.floor(320 / Math.max(opts.rows, opts.columns)), 14, 30);
      const gw = opts.columns * CELL;
      const gh = opts.rows * CELL;
      const w = gw + 8;
      const h = gh + (opts.label ? 34 : 0) + 8;
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const ox = x + 4;
      const oy = y + 4;
      const bands = (opts.shadeRows ?? 0) > 0 || (opts.shadeColumns ?? 0) > 0;
      const pens = takePens(bands ? 2 : 1);
      const pen = pens[0];
      if (bands) {
        // A fraction of a fraction: rows tinted, columns hatched, the overlap shows both.
        const sr = clamp(Math.round(opts.shadeRows ?? 0), 0, opts.rows);
        const sc = clamp(Math.round(opts.shadeColumns ?? 0), 0, opts.columns);
        if (sr > 0) createBox(editor, ox, oy, gw, sr * CELL, "", pens[0], "solid", { dash: "solid" });
        if (sc > 0) createBox(editor, ox, oy, sc * CELL, gh, "", pens[1], "solid", { dash: "solid" });
        // The product: where both bands cover, in full colour.
        if (sr > 0 && sc > 0) createBox(editor, ox, oy, sc * CELL, sr * CELL, "", pens[0], "fill", { dash: "solid" });
      } else {
        const shaded = clamp(Math.round(opts.shaded), 0, opts.rows * opts.columns);
        const full = Math.floor(shaded / opts.columns);
        const rem = shaded % opts.columns;
        if (full > 0) createBox(editor, ox, oy, gw, full * CELL, "", pen, "solid", { dash: "solid" });
        if (rem > 0) createBox(editor, ox, oy + full * CELL, rem * CELL, CELL, "", pen, "solid", { dash: "solid" });
      }
      for (let r = 0; r <= opts.rows; r++) {
        createLineShape(editor, undefined, undefined, [{ x: ox, y: oy + r * CELL }, { x: ox + gw, y: oy + r * CELL }], { color: INK, size: "s", dash: "solid" });
      }
      for (let c = 0; c <= opts.columns; c++) {
        createLineShape(editor, undefined, undefined, [{ x: ox + c * CELL, y: oy }, { x: ox + c * CELL, y: oy + gh }], { color: INK, size: "s", dash: "solid" });
      }
      if (opts.label) {
        const cw = Math.max(w, 240);
        createText(editor, opts.label, x + (w - cw) / 2, oy + gh + 12, { color: PENCIL, size: "s", font: "sans", width: cw, align: "middle" });
      }
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "grid", label: opts.label, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    writeVertical(opts: VerticalDrawing) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const digitW = measureText(editor, "0", "mono", "m", null).w || 14;
      const lineH = FONT_PX.m * LINE_HEIGHT;
      const OP_W = 30;
      const longest = Math.max(...[...opts.operands, opts.result ?? "", ...opts.partials, opts.carries ?? ""].map((t) => t.length));
      const numW = longest * digitW + 8;
      const w = OP_W + numW + 8;
      const lines = (opts.carries ? 0.8 : 0) + opts.operands.length + opts.partials.length + (opts.result ? 1 : 0);
      const rules = 1 + (opts.partials.length > 0 && opts.result ? 1 : 0);
      const h = lines * lineH + rules * 10 + (opts.label ? 30 : 0) + 8;
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const pens = takePens(2);
      let cy = y;
      const write = (text: string, color: TldrawColor) => {
        createText(editor, text, x + OP_W, cy, { color, size: "m", font: "mono", width: numW, align: "end" });
        cy += lineH;
      };
      if (opts.carries) {
        createText(editor, opts.carries, x + OP_W, cy + 4, { color: PENCIL, size: "s", font: "mono", width: numW, align: "end" });
        cy += lineH * 0.8;
      }
      opts.operands.forEach((operand, i) => {
        if (i === opts.operands.length - 1) createText(editor, opts.operation, x, cy, { color: INK, size: "m", font: "mono", width: OP_W });
        write(operand, INK);
      });
      const rule = () => {
        createLineShape(editor, undefined, undefined, [{ x, y: cy + 2 }, { x: x + w, y: cy + 2 }], { color: INK, size: "m", dash: "solid" });
        cy += 10;
      };
      rule();
      if (opts.partials.length > 0) {
        opts.partials.forEach((partial) => write(partial, pens[1]));
        if (opts.result) rule();
      }
      if (opts.result) write(opts.result, pens[0]);
      if (opts.label) createText(editor, opts.label, x, cy + 2, { color: PENCIL, size: "s", font: "sans", width: Math.max(w, 200), align: "start" });
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, Math.max(w, 200), h);
      recordDirectSemanticAction(
        { type: "vertical_arithmetic", text: opts.operands.join(` ${opts.operation} `), label: opts.label, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    drawLongDivision(opts: LongDivisionDrawing) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const digitW = measureText(editor, "0", "mono", "m", null).w || 14;
      const lineH = FONT_PX.m * LINE_HEIGHT;
      const divisorW = opts.divisor.length * digitW + 10;
      const widest = Math.max(opts.dividend.length, (opts.quotient ?? "").length, ...opts.steps.map((t) => t.length));
      const dividendW = widest * digitW + 10;
      const w = divisorW + 12 + dividendW + 8;
      const h = lineH * (2 + opts.steps.length) + opts.steps.filter((t) => /^\s*[-−]/.test(t)).length * 6 + (opts.label ? 30 : 0) + 8;
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const pens = takePens(2);
      const bx = x + divisorW + 6;
      const barY = y + lineH;
      if (opts.quotient) createText(editor, opts.quotient, bx + 6, y, { color: pens[0], size: "m", font: "mono", width: dividendW, align: "end" });
      createLineShape(editor, undefined, undefined, [{ x: bx, y: barY + 2 }, { x: bx, y: barY + lineH }], { color: INK, size: "m", dash: "solid" });
      createLineShape(editor, undefined, undefined, [{ x: bx, y: barY + 2 }, { x: bx + dividendW + 8, y: barY + 2 }], { color: INK, size: "m", dash: "solid" });
      createText(editor, opts.divisor, x, barY + 4, { color: INK, size: "m", font: "mono", width: divisorW, align: "end" });
      createText(editor, opts.dividend, bx + 6, barY + 4, { color: INK, size: "m", font: "mono", width: dividendW, align: "end" });
      let cy = barY + lineH + 6;
      for (const step of opts.steps) {
        const sub = /^\s*[-−]/.test(step);
        // Leading spaces place the line under the right digits.
        const lead = step.length - step.trimStart().length;
        createText(editor, step.trimStart(), bx + 6 + lead * digitW, cy, { color: sub ? pens[1] : INK, size: "m", font: "mono", width: Math.max(digitW * 2, dividendW - lead * digitW), align: "start" });
        cy += lineH;
        if (sub) {
          createLineShape(editor, undefined, undefined, [{ x: bx + 6, y: cy - 4 }, { x: bx + 6 + dividendW, y: cy - 4 }], { color: INK, size: "s", dash: "solid" });
          cy += 6;
        }
      }
      if (opts.label) createText(editor, opts.label, x, cy + 2, { color: PENCIL, size: "s", font: "sans", width: Math.max(w, 220) });
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, Math.max(w, 220), h);
      recordDirectSemanticAction(
        { type: "long_division", text: `${opts.dividend} ÷ ${opts.divisor}`, label: opts.label, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    drawTransversal(opts: TransversalDrawing) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const W = 320;
      const H = 200;
      const PAD = 34;
      const w = W + PAD * 2;
      const h = H + PAD * 2 + (opts.label ? 30 : 0);
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const ox = x + PAD;
      const oy = y + PAD;
      const y1 = oy + 46;
      const y2 = oy + H - 46;
      const t0 = { x: ox + 70, y: oy + H };
      const t1 = { x: ox + W - 70, y: oy };
      const xAt = (yy: number) => t0.x + ((t0.y - yy) / (t0.y - t1.y)) * (t1.x - t0.x);
      createLineShape(editor, undefined, undefined, [{ x: ox, y: y1 }, { x: ox + W, y: y1 }], { color: INK, size: "m", dash: "solid" });
      createLineShape(editor, undefined, undefined, [{ x: ox, y: y2 }, { x: ox + W, y: y2 }], { color: INK, size: "m", dash: "solid" });
      createLineShape(editor, undefined, undefined, [t0, t1], { color: INK, size: "m", dash: "solid" });
      const chevron = (yy: number) =>
        createLineShape(editor, undefined, undefined, [{ x: ox + W - 50, y: yy - 6 }, { x: ox + W - 42, y: yy }, { x: ox + W - 50, y: yy + 6 }], { color: INK, size: "s", dash: "solid" });
      chevron(y1);
      chevron(y2);
      const tl = Math.hypot(t1.x - t0.x, t1.y - t0.y) || 1;
      const tv = { x: (t1.x - t0.x) / tl, y: (t1.y - t0.y) / tl };
      const hv = { x: 1, y: 0 };
      const neg = (v: Pt) => ({ x: -v.x, y: -v.y });
      const regions: Array<[Pt, Pt]> = [[neg(hv), tv], [tv, hv], [hv, neg(tv)], [neg(tv), neg(hv)]];
      const centers = [{ x: xAt(y1), y: y1 }, { x: xAt(y2), y: y2 }];
      const pens = takePens(Math.max(1, opts.marks.length));
      let markIdx = 0;
      const labelAt = (text: string, p: Pt, color: TldrawColor) =>
        createText(editor, text, p.x - 28, p.y - 12, { color, size: "s", font: "sans", width: 56, align: "middle" });
      centers.forEach((c, ci) => {
        regions.forEach(([a, b], ri) => {
          const idx = ci * 4 + ri;
          const bis = { x: a.x + b.x, y: a.y + b.y };
          const bl = Math.hypot(bis.x, bis.y) || 1;
          const label = opts.angleLabels[idx];
          if (label) labelAt(label, { x: c.x + (bis.x / bl) * 34, y: c.y + (bis.y / bl) * 34 }, INK);
          if (opts.marks.includes(idx + 1)) {
            const pen = pens[markIdx++ % pens.length];
            const a0 = Math.atan2(a.y, a.x);
            let sweep = Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
            if (sweep < 0) sweep += 0;
            const pts: Pt[] = [];
            for (let i = 0; i <= 12; i++) {
              const ang = a0 + (sweep * i) / 12;
              pts.push({ x: c.x + 18 * Math.cos(ang), y: c.y + 18 * Math.sin(ang) });
            }
            createDrawStroke(editor, undefined, undefined, pts, { color: pen, size: "s", dash: "solid", fill: "none", isClosed: false });
          }
        });
      });
      if (opts.label) createText(editor, opts.label, x, oy + H + PAD - 6, { color: PENCIL, size: "s", font: "sans", width: w, align: "middle" });
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "transversal", label: opts.label, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    drawIcons(opts: IconsDrawing) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "left";
      const ICON = 44;
      const GAP = 8;
      const GROUP_GAP = 24;
      const BLOCK_GAP = 18;
      const specs = [
        { icon: opts.icon, count: opts.count, crossed: opts.crossed ?? 0 },
        ...(opts.secondIcon && opts.secondCount ? [{ icon: opts.secondIcon, count: opts.secondCount, crossed: 0 }] : []),
      ];
      const groupSize = opts.groupSize && opts.groupSize >= 2 ? opts.groupSize : 0;
      const perRowFor = (count: number) => (groupSize ? groupSize * Math.max(1, Math.floor(10 / groupSize)) : Math.min(count, 10));
      const blockWidth = (count: number) => {
        const perRow = Math.min(count, perRowFor(count));
        const groups = groupSize ? Math.ceil(perRow / groupSize) : 1;
        return perRow * ICON + (perRow - 1) * GAP + (groups - 1) * (GROUP_GAP - GAP);
      };
      const blockHeight = (count: number) => Math.ceil(count / perRowFor(count)) * (ICON + GAP) - GAP;
      const countW = 56;
      const w = Math.max(...specs.map((sp) => blockWidth(sp.count))) + countW + 8;
      const h = specs.reduce((sum, sp) => sum + blockHeight(sp.count), 0) + (specs.length - 1) * BLOCK_GAP + (opts.label ? 34 : 0) + 4;
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      let cy = y;
      specs.forEach((sp) => {
        const perRow = perRowFor(sp.count);
        for (let i = 0; i < sp.count; i++) {
          const row = Math.floor(i / perRow);
          const colIdx = i % perRow;
          const g = groupSize ? Math.floor(colIdx / groupSize) : 0;
          const ix = x + colIdx * (ICON + GAP) + g * (GROUP_GAP - GAP);
          const iy = cy + row * (ICON + GAP);
          editor.createShape<TLIconShape>({
            id: createShapeId(),
            type: "icon",
            x: ix,
            y: iy,
            props: { w: ICON, h: ICON, icon: sp.icon, crossed: i >= sp.count - sp.crossed, reveal: 1 },
            meta: currentMeta(),
          });
        }
        const bh = blockHeight(sp.count);
        createText(editor, `${sp.count}`, x + blockWidth(sp.count) + 10, cy + Math.min(bh, ICON) / 2 - 12, { color: PENCIL, size: "s", font: "sans", width: countW });
        cy += bh + BLOCK_GAP;
      });
      if (opts.label) {
        const cw = Math.max(w, 260);
        createText(editor, opts.label, x + (w - cw) / 2, cy - BLOCK_GAP + 10, { color: PENCIL, size: "s", font: "sans", width: cw, align: "middle" });
      }
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "icons", text: `${opts.count} ${opts.icon}`, label: opts.label, column: col },
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
      const adj = opts.adjacentDegrees && opts.adjacentDegrees > 0 && deg + opts.adjacentDegrees < 360 ? opts.adjacentDegrees : 0;
      const rad2 = (-(deg + adj) * Math.PI) / 180;
      const ex2 = adj ? Math.cos(rad2) * L : 0;
      const ey2 = adj ? Math.sin(rad2) * L : 0;
      const PAD = 40;
      const minX = Math.min(0, ex, ex2);
      const maxX = Math.max(L, ex, ex2);
      const minY = Math.min(0, ey, ey2);
      const maxY = Math.max(0, ey, ey2);
      const w = maxX - minX + PAD * 2;
      const h = maxY - minY + PAD * 2 + (opts.caption ? 22 : 0);
      ensureColumnRoom(editor, col, h + ROW_GAP);
      const x = colX(col);
      const y = colY(col).current;
      const vx = x + PAD - minX;
      const vy = y + PAD - minY;
      const [pen, pen2] = takePens(adj ? 2 : 1);
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
      if (adj) {
        ray(vx + ex2, vy + ey2);
        createDrawStroke(editor, undefined, undefined, arcPolyline(vx, vy, 60, -deg, -(deg + adj), 4), { color: pen2, size: "s", dash: "solid", fill: "none", isClosed: false });
        const mid2 = (-(deg + adj / 2) * Math.PI) / 180;
        createText(editor, opts.adjacentLabel ?? `${adj}°`, vx + Math.cos(mid2) * 86 - 40, vy + Math.sin(mid2) * 86 - 12, { color: pen2, size: "s", font: "sans", width: 80, align: "middle" });
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
          const filled = opts.shaded === undefined || r * opts.columns + c < opts.shaded;
          createFreeformGeo(editor, "ellipse", ox + c * SP + (SP - DOT) / 2, oy + r * SP + (SP - DOT) / 2, DOT, DOT, second ? pens[1] : pens[0], filled ? "fill" : "none", { dash: "solid" });
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
      const editor = editorRef.current;
      if (!editor) return false;
      const lines = mathLines(editor);
      const idx = resolveEqIndex(lines, target);
      if (idx < 0) {
        // Not an equation line: ring, underline, or box any item by label
        // (a student's attempt, a note) with a green marker.
        const item = target.step_label ? resolveItemTarget(itemsRef.current, target.step_label) : null;
        const b = item ? itemBounds(editor, item) : null;
        if (!item || !b) return false;
        if (style === "circle") {
          createDrawStroke(editor, undefined, undefined, ringPoints(b, 10), { color: "green", size: "m", dash: "solid", fill: "none", isClosed: false });
        } else if (style === "underline") {
          createLineShape(editor, undefined, undefined, [{ x: b.x - 4, y: b.y + b.h + 6 }, { x: b.x + b.w + 4, y: b.y + b.h + 6 }], { color: "green", size: "m", dash: "solid" });
        } else {
          createBox(editor, b.x - 8, b.y - 6, b.w + 16, b.h + 12, "", "green", "none", { dash: "dashed" });
        }
        recordDirectSemanticAction(
          { type: "highlight_step", step_label: target.step_label, style },
          { shapeIds: [], bounds: { x: b.x, y: b.y, w: b.w, h: b.h, pageIndex: pageIndex.current } },
        );
        return true;
      }
      const line = lines[idx];
      editor.updateShapes([{ id: line.shape.id, type: "math", props: { highlight: style } }] as unknown as Parameters<Editor["updateShapes"]>[0]);
      const b = editor.getShapePageBounds(line.shape.id);
      recordDirectSemanticAction(
        { type: "highlight_step", step_label: target.step_label, step_index: target.step_index, style },
        { shapeIds: [line.id], bounds: b ? { x: b.x, y: b.y, w: b.w, h: b.h, pageIndex: pageIndex.current } : undefined },
      );
      return true;
    },

    crossOutStep(target: StepTarget) {
      const editor = editorRef.current;
      if (!editor) return false;
      const lines = mathLines(editor);
      const idx = resolveEqIndex(lines, target);
      if (idx < 0) {
        // Not an equation line: strike through any item by label in red.
        const item = target.step_label ? resolveItemTarget(itemsRef.current, target.step_label) : null;
        const b = item ? itemBounds(editor, item) : null;
        if (!item || !b) return false;
        createLineShape(editor, undefined, undefined, [{ x: b.x - 6, y: b.y + b.h * 0.55 }, { x: b.x + b.w + 6, y: b.y + b.h * 0.45 }], { color: "red", size: "m", dash: "solid" });
        recordDirectSemanticAction(
          { type: "cross_out_step", step_label: target.step_label },
          { shapeIds: [], bounds: { x: b.x, y: b.y, w: b.w, h: b.h, pageIndex: pageIndex.current } },
        );
        return true;
      }
      const line = lines[idx];
      editor.updateShapes([{ id: line.shape.id, type: "math", props: { crossOut: true } }] as unknown as Parameters<Editor["updateShapes"]>[0]);
      const b = editor.getShapePageBounds(line.shape.id);
      recordDirectSemanticAction(
        { type: "cross_out_step", step_label: target.step_label, step_index: target.step_index },
        { shapeIds: [line.id], bounds: b ? { x: b.x, y: b.y, w: b.w, h: b.h, pageIndex: pageIndex.current } : undefined },
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
        semanticBoardRef.current = applySemanticBoardAction(
          semanticBoardRef.current,
          action,
          meta,
          {
            shapeIds: createdShapeIds,
            eqItemIds: [],
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
        eqItems: [],
        items: [...itemsRef.current],
        itemSeq: itemSeqRef.current,
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
      return formatBoardItems(itemsRef.current, semanticBoardRef.current.title);
    },

    beginItem(tool: string): ItemToken {
      const editor = editorRef.current;
      return {
        tool,
        shapes: editor ? currentShapeIdSet(editor) : new Set<string>(),
        eqs: new Set<string>(),
      };
    },

    endItem(token: ItemToken, label: string | null, owner: "tutor" | "student" = "tutor"): string | null {
      const editor = editorRef.current;
      if (!editor) return null;
      const shapeIds = diffStringSet(currentShapeIdSet(editor), token.shapes);
      const eqItemIds: string[] = [];
      if (shapeIds.length === 0) return null;
      const id = `b${++itemSeqRef.current}`;
      const item: BoardItem = {
        id,
        tool: token.tool,
        label: itemLabelFrom(label, token.tool.replaceAll("_", " ")),
        shapeIds,
        eqItemIds,
        owner: token.tool === "add_student_attempt" ? "student" : owner,
        createdAt: Date.now(),
      };
      itemsRef.current = [...itemsRef.current, item].slice(-200);
      try {
        const updates = shapeIds
          .map((shapeId) => editor.getShape(shapeId as TLShapeId))
          .filter((shape): shape is NonNullable<typeof shape> => Boolean(shape))
          .map((shape) => ({ id: shape.id, type: shape.type, meta: { ...shape.meta, itemId: id } }));
        if (updates.length > 0) editor.updateShapes(updates);
      } catch {
        // Tagging is a nicety; the registry is the source of truth.
      }
      // Written, not pasted: hide what was just created and reveal it in order.
      revealItem(editor, item, itemBounds(editor, item));
      return id;
    },

    pointAt(target: string) {
      const editor = editorRef.current;
      if (!editor) return null;
      const item = resolveItemTarget(itemsRef.current, target);
      if (!item) return null;
      const b = itemBounds(editor, item);
      if (!b) return null;
      enqueue({
        kind: "action",
        wait: 520,
        run: () => {
          const bb = itemBounds(editor, item) ?? b;
          focusOn(editor, bb.x, bb.y, bb.w, bb.h);
          const px = bb.x + Math.min(40, bb.w * 0.25);
          const py = bb.y + bb.h * 0.6;
          // Glide over, then a small dip to the right and back: a tap.
          moveCursor(editor, px, py, 420, () => {
            moveCursor(editor, px + 14, py + 8, 150, () => moveCursor(editor, px, py, 150));
          });
        },
      });
      return item;
    },

    circleItem(target: string, keep: boolean) {
      const editor = editorRef.current;
      if (!editor) return null;
      const item = resolveItemTarget(itemsRef.current, target);
      if (!item) return null;
      const b = itemBounds(editor, item);
      if (!b) return null;
      focusOn(editor, b.x - 16, b.y - 16, b.w + 32, b.h + 32);
      const ring = ringPoints(b, 12);
      if (keep) {
        // A marker ring is a real stroke: it registers as an item and is
        // written like everything else.
        createDrawStroke(editor, undefined, undefined, ring, { color: "orange", size: "m", dash: "solid", fill: "none", isClosed: false });
        recordDirectSemanticAction(
          { type: "highlight_step", step_label: item.label, style: "circle" },
          { shapeIds: [], bounds: { x: b.x, y: b.y, w: b.w, h: b.h, pageIndex: pageIndex.current } },
        );
      } else {
        enqueue({
          kind: "action",
          wait: 700,
          run: () => {
            const bb = itemBounds(editor, item) ?? b;
            tutorScribble(editor, ringPoints(bb, 12), { duration: 640, hold: 3000, size: 5 });
          },
        });
      }
      return item;
    },

    eraseItems(targets: string[]) {
      const editor = editorRef.current;
      if (!editor) return [];
      const erased: string[] = [];
      const goneIds = new Set<string>();
      // Closing the gap: everything lower in the same column moves up by the
      // erased item's height, so the board does not keep holes.
      const reflow = (b: ItemBounds) => {
        // Headings and anything spanning both columns stay put.
        const spansBoth = b.x < RIGHT_X - 20 && b.x + b.w > RIGHT_X + 60;
        if (spansBoth || b.y < START_Y - 10) return;
        const col: "left" | "right" = b.x >= RIGHT_X - 20 ? "right" : "left";
        const inCol = (sx: number) => (sx >= RIGHT_X - 20) === (col === "right");
        const dy = b.h + ROW_GAP;
        const movers = editor.getCurrentPageShapes().filter((s) => inCol(s.x) && s.y > b.y + b.h - 2);
        if (movers.length > 0) {
          editor.run(() => editor.updateShapes(movers.map((s) => ({ id: s.id, type: s.type, y: s.y - dy })) as unknown as Parameters<Editor["updateShapes"]>[0]), { history: "ignore" });
        }
        const cursor = col === "right" ? rightY : leftY;
        cursor.current = Math.max(START_Y, cursor.current - dy);
      };
      for (const target of targets) {
        const item = resolveItemTarget(itemsRef.current.filter((i) => !goneIds.has(i.id)), target);
        if (!item) continue;
        goneIds.add(item.id);
        erased.push(item.label);
        const bounds = itemBounds(editor, item);
        const shapeIds = item.shapeIds.filter((id) => editor.getShape(id as TLShapeId)).map((id) => id as TLShapeId);
        if (shapeIds.length > 0) editor.deleteShapes(shapeIds);
        if (bounds) reflow(bounds);
        mathOrderRef.current = mathOrderRef.current.filter((mid) => editor.getShape(mid as TLShapeId));
        recordDirectSemanticAction({ type: "delete_shape", target_ids: item.shapeIds });
      }
      if (goneIds.size > 0) itemsRef.current = itemsRef.current.filter((i) => !goneIds.has(i.id));
      return erased;
    },

    eraseOlder(keep: number) {
      const body = itemsRef.current.filter((i) => !isHeadingItem(i));
      const n = Math.max(0, Math.min(body.length, Math.floor(keep)));
      const victims = body.slice(0, body.length - n);
      if (victims.length === 0) return [];
      return api.eraseItems(victims.map((v) => v.id));
    },

    async exportImage(maxWidth = 1024) {
      const editor = editorRef.current;
      if (!editor) return null;
      await awaitRevealIdle();
      const ids = editor.getCurrentPageShapeIds();
      if (ids.size === 0) return null;
      try {
        // Every shape exports itself, math included (as plain text).
        const bounds = editor.getCurrentPageBounds();
        const scale = bounds && bounds.w > maxWidth ? maxWidth / bounds.w : 1;
        const out = await editor.toImageDataUrl(Array.from(ids), { format: "jpeg", quality: 0.72, scale, pixelRatio: 1, background: true, padding: 24 });
        return out ? { url: out.url, width: out.width, height: out.height } : null;
      } catch (err) {
        if (process.env.NODE_ENV !== "production") console.warn("[TldrawCore] exportImage", err);
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
      // Math shapes came back with the store; old overlay items become shapes.
      mathOrderRef.current = editor.getCurrentPageShapesSorted().filter((shape) => shape.type === "math").map((shape) => shape.id);
      for (const item of snap.eqItems ?? []) {
        if (!item || typeof item.latex !== "string") continue;
        createMath(editor, {
          latex: item.latex,
          x: item.x,
          y: item.y,
          annotation: item.annotation,
          display: item.role !== "label",
          role: item.role === "label" ? "label" : "",
          color: item.color,
          crossOut: Boolean(item.crossOut),
          highlight: (item.highlight ?? "") as MathHighlight,
          meta: item.meta,
        });
      }
      // Items: saved with the snapshot, or rebuilt from the itemId every
      // shape carries in its meta (snapshots from before items were saved).
      const live = new Set(editor.getCurrentPageShapes().map((shape) => shape.id as string));
      if (Array.isArray(snap.items) && snap.items.length > 0) {
        itemsRef.current = snap.items
          .map((item) => ({ ...item, shapeIds: item.shapeIds.filter((id) => live.has(id)) }))
          .filter((item) => item.shapeIds.length > 0 || item.eqItemIds.length > 0);
      } else {
        const byItem = new Map<string, BoardItem>();
        for (const shape of editor.getCurrentPageShapesSorted()) {
          const meta = shape.meta as { itemId?: unknown; tutorReferenceLabel?: unknown; owner?: unknown };
          const itemId = typeof meta.itemId === "string" ? meta.itemId : null;
          if (!itemId) continue;
          const existing = byItem.get(itemId);
          if (existing) {
            existing.shapeIds.push(shape.id);
            continue;
          }
          byItem.set(itemId, {
            id: itemId,
            tool: shape.type === "math" ? "draw_equation_step" : shape.type === "icon" ? "draw_icons" : "add_text_note",
            label: typeof meta.tutorReferenceLabel === "string" ? meta.tutorReferenceLabel : shape.type,
            shapeIds: [shape.id],
            eqItemIds: [],
            owner: meta.owner === "student" ? "student" : "tutor",
            createdAt: Date.now(),
          });
        }
        itemsRef.current = Array.from(byItem.values()).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
      }
      const maxSeq = itemsRef.current.reduce((m, item) => Math.max(m, Number(item.id.slice(1)) || 0), 0);
      itemSeqRef.current = Math.max(snap.itemSeq ?? 0, maxSeq, itemSeqRef.current);
      semanticBoardRef.current = normalizeSemanticBoard(snap.semanticBoard);
      // Defensive: ensure post-resume direct calls go through withDirectMeta
      // cleanly. (No prior path should leak meta across resume, but a snapshot
      // reload is a natural reset point so we make it explicit.)
      jobMetaRef.current = null;
    },
    };
    handleRef.current = api;
    return api;
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Tldraw
        onMount={handleMount}
        autoFocus={autoFocus}
        hideUi
        components={TLDRAW_COMPONENTS}
        overlayUtils={OVERLAY_UTILS}
        shapeUtils={SHAPE_UTILS}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      />
    </div>
  );
});

export default TldrawCore;
