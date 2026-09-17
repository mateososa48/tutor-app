"use client";

// tldraw/katex CSS are imported in app/globals.css so they load with the page,
// not behind the dynamic chunk.

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
  useEffect,
  useState,
} from "react";
import { Tldraw, renderPlaintextFromRichText, type TLComponents } from "tldraw";
import { Editor, createShapeId, toRichText, useValue } from "@tldraw/editor";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { InstancePresenceRecordType, type TLInstancePresence, type TLShapeId } from "@tldraw/tlschema";
import {
  formatBoardItems,
  highlightSwipeFor,
  isHeadingItem,
  itemLabelFrom,
  matchVariants,
  mergeLineRects,
  normalizeForMatch,
  resolveItemTarget,
  ringPoints,
  toolRole,
  type BoardItem,
  type ItemBounds,
} from "@/lib/board-items";
import { planCamera } from "@/lib/board-camera";
import { BOARD_THEMES, SKY } from "@/components/board/board-theme";
import { catchUpPace, planReveal, pointsShown, polylineLength, typedPrefix, REVEAL_CAP_MS, type RevealInput, type RevealStep } from "@/lib/board-reveal";
import { findSpot, freeSpace, inArea, intersect, LAYOUT_GAP, PANEL_MIN_W, pageAt, planSection, regionName, shouldOpenPage, usedCells, type PlaceHint, type PlaceRequest, type Rect, type Size } from "@/lib/board-layout";
import { latexToPlain } from "@/lib/latex-plain";
import { TutorPenOverlayUtil, TutorScribbleOverlayUtil } from "@/components/board/TutorPenOverlay";
import { MathShapeUtil, measureMath, type MathHighlight, type TLMathShape } from "@/components/board/MathShape";
import { IconShapeUtil, type TLIconShape } from "@/components/board/IconShape";
import { GraphShapeUtil, type TLGraphShape, type TLGraphShapeProps } from "@/components/board/GraphShape";
import { desmosAvailable, desmosFailure, desmosStatus, devParam, renderDesmosGraph } from "@/components/board/desmos-renderer";
import { buildBarChartGraph } from "@/lib/desmos-bar-chart";
import { exploreHint, hasExploreControls, isExplorable } from "@/lib/desmos-explore";
import { desmosPictureTools } from "@/lib/desmos-config";
import { buildFigureGraph, DESMOS_FIGURES } from "@/lib/desmos-figure";
import { buildNumberLineGraph } from "@/lib/desmos-number-line";
import { autoYRange, buildAxesGraph, buildFunctionGraph, buildPointsGraph, curveCrossings, ensureRelation, graphFunction, toDesmosLatex, vectorExtra } from "@/lib/desmos-graph";
import {
  DEFAULT_GRAPH_SIZE,
  findMarker,
  graphSpecText,
  isGraphTable,
  markerBox,
  parseGraphSpec,
  type GraphSize,
  type GraphSource,
  type GraphSpec,
} from "@/lib/desmos-spec";

const OVERLAY_UTILS = [TutorPenOverlayUtil, TutorScribbleOverlayUtil];
const SHAPE_UTILS = [MathShapeUtil, IconShapeUtil, GraphShapeUtil];
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
  figureSideLabels,
  figureVertices,
  formatTick,
  labelLanes,
  placeSketchLabels,
  fractionLatex,
  fractionText,
  niceMax,
  niceStep,
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
import { splitSlots } from "@/lib/board-content-rules";
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
const ROW_GAP = 16;
const EQ_H = 52;
const EQ_ROW_GAP = 8;
const POINT_PATTERN = /\(\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*\)(?:\s*:\s*([^,;\n(]+))?/g;

// ── Board style ─────────────────────────────────────────────────────────────
// One pen for the tutor (blue), ink for structure (black), pencil for the
// student's work and quiet labels. Diagrams use solid strokes; only
// draw_sketch keeps tldraw's hand-drawn wobble.
const INK: TldrawColor = "black";
const PEN: TldrawColor = "blue";
// The student's pencil: the app's second ink (components/board/board-theme.ts).
const PENCIL: TldrawColor = "pencil";
// Every tutor mark is the app's sky blue (Mateo, Sept 16); strikes are the deeper sky.
const MARK: TldrawColor = "sky";
const STRIKE: TldrawColor = "sky-deep";
// Marker palette. Each new diagram, and each series inside one (two
// fractions, five bars, three forces), takes the next pen so nothing that
// should be told apart shares a colour. Structure stays in ink. Light blue
// left the palette: next to the sky marks it read as a mark.
const MARKERS: TldrawColor[] = ["blue", "violet", "green", "orange", "red"];
const MARKER_HEX: Record<string, string> = {
  blue: "#4465e9",
  violet: "#ae3ec9",
  green: "#099268",
  orange: "#e16919",
  red: "#e03131",
  "light-blue": "#4ba1f1",
};
const HEX_MARKER = new Map(Object.entries(MARKER_HEX).map(([name, hex]) => [hex.toLowerCase(), name as TldrawColor]));
const DIAGRAM_W = 520;
// Desmos graphs (Sept 15 2026): a 4:3 picture, big enough to read at a glance
// and small enough that three sit side by side on a laptop-sized board page
// (at 480 × 360 only two fit and a graph-heavy lesson turned a page every two).
// Vector graphs (no Desmos) take the same box, labels included, so a graph
// redrawn as vectors after a failed load keeps its place and its caption.
const GRAPH_SIZE: GraphSize = DEFAULT_GRAPH_SIZE;
const GRAPH_CAPTION_GAP = 20;
const VECTOR_INSET = { left: 28, right: 34, top: 28, bottom: 30 };

// ── Whiteboard pages (Sept 14 2026) ─────────────────────────────────────────
// The board is a page the size of the visible board. Each tool call's drawing
// is measured and moved into free space (lib/board-layout.ts): down the first
// column, then the next, or beside or below an item the tutor names. A full
// page opens the next one to the right.
const PAGE_GAP = 240;
// Clear of the session chip and End button above, the watermark below.
const PAGE_INSET = { top: 68, right: 36, bottom: 56, left: 36 };
// The voice dock and its pills cover the bottom-right corner.
const DOCK_BLOCK = { w: 384, h: 282 };
const PLACE_SKIP = new Set(["start_new_problem", "start_board_section", "clear_whiteboard"]);
const AREA_RIGHT_TOOLS = new Set(["add_function_graph", "add_coordinate_axes", "plot_points", "draw_desmos"]);
const EQUATION_TOOLS = new Set(["draw_equation_step", "add_equation_sequence"]);
// Pictures sit beside the words they illustrate.
const PICTURE_TOOLS = new Set([
  "draw_fraction", "add_number_line", "draw_figure", "draw_angle", "draw_array", "add_area_model", "draw_balance",
  "draw_bar_chart", "add_table", "draw_tape_diagram", "draw_grid", "draw_transversal", "draw_icons", "draw_sketch",
  "write_vertical", "draw_long_division", "draw_data_plot",
]);
// Marks measure the marked words or drawing, without decorations beside them.
const MARK_BOUNDS = { decor: false } as const;
// The tutor's presence (pen cursor, laser ring) in the app's sky.
const TUTOR_COLOR = SKY;
type HighlightStroke = { points: Array<{ x: number; y: number }>; size: TLDefaultSizeStyle; duration: number; ring?: boolean };

function pageFrame(base: { w: number; h: number }, index: number): Rect {
  return { x: (index - 1) * (base.w + PAGE_GAP), y: 0, w: base.w, h: base.h };
}

function usableArea(frame: Rect): Rect {
  const top = frame.y + PAGE_INSET.top;
  return {
    x: frame.x + PAGE_INSET.left,
    y: top,
    w: frame.w - PAGE_INSET.left - PAGE_INSET.right,
    h: Math.max(0, frame.y + frame.h - PAGE_INSET.bottom - top),
  };
}

// Where work flows by default: the current section's region, or the whole page.
function placementArea(frame: Rect, section: Rect | null): Rect {
  const page = usableArea(frame);
  return (section && intersect(section, page)) || page;
}

// Snapshots before Sept 16 kept only where the section started: everything below it.
function legacySection(frame: Rect | null, sectionTop?: number): Rect | null {
  if (!frame || !sectionTop) return null;
  const page = usableArea(frame);
  const top = Math.max(page.y, sectionTop);
  return { x: page.x, y: top, w: page.w, h: Math.max(0, page.y + page.h - top) };
}

// The page the camera is showing.
function visiblePage(editor: Editor, frame: Rect, fallback: number): number {
  try {
    const view = editor.getViewportPageBounds();
    return pageAt(view.x + view.w / 2, frame.w, PAGE_GAP);
  } catch {
    return fallback;
  }
}

function dockBlock(frame: Rect): Rect {
  return { x: frame.x + frame.w - DOCK_BLOCK.w, y: frame.y + frame.h - DOCK_BLOCK.h, w: DOCK_BLOCK.w, h: DOCK_BLOCK.h };
}

function onPage(r: Rect, frame: Rect): boolean {
  const cx = r.x + r.w / 2;
  return cx >= frame.x - PAGE_GAP / 2 && cx <= frame.x + frame.w + PAGE_GAP / 2;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}
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
  /** `section`: the current section's writing area; `rowTop`: where its row of sections starts. `sectionTop`: snapshots before Sept 16 2026. */
  pageState: { pageIndex: number; pageTop: number; leftY: number; rightY: number; frame?: Rect; section?: Rect | null; rowTop?: number | null; sectionTop?: number };
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
  addTable(columns: string, rows: string, title?: string, column?: "left" | "right"): void;
  addNumberLine(opts: NumberLineDrawing): void;
  addCoordinateAxes(xMin: number, xMax: number, yMin: number, yMax: number, label?: string, column?: "left" | "right"): void;
  plotPoints(points: string, xMin: number, xMax: number, yMin: number, yMax: number, label?: string, column?: "left" | "right", connect?: boolean): void;
  addWorkedExampleBox(title: string, body: string, column?: "left" | "right"): void;
  addStudentAttempt(text: string, column?: "left" | "right"): void;
  addProblemSetup(goal: string, givens?: string, unknowns?: string, plan?: string, column?: "left" | "right"): void;
  /** Equation lines as one block; an empty annotation slot leaves that line unannotated. */
  addEquationSequence(steps: string[], annotations: string[], title?: string, column?: "left" | "right"): void;
  /** A small sky tag with one short line. */
  addCallout(text: string, column?: "left" | "right"): void;
  addAreaModel(title: string, rowLabels: string, columnLabels: string, cells: string, column?: "left" | "right"): void;
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
  getBoardSummary(): string;
  /** Item bookkeeping around one tool call: everything created between begin and end becomes one board item. */
  beginItem(tool: string, callId?: string): ItemToken;
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
  /** Where the next item goes; the dispatcher sets it before each tool call. Optional so fake boards compile. */
  setPlacement?(request: PlaceRequest | null): void;
  /** What placement or a mark wants the tool result to say ("stayed on this page: there was room"); clears them. */
  takeNotes?(): string[];
  /** A highlighter over the words `text` in an item, or over the whole item. `part` says which it managed. */
  highlight?(target: string, text: string | undefined): { item: BoardItem; part: "text" | "item" } | null;
  /** The board's items as they are now (the dispatcher looks for duplicates in them). */
  itemsSnapshot?(): BoardItem[];
  /** Take back what a cancelled tool call did. Returns what was undone, in words ("" for nothing). */
  undoCall?(callId: string): string;
  /** Whether graphs are drawn by Desmos here (a key, a browser, no failed load). */
  canUseDesmos?(): boolean;
  /** Whether this picture tool draws on Desmos right now (loaded, and switched on for it). */
  desmosFor?(tool: string, figure?: string): boolean;
  /** A Desmos picture from a spec the caller builds with the pens it is handed (draw_desmos, draw_data_plot). */
  drawGraph?(build: (colors: string[]) => GraphSpec, opts: { pens: number; label?: string; column?: "left" | "right"; summary?: string }): void;
  /** A graph item as it is now (its spec and its box on screen), or null once it is gone. For Explore. */
  getGraph?(itemId: string): ExploreTarget | null;
  /** Draw a graph item again from a new spec (the student's version from Explore). False when it is gone. */
  applyGraphSpec?(itemId: string, spec: GraphSpec): boolean;
}

/** `content`: what the call writes or draws, fingerprinted, so a later call can tell it is already up. */
export type ItemToken = { tool: string; shapes: Set<string>; eqs: Set<string>; content?: string };

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
  if (meta.callId) compact.callId = meta.callId;
  if (meta.role) compact.role = meta.role;
  if (meta.concept) compact.concept = meta.concept;
  if (meta.summary) compact.summary = meta.summary;
  if (meta.owner) compact.owner = meta.owner;
  if (meta.tutorReferenceLabel) compact.tutorReferenceLabel = meta.tutorReferenceLabel;
  return compact;
}

function currentShapeIdSet(editor: Editor): Set<string> {
  try {
    return new Set(Array.from(editor.getCurrentPageShapeIds() as unknown as Iterable<string>));
  } catch {
    return new Set();
  }
}

// Saved boards leave graph pictures out: each is 30-80 KB of SVG and is
// drawn again from its spec when the board is loaded.
function withoutGraphPictures(snapshot: unknown): unknown {
  const snap = snapshot as { store?: Record<string, { typeName?: string; type?: string; props?: Record<string, unknown> }> } | null;
  if (!snap?.store) return snapshot;
  let changed = false;
  const store: Record<string, unknown> = {};
  for (const [key, record] of Object.entries(snap.store)) {
    if (record?.typeName === "shape" && record.type === "graph" && record.props?.svg) {
      store[key] = { ...record, props: { ...record.props, svg: "", status: "rendering" } };
      changed = true;
    } else {
      store[key] = record;
    }
  }
  return changed ? { ...snap, store } : snapshot;
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

// Cells read like the board's math: "x^2" shows as x².
function formatTableText(columns: string, rows: string): string {
  const headers = columns.split("|").map((cell) => latexToPlain(cell.trim())).filter(Boolean);
  const parsedRows = rows
    .split(/[;\n]/)
    .map((row) => row.split("|").map((cell) => latexToPlain(cell.trim())))
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

// Rows keep their empty cells, so a blank for the student stays in its column.
function splitRows(input: string): string[][] {
  return input
    .split(/[;\n]/)
    .map((row) => splitSlots(row))
    .filter((row) => row.some((cell) => cell !== ""));
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

// ── Equation block (KaTeX HTML overlay) ────────────────────────────────────
// ── Main component ──────────────────────────────────────────────────────────
// A plain white board. The dot grid read as clutter next to real diagrams.
function PlainBackground() {
  return <div style={{ position: "absolute", inset: 0, backgroundColor: "#ffffff" }} />;
}

// ── Explore (Sept 17 2026) ──────────────────────────────────────────────────
// A graph the student can open live (lib/desmos-explore.ts) gets an Explore
// button in its top right corner. The buttons are real buttons in a layer of
// their own beside tldraw, following the camera: clicks never reach the
// canvas, and tldraw leaves keys alone while a button has focus. The layer
// sits at z-index 5, above the canvas and under the page's captions, dock and
// panels. (tldraw's in-front layer is z-index 250 in the page's stacking
// context, which put the buttons over the Explore panel and would put them
// over the dock; tldraw's container is not isolated, and isolating it would
// let the dock cover the tldraw watermark on phones.) Pages without Explore
// (the landing page) get none.

/** A graph item opened in Explore: its spec now, and its box on screen (px, relative to the board). */
export type ExploreTarget = {
  itemId: string;
  label: string;
  spec: GraphSpec;
  rect: { x: number; y: number; w: number; h: number };
};

// Parsing a spec on every camera move adds up; the answer changes only with the spec.
const explorableBySpec = new Map<string, boolean>();
function explorableSpecText(text: string, size: GraphSize): boolean {
  let known = explorableBySpec.get(text);
  if (known === undefined) {
    known = isExplorable(parseGraphSpec(text, size));
    if (explorableBySpec.size >= 64) explorableBySpec.clear();
    explorableBySpec.set(text, known);
  }
  return known;
}

// The button's top right corner, in px from the board's top left.
type ExploreSpot = { itemId: string; right: number; top: number; compact: boolean };

function ExploreButtons({ editor, activeItemId, open }: { editor: Editor; activeItemId: string | null; open: (itemId: string) => void }) {
  const spots = useValue(
    "explore buttons",
    (): ExploreSpot[] => {
      const view = editor.getViewportScreenBounds();
      const out: ExploreSpot[] = [];
      for (const shape of editor.getCurrentPageShapes()) {
        if (shape.type !== "graph" || shape.opacity < 1) continue;
        const gp = shape.props as TLGraphShapeProps;
        const itemId = (shape.meta as { itemId?: unknown }).itemId;
        // Only once the picture is drawn and written in.
        if (typeof itemId !== "string" || gp.status !== "ready" || gp.reveal < 1) continue;
        if (!explorableSpecText(gp.spec, { w: gp.w, h: gp.h })) continue;
        const topLeft = editor.pageToScreen({ x: shape.x, y: shape.y });
        const bottomRight = editor.pageToScreen({ x: shape.x + gp.w, y: shape.y + gp.h });
        // The part of the graph on screen holds the button, in its top right corner.
        const left = Math.max(topLeft.x - view.x, 0);
        const top = Math.max(topLeft.y - view.y, 0);
        const right = Math.min(bottomRight.x - view.x, view.w);
        const bottom = Math.min(bottomRight.y - view.y, view.h);
        if (right - left < 72 || bottom - top < 56) continue;
        out.push({ itemId, right, top, compact: view.w < 640 || right - left < 220 });
      }
      return out;
    },
    [editor],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 5 }}>
      {spots.map((spot) => (
        <ExploreButton key={spot.itemId} spot={spot} active={spot.itemId === activeItemId} onOpen={open} />
      ))}
    </div>
  );
}

// A 28px pill inside a 44px target, 8px in from the graph's top right corner.
function ExploreButton({ spot, active, onOpen }: { spot: ExploreSpot; active: boolean; onOpen: (itemId: string) => void }) {
  return (
    <button
      type="button"
      data-explore-item={spot.itemId}
      aria-pressed={active}
      aria-label={`Explore graph ${spot.itemId}`}
      title={spot.compact ? "Explore this graph" : undefined}
      onClick={() => onOpen(spot.itemId)}
      className="group pointer-events-auto absolute flex h-11 min-w-11 items-center justify-end px-2 font-[family-name:var(--lp-font-body)] outline-none"
      style={{ left: spot.right, top: spot.top, transform: "translateX(-100%)" }}
    >
      <span
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-full border border-(--lp-line-strong) bg-white/95 text-[12.5px] leading-none font-medium text-(--lp-ink) shadow-(--lp-shadow-card) backdrop-blur-sm",
          "transition-[scale,background-color,border-color,color] duration-150 ease-out group-hover:border-[rgba(18,18,21,0.26)] group-hover:bg-white group-active:scale-[0.96]",
          "group-focus-visible:outline-3 group-focus-visible:outline-offset-2 group-focus-visible:outline-(--lp-sky-glow)",
          // Pressed: a sky fill and border; the label stays ink (sky text on the fill is 3.6:1).
          "group-aria-pressed:border-(--lp-sky-deep) group-aria-pressed:bg-(--lp-sky-soft)",
          spot.compact ? "w-7 justify-center" : "px-2.5",
        )}
      >
        <SlidersHorizontal aria-hidden className="size-3.5 shrink-0 text-(--lp-sky-deep)" strokeWidth={2} />
        {!spot.compact && <span>{active ? "Exploring" : "Explore"}</span>}
      </span>
    </button>
  );
}

const TLDRAW_COMPONENTS: TLComponents = { Background: PlainBackground };

export type TldrawCoreProps = {
  /** True while queued writing is still appearing on the board. */
  onWriting?: (busy: boolean) => void;
  /** Let tldraw take keyboard focus on mount (default). The landing page demo turns this off. */
  autoFocus?: boolean;
  /** Graphs a student can open live get an Explore button that calls this. Pages without it show none. */
  onExplore?: (target: ExploreTarget) => void;
  /** The graph item open in Explore; its button shows as pressed. */
  exploringItemId?: string | null;
};

const TldrawCore = forwardRef<WhiteboardHandle, TldrawCoreProps>(function TldrawCore({ onWriting, autoFocus = true, onExplore, exploringItemId = null }, ref) {
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
  type RevealJob = (
    | { kind: "reveal"; steps: RevealStep[]; restAt: ItemBounds | null }
    | { kind: "action"; run: () => void; wait: number }
  ) & { callId?: string };
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
  const onExploreRef = useRef(onExplore);
  useEffect(() => {
    onExploreRef.current = onExplore;
  }, [onExplore]);
  // A graph item as it is now: its spec, and where it is on screen.
  const exploreTargetFor = useCallback((itemId: string): ExploreTarget | null => {
    const editor = editorRef.current;
    const item = itemsRef.current.find((i) => i.id === itemId);
    if (!editor || !item) return null;
    for (const sid of item.shapeIds) {
      const shape = editor.getShape(sid as TLShapeId);
      if (shape?.type !== "graph") continue;
      const gp = shape.props as TLGraphShapeProps;
      const spec = parseGraphSpec(gp.spec, { w: gp.w, h: gp.h });
      if (!spec) return null;
      const view = editor.getViewportScreenBounds();
      const topLeft = editor.pageToScreen({ x: shape.x, y: shape.y });
      const bottomRight = editor.pageToScreen({ x: shape.x + gp.w, y: shape.y + gp.h });
      // The graph's caption names it for the student; else its first line.
      let label = "";
      for (const other of item.shapeIds) {
        const text = editor.getShape(other as TLShapeId);
        const richText = text?.type === "text" ? (text.props as { richText?: unknown }).richText : undefined;
        if (!richText) continue;
        try {
          label = renderPlaintextFromRichText(editor, richText as Parameters<typeof renderPlaintextFromRichText>[1]).trim();
        } catch {
          label = "";
        }
        if (label) break;
      }
      if (!label) {
        const first = spec.expressions.find((e) => !isGraphTable(e) && /^(curve|item)\d+$/.test(e.id));
        label = first && !isGraphTable(first) ? latexToPlain(first.latex) : "";
      }
      return {
        itemId,
        label,
        spec,
        rect: { x: topLeft.x - view.x, y: topLeft.y - view.y, w: bottomRight.x - topLeft.x, h: bottomRight.y - topLeft.y },
      };
    }
    return null;
  }, []);
  const openExplore = useCallback((itemId: string) => {
    const target = exploreTargetFor(itemId);
    if (target) onExploreRef.current?.(target);
  }, [exploreTargetFor]);
  // The buttons need the editor in state: they render once it has mounted.
  const [mountedEditor, setMountedEditor] = useState<Editor | null>(null);
  const cursorHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scribbleTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  // Page layout: the current page's frame in page coordinates, the current
  // section's writing area (null: the whole page) and the row its heading
  // owns, what the next tool call asked for, notes for its result, and each
  // item's rectangle as placed (a reveal changes live bounds mid-write).
  const pageFrameRef = useRef<Rect | null>(null);
  const sectionRegionRef = useRef<Rect | null>(null);
  const headingRowRef = useRef<{ x: number; w: number } | null>(null);
  // Where the current row of sections starts (null: under the page heading).
  const rowTopRef = useRef<number | null>(null);
  // The newest section: its title, the row it was planned in, and its heading's item id.
  const currentSectionRef = useRef<{ title: string; rowTop: number | null; headingId: string | null } | null>(null);
  // The live tool call being drawn now, what calls changed on typeset lines,
  // and the boards new problems cleared: what undoCall needs.
  const currentCallIdRef = useRef<string | null>(null);
  const mathChangesRef = useRef<Array<{ callId: string; id: string; prop: "highlight" | "crossOut"; prev: unknown }>>([]);
  const clearedBoardsRef = useRef<Map<string, WhiteboardSnapshot>>(new Map());
  const notesRef = useRef<string[]>([]);
  const placeRequestRef = useRef<PlaceRequest | null>(null);
  const placedRectsRef = useRef<Map<string, Rect>>(new Map());
  const buildingItemRef = useRef(false);
  const pendingIsPageRef = useRef(false);
  // A lone item too wide for a phone at the readable zoom: framed tight, a little further out.
  const pendingTightRef = useRef<number | null>(null);
  const highlightRafRef = useRef<number | null>(null);
  // Desmos renders graphs asynchronously; board pictures wait for these.
  const pendingGraphsRef = useRef<Set<Promise<void>>>(new Set());
  // Set while a picture Desmos could not draw is drawn again as vectors.
  const vectorOnlyRef = useRef(false);

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
    // A line wider than its column shrinks (down to 70%) rather than spilling
    // into the other column.
    const MAX_W = RIGHT_X - LEFT_X - 40;
    let scale = 1;
    let m = measureMath(opts.latex, display, opts.annotation ?? "", scale);
    while (m.w > MAX_W && scale > 0.6) {
      scale = Math.max(0.6, Math.round((scale - 0.1) * 100) / 100);
      m = measureMath(opts.latex, display, opts.annotation ?? "", scale);
    }
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
        scale,
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
      run(() => editor.updateShapes([{ id: shape.id, type: shape.type, opacity: 1, props: { reveal: r } }] as unknown as Parameters<Editor["updateShapes"]>[0]));
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
    // box / fade: a quick fade-in, to the shape's own opacity when it has one
    const rest = typeof shape.meta.restOpacity === "number" ? shape.meta.restOpacity : 1;
    const op = Math.min(1, Math.max(0, p)) * rest;
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
    const GAP_BIG = 140;
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
            leadMs = step.duration > 200 && dist > 40 ? Math.min(280, dist) : 0;
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
        const gap = next && next.duration > 350 ? GAP_BIG : next && next.duration > 200 ? 60 : 0;
        waitUntil = now + gap;
        if (gap > 0 || !next || next.duration > 120) break;
      }
      revealRafRef.current = requestAnimationFrame(frame);
    };
    revealRafRef.current = requestAnimationFrame(frame);
  }, [applyStep, ensurePresence, finishReveal, moveCursor, patchPresence, penAt, scheduleCursorHide]);

  // Jobs start after the tool call that queued them returns. A mark that ran
  // inside the call became part of that call's item (and was moved into free
  // space), and camera moves are skipped while a call is building.
  const queueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enqueue = useCallback((job: RevealJob) => {
    revealQueueRef.current.push(currentCallIdRef.current && !job.callId ? { ...job, callId: currentCallIdRef.current } : job);
    if (!writingRef.current) {
      writingRef.current = true;
      onWritingRef.current?.(true);
    }
    if (queueTimerRef.current !== null) return;
    queueTimerRef.current = setTimeout(() => {
      queueTimerRef.current = null;
      runQueue();
    }, 0);
  }, [runQueue]);

  const resetReveal = useCallback(() => {
    if (queueTimerRef.current !== null) {
      clearTimeout(queueTimerRef.current);
      queueTimerRef.current = null;
    }
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
      } else if (shape.type === "graph") {
        inputs.push({ id: shape.id, kind: "eq", x, y, chars: 70 });
      } else if (shape.type === "draw" && props.dash === "none") {
        // A fill with no outline (an inequality's side) has nothing to trace.
        inputs.push({ id: shape.id, kind: "fade", x, y });
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
    // Unhurried, unless tool calls are piling up behind this one.
    const steps = planReveal(inputs, 28, REVEAL_CAP_MS, catchUpPace(revealQueueRef.current.length));
    editor.run(() => {
      if (hide.length > 0) editor.updateShapes(hide.map((h) => ({ id: h.id, type: h.type, opacity: 0 })) as unknown as Parameters<Editor["updateShapes"]>[0]);
      const maths = hide.filter((h) => h.type === "math" || h.type === "graph");
      if (maths.length > 0) editor.updateShapes(maths.map((h) => ({ id: h.id, type: h.type, props: { reveal: 0 } })) as unknown as Parameters<Editor["updateShapes"]>[0]);
    }, { history: "ignore" });
    enqueue({ kind: "reveal", steps, restAt });
  }, [enqueue, plainOf]);

  // What an item covers. Marks never count. `decor: false` also leaves out
  // decorations (the "you" tag beside a student's words), for marks to measure.
  const itemBounds = useCallback((editor: Editor, item: BoardItem, opts: { decor?: boolean } = {}): ItemBounds | null => {
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
      // Marks (rings, swipes, strikes) are not part of what they mark.
      const shapeMeta = shape.meta as { mark?: unknown; decor?: unknown } | undefined;
      if (shapeMeta?.mark === true) continue;
      if (opts.decor === false && shapeMeta?.decor === true) continue;
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

  // ── Page layout ─────────────────────────────────────────────────────────────
  // The current page, measured from the visible board the first time it is needed.
  const ensurePageFrame = useCallback((editor: Editor): Rect => {
    if (pageFrameRef.current) return pageFrameRef.current;
    let w = 1280;
    let h = 760;
    try {
      const screen = editor.getViewportScreenBounds();
      if (screen.w > 0 && screen.h > 0) {
        w = screen.w;
        h = screen.h;
      }
    } catch {
      // keep the default size
    }
    const base = { w: Math.round(Math.min(1800, Math.max(900, w))), h: Math.round(Math.min(1100, Math.max(560, h))) };
    pageFrameRef.current = pageFrame(base, pageIndex.current);
    return pageFrameRef.current;
  }, []);

  const openPage = useCallback((editor: Editor): Rect => {
    const current = ensurePageFrame(editor);
    pageIndex.current += 1;
    sectionRegionRef.current = null;
    rowTopRef.current = null;
    pageFrameRef.current = pageFrame(current, pageIndex.current);
    return pageFrameRef.current;
  }, [ensurePageFrame]);

  const rectOf = useCallback(
    (editor: Editor, item: BoardItem): Rect | null => placedRectsRef.current.get(item.id) ?? itemBounds(editor, item),
    [itemBounds],
  );

  // Everything on this page that new work must not cover, the dock first.
  const occupiedOn = useCallback((editor: Editor, frame: Rect, exclude?: string): Rect[] => {
    const out: Rect[] = [dockBlock(frame)];
    for (const item of itemsRef.current) {
      if (item.id === exclude) continue;
      const r = rectOf(editor, item);
      if (r && onPage(r, frame)) out.push(r);
    }
    return out;
  }, [rectOf]);

  // How many of a page's nine cells hold work: headings count by their words
  // (their rows are kept clear, not written on) and the dock not at all.
  const usedCellsOn = useCallback((editor: Editor, frame: Rect, exclude?: string): number => {
    const work: Rect[] = [];
    for (const item of itemsRef.current) {
      if (item.id === exclude) continue;
      const r = isHeadingItem(item) ? itemBounds(editor, item) : rectOf(editor, item);
      if (r && onPage(r, frame)) work.push(r);
    }
    return usedCells(work, usableArea(frame));
  }, [itemBounds, rectOf]);

  // A mark on another page turns the board there; the tool result says so.
  const notePage = useCallback((editor: Editor, item: BoardItem) => {
    const frame = pageFrameRef.current;
    const r = rectOf(editor, item);
    if (!frame || !r) return;
    const page = pageAt(r.x + r.w / 2, frame.w, PAGE_GAP);
    if (page !== visiblePage(editor, frame, pageIndex.current)) {
      notesRef.current.push(`${item.id} is on page ${page}, so the board turns there to show it`);
    }
  }, [rectOf]);

  // Move a finished tool call's drawing into free space. Returns where it went.
  const placeItem = useCallback((
    editor: Editor,
    item: BoardItem,
    request: PlaceRequest | null,
    rehome?: (size: Size) => boolean,
  ): Rect | null => {
    const box = itemBounds(editor, item);
    if (!box) return null;
    let frame = ensurePageFrame(editor);
    let page = usableArea(frame);
    const others = itemsRef.current.filter((i) => i.id !== item.id);
    if (request?.kind === "new_page" && occupiedOn(editor, frame, item.id).length > 1) {
      // A new page hides everything on this one. It opens only when this one
      // is mostly used, and only where a section starts, taking the heading
      // along: a page break inside a section splits the work being read.
      const previous = others[others.length - 1];
      const heading = previous?.tool === "start_board_section" ? previous : null;
      const mostlyUsed = shouldOpenPage({ fits: true, askedForNewPage: true, usedCells: usedCellsOn(editor, frame, item.id) });
      const at = heading ? rectOf(editor, heading) : null;
      if (mostlyUsed && heading && at) {
        const bodyOffset = sectionRegionRef.current ? sectionRegionRef.current.y - at.y : at.h;
        frame = openPage(editor);
        page = usableArea(frame);
        const ids = heading.shapeIds.filter((sid) => editor.getShape(sid as TLShapeId)).map((sid) => sid as TLShapeId);
        if (ids.length > 0) editor.run(() => editor.nudgeShapes(ids, { x: page.x - at.x, y: page.y - at.y }), { history: "ignore" });
        placedRectsRef.current.set(heading.id, { x: page.x, y: page.y, w: page.w, h: at.h });
        const bodyTop = page.y + Math.max(at.h, bodyOffset);
        sectionRegionRef.current = { x: page.x, y: bodyTop, w: page.w, h: Math.max(0, page.y + page.h - bodyTop) };
        headingRowRef.current = { x: page.x, w: page.w };
        rowTopRef.current = page.y;
      } else {
        notesRef.current.push(mostlyUsed ? "stayed on this page, so this section stays together" : "stayed on this page: there was room");
      }
    }
    const section = sectionRegionRef.current;
    const here = (r: Rect | null): Rect | null => (r && onPage(r, frame) ? r : null);
    // Default neighbours come from the current section only.
    const inSection = (r: Rect | null): Rect | null => (r && onPage(r, frame) && (!section || intersect(r, section)) ? r : null);
    let hint: PlaceHint = { kind: "flow" };
    // A place the tutor named is looked for on the whole page (the words in
    // [Board: …] describe the page); other work flows in the current section.
    let named = false;
    if (request?.kind === "beside" || request?.kind === "below") {
      const anchor = resolveItemTarget(others, request.target);
      const r = anchor ? here(rectOf(editor, anchor)) : null;
      if (r) {
        hint = { kind: request.kind, anchor: r };
        named = true;
      }
    } else if (request?.kind === "area") {
      hint = { kind: "area", area: request.area };
      named = true;
    } else if (AREA_RIGHT_TOOLS.has(item.tool)) {
      hint = { kind: "area", area: "right" };
    } else if (EQUATION_TOOLS.has(item.tool)) {
      // The next line of working goes under the last one.
      const lastEq = [...others].reverse().find((i) => EQUATION_TOOLS.has(i.tool));
      const r = lastEq ? inSection(rectOf(editor, lastEq)) : null;
      if (r) hint = { kind: "below", anchor: r };
    } else if (PICTURE_TOOLS.has(item.tool)) {
      // A picture goes beside the words it illustrates.
      const previous = [...others].reverse().find((i) => !isHeadingItem(i));
      const words = previous && !PICTURE_TOOLS.has(previous.tool) && !AREA_RIGHT_TOOLS.has(previous.tool);
      const r = words ? inSection(rectOf(editor, previous)) : null;
      if (r) hint = { kind: "beside", anchor: r };
    }
    if (hint.kind === "flow") {
      // Words continue under the last words written (or in the next column),
      // the way a hand moves down a board; earlier gaps are not refilled.
      const lastWords = [...others].reverse().find((i) => !isHeadingItem(i) && !PICTURE_TOOLS.has(i.tool) && !AREA_RIGHT_TOOLS.has(i.tool));
      const r = lastWords ? inSection(rectOf(editor, lastWords)) : null;
      if (r) hint = { kind: "flow", after: r };
    }
    let area = named ? page : placementArea(frame, section);
    const size = { w: Math.min(box.w, page.w), h: box.h };
    const fitIn = (a: Rect) => (size.h <= a.h + 0.5 ? findSpot(size, occupiedOn(editor, frame, item.id), a, hint) : null);
    let spot = fitIn(area);
    // A section's first item that does not fit under its heading takes the
    // heading along to room that holds both (endItem supplies the move).
    if (!spot && !named && section && rehome?.(size)) {
      frame = ensurePageFrame(editor);
      page = usableArea(frame);
      area = placementArea(frame, sectionRegionRef.current);
      spot = fitIn(area);
    }
    // A full section spills onto the rest of this page before a page opens.
    if (!spot && area !== page) spot = fitIn(page);
    if (!spot) {
      // Nothing fits on this page: the next one, unless this page is still empty.
      if (occupiedOn(editor, frame, item.id).length > 1) {
        frame = openPage(editor);
        page = usableArea(frame);
        spot = findSpot(size, occupiedOn(editor, frame, item.id), page);
      }
      spot = spot ?? { x: page.x, y: page.y };
    }
    const placed = { x: spot.x, y: spot.y, w: box.w, h: box.h };
    if (request?.kind === "area" && !inArea(placed, request.area, page)) {
      notesRef.current.push(`no room at "${request.area}", so it is at the ${regionName(placed, page)}`);
    }
    const dx = spot.x - box.x;
    const dy = spot.y - box.y;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      const ids = item.shapeIds.filter((sid) => editor.getShape(sid as TLShapeId)).map((sid) => sid as TLShapeId);
      if (ids.length > 0) editor.run(() => editor.nudgeShapes(ids, { x: dx, y: dy }), { history: "ignore" });
    }
    return placed;
  }, [ensurePageFrame, itemBounds, occupiedOn, openPage, rectOf, usedCellsOn]);

  // ── Highlighter ─────────────────────────────────────────────────────────────
  // The plain text a shape shows, to decide whether a highlight's words are there.
  const shapeText = useCallback((editor: Editor, shapeId: string): string => {
    const shape = editor.getShape(shapeId as TLShapeId);
    if (!shape) return "";
    const props = shape.props as Record<string, unknown>;
    if (shape.type === "math") return latexToPlain(String(props.latex ?? ""));
    if (shape.type === "graph") {
      const spec = parseGraphSpec(String(props.spec ?? ""), { w: Number(props.w) || GRAPH_SIZE.w, h: Number(props.h) || GRAPH_SIZE.h });
      return spec ? graphSpecText(spec) : "";
    }
    if ("richText" in props) return revealTextRef.current.get(shape.id) ?? plainOf(editor, props.richText);
    return "";
  }, [plainOf]);

  // Where some words (or all the text) sit inside a shape on screen, as page
  // rectangles, one per line. Null when the shape is not laid out right now.
  const textRectsIn = useCallback((editor: Editor, shapeId: string, variants: string[] | null): Rect[] | null => {
    let el: Element | null = null;
    try {
      el = editor.getContainer().querySelector(`[data-shape-id="${CSS.escape(shapeId)}"]`);
    } catch {
      return null;
    }
    if (!el) return null;
    const shape = editor.getShape(shapeId as TLShapeId);
    // Typeset math: only the formula, not its annotation or KaTeX's hidden MathML.
    const root = shape?.type === "math" ? (el.querySelector(".chalk-math > div > span") ?? el) : el;
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (node.parentElement?.closest(".katex-mathml") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let flat = "";
    const at: Array<{ node: Text; offset: number }> = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      for (let i = 0; i < text.data.length; i++) {
        for (const ch of normalizeForMatch(text.data[i])) {
          flat += ch;
          at.push({ node: text, offset: i });
        }
      }
    }
    if (!flat) return [];
    let start = 0;
    let length = flat.length;
    if (variants) {
      const hit = variants.map((v) => ({ v, i: flat.indexOf(v) })).find((h) => h.i >= 0);
      if (!hit) return [];
      start = hit.i;
      length = hit.v.length;
    }
    // One range per text node, so KaTeX's tall layout boxes never count.
    const spans = new Map<Text, { from: number; to: number }>();
    for (const { node, offset } of at.slice(start, start + length)) {
      const span = spans.get(node);
      if (span) span.to = Math.max(span.to, offset + 1);
      else spans.set(node, { from: offset, to: offset + 1 });
    }
    const rects: Rect[] = [];
    for (const [node, { from, to }] of spans) {
      const range = doc.createRange();
      range.setStart(node, from);
      range.setEnd(node, Math.min(node.length, to));
      for (const r of Array.from(range.getClientRects())) {
        if (r.width < 0.5 || r.height < 0.5) continue;
        const a = editor.screenToPage({ x: r.left, y: r.top });
        const b = editor.screenToPage({ x: r.right, y: r.bottom });
        rects.push({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y });
      }
    }
    if (rects.length === 0) return null;
    return mergeLineRects(rects, shape?.type === "math");
  }, []);

  // A mark belongs to the item it marks: it joins that item's shapes (erased
  // with it) and is tagged so the item's size never includes it.
  const markShapes = useCallback((editor: Editor, host: BoardItem, ids: string[], meta: BoardArtifactMeta | Record<string, never>) => {
    if (ids.length === 0) return;
    host.shapeIds = [...host.shapeIds, ...ids];
    try {
      const updates = ids
        .map((sid) => editor.getShape(sid as TLShapeId))
        .filter((shape): shape is NonNullable<typeof shape> => Boolean(shape))
        .map((shape) => ({ id: shape.id, type: shape.type, meta: { ...shape.meta, ...meta, itemId: host.id, mark: true } }));
      if (updates.length > 0) editor.run(() => editor.updateShapes(updates), { history: "ignore" });
    } catch {
      // tagging is a nicety
    }
  }, []);

  // Development check: a mark must land on the item it marks (the Sept 15
  // recording had a ring drawn around empty space).
  const checkMarkLanded = useCallback((editor: Editor, host: BoardItem, ids: string[]) => {
    if (process.env.NODE_ENV === "production") return;
    const target = itemBounds(editor, host, MARK_BOUNDS);
    if (!target) return;
    for (const sid of ids) {
      const b = editor.getShapePageBounds(sid as TLShapeId);
      if (!b) continue;
      const overlaps = b.x < target.x + target.w + 40 && b.x + b.w > target.x - 40 && b.y < target.y + target.h + 40 && b.y + b.h > target.y - 40;
      if (!overlaps) console.warn(`[TldrawCore] a mark for ${host.id} landed away from it`, { mark: { x: b.x, y: b.y, w: b.w, h: b.h }, target });
    }
  }, [itemBounds]);

  // Highlighter strokes, one after another, each grown under the pen. They
  // join the item, so erasing the item erases them too.
  const runHighlights = useCallback((
    editor: Editor,
    itemId: string,
    strokes: HighlightStroke[],
    meta: BoardArtifactMeta | Record<string, never>,
  ) => {
    const reduce = prefersReducedMotion();
    const next = (k: number) => {
      const stroke = strokes[k];
      const host = itemsRef.current.find((i) => i.id === itemId);
      if (!stroke || !host) {
        scheduleCursorHide(editor, 2400);
        return;
      }
      const pts = stroke.points;
      if (pts.length < 2) {
        next(k + 1);
        return;
      }
      const minX = Math.min(...pts.map((pt) => pt.x));
      const minY = Math.min(...pts.map((pt) => pt.y));
      const local = pts.map((pt) => ({ x: pt.x - minX, y: pt.y - minY, z: 0.5 }));
      const segments = (n: number) => compressLegacySegments([{ type: "free", points: local.slice(0, Math.max(2, n)) }]);
      const id = createShapeId();
      editor.run(() => {
        const common = { segments: segments(reduce ? local.length : 2), isComplete: reduce, isPen: false, scale: 1, scaleX: 1, scaleY: 1 };
        editor.createShape({
          id,
          // Words get a highlighter swipe behind the ink. A drawing gets a
          // marker ring: a highlighter ring that size smothers the drawing and
          // runs into its neighbours, and tldraw's highlight `scale` cannot
          // thin it (its SVG export divides positions by the scale).
          type: stroke.ring ? "draw" : "highlight",
          x: minX,
          y: minY,
          opacity: reduce ? 1 : 0,
          props: stroke.ring
            ? { ...common, color: MARK, size: "m", fill: "none", dash: "solid", isClosed: false }
            : { ...common, color: MARK, size: stroke.size },
          meta: { ...meta, itemId, mark: true },
        } as Parameters<Editor["createShape"]>[0]);
      }, { history: "ignore" });
      host.shapeIds = [...host.shapeIds, id];
      checkMarkLanded(editor, host, [id]);
      if (reduce) {
        next(k + 1);
        return;
      }
      moveCursor(editor, pts[0].x, pts[0].y, 240, () => {
        const t0 = performance.now();
        const frame = (now: number) => {
          highlightRafRef.current = null;
          if (!editor.getShape(id)) return;
          const p = Math.min(1, (now - t0) / Math.max(1, stroke.duration));
          const n = Math.max(2, Math.round(local.length * (1 - Math.pow(1 - p, 2))));
          editor.run(() => {
            editor.updateShapes([{ id, type: stroke.ring ? "draw" : "highlight", opacity: 1, props: { segments: segments(n), isComplete: p >= 1 } }] as unknown as Parameters<Editor["updateShapes"]>[0]);
          }, { history: "ignore" });
          const head = pts[n - 1];
          patchPresence(editor, { cursor: { x: head.x, y: head.y, type: "default", rotation: 0 } });
          if (p < 1) {
            highlightRafRef.current = requestAnimationFrame(frame);
            return;
          }
          next(k + 1);
        };
        highlightRafRef.current = requestAnimationFrame(frame);
      });
    };
    next(0);
  }, [checkMarkLanded, moveCursor, patchPresence, scheduleCursorHide]);

  useEffect(() => {
    const timers = scribbleTimersRef.current;
    return () => {
      if (highlightRafRef.current !== null) cancelAnimationFrame(highlightRafRef.current);
      if (cursorAnimRef.current !== null) cancelAnimationFrame(cursorAnimRef.current);
      if (scribbleAnimRef.current !== null) cancelAnimationFrame(scribbleAnimRef.current);
      if (revealRafRef.current !== null) cancelAnimationFrame(revealRafRef.current);
      if (cursorHideRef.current) clearTimeout(cursorHideRef.current);
      for (const t of timers) clearTimeout(t);
    };
  }, []);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    setMountedEditor(editor);
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __chalkEditor?: Editor }).__chalkEditor = editor;
      (window as unknown as { __chalkBoard?: WhiteboardHandle | null }).__chalkBoard = handleRef.current;
    }
    editor.setCurrentTool("hand");
    editor.setCamera({ x: 0, y: 0, z: 1 });
  }, []);

  // Is this page rectangle on screen at a readable zoom?
  const rectVisible = useCallback((editor: Editor, r: Rect): boolean => {
    try {
      const viewport = editor.getViewportPageBounds();
      const zoom = editor.getZoomLevel() || 1;
      const pad = 12 / zoom;
      return (
        zoom >= 0.8 &&
        r.x - pad >= viewport.minX &&
        r.y - pad >= viewport.minY &&
        r.x + r.w + pad <= viewport.maxX &&
        r.y + r.h + pad <= viewport.maxY
      );
    } catch {
      return true;
    }
  }, []);

  // Bring new or referenced work into view. When the board page fits on
  // screen at a readable zoom the camera frames the whole page, so the board
  // holds still while the tutor writes around it; otherwise it frames the
  // work itself. "Visible" also means readable: a student who zoomed far out
  // comes back to a legible zoom.
  const focusOn = useCallback((editor: Editor, x: number, y: number, w = 420, h = 180) => {
    // Mid tool call the shapes are not in their final place yet; endItem focuses.
    if (buildingItemRef.current) return;
    try {
      if (rectVisible(editor, { x, y, w, h })) return;
      // The page that holds it: a mark can point back at an earlier page.
      const current = pageFrameRef.current;
      const frame = current ? pageFrame(current, pageAt(x + w / 2, current.w, PAGE_GAP)) : null;
      const screen = editor.getViewportScreenBounds();
      const cx = x + w / 2;
      const cy = y + h / 2;
      const wholePage = Boolean(
        frame &&
          Math.min(screen.w / frame.w, screen.h / frame.h) >= 0.8 &&
          cx >= frame.x &&
          cx <= frame.x + frame.w &&
          cy >= frame.y &&
          cy <= frame.y + frame.h,
      );
      // Too small a screen for the page (a phone): frame the item's row from
      // the page's left edge, so a row never loses its start off screen, as
      // long as the item itself still fits at the readable zoom (an item in a
      // right-hand panel is framed on its own).
      const pageLeft = frame && cx >= frame.x && cx <= frame.x + frame.w ? Math.min(x, frame.x + PAGE_INSET.left) : x;
      const rowStart = (x + w - pageLeft + 64) * 0.8 <= screen.w ? pageLeft : x;
      // A number line or chart wider than a phone at 0.8 is shown whole, a
      // little further out (never below 0.55), rather than cut at the right.
      const tight = !wholePage && rowStart === x && (w + 64) * 0.8 > screen.w;
      const tightZoom = tight ? Math.min(0.8, Math.max(0.55, (screen.w - 16) / (w + 16))) : null;
      const rect: FocusRect = wholePage && frame
        ? { ...frame }
        : tight
          ? { x: x - 8, y: y - 56, w: w + 16, h: h + 112 }
          : { x: rowStart - 24, y: y - 56, w: x + w - rowStart + 64, h: h + 112 };
      // Coalesce a burst of draws into one camera move on the next frame.
      const pending = pendingFocusRef.current;
      const merge = pending && !wholePage && !pendingIsPageRef.current;
      pendingFocusRef.current = merge ? unionRect(pending, rect) : rect;
      pendingIsPageRef.current = wholePage;
      pendingTightRef.current = merge && pendingTightRef.current !== null ? Math.min(pendingTightRef.current, tightZoom ?? 0.8) : tightZoom;
      if (focusDebounceRef.current.raf !== null) cancelAnimationFrame(focusDebounceRef.current.raf);
      focusDebounceRef.current.raf = requestAnimationFrame(() => {
        focusDebounceRef.current.raf = null;
        const f = pendingFocusRef.current;
        const isPage = pendingIsPageRef.current;
        const tightZoom = pendingTightRef.current;
        pendingTightRef.current = null;
        pendingFocusRef.current = null;
        pendingIsPageRef.current = false;
        if (!f) return;
        try {
          // One planned move. Animating zoomToBounds and then clamping the zoom
          // stopped the first move, so the camera zoomed in place instead.
          const screen = editor.getViewportScreenBounds();
          const camera = planCamera(f, { w: screen.w, h: screen.h }, { inset: isPage || tightZoom !== null ? 0 : 48, maxZoom: 1, minZoom: isPage ? 0.1 : (tightZoom ?? 0.8) });
          editor.setCamera(camera, { animation: { duration: 320 } });
        } catch {
          // Editor may be mid-teardown; a missed camera move is harmless.
        }
      });
    } catch {
      // Camera movement is a nicety; drawing should never fail because of it.
    }
  }, [rectVisible]);

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

  // ── Stroke and line helpers ─────────────────────────────────────────────────
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
      /** See-through (overlapping shading blends); the writing fades it in to this. */
      opacity?: number;
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
      ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
      meta: opts.opacity !== undefined ? { ...currentMeta(), restOpacity: opts.opacity } : currentMeta(),
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


  // Axes with arrowheads, ticks at a readable step, end labels, no outer box.
  // (x, y, w, h) is the plot area; arrowheads and labels reach about 28px past it.
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
    tick(formatNumber(xMin), x - 24, xAxisY + 8, 48);
    tick(formatNumber(xMax), x + w - 24, xAxisY + 8, 48);
    tick(formatNumber(yMax), yAxisX + 8, y - 8, 60, "start");
    tick(formatNumber(yMin), yAxisX + 8, y + h - 20, 60, "start");
    tick("x", x + w + 16, xAxisY - 12, 24, "start");
    tick("y", yAxisX - 26, y - 22, 24, "start");
  }, [createLine, createText, currentMeta]);

  // A graph without Desmos, drawn from what the tutor asked for (a graph
  // spec's source) inside `box`, labels included, so it can stand in for a
  // Desmos picture of the same size. `pens`: curve colours in order, then the
  // slope triangle's.
  const drawVectorGraph = useCallback((editor: Editor, source: GraphSource, box: Rect, pens: TldrawColor[]) => {
    const area = {
      x: box.x + VECTOR_INSET.left,
      y: box.y + VECTOR_INSET.top,
      w: Math.max(80, box.w - VECTOR_INSET.left - VECTOR_INSET.right),
      h: Math.max(60, box.h - VECTOR_INSET.top - VECTOR_INSET.bottom),
    };
    const pen = (i: number): TldrawColor => pens.length > 0 ? pens[i % pens.length] : PEN;
    const dot = (px: number, py: number, color: TldrawColor, label?: string) => {
      createFreeformGeo(editor, "ellipse", px - 6, py - 6, 12, 12, color, "fill", { dash: "solid" });
      if (label) createText(editor, label, px + 8, py - 26, { color, size: "s", font: "sans", width: 140 });
    };
    if (source.kind === "axes") {
      drawAxes(editor, area.x, area.y, area.w, area.h, source.xMin, source.xMax, source.yMin, source.yMax);
      return;
    }
    if (source.kind === "points") {
      const { xMin, xMax, yMin, yMax } = source;
      drawAxes(editor, area.x, area.y, area.w, area.h, xMin, xMax, yMin, yMax);
      const color = pen(0);
      const placed: Pt[] = [];
      for (const point of source.points) {
        if (point.x < xMin || point.x > xMax || point.y < yMin || point.y > yMax) continue;
        const px = area.x + ((point.x - xMin) / (xMax - xMin)) * area.w;
        const py = area.y + area.h - ((point.y - yMin) / (yMax - yMin)) * area.h;
        placed.push({ x: px, y: py });
        createFreeformGeo(editor, "ellipse", px - 6, py - 6, 12, 12, color, "fill", { dash: "solid" });
        if (point.label) createText(editor, point.label, px + 8, py - 26, { color, size: "s", font: "sans", width: 120 });
      }
      if (source.connect && placed.length >= 2) {
        createLineShape(editor, undefined, undefined, placed.length >= 3 ? [...placed, placed[0]] : placed, { color, size: "m", dash: "solid", spline: "line" });
      }
      return;
    }

    // Pictures (number lines, bar charts, figures) are redrawn by their own tools.
    if (source.kind === "number_line" || source.kind === "bar_chart" || source.kind === "figure") return;
    // A function, or free lines and points (draw_desmos): Compute Engine reads
    // LaTeX and plain math; the old parser is the backup.
    const { xMin, xMax } = source;
    const extras: Partial<GraphExtras> = source.kind === "free"
      ? { extraExpressions: source.expressions, markPoints: source.points, yMin: source.yMin, yMax: source.yMax, slopeRun: null }
      : (source.extras ?? {});
    const expression = source.kind === "free" ? "" : source.expression;
    const evaluate = (expr: string): ((v: number) => number) | null => {
      const read = graphFunction(ensureRelation(toDesmosLatex(expr)));
      if (read) return read;
      const plain = createMathEvaluator(expr);
      if (!plain) return null;
      return (v: number) => {
        try {
          return plain(v);
        } catch {
          return NaN;
        }
      };
    };
    const fn = expression ? evaluate(expression) : null;
    const fn2 = extras.secondExpression ? evaluate(extras.secondExpression) : null;
    const curves = [fn, fn2].filter((f): f is (v: number) => number => Boolean(f));
    // Extra lines: what vectors can draw of them (curves, pieces, vertical lines, circles, shading).
    const more = (extras.extraExpressions ?? []).map((raw) => vectorExtra(raw));
    const moreFns = more.flatMap((e) => (e?.line?.kind === "curve" ? [e.line.fn] : []));
    const hasCircle = more.some((e) => e?.line?.kind === "circle");
    const marks = extras.markPoints ?? [];
    const auto = autoYRange([...curves, ...moreFns], xMin, xMax, marks.map((m) => m.y));
    let yLo: number;
    let yHi: number;
    if (hasCircle && extras.yMin === undefined && extras.yMax === undefined) {
      // A circle needs square units: y follows the x range, as on Desmos.
      const span = ((xMax - xMin) * area.h) / area.w;
      const mid = !auto || (auto.bottom <= 0 && auto.top >= 0) ? 0 : (auto.bottom + auto.top) / 2;
      yLo = mid - span / 2;
      yHi = mid + span / 2;
    } else {
      yLo = extras.yMin ?? auto?.bottom ?? -5;
      yHi = extras.yMax ?? auto?.top ?? 5;
      if (!(yHi > yLo)) yHi = yLo + 10;
      const ys = niceStep(yLo, yHi, 6);
      if (extras.yMin === undefined) yLo = Math.floor(yLo / ys) * ys;
      if (extras.yMax === undefined) yHi = Math.ceil(yHi / ys) * ys;
    }
    const px = (v: number) => area.x + ((v - xMin) / (xMax - xMin)) * area.w;
    const py = (v: number) => area.y + area.h - ((v - yLo) / (yHi - yLo)) * area.h;
    const inRange = (v: number) => Number.isFinite(v) && v >= yLo && v <= yHi;
    const clampY = (v: number) => Math.min(yHi, Math.max(yLo, v));
    // Sampled runs, cut where the curve leaves the view (at the edge) or jumps (an asymptote).
    const drawCurve = (f: (v: number) => number, color: TldrawColor, opts: { from?: number | null; to?: number | null; dash?: TLDefaultDashStyle } = {}) => {
      const a = Math.max(xMin, opts.from ?? xMin);
      const b = Math.min(xMax, opts.to ?? xMax);
      if (!(b > a)) return;
      let run: Pt[] = [];
      const flush = () => {
        if (run.length >= 2) createLineShape(editor, undefined, undefined, run, { color, size: "m", dash: opts.dash ?? "solid", spline: "line" });
        run = [];
      };
      const N = Math.max(24, Math.round((160 * (b - a)) / (xMax - xMin)));
      let prevX = a;
      let prevY = f(a);
      for (let i = 0; i <= N; i++) {
        const sx = a + ((b - a) * i) / N;
        const sy = f(sx);
        const jump = Number.isFinite(prevY) && Number.isFinite(sy) && Math.abs(sy - prevY) > (yHi - yLo) * 0.8;
        if (jump) flush();
        if (inRange(sy)) {
          if (run.length === 0 && i > 0 && !jump && Number.isFinite(prevY) && !inRange(prevY)) {
            const edge = prevY > yHi ? yHi : yLo;
            run.push({ x: px(prevX + ((sx - prevX) * (edge - prevY)) / (sy - prevY)), y: py(edge) });
          }
          run.push({ x: px(sx), y: py(sy) });
        } else {
          if (run.length > 0 && Number.isFinite(sy) && Number.isFinite(prevY) && !jump) {
            const edge = sy > yHi ? yHi : yLo;
            run.push({ x: px(prevX + ((sx - prevX) * (edge - prevY)) / (sy - prevY)), y: py(edge) });
          }
          flush();
        }
        prevX = sx;
        prevY = sy;
      }
      flush();
    };
    // Where an extra line is drawn: a circle's outline, clamped to the view.
    const ringOf = (c: { cx: number; cy: number; r: number }): Pt[] => {
      const ring: Pt[] = [];
      for (let i = 0; i <= 72; i++) {
        const t = (i / 72) * Math.PI * 2;
        const x = Math.min(xMax, Math.max(xMin, c.cx + c.r * Math.cos(t)));
        ring.push({ x: px(x), y: py(clampY(c.cy + c.r * Math.sin(t))) });
      }
      return ring;
    };
    // An inequality's side: the pen, see-through so overlapping sides show where
    // both hold, with no outline, under the axes.
    const shadeRegion = (extra: NonNullable<(typeof more)[number]>, color: TldrawColor) => {
      const line = extra.line;
      let region: Pt[] = [];
      if (line?.kind === "curve" && (extra.shade === "above" || extra.shade === "below")) {
        const edge = extra.shade === "above" ? yHi : yLo;
        let prev = NaN;
        for (let i = 0; i <= 80; i++) {
          const sx = xMin + ((xMax - xMin) * i) / 80;
          const sy = line.fn(sx);
          // An asymptote splits the region; better no shading than a wrong one.
          if (!Number.isFinite(sy) || (Number.isFinite(prev) && Math.abs(sy - prev) > (yHi - yLo) * 0.8)) return;
          prev = sy;
          region.push({ x: px(sx), y: py(clampY(sy)) });
        }
        region.push({ x: px(xMax), y: py(edge) }, { x: px(xMin), y: py(edge) });
      } else if (line?.kind === "vertical" && (extra.shade === "left" || extra.shade === "right")) {
        const gx = px(Math.min(xMax, Math.max(xMin, line.x)));
        const far = px(extra.shade === "left" ? xMin : xMax);
        region = [{ x: gx, y: py(yHi) }, { x: far, y: py(yHi) }, { x: far, y: py(yLo) }, { x: gx, y: py(yLo) }];
      } else if (line?.kind === "circle" && extra.shade === "inside") {
        region = ringOf(line).slice(0, -1);
      }
      if (region.length >= 3) createDrawStroke(editor, undefined, undefined, region, { color, fill: "fill", dash: "none", size: "s", isClosed: true, sharp: true, opacity: 0.22 });
    };
    const drawExtra = (extra: NonNullable<(typeof more)[number]>, color: TldrawColor) => {
      const line = extra.line;
      if (!line) return;
      const dash: TLDefaultDashStyle = extra.dashed ? "dashed" : "solid";
      if (line.kind === "curve") {
        drawCurve(line.fn, color, { from: line.from, to: line.to, dash });
      } else if (line.kind === "vertical") {
        if (line.x < xMin || line.x > xMax) return;
        const gx = px(line.x);
        const top = clampY(line.to ?? yHi);
        const bottom = clampY(line.from ?? yLo);
        if (top > bottom) createLineShape(editor, undefined, undefined, [{ x: gx, y: py(top) }, { x: gx, y: py(bottom) }], { color, size: "m", dash, spline: "line" });
      } else {
        createLineShape(editor, undefined, undefined, ringOf(line), { color, size: "m", dash, spline: "line" });
      }
    };
    const extraPen = (expression ? 1 : 0) + (extras.secondExpression ? 1 : 0);
    more.forEach((extra, k) => {
      if (extra) shadeRegion(extra, pen(extraPen + k));
    });
    drawAxes(editor, area.x, area.y, area.w, area.h, xMin, xMax, yLo, yHi);
    more.forEach((extra, k) => {
      if (extra) drawExtra(extra, pen(extraPen + k));
    });
    if (fn) drawCurve(fn, pen(0));
    if (fn2) drawCurve(fn2, pen(1));
    if (expression && !fn) {
      createText(editor, "Could not read that expression", area.x, area.y + area.h / 2 - 12, { color: "red", size: "s", font: "sans", width: area.w, align: "middle" });
    }
    // Where the two curves cross, then the marked points, in ink.
    if (fn && fn2) {
      for (const p of curveCrossings(fn, fn2, xMin, xMax)) {
        if (inRange(p.y)) dot(px(p.x), py(p.y), INK, `(${formatNumber(p.x)}, ${formatNumber(p.y)})`);
      }
    }
    for (const m of marks) {
      if (m.x >= xMin && m.x <= xMax && inRange(m.y)) dot(px(m.x), py(m.y), INK, m.label);
    }
    if (extras.slopeRun && fn) {
      const x1 = Math.min(extras.slopeRun.x1, extras.slopeRun.x2);
      const x2 = Math.max(extras.slopeRun.x1, extras.slopeRun.x2);
      const y1 = fn(x1);
      const y2 = fn(x2);
      if (Number.isFinite(y1) && Number.isFinite(y2)) {
        const sp = pen(1 + (extras.secondExpression ? 1 : 0) + (extras.extraExpressions?.length ?? 0));
        const ax = px(x1);
        const ay = py(y1);
        const bx = px(x2);
        const by = py(y2);
        createLineShape(editor, undefined, undefined, [{ x: ax, y: ay }, { x: bx, y: ay }], { color: sp, size: "s", dash: "dashed" });
        createLineShape(editor, undefined, undefined, [{ x: bx, y: ay }, { x: bx, y: by }], { color: sp, size: "s", dash: "dashed" });
        createFreeformGeo(editor, "ellipse", ax - 5, ay - 5, 10, 10, INK, "fill", { dash: "solid" });
        createFreeformGeo(editor, "ellipse", bx - 5, by - 5, 10, 10, INK, "fill", { dash: "solid" });
        createText(editor, `run ${formatNumber(x2 - x1)}`, (ax + bx) / 2 - 45, by < ay ? ay + 14 : ay - 34, { color: sp, size: "s", font: "sans", width: 90, align: "middle" });
        createText(editor, `rise ${formatNumber(y2 - y1)}`, bx + 8, (ay + by) / 2 - 12, { color: sp, size: "s", font: "sans", width: 100 });
      }
    }
  }, [createDrawStroke, createFreeformGeo, createLineShape, createText, drawAxes]);

  useImperativeHandle(ref, () => {
    // Pictures with both versions draw on Desmos once it has loaded (never
    // waiting on the 4.3 MB script for a number line) and when switched on.
    const desmosPictureFor = (tool: string, figure?: string): boolean => {
      if (vectorOnlyRef.current || desmosStatus() !== "ready") return false;
      if (tool === "draw_figure" && !(figure && DESMOS_FIGURES.has(figure as FigureKind))) return false;
      return desmosPictureTools(undefined, devParam("desmostools")).has(tool);
    };
    const hexPens = (n: number) => takePens(n).map((pen) => MARKER_HEX[pen] ?? MARKER_HEX.blue);

    // A picture's vector version, drawn where the Desmos one stood: drawn in
    // its column as usual, then moved (its caption is already there).
    const drawVectorPictureAt = (editor: Editor, source: GraphSource, at: { x: number; y: number }) => {
      const y0 = leftY.current;
      const building = buildingItemRef.current;
      vectorOnlyRef.current = true;
      buildingItemRef.current = true;
      try {
        if (source.kind === "number_line") api.addNumberLine({ ...source.drawing, label: undefined, column: "left" });
        else if (source.kind === "bar_chart") api.drawBarChart({ ...source.drawing, label: undefined, column: "left" });
        else if (source.kind === "figure") api.drawFigure({ ...source.drawing, label: undefined, column: "left" });
      } finally {
        vectorOnlyRef.current = false;
        buildingItemRef.current = building;
        leftY.current = y0;
      }
      return { dx: at.x - LEFT_X, dy: at.y - y0 };
    };

    // A graph's pens as tldraw colours, read back from its Desmos colours:
    // the curves in order, then the slope triangle (or the joined points).
    const graphPens = (spec: GraphSpec): TldrawColor[] => {
      const pens: TldrawColor[] = [];
      for (const item of spec.expressions) {
        if (isGraphTable(item) || !item.color) continue;
        if (!/^(curve\d+|run|shape|point1)$/.test(item.id)) continue;
        const pen = HEX_MARKER.get(item.color.toLowerCase());
        if (pen) pens.push(pen);
      }
      return pens;
    };

    // Desmos is gone (it failed to load, or never will here): the graph is
    // redrawn as vectors in its own box, under the same item and tool call,
    // and written in again.
    const swapGraphToVector = (editor: Editor, id: TLShapeId, animate = true, reason = "") => {
      const shape = editor.getShape(id);
      if (!shape || shape.type !== "graph") return;
      const gp = shape.props as TLGraphShapeProps;
      const spec = parseGraphSpec(gp.spec, { w: gp.w, h: gp.h });
      if (!spec?.source) {
        // Nothing to draw it with instead (a box plot): it stays a placeholder and the summary says why.
        const issues = reason || `Desmos did not load${desmosFailure() ? ` (${desmosFailure()})` : ""}`;
        editor.run(() => editor.updateShapes([{ id, type: "graph", props: { status: "error", issues } }] as unknown as Parameters<Editor["updateShapes"]>[0]), { history: "ignore" });
        return;
      }
      const source = spec.source;
      const before = currentShapeIdSet(editor);
      let shift = { dx: 0, dy: 0 };
      editor.run(() => {
        if (source.kind === "number_line" || source.kind === "bar_chart" || source.kind === "figure") shift = drawVectorPictureAt(editor, source, shape);
        else drawVectorGraph(editor, source, { x: shape.x, y: shape.y, w: gp.w, h: gp.h }, graphPens(spec));
      }, { history: "ignore" });
      const created = diffStringSet(currentShapeIdSet(editor), before);
      editor.run(() => {
        const updates = created
          .map((sid) => editor.getShape(sid as TLShapeId))
          .filter((s): s is NonNullable<typeof s> => Boolean(s))
          .map((s) => ({ id: s.id, type: s.type, x: s.x + shift.dx, y: s.y + shift.dy, meta: { ...s.meta, ...shape.meta } }));
        if (updates.length > 0) editor.updateShapes(updates);
        editor.deleteShapes([id]);
      }, { history: "ignore" });
      const item = itemsRef.current.find((i) => i.shapeIds.includes(id));
      if (!item) return;
      const updated: BoardItem = { ...item, shapeIds: item.shapeIds.flatMap((sid) => (sid === id ? created : [sid])) };
      itemsRef.current = itemsRef.current.map((i) => (i === item ? updated : i));
      if (animate) revealItem(editor, { ...updated, shapeIds: created }, null);
    };

    // Render a graph spec into a graph shape; board pictures wait for it. A
    // failed load redraws the graph as vectors; a picture that fails for
    // another reason (a stuck calculator) is tried once more, then redrawn too.
    const renderGraphInto = (editor: Editor, id: TLShapeId, spec: GraphSpec, retried = false) => {
      const shape = editor.getShape(id);
      const size = shape ? { w: (shape.props as TLGraphShapeProps).w, h: (shape.props as TLGraphShapeProps).h } : spec.size;
      const drawn = spec.expressions.filter((e) => !isGraphTable(e)).length;
      const job = renderDesmosGraph(spec, size)
        .then(({ svg, errors }) => {
          if (!editor.getShape(id)) return;
          const allFailed = drawn > 0 && errors.length >= drawn;
          const issues = errors.map((e) => `${e.latex}: ${e.message}`).join(" | ");
          editor.run(
            () => editor.updateShapes([{ id, type: "graph", props: { svg, status: allFailed ? "error" : "ready", issues } }] as unknown as Parameters<Editor["updateShapes"]>[0]),
            { history: "ignore" },
          );
        })
        .catch((err: unknown) => {
          if (!editor.getShape(id)) return;
          if (desmosAvailable() && !retried) {
            renderGraphInto(editor, id, spec, true);
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          if (process.env.NODE_ENV !== "production") console.warn("[TldrawCore] graph redrawn without Desmos:", message);
          swapGraphToVector(editor, id, true, desmosAvailable() ? message : "");
        });
      pendingGraphsRef.current.add(job);
      void job.finally(() => pendingGraphsRef.current.delete(job));
    };

    // A graph's place: the next spot in its column, with the caption under
    // the picture's credit strip. `draw` fills the box.
    const placeGraph = (editor: Editor, col: "left" | "right", label: string | undefined, size: GraphSize, draw: (box: Rect) => void) => {
      const x = colX(col);
      const y = colY(col).current;
      draw({ x, y, w: size.w, h: size.h });
      if (label) createText(editor, label, x, y + size.h + GRAPH_CAPTION_GAP, { color: PENCIL, size: "s", font: "sans", width: size.w, align: "middle" });
      colY(col).current += size.h + (label ? 86 : 58);
      return { x, y, w: size.w, h: size.h };
    };

    // A real Desmos graph on the board, with its caption; placed like any drawing.
    const createGraph = (editor: Editor, spec: GraphSpec, label: string | undefined, col: "left" | "right") =>
      placeGraph(editor, col, label, spec.size, ({ x, y }) => {
        const id = createShapeId();
        editor.createShape<TLGraphShape>({
          id,
          type: "graph",
          x,
          y,
          props: { w: spec.size.w, h: spec.size.h, spec: JSON.stringify(spec), svg: "", status: "rendering", issues: "", reveal: 1 },
          meta: currentMeta(),
        });
        renderGraphInto(editor, id, spec);
      });

    // A section heading: its words in sans and a pencil rule at a region's
    // top left. Returns where the section's work starts.
    const writeSectionHeading = (editor: Editor, title: string, region: Rect): number => {
      const headW = Math.min(1120, region.w);
      const measured = measureText(editor, title, "sans", "l", headW);
      createText(editor, title, region.x, region.y, { size: "l", font: "sans", color: INK, width: headW });
      const sectionW = Math.min(headW, Math.max(200, measured.w + 8));
      const ruleY = region.y + measured.h + 6;
      createLine(editor, region.x, ruleY, region.x + sectionW, ruleY, PENCIL);
      return ruleY + 24;
    };

    // What a new section has to fit around on a page: the work under the page
    // heading (a section heading counts as its words, not its row) and the dock.
    const sectionInputs = (editor: Editor, frame: Rect, exclude?: string) => {
      const page = usableArea(frame);
      const content: Rect[] = [];
      let headBottom = page.y;
      for (const item of itemsRef.current) {
        if (item.id === exclude) continue;
        const r = rectOf(editor, item);
        if (!r || !onPage(r, frame)) continue;
        if (item.tool === "start_new_problem") headBottom = Math.max(headBottom, r.y + r.h + LAYOUT_GAP);
        else if (item.tool === "start_board_section") content.push(itemBounds(editor, item) ?? r);
        else content.push(r);
      }
      const below = { x: page.x, y: headBottom, w: page.w, h: Math.max(0, page.y + page.h - headBottom) };
      return { page, content, below, dock: dockBlock(frame) };
    };

    const enterSection = (region: Rect, bodyTop: number) => {
      sectionRegionRef.current = { x: region.x, y: bodyTop, w: region.w, h: Math.max(0, region.y + region.h - bodyTop) };
      headingRowRef.current = { x: region.x, w: region.w };
      rowTopRef.current = region.y;
    };

    // Rewrite the newest section heading where there is room for it and for
    // an item of `size` under it: on this page if anywhere, else on a fresh
    // one. False when there is nowhere better.
    const rehomeSection = (editor: Editor, heading: BoardItem, size: Size): boolean => {
      const current = currentSectionRef.current;
      const region = sectionRegionRef.current;
      const at = placedRectsRef.current.get(heading.id);
      if (!current || current.headingId !== heading.id || !region || !at) return false;
      const headSpace = region.y - at.y;
      let frame = ensurePageFrame(editor);
      const inputs = sectionInputs(editor, frame, heading.id);
      if (inputs.content.length === 0) return false;
      let plan = planSection(inputs.content, inputs.below, [inputs.dock], {
        rowTop: current.rowTop ?? undefined,
        minW: Math.max(PANEL_MIN_W, size.w + 8),
        minH: headSpace + size.h + LAYOUT_GAP,
      });
      if (plan && Math.abs(plan.region.x - at.x) < 1 && Math.abs(plan.region.y - at.y) < 1) return false;
      if (!plan) {
        // Only worth a page if the item fits on an empty one.
        if (size.w > inputs.page.w || headSpace + size.h > inputs.page.h) return false;
        frame = openPage(editor);
        plan = { region: usableArea(frame), kind: "page" };
        current.rowTop = null;
      }
      const old = heading.shapeIds.filter((sid) => editor.getShape(sid as TLShapeId)).map((sid) => sid as TLShapeId);
      if (old.length > 0) editor.deleteShapes(old);
      const before = currentShapeIdSet(editor);
      const bodyTop = writeSectionHeading(editor, current.title, plan.region);
      const ids = diffStringSet(currentShapeIdSet(editor), before);
      const tagged = ids
        .map((sid) => editor.getShape(sid as TLShapeId))
        .filter((shape): shape is NonNullable<typeof shape> => Boolean(shape))
        .map((shape) => ({ id: shape.id, type: shape.type, meta: { ...shape.meta, itemId: heading.id } }));
      if (tagged.length > 0) editor.updateShapes(tagged);
      heading.shapeIds = ids;
      const placed = { x: plan.region.x, y: plan.region.y, w: plan.region.w, h: Math.max(1, bodyTop - 24 - plan.region.y) };
      placedRectsRef.current.set(heading.id, placed);
      enterSection(plan.region, bodyTop);
      revealItem(editor, heading, placed);
      return true;
    };

    // The board as saved: graph pictures are dropped unless `keepGraphs`
    // (an in-memory copy an undo puts straight back).
    const snapshotBoard = (keepGraphs: boolean): WhiteboardSnapshot | null => {
      const editor = editorRef.current;
      if (!editor) return null;
      let store: unknown = null;
      try {
        store = editor.store.getStoreSnapshot();
        if (!keepGraphs) store = withoutGraphPictures(store);
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
          frame: pageFrameRef.current ?? undefined,
          section: sectionRegionRef.current,
          rowTop: rowTopRef.current,
        },
      };
    };

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
      pageFrameRef.current = null;
      sectionRegionRef.current = null;
      headingRowRef.current = null;
      rowTopRef.current = null;
      currentSectionRef.current = null;
      placedRectsRef.current.clear();
    },

    startNewProblem(title: string) {
      const editor = editorRef.current;
      if (!editor) return;
      const callId = currentCallIdRef.current;
      if (callId && itemsRef.current.length > 0) {
        const before = snapshotBoard(true);
        if (before) {
          clearedBoardsRef.current.set(callId, before);
          while (clearedBoardsRef.current.size > 3) clearedBoardsRef.current.delete(clearedBoardsRef.current.keys().next().value as string);
        }
      }
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
      pageFrameRef.current = null;
      sectionRegionRef.current = null;
      headingRowRef.current = null;
      rowTopRef.current = null;
      currentSectionRef.current = null;
      placedRectsRef.current.clear();
      // A fresh page the size of the visible board, headed at its top left.
      const usable = usableArea(ensurePageFrame(editor));
      const headW = Math.min(1120, usable.w);
      // Ink heading with a thin pencil rule, the way a board title is written.
      const measured = measureText(editor, title, "sans", "xl", headW);
      editor.createShape({
        id: createShapeId(),
        type: "text",
        x: usable.x,
        y: usable.y,
        props: {
          richText: toRichText(title),
          size: "xl",
          font: "sans",
          color: INK,
          textAlign: "start",
          w: headW,
          autoSize: false,
          scale: 1,
        },
        meta: currentMeta(),
      });
      const titleW = Math.min(headW, Math.max(240, measured.w + 8));
      const ruleY = usable.y + measured.h + 8;
      createLine(editor, usable.x, ruleY, usable.x + titleW, ruleY, PENCIL);
      recordDirectSemanticAction(
        { type: "start_new_problem", title },
        { bounds: { x: usable.x, y: usable.y, w: titleW, h: 80, column: "full", pageIndex: pageIndex.current } },
      );
    },

    startBoardSection(title: string, freshPage?: boolean) {
      const editor = editorRef.current;
      if (!editor) return;
      // A section is the next panel of the board: beside the work while there
      // is width, then under it, and a fresh page only when neither fits.
      let frame = ensurePageFrame(editor);
      const { content, below, dock } = sectionInputs(editor, frame);
      let rowTop = rowTopRef.current;
      let plan = planSection(content, below, [dock], { rowTop: rowTop ?? undefined });
      if (plan && freshPage && content.length > 0) {
        if (shouldOpenPage({ fits: true, askedForNewPage: true, usedCells: usedCellsOn(editor, frame) })) plan = null;
        else notesRef.current.push("stayed on this page: there was room");
      }
      if (!plan) {
        frame = openPage(editor);
        plan = { region: usableArea(frame), kind: "page" };
        rowTop = null;
      }
      const region = plan.region;
      const bodyTop = writeSectionHeading(editor, title, region);
      enterSection(region, bodyTop);
      currentSectionRef.current = { title, rowTop, headingId: null };
      recordDirectSemanticAction(
        { type: "start_section", title },
        { bounds: { x: region.x, y: region.y, w: Math.min(1120, region.w), h: 60, column: "full", pageIndex: pageIndex.current } },
      );
    },

    drawEquationStep(latex: string, annotation?: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
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
      const curves = 1 + (extras?.secondExpression ? 1 : 0) + (extras?.extraExpressions?.length ?? 0);
      const pens = takePens(curves + (extras?.slopeRun ? 1 : 0));
      let b: Rect;
      if (desmosAvailable()) {
        const { spec } = buildFunctionGraph({
          expression,
          second: extras?.secondExpression,
          extras: extras?.extraExpressions,
          xMin,
          xMax,
          yMin: extras?.yMin,
          yMax: extras?.yMax,
          markPoints: extras?.markPoints,
          slopeRun: extras?.slopeRun ?? null,
          colors: pens.map((pen) => MARKER_HEX[pen] ?? MARKER_HEX.blue),
          box: GRAPH_SIZE,
        });
        b = createGraph(editor, spec, label, col);
      } else {
        const source: GraphSource = { kind: "function", expression, xMin, xMax, extras: extras ? { ...extras } : undefined };
        b = placeGraph(editor, col, label, GRAPH_SIZE, (box) => drawVectorGraph(editor, source, box, pens));
      }
      recordDirectSemanticAction(
        { type: "function_graph", expression, x_min: xMin, x_max: xMax, label, column: col },
        { bounds: { ...b, column: col, pageIndex: pageIndex.current } },
      );
    },

    addTable(columns: string, rows: string, title?: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      const tableText = formatTableText(columns, rows);
      const lineCount = tableText.split("\n").length + (title ? 2 : 0);
      const h = Math.max(96, lineCount * 24 + 26);
      const w = 560;
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
      if (desmosPictureFor("add_number_line")) {
        const spec = buildNumberLineGraph({ ...opts, colors: hexPens(opts.intervals.length + opts.marks.length + opts.jumps.length) });
        const b = createGraph(editor, spec, opts.label, col);
        recordDirectSemanticAction(
          { type: "number_line", min: opts.min, max: opts.max, text: opts.marks.map((m) => (m.label ? `${m.value}:${m.label}` : `${m.value}`)).join(", "), label: opts.label, column: col },
          { bounds: { ...b, column: col, pageIndex: pageIndex.current } },
        );
        return;
      }
      const { min, max } = opts;
      const step = opts.step ?? niceStep(min, max);
      const w = DIAGRAM_W;
      const PAD = 26; // arrow overhang past the first and last tick
      const hasJumps = opts.jumps.length > 0;
      const tickStyle = opts.labelStyle ?? autoTickStyle(step);
      const rel = (v: number) => PAD + ((v - min) / (max - min)) * (w - PAD * 2);
      const textW = (t: string) => Math.ceil(measureText(editor, t, "sans", "s", null).w) + 8;
      const ticks = tickValues(min, max, step);
      // A dot between ticks says its value under the line (Sept 16 2026: dots
      // at 3 and 11 on a line ticked in twos showed only "P1y" and "P2y").
      const onTick = (v: number) => ticks.some((t) => Math.abs(t - v) <= Math.abs(step) * 1e-6);
      const markValues = [...new Set(opts.marks.map((m) => m.value))].filter((v) => !onTick(v));
      const bottomItems = [
        ...ticks.map((v) => ({ x: rel(v), w: textW(formatTick(v, step, tickStyle)) })),
        ...markValues.map((v) => ({ x: rel(v), w: textW(formatTick(v, step, tickStyle)) })),
      ];
      const bottomLanes = labelLanes(bottomItems).slice(ticks.length);
      // Labels above the line: ranges first, then the first dot at each value.
      const topLabels: Array<{ text: string; x: number; kind: "range" | "mark"; index: number }> = [];
      opts.intervals.forEach((iv, i) => {
        if (!iv.label) return;
        const from = Math.max(min, iv.from);
        const to = Math.min(max, iv.to);
        const x1 = iv.from < min ? 0 : rel(from);
        const x2 = iv.to > max ? w : rel(to);
        topLabels.push({ text: iv.label, x: (x1 + x2) / 2, kind: "range", index: i });
      });
      const firstAt = new Set<number>();
      opts.marks.forEach((m, i) => {
        if (!m.label || firstAt.has(m.value)) return;
        firstAt.add(m.value);
        topLabels.push({ text: m.label, x: rel(m.value), kind: "mark", index: i });
      });
      const topLanes = labelLanes(topLabels.map((l) => ({ x: l.x, w: textW(l.text) })));
      const topRows = topLabels.length ? Math.max(...topLanes) + 1 : 0;
      const bottomRows = bottomLanes.length ? Math.max(0, ...bottomLanes) + 1 : 1;
      const top = Math.max(hasJumps ? 74 : 18, topRows ? 44 + (topRows - 1) * 20 : 0);
      const second = opts.secondMin !== undefined && opts.secondMax !== undefined && opts.secondMax !== opts.secondMin;
      const SECOND_DY = 70 + (bottomRows - 1) * 18;
      const h = top + 46 + (bottomRows - 1) * 18 + (second ? SECOND_DY : 0) + (opts.label ? 30 : 0);
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
      });

      // The axis, then ticks with labels.
      arrow(x, x + w, { color: INK, size: "m", startHead: true, endHead: true });
      for (const v of ticks) {
        const tx = px(v);
        const label = formatTick(v, step, tickStyle);
        const lw = Math.max(64, textW(label));
        createLine(editor, tx, lineY - 8, tx, lineY + 8, INK);
        createText(editor, label, tx - lw / 2, lineY + 14, { color: PENCIL, size: "s", font: "sans", width: lw, align: "middle" });
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
      });
      markValues.forEach((v, j) => {
        const first = opts.marks.findIndex((m) => m.value === v);
        const label = formatTick(v, step, tickStyle);
        const lw = Math.max(64, textW(label));
        createText(editor, label, px(v) - lw / 2, lineY + 14 + bottomLanes[j] * 18, { color: markPen(first), size: "s", font: "sans", width: lw, align: "middle" });
      });
      topLabels.forEach((l, j) => {
        const color = l.kind === "range" ? intervalPen(l.index) : markPen(l.index);
        const lw = Math.max(80, textW(l.text));
        createText(editor, l.text, x + l.x - lw / 2, lineY - 40 - topLanes[j] * 20, { color, size: "s", font: "sans", width: lw, align: "middle" });
      });

      // Hop arrows arc above the line; a negative bend curves upward.
      opts.jumps.forEach((j, i) => {
        const x1 = px(j.from);
        const x2 = px(j.to);
        arrow(x1, x2, { color: jumpPen(i), size: "s", startHead: false, endHead: true, bend: x2 > x1 ? -46 : 46, label: j.label, dy: -8 });
      });

      if (opts.label) {
        createText(editor, opts.label, x, lineY + 44 + (bottomRows - 1) * 18 + (second ? SECOND_DY : 0), { color: PENCIL, size: "s", font: "sans", width: w, align: "middle" });
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
      const b = desmosAvailable()
        ? createGraph(editor, buildAxesGraph({ xMin, xMax, yMin, yMax, box: GRAPH_SIZE }), label, col)
        : placeGraph(editor, col, label, GRAPH_SIZE, (box) => drawVectorGraph(editor, { kind: "axes", xMin, xMax, yMin, yMax }, box, []));
      recordDirectSemanticAction(
        { type: "coordinate_axes", x_min: xMin, x_max: xMax, y_min: yMin, y_max: yMax, label, column: col },
        { bounds: { ...b, column: col, pageIndex: pageIndex.current } },
      );
    },

    plotPoints(points: string, xMin: number, xMax: number, yMin: number, yMax: number, label?: string, column?: "left" | "right", connect?: boolean) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "right";
      const pens = takePens(1);
      const parsed = parseCoordinatePoints(points);
      const b = desmosAvailable()
        ? createGraph(
            editor,
            buildPointsGraph({ points: parsed, connect: connect === true, xMin, xMax, yMin, yMax, colors: pens.map((pen) => MARKER_HEX[pen] ?? MARKER_HEX.blue), box: GRAPH_SIZE }),
            label,
            col,
          )
        : placeGraph(editor, col, label, GRAPH_SIZE, (box) =>
            drawVectorGraph(editor, { kind: "points", points: parsed, connect: connect === true, xMin, xMax, yMin, yMax }, box, pens),
          );
      recordDirectSemanticAction(
        { type: "plot_points", text: points, x_min: xMin, x_max: xMax, y_min: yMin, y_max: yMax, label, column: col },
        { bounds: { ...b, column: col, pageIndex: pageIndex.current } },
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
      const x = colX(col);
      const y = colY(col).current;
      createText(editor, text, x, y, { size: "m", font: "draw", color: PENCIL, width: textW });
      // Tag drawn as a box plus its own text: a geo label would grow the box.
      // It decorates the words, so a strike or ring on them leaves it alone.
      const beforeTag = currentShapeIdSet(editor);
      createBox(editor, x + usedW + 14, y + 3, 58, 28, "", PENCIL, "solid");
      createText(editor, "you", x + usedW + 14, y + 5, { size: "s", font: "sans", color: PENCIL, width: 58, align: "middle" });
      const tagShapes = diffStringSet(currentShapeIdSet(editor), beforeTag)
        .map((sid) => editor.getShape(sid as TLShapeId))
        .filter((shape): shape is NonNullable<typeof shape> => Boolean(shape));
      if (tagShapes.length > 0) editor.updateShapes(tagShapes.map((shape) => ({ id: shape.id, type: shape.type, meta: { ...shape.meta, decor: true } })));
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "student_attempt", text, column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
      );
    },

    addCallout(text: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      // A small sky tag sized to its words (Sept 16 2026). The sticky notes it
      // replaces were 220 px squares in six colours, the loudest thing on the
      // board, and the colours meant nothing once every mark was sky.
      const PAD_X = 14;
      const PAD_Y = 9;
      const maxW = 360;
      const measured = measureText(editor, text, "sans", "s", maxW - PAD_X * 2);
      const w = Math.min(maxW, Math.ceil(measured.w) + PAD_X * 2 + 6);
      const h = Math.ceil(measured.h) + PAD_Y * 2;
      const x = colX(col);
      const y = colY(col).current;
      createBox(editor, x, y, w, h, "", "sky", "semi", { size: "s" });
      createText(editor, text, x + PAD_X, y + PAD_Y, { color: INK, size: "s", font: "sans", width: w - PAD_X * 2 });
      colY(col).current += h + ROW_GAP;
      focusOn(editor, x, y, w, h);
      recordDirectSemanticAction(
        { type: "text_note", text, size: "body", column: col },
        { bounds: { x, y, w, h, column: col, pageIndex: pageIndex.current } },
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

    addEquationSequence(stepList: string[], annotationList: string[], title?: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "left";
      const titleHeight = title ? 38 : 0;
      const totalHeight = titleHeight + stepList.length * (EQ_H + EQ_ROW_GAP);
      const x = colX(col);
      let y = colY(col).current;

      if (title) {
        createText(editor, title, x, y, { color: PENCIL, size: "s", font: "sans", width: 520 });
        y += titleHeight;
      }

      let cy = y;
      const created = stepList.map((latex, index) => {
        const line = createMath(editor, { latex, annotation: annotationList[index] || undefined, x, y: cy, display: true });
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
        { type: "equation_sequence", steps: stepList.join(" | "), annotations: annotationList.join(" | "), title, column: col },
        {
          shapeIds: created.map((line) => line.id),
          bounds: { x, y: colY(col).current - totalHeight, w: 520, h: totalHeight, column: col, pageIndex: pageIndex.current },
        },
      );
    },

    addAreaModel(title: string, rowLabels: string, columnLabels: string, cells: string, column?: "left" | "right") {
      const editor = editorRef.current;
      if (!editor) return;
      const col = column ?? "right";
      const rows = splitPipeList(rowLabels).map(latexToPlain);
      const cols = splitPipeList(columnLabels).map(latexToPlain);
      const cellRows = splitRows(cells).map((row) => row.map(latexToPlain));
      const rowCount = Math.max(rows.length, cellRows.length, 1);
      const colCount = Math.max(cols.length, ...cellRows.map((row) => row.length), 1);
      const labelW = 74;
      const headerH = 38;
      const cellW = Math.max(72, Math.min(108, Math.floor((520 - labelW) / colCount)));
      const cellH = 46;
      const gridW = labelW + colCount * cellW;
      const gridH = headerH + rowCount * cellH;
      const h = gridH + 58;
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
      if (desmosPictureFor("draw_figure", opts.figure)) {
        const pens = opts.sideLabels.length + opts.angleLabels.length + (opts.radiusLabel ? 1 : 0) + (opts.diameterLabel ? 1 : 0) + (opts.heightLabel ? 1 : 0) + 1;
        const { spec } = buildFigureGraph({ ...opts, colors: hexPens(pens) });
        const b = createGraph(editor, spec, opts.label, col);
        recordDirectSemanticAction({ type: "figure", text: opts.figure, label: opts.label, column: col }, { bounds: { ...b, column: col, pageIndex: pageIndex.current } });
        return;
      }
      const PAD = 48;
      const SIZE: Record<FigureKind, [number, number]> = {
        rectangle: [260, 150], square: [200, 200], circle: [180, 180], triangle: [230, 170], right_triangle: [230, 170],
        parallelogram: [260, 140], trapezoid: [250, 140], rhombus: [230, 150], pentagon: [200, 200], hexagon: [210, 190],
        rectangular_prism: [270, 176], cube: [205, 190], cylinder: [150, 200],
      };
      const [fw, fh] = SIZE[opts.figure] ?? [230, 170];
      const w = fw + PAD * 2;
      const h = fh + PAD * 2 + (opts.label ? 22 : 0);
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
        figureSideLabels(opts.figure, opts.sideLabels).edges.slice(0, pts.length).forEach((text, i) => {
          if (!text) return;
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
      const GROUP_GAP = 30;
      const BLOCK_GAP = 18;
      const MAX_W = 560;
      const countW = 56;
      const cell = ICON + GAP;
      const groupSize = opts.groupSize && opts.groupSize >= 2 ? opts.groupSize : 0;
      const arrange = opts.arrange ?? "rows";
      const specs = [
        { icon: opts.icon, count: opts.count, crossed: opts.crossed ?? 0 },
        ...(opts.secondIcon && opts.secondCount ? [{ icon: opts.secondIcon, count: opts.secondCount, crossed: 0 }] : []),
      ];

      type Spot = { x: number; y: number };
      type Box = { x: number; y: number; w: number; h: number };
      type Block = { spots: Spot[]; w: number; h: number; boxes: Box[] };

      // A grid, optionally with a gap after every `gs` icons. Whole groups
      // never split across a row: a student read "groups of 5" as groups of
      // 20 when two groups shared a row (Sept 15).
      const grid = (count: number, perRow: number, gs: number, boxed: boolean): Block => {
        const spots: Spot[] = [];
        for (let i = 0; i < count; i++) {
          const c = i % perRow;
          const g = gs ? Math.floor(c / gs) : 0;
          spots.push({ x: c * cell + g * (GROUP_GAP - GAP), y: Math.floor(i / perRow) * cell });
        }
        const groupsPerRow = gs ? Math.max(1, Math.round(perRow / gs)) : 1;
        const rows = Math.max(1, Math.ceil(count / perRow));
        const boxes: Box[] = [];
        if (boxed && gs) {
          for (let s = 0; s < count; s += gs) {
            const n = Math.min(gs, count - s);
            const first = spots[s];
            const last = spots[s + n - 1];
            if (!first || !last || first.y !== last.y) continue;
            boxes.push({ x: first.x - 7, y: first.y - 7, w: last.x + ICON - first.x + 14, h: ICON + 14 });
          }
        }
        return {
          spots,
          w: Math.min(count, perRow) * cell - GAP + (groupsPerRow - 1) * (GROUP_GAP - GAP),
          h: rows * cell - GAP,
          boxes,
        };
      };

      const build = (count: number): Block => {
        if (arrange === "ring") {
          const r = Math.max(74, (count * cell) / (2 * Math.PI));
          const spots: Spot[] = [];
          for (let i = 0; i < count; i++) {
            const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
            spots.push({ x: r + r * Math.cos(a), y: r + r * Math.sin(a) });
          }
          return { spots, w: 2 * r + ICON, h: 2 * r + ICON, boxes: [] };
        }
        if (arrange === "ten_frame") {
          const frames = Math.max(1, Math.ceil(count / 10));
          const frameW = 5 * cell - GAP + 14;
          const frameH = 2 * cell - GAP + 14;
          // Two frames are 556px against a 560px column, so they only sit side by
          // side with a gap tighter than GROUP_GAP. 23 reads as 10 + 10 + 3.
          const FRAME_GAP = 24;
          const perRow = Math.max(1, Math.floor((MAX_W + FRAME_GAP) / (frameW + FRAME_GAP)));
          const spots: Spot[] = [];
          const boxes: Box[] = [];
          for (let f = 0; f < frames; f++) {
            const ox = (f % perRow) * (frameW + FRAME_GAP);
            const oy = Math.floor(f / perRow) * (frameH + FRAME_GAP);
            boxes.push({ x: ox - 7, y: oy - 7, w: frameW, h: frameH });
            for (let i = f * 10; i < Math.min(count, f * 10 + 10); i++) {
              const k = i % 10;
              spots.push({ x: ox + (k % 5) * cell, y: oy + Math.floor(k / 5) * cell });
            }
          }
          return {
            spots,
            w: Math.min(frames, perRow) * (frameW + FRAME_GAP) - FRAME_GAP,
            h: Math.ceil(frames / perRow) * (frameH + FRAME_GAP) - FRAME_GAP,
            boxes,
          };
        }
        if (arrange === "array") {
          const cols = Math.max(1, Math.min(opts.columns ?? groupSize ?? Math.ceil(Math.sqrt(count)), 20));
          return grid(count, cols, 0, false);
        }
        if (groupSize) {
          const groupW = groupSize * cell - GAP;
          const perRowGroups = Math.max(1, Math.floor((MAX_W + GROUP_GAP) / (groupW + GROUP_GAP)));
          return grid(count, perRowGroups * groupSize, groupSize, arrange === "groups");
        }
        return grid(count, Math.max(1, Math.min(count, Math.floor(MAX_W / cell))), 0, false);
      };

      const blocks = specs.map((sp) => build(sp.count));
      const w = Math.max(...blocks.map((b) => b.w)) + countW + 8;
      const h = blocks.reduce((sum, b) => sum + b.h, 0) + (blocks.length - 1) * BLOCK_GAP + (opts.label ? 34 : 0) + 4;
      const x = colX(col);
      const y = colY(col).current;
      let cy = y;
      specs.forEach((sp, bi) => {
        const block = blocks[bi];
        for (const b of block.boxes) {
          createFreeformGeo(editor, "rectangle", x + b.x, cy + b.y, b.w, b.h, PENCIL, "none", { dash: "dashed" });
        }
        block.spots.forEach((spot, i) => {
          editor.createShape<TLIconShape>({
            id: createShapeId(),
            type: "icon",
            x: x + spot.x,
            y: cy + spot.y,
            props: { w: ICON, h: ICON, icon: sp.icon, crossed: i >= sp.count - sp.crossed, reveal: 1 },
            meta: currentMeta(),
          });
        });
        createText(editor, `${sp.count}`, x + block.w + 10, cy + Math.min(block.h, ICON) / 2 - 12, { color: PENCIL, size: "s", font: "sans", width: countW });
        cy += block.h + BLOCK_GAP;
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
      if (desmosPictureFor("draw_bar_chart")) {
        const spec = buildBarChartGraph({ ...opts, colors: hexPens(opts.categories.length) });
        const b = createGraph(editor, spec, opts.label, col);
        recordDirectSemanticAction(
          { type: "bar_chart", text: opts.categories.map((c, i) => `${c}=${opts.values[i]}`).join(", "), label: opts.label, column: col },
          { bounds: { ...b, column: col, pageIndex: pageIndex.current } },
        );
        return;
      }
      const w = 440;
      const CHART_H = 200;
      const PAD_L = 64;
      const PAD_B = 34;
      const PAD_T = opts.label ? 44 : 16;
      const h = PAD_T + CHART_H + PAD_B + 4;
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
      const measure = (t: string) => {
        const m = measureText(editor, t, "sans", "s", 180);
        return { w: Math.ceil(m.w) + 6, h: Math.ceil(m.h) };
      };
      for (const l of placeSketchLabels(opts.strokes, opts.labels, opts.width, opts.height, measure)) {
        createText(editor, l.text, x + l.x, y + l.y, { color: PENCIL, size: "s", font: "sans", width: l.w, align: "middle" });
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
      const meta = currentMeta();
      if (idx < 0) {
        // Not an equation line: ring, underline, or box any item by label
        // (a student's attempt, a note), drawn once what it marks is written.
        const item = target.step_label ? resolveItemTarget(itemsRef.current, target.step_label) : null;
        const b = item ? itemBounds(editor, item) : null;
        if (!item || !b) return false;
        notePage(editor, item);
        enqueue({
          kind: "action",
          wait: style === "circle" ? 1100 : 600,
          run: () => {
            const host = itemsRef.current.find((i) => i.id === item.id);
            const bb = host ? itemBounds(editor, host, MARK_BOUNDS) : null;
            if (!host || !bb) return;
            focusOn(editor, bb.x - 16, bb.y - 16, bb.w + 32, bb.h + 32);
            if (style === "circle") {
              runHighlights(editor, host.id, [{ points: ringPoints(bb, 10), size: "m", duration: 900, ring: true }], meta);
              return;
            }
            const before = currentShapeIdSet(editor);
            if (style === "underline") {
              createLineShape(editor, undefined, undefined, [{ x: bb.x - 4, y: bb.y + bb.h + 6 }, { x: bb.x + bb.w + 4, y: bb.y + bb.h + 6 }], { color: MARK, size: "m", dash: "solid" });
            } else {
              createBox(editor, bb.x - 8, bb.y - 6, bb.w + 16, bb.h + 12, "", MARK, "none", { dash: "dashed" });
            }
            const ids = diffStringSet(currentShapeIdSet(editor), before);
            markShapes(editor, host, ids, meta);
            checkMarkLanded(editor, host, ids);
            revealItem(editor, { ...host, shapeIds: ids }, bb);
          },
        });
        recordDirectSemanticAction(
          { type: "highlight_step", step_label: target.step_label, style },
          { shapeIds: [], bounds: { x: b.x, y: b.y, w: b.w, h: b.h, pageIndex: pageIndex.current } },
        );
        return true;
      }
      const line = lines[idx];
      const lineCallId = currentCallIdRef.current;
      enqueue({
        kind: "action",
        wait: 500,
        run: () => {
          const shape = editor.getShape(line.shape.id) as TLMathShape | undefined;
          if (!shape) return;
          const bb = editor.getShapePageBounds(line.shape.id);
          if (bb) focusOn(editor, bb.x, bb.y, bb.w, bb.h);
          if (lineCallId) mathChangesRef.current = [...mathChangesRef.current, { callId: lineCallId, id: shape.id, prop: "highlight" as const, prev: shape.props.highlight }].slice(-200);
          editor.updateShapes([{ id: line.shape.id, type: "math", props: { highlight: style } }] as unknown as Parameters<Editor["updateShapes"]>[0]);
        },
      });
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
      const meta = currentMeta();
      if (idx < 0) {
        // Not an equation line: strike through any item by label, once it is written.
        const item = target.step_label ? resolveItemTarget(itemsRef.current, target.step_label) : null;
        const b = item ? itemBounds(editor, item) : null;
        if (!item || !b) return false;
        notePage(editor, item);
        enqueue({
          kind: "action",
          wait: 600,
          run: () => {
            const host = itemsRef.current.find((i) => i.id === item.id);
            const bb = host ? itemBounds(editor, host, MARK_BOUNDS) : null;
            if (!host || !bb) return;
            focusOn(editor, bb.x, bb.y, bb.w, bb.h);
            const before = currentShapeIdSet(editor);
            createLineShape(editor, undefined, undefined, [{ x: bb.x - 6, y: bb.y + bb.h * 0.55 }, { x: bb.x + bb.w + 6, y: bb.y + bb.h * 0.45 }], { color: STRIKE, size: "m", dash: "solid" });
            const ids = diffStringSet(currentShapeIdSet(editor), before);
            markShapes(editor, host, ids, meta);
            checkMarkLanded(editor, host, ids);
            revealItem(editor, { ...host, shapeIds: ids }, bb);
          },
        });
        recordDirectSemanticAction(
          { type: "cross_out_step", step_label: target.step_label },
          { shapeIds: [], bounds: { x: b.x, y: b.y, w: b.w, h: b.h, pageIndex: pageIndex.current } },
        );
        return true;
      }
      const line = lines[idx];
      const lineCallId = currentCallIdRef.current;
      enqueue({
        kind: "action",
        wait: 500,
        run: () => {
          const shape = editor.getShape(line.shape.id) as TLMathShape | undefined;
          if (!shape) return;
          const bb = editor.getShapePageBounds(line.shape.id);
          if (bb) focusOn(editor, bb.x, bb.y, bb.w, bb.h);
          if (lineCallId) mathChangesRef.current = [...mathChangesRef.current, { callId: lineCallId, id: shape.id, prop: "crossOut" as const, prev: shape.props.crossOut }].slice(-200);
          editor.updateShapes([{ id: line.shape.id, type: "math", props: { crossOut: true } }] as unknown as Parameters<Editor["updateShapes"]>[0]);
        },
      });
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
          ...(currentCallIdRef.current ? { callId: currentCallIdRef.current } : {}),
        },
        fn,
      );
    },

    getSnapshot() {
      return snapshotBoard(false);
    },

    getBoardSummary() {
      const editor = editorRef.current;
      const title = semanticBoardRef.current.title;
      const frame = pageFrameRef.current;
      if (!editor || !frame || itemsRef.current.length === 0) return formatBoardItems(itemsRef.current, title);
      // Where each item sits and where the page is still empty, in words, on
      // the page area a named `place` resolves against. Work on another page
      // says which page it is on.
      const usable = usableArea(frame);
      const places: Record<string, string> = {};
      const here: Rect[] = [];
      for (const item of itemsRef.current) {
        const r = rectOf(editor, item);
        if (!r) continue;
        const onThis = pageAt(r.x + r.w / 2, frame.w, PAGE_GAP);
        if (onThis === pageIndex.current) {
          places[item.id] = regionName(r, usable);
          here.push(r);
        } else {
          places[item.id] = `page ${onThis}`;
        }
      }
      const issues: Record<string, string> = {};
      for (const item of itemsRef.current) {
        for (const sid of item.shapeIds) {
          const shape = editor.getShape(sid as TLShapeId);
          if (shape?.type !== "graph") continue;
          const gp = shape.props as TLGraphShapeProps;
          const notes: string[] = [];
          if (gp.issues) notes.push(gp.status === "error" ? `could not draw: ${gp.issues}` : `some lines did not draw: ${gp.issues}`);
          // What the student can drag in Explore, or what they changed there.
          if (onExploreRef.current && gp.status === "ready") {
            const spec = parseGraphSpec(gp.spec, { w: gp.w, h: gp.h });
            const changed = spec?.studentState?.summary;
            if (changed) notes.push(`the student changed it in Explore: ${changed.length > 140 ? `${changed.slice(0, 139)}…` : changed}`);
            else if (isExplorable(spec) && hasExploreControls(spec)) notes.push(`Explore: ${exploreHint(spec)}`);
          }
          if (notes.length > 0) issues[item.id] = notes.join("; ");
        }
      }
      return formatBoardItems(itemsRef.current, title, 10, {
        places,
        free: freeSpace([...here, dockBlock(frame)], usable),
        page: pageIndex.current,
        seen: visiblePage(editor, frame, pageIndex.current),
        issues,
      });
    },

    beginItem(tool: string, callId?: string): ItemToken {
      const editor = editorRef.current;
      buildingItemRef.current = true;
      placeRequestRef.current = null;
      notesRef.current = [];
      currentCallIdRef.current = callId ?? null;
      return {
        tool,
        shapes: editor ? currentShapeIdSet(editor) : new Set<string>(),
        eqs: new Set<string>(),
      };
    },

    setPlacement(request: PlaceRequest | null) {
      placeRequestRef.current = request;
    },

    canUseDesmos() {
      return desmosAvailable();
    },

    desmosFor(tool: string, figure?: string) {
      return desmosPictureFor(tool, figure);
    },

    drawGraph(build: (colors: string[]) => GraphSpec, opts: { pens: number; label?: string; column?: "left" | "right"; summary?: string }) {
      const editor = editorRef.current;
      if (!editor) return;
      const col = opts.column ?? "right";
      const spec = build(hexPens(Math.max(1, opts.pens)));
      const b = createGraph(editor, spec, opts.label, col);
      recordDirectSemanticAction(
        { type: "bar_chart", text: opts.summary ?? spec.kind, label: opts.label, column: col },
        { bounds: { ...b, column: col, pageIndex: pageIndex.current } },
      );
    },

    getGraph(itemId: string) {
      return exploreTargetFor(itemId);
    },

    applyGraphSpec(itemId: string, spec: GraphSpec) {
      const editor = editorRef.current;
      const item = itemsRef.current.find((i) => i.id === itemId);
      if (!editor || !item) return false;
      const shape = item.shapeIds.map((sid) => editor.getShape(sid as TLShapeId)).find((s) => s?.type === "graph");
      if (!shape) return false;
      // The old picture stays up until the new one is drawn.
      editor.run(
        () => editor.updateShapes([{ id: shape.id, type: "graph", props: { spec: JSON.stringify(spec) } }] as unknown as Parameters<Editor["updateShapes"]>[0]),
        { history: "ignore" },
      );
      renderGraphInto(editor, shape.id, spec);
      return true;
    },

    takeNotes() {
      const notes = notesRef.current;
      notesRef.current = [];
      return notes;
    },

    itemsSnapshot() {
      return itemsRef.current.map((item) => ({ ...item }));
    },

    // A tool call the model cancelled (the student spoke over it) should leave
    // no trace: a recorded session kept drawings for calls that never finished.
    undoCall(callId: string) {
      const editor = editorRef.current;
      if (!editor || !callId) return "";
      const cleared = clearedBoardsRef.current.get(callId);
      if (cleared) {
        clearedBoardsRef.current.delete(callId);
        resetReveal();
        api.loadSnapshot(cleared);
        return "put back the board the new problem had cleared";
      }
      const said: string[] = [];
      const queued = revealQueueRef.current.length;
      revealQueueRef.current = revealQueueRef.current.filter((job) => job.callId !== callId);
      if (revealQueueRef.current.length < queued) said.push(`dropped ${queued - revealQueueRef.current.length} queued step${queued - revealQueueRef.current.length === 1 ? "" : "s"}`);
      const shapes = editor.getCurrentPageShapes().filter((shape) => (shape.meta as { callId?: unknown }).callId === callId);
      if (shapes.length > 0) {
        editor.run(() => editor.deleteShapes(shapes.map((shape) => shape.id)), { history: "ignore" });
        said.push(`erased ${shapes.length} shape${shapes.length === 1 ? "" : "s"}`);
      }
      const gone = new Set<string>(shapes.map((shape) => shape.id));
      const removed = itemsRef.current.filter((item) => item.callId === callId);
      itemsRef.current = itemsRef.current
        .filter((item) => item.callId !== callId)
        .map((item) => (item.shapeIds.some((sid) => gone.has(sid)) ? { ...item, shapeIds: item.shapeIds.filter((sid) => !gone.has(sid)) } : item));
      for (const item of removed) placedRectsRef.current.delete(item.id);
      if (removed.length > 0) said.push(`removed ${removed.map((item) => item.id).join(", ")}`);
      const changes = mathChangesRef.current.filter((c) => c.callId === callId);
      for (const change of changes.reverse()) {
        if (!editor.getShape(change.id as TLShapeId)) continue;
        editor.updateShapes([{ id: change.id, type: "math", props: { [change.prop]: change.prev } }] as unknown as Parameters<Editor["updateShapes"]>[0]);
      }
      if (changes.length > 0) said.push("took back a line mark");
      mathChangesRef.current = mathChangesRef.current.filter((c) => c.callId !== callId);
      return said.join(", ");
    },

    endItem(token: ItemToken, label: string | null, owner: "tutor" | "student" = "tutor"): string | null {
      buildingItemRef.current = false;
      // Marks queue their work during the call; the call id stays on those
      // jobs, and is cleared once this call's own work is placed.
      const callId = currentCallIdRef.current;
      queueMicrotask(() => {
        if (currentCallIdRef.current === callId) currentCallIdRef.current = null;
      });
      const request = placeRequestRef.current;
      placeRequestRef.current = null;
      const editor = editorRef.current;
      if (!editor) return null;
      const shapeIds = diffStringSet(currentShapeIdSet(editor), token.shapes);
      const eqItemIds: string[] = [];
      if (shapeIds.length === 0) return null;
      // Only drawing adds an item. Marks draw from the queue after the call,
      // onto the item they mark; anything a mark drew during the call is a bug.
      if (toolRole(token.tool) !== "draw") {
        if (process.env.NODE_ENV !== "production") console.warn(`[TldrawCore] ${token.tool} drew ${shapeIds.length} shape(s) during its call; marks belong in the queue`);
        return null;
      }
      const id = `b${++itemSeqRef.current}`;
      const item: BoardItem = {
        id,
        tool: token.tool,
        label: itemLabelFrom(label, token.tool.replaceAll("_", " ")),
        shapeIds,
        eqItemIds,
        owner: token.tool === "add_student_attempt" ? "student" : owner,
        createdAt: Date.now(),
        ...(token.content ? { content: token.content } : {}),
        ...(currentCallIdRef.current ? { callId: currentCallIdRef.current } : {}),
      };
      itemsRef.current = [...itemsRef.current, item].slice(-200);
      // Into free space on the board. Headings place themselves.
      let placed: Rect | null;
      if (PLACE_SKIP.has(token.tool)) {
        // A heading owns its row (a section heading, its panel's width), so
        // nothing squeezes in beside it.
        const b = itemBounds(editor, item);
        const pageRow = pageFrameRef.current ? usableArea(pageFrameRef.current) : null;
        const row = token.tool === "start_board_section" && headingRowRef.current ? headingRowRef.current : pageRow;
        placed = b && row ? { x: row.x, y: b.y, w: row.w, h: b.h } : b;
        if (token.tool === "start_board_section" && currentSectionRef.current && !currentSectionRef.current.headingId) {
          currentSectionRef.current.headingId = id;
        }
      } else {
        // The first thing under a section heading may move the heading with it.
        const previous = itemsRef.current[itemsRef.current.length - 2];
        const heading = previous && previous.id === currentSectionRef.current?.headingId ? previous : null;
        placed = placeItem(editor, item, request, heading ? (size) => rehomeSection(editor, heading, size) : undefined);
      }
      if (placed) placedRectsRef.current.set(id, placed);
      // Tools still draw at the old column cursors; placement moves the result.
      leftY.current = START_Y;
      rightY.current = START_Y;
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
      revealItem(editor, item, placed ?? itemBounds(editor, item));
      if (placed) focusOn(editor, placed.x, placed.y, placed.w, placed.h);
      currentCallIdRef.current = null;
      return id;
    },

    pointAt(target: string) {
      const editor = editorRef.current;
      if (!editor) return null;
      const item = resolveItemTarget(itemsRef.current, target);
      if (!item) return null;
      const b = itemBounds(editor, item);
      if (!b) return null;
      notePage(editor, item);
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
      notePage(editor, item);
      const meta = currentMeta();
      if (keep) {
        recordDirectSemanticAction(
          { type: "highlight_step", step_label: item.label, style: "circle" },
          { shapeIds: [], bounds: { x: b.x, y: b.y, w: b.w, h: b.h, pageIndex: pageIndex.current } },
        );
      }
      enqueue({
        kind: "action",
        wait: keep ? 1100 : 700,
        run: () => {
          const host = itemsRef.current.find((i) => i.id === item.id);
          const bb = host ? itemBounds(editor, host, MARK_BOUNDS) : null;
          if (!host || !bb) return;
          focusOn(editor, bb.x - 16, bb.y - 16, bb.w + 32, bb.h + 32);
          // A kept ring is a real sky stroke that belongs to the item; the
          // laser ring is the tutor's presence and fades.
          if (keep) runHighlights(editor, host.id, [{ points: ringPoints(bb, 12), size: "m", duration: 900, ring: true }], meta);
          else tutorScribble(editor, ringPoints(bb, 12), { duration: 640, hold: 3000, size: 5 });
        },
      });
      return item;
    },

    highlight(target: string, text: string | undefined) {
      const editor = editorRef.current;
      if (!editor) return null;
      const item = resolveItemTarget(itemsRef.current, target);
      if (!item) return null;
      const box = itemBounds(editor, item);
      if (!box) return null;
      notePage(editor, item);
      const variants = text && text.trim() ? matchVariants(text) : null;
      const isMark = (sid: string) => {
        const shape = editor.getShape(sid as TLShapeId);
        return !shape || shape.type === "highlight" || (shape.meta as { mark?: unknown }).mark === true;
      };
      const own = item.shapeIds.filter((sid) => !isMark(sid));
      // Decide now whether the words are on the board, so the result can say so.
      const holder = variants
        ? own.find((sid) => {
            const plain = normalizeForMatch(shapeText(editor, sid));
            return variants.some((v) => plain.includes(v));
          })
        : undefined;
      const part: "text" | "item" = holder ? "text" : "item";
      const textual = own.every((sid) => {
        const type = editor.getShape(sid as TLShapeId)?.type;
        return type === "math" || type === "text";
      });
      const meta = currentMeta();
      const swipes = (rects: Rect[]): HighlightStroke[] =>
        rects.slice(0, 4).map((r) => {
          const swipe = highlightSwipeFor(r);
          return { points: swipe.points, size: swipe.size as TLDefaultSizeStyle, duration: Math.min(620, 260 + Math.max(r.w, r.h) * 1.4) };
        });
      const draw = () => {
        const host = itemsRef.current.find((i) => i.id === item.id);
        if (!host) return;
        // Words on a Desmos graph (a labelled point, "rise 4"): a dab on the
        // point or the label. A graph's only DOM text is its credit, so a
        // graph never falls back to measuring text.
        const holderShape = holder ? editor.getShape(holder as TLShapeId) : undefined;
        const onGraph = holderShape?.type === "graph";
        if (holderShape && onGraph && variants) {
          const gp = holderShape.props as TLGraphShapeProps;
          const gb = editor.getShapePageBounds(holderShape.id);
          const spec = parseGraphSpec(gp.spec, { w: gp.w, h: gp.h });
          const marker = spec ? findMarker(spec, (label) => variants.some((v) => normalizeForMatch(label).includes(v))) : undefined;
          if (spec && marker && gb) {
            const dab = markerBox(marker, spec.bounds, { w: gp.w, h: gp.h });
            runHighlights(editor, item.id, swipes([{ x: gb.x + dab.x, y: gb.y + dab.y, w: dab.w, h: dab.h }]), meta);
            return;
          }
        }
        let strokes = holder && variants && !onGraph ? swipes(textRectsIn(editor, holder, variants) ?? []) : [];
        // The words could not be measured: mark the line they are in.
        if (strokes.length === 0 && !onGraph && (holder || textual)) {
          strokes = swipes((holder ? [holder] : own).flatMap((sid) => textRectsIn(editor, sid, null) ?? []));
        }
        // A drawing: a marker ring around it.
        if (strokes.length === 0) {
          const bb = itemBounds(editor, host, MARK_BOUNDS) ?? box;
          strokes = [{ points: ringPoints(bb, 10), size: "m", duration: 900, ring: true }];
        }
        runHighlights(editor, item.id, strokes, meta);
      };
      enqueue({
        kind: "action",
        wait: part === "text" ? 1300 : textual ? 2400 : 1500,
        run: () => {
          const host = itemsRef.current.find((i) => i.id === item.id);
          const bb = (host && itemBounds(editor, host, MARK_BOUNDS)) ?? box;
          const moving = !rectVisible(editor, bb);
          focusOn(editor, bb.x, bb.y, bb.w, bb.h);
          if (!moving) {
            draw();
            return;
          }
          // Measure once the camera has arrived and the words are on screen.
          const t = setTimeout(draw, 420);
          scribbleTimersRef.current.push(t);
        },
      });
      return { item, part };
    },

    eraseItems(targets: string[]) {
      const editor = editorRef.current;
      if (!editor) return [];
      const erased: string[] = [];
      const goneIds = new Set<string>();
      // Erased space stays free for the next drawing. Nothing slides up, so
      // what the student is looking at never jumps.
      for (const target of targets) {
        const item = resolveItemTarget(itemsRef.current.filter((i) => !goneIds.has(i.id)), target);
        if (!item) continue;
        goneIds.add(item.id);
        erased.push(item.label);
        placedRectsRef.current.delete(item.id);
        const shapeIds = item.shapeIds.filter((id) => editor.getShape(id as TLShapeId)).map((id) => id as TLShapeId);
        if (shapeIds.length > 0) editor.deleteShapes(shapeIds);
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
      if (pendingGraphsRef.current.size > 0) {
        await Promise.race([Promise.allSettled([...pendingGraphsRef.current]), new Promise((resolve) => setTimeout(resolve, 8000))]);
        // A graph Desmos could not draw is written in again as vectors.
        await awaitRevealIdle();
      }
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
      pageFrameRef.current = snap.pageState?.frame ?? null;
      sectionRegionRef.current = snap.pageState?.section ?? legacySection(pageFrameRef.current, snap.pageState?.sectionTop);
      headingRowRef.current = null;
      rowTopRef.current = snap.pageState?.rowTop ?? null;
      currentSectionRef.current = null;
      placedRectsRef.current.clear();
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
      // Saved boards carry graph specs, not pictures: draw them again, with
      // Desmos when it is here, else as vectors (once the items are back, so
      // the vectors join the graph's item; shown at once, not written in).
      for (const shape of editor.getCurrentPageShapes()) {
        if (shape.type !== "graph") continue;
        const gp = shape.props as TLGraphShapeProps;
        if (gp.svg) continue;
        const spec = parseGraphSpec(gp.spec, { w: gp.w, h: gp.h });
        if (spec && desmosAvailable()) renderGraphInto(editor, shape.id, spec);
        else if (spec) swapGraphToVector(editor, shape.id, false);
      }
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
        themes={BOARD_THEMES}
        autoFocus={autoFocus}
        hideUi
        components={TLDRAW_COMPONENTS}
        overlayUtils={OVERLAY_UTILS}
        shapeUtils={SHAPE_UTILS}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      />
      {onExplore && mountedEditor && <ExploreButtons editor={mountedEditor} activeItemId={exploringItemId} open={openExplore} />}
    </div>
  );
});

export default TldrawCore;
