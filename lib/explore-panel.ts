// Where the Explore panel opens on a laptop or tablet (Sept 17 2026): over
// the graph it came from, so the student sees one graph, not two, and big
// enough that the live graph is about the board graph's size next to
// Desmos's expression list (which needs the panel above 450 px to sit
// beside the graph). It keeps clear of the session chrome: the title chip
// and End button along the top, and the voice dock with its transcript sheet
// down the right. Phones get a bottom sheet instead. Pure; tested in
// explore-panel.test.ts.

export type PanelRect = { x: number; y: number; w: number; h: number };

/** The session chrome, in px from the board's edges. */
export const PANEL_TOP = 64; // 16 + the 36 px chips + 12
export const PANEL_EDGE = 16;
export const DOCK_COLUMN = 388; // 16 + the 340 px dock + the sheet's 20 px lip + 12
export const DOCK_BLOCK_H = 270; // 16 + the 200 px dock + its 36 px pills and gaps + 18

// Desmos's expression list beside the graph paper.
const LIST_W = 340;
const MIN_W = 560;
const MAX_W = 800;
const MIN_H = 440;
const MAX_H = 620;
const GAP = 16;

type Area = { left: number; top: number; right: number; bottom: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The panel's box in a board of `board` px, in order of preference: over the
 * whole graph inside the area clear of the dock column; over it reaching
 * into that column (still above the dock); beside it; over as much of it as
 * fits.
 */
export function placeExplorePanel(graph: PanelRect, board: { w: number; h: number }): PanelRect {
  const besideDock = board.w - PANEL_EDGE - DOCK_COLUMN >= MIN_W;
  const area = (right: number, bottom: number): Area => ({ left: PANEL_EDGE, top: PANEL_TOP, right: board.w - right, bottom: board.h - bottom });
  const clear = besideDock ? area(DOCK_COLUMN, PANEL_EDGE) : area(PANEL_EDGE, DOCK_BLOCK_H);
  const wide = area(PANEL_EDGE, DOCK_BLOCK_H);
  const cx = graph.x + graph.w / 2;
  const cy = graph.y + graph.h / 2;
  const sizeIn = (a: Area, most = Infinity) => {
    const w = Math.min(a.right - a.left, most, clamp(graph.w + LIST_W, MIN_W, MAX_W));
    return { w, h: Math.min(a.bottom - a.top, clamp(w * 0.72, MIN_H, MAX_H)) };
  };
  const centredIn = (a: Area): PanelRect => {
    const { w, h } = sizeIn(a);
    return { x: clamp(cx - w / 2, a.left, a.right - w), y: clamp(cy - h / 2, a.top, a.bottom - h), w, h };
  };
  const covers = (r: PanelRect) => r.x <= graph.x && r.y <= graph.y && r.x + r.w >= graph.x + graph.w && r.y + r.h >= graph.y + graph.h;
  const done = (r: PanelRect): PanelRect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

  const over = centredIn(clear);
  if (covers(over)) return done(over);
  const overWide = centredIn(wide);
  if (covers(overWide)) return done(overWide);
  // Beside the graph, in the room on its left or right.
  const roomLeft = graph.x - GAP - clear.left;
  const roomRight = clear.right - (graph.x + graph.w + GAP);
  const side = roomLeft >= roomRight ? "left" : "right";
  const room = Math.max(roomLeft, roomRight);
  if (room >= MIN_W) {
    const { w, h } = sizeIn(clear, room);
    const x = side === "left" ? graph.x - GAP - w : graph.x + graph.w + GAP;
    return done({ x, y: clamp(cy - h / 2, clear.top, clear.bottom - h), w, h });
  }
  return done(over);
}
