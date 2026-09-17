import { test } from "node:test";
import assert from "node:assert/strict";
import { DOCK_BLOCK_H, DOCK_COLUMN, PANEL_EDGE, PANEL_TOP, placeExplorePanel, type PanelRect } from "./explore-panel";

const within = (r: PanelRect, board: { w: number; h: number }, right: number, bottom: number) =>
  r.x >= PANEL_EDGE && r.y >= PANEL_TOP && r.x + r.w <= board.w - right && r.y + r.h <= board.h - bottom;
const covers = (r: PanelRect, g: PanelRect) => r.x <= g.x && r.y <= g.y && r.x + r.w >= g.x + g.w && r.y + r.h >= g.y + g.h;

const laptop = { w: 1392, h: 900 };

test("on a laptop the panel covers its graph, clear of the chips and the dock column", () => {
  const graph = { x: 200, y: 200, w: 420, h: 315 };
  const r = placeExplorePanel(graph, laptop);
  assert.ok(within(r, laptop, DOCK_COLUMN, PANEL_EDGE), JSON.stringify(r));
  assert.ok(covers(r, graph), "one graph on screen, not two");
  // The live graph gets about the board graph's width beside Desmos's list.
  assert.equal(r.w, 420 + 340);
  assert.equal(r.h, Math.round(760 * 0.72));
  assert.equal(r.x, Math.round(200 + 210 - 380));
});

test("a graph reaching under the title chip gets the panel beside it, not over its lower part", () => {
  const graph = { x: 20, y: 30, w: 336, h: 252 };
  const r = placeExplorePanel(graph, laptop);
  assert.equal(r.x, graph.x + graph.w + 16);
  assert.equal(r.y, PANEL_TOP);
  assert.ok(within(r, laptop, DOCK_COLUMN, PANEL_EDGE));
});

test("a graph by the dock column is covered reaching into the column, above the dock", () => {
  const graph = { x: 720, y: 172, w: 420, h: 315 };
  const r = placeExplorePanel(graph, { w: 1440, h: 900 });
  assert.ok(covers(r, graph), JSON.stringify(r));
  assert.ok(within(r, { w: 1440, h: 900 }, PANEL_EDGE, DOCK_BLOCK_H), "never over the dock itself");
});

test("a graph too tall to cover gets the panel beside it", () => {
  const graph = { x: 760, y: 80, w: 420, h: 700 };
  const r = placeExplorePanel(graph, laptop);
  assert.ok(r.x + r.w <= graph.x - 16 || r.x >= graph.x + graph.w + 16, JSON.stringify(r));
  assert.ok(within(r, laptop, DOCK_COLUMN, PANEL_EDGE));
  assert.ok(r.w >= 560);
});

test("on a narrow tablet the panel may pass the dock column but stays above the dock", () => {
  const board = { w: 768, h: 1024 };
  const r = placeExplorePanel({ x: 300, y: 500, w: 300, h: 225 }, board);
  assert.ok(within(r, board, PANEL_EDGE, DOCK_BLOCK_H), JSON.stringify(r));
  assert.ok(r.w >= 560);
});

test("a short window gives the panel what room there is", () => {
  const board = { w: 1280, h: 480 };
  const r = placeExplorePanel({ x: 400, y: 100, w: 336, h: 252 }, board);
  assert.equal(r.h, 480 - PANEL_TOP - PANEL_EDGE);
  assert.ok(within(r, board, DOCK_COLUMN, PANEL_EDGE));
});
