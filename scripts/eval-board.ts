// The fake whiteboard both offline evals run tools against. It remembers
// items and the problem title but draws nothing. Marks (pointing, rings,
// highlights) never become items: they belong to the item they mark, which is
// how the real board works since the Sept 16 marking fix.
import { formatBoardItems, isHeadingItem, itemLabelFrom, resolveItemTarget, type BoardItem } from "../lib/board-items";
import type { ItemToken, WhiteboardHandle } from "../components/TldrawCore";

/** Tools that mark, look, erase or remember: they never add an item to the board. */
export const NON_CREATING_TOOLS = new Set([
  "point_at", "circle_item", "highlight", "highlight_step", "cross_out_step",
  "erase_items", "erase_older", "look_at_board", "look_at_worksheet", "clear_whiteboard", "remember_about_student",
]);

export type FakeBoard = {
  handle: WhiteboardHandle;
  items: () => BoardItem[];
  title: () => string | undefined;
};

export function createFakeBoard(): FakeBoard {
  let items: BoardItem[] = [];
  let title: string | undefined;
  let seq = 0;
  // Methods the handle gains in later phases are allowed here as extras.
  const base: Partial<WhiteboardHandle> & Record<string, unknown> = {
    beginItem: (tool: string): ItemToken => ({ tool, shapes: new Set(), eqs: new Set() }),
    endItem: (token: ItemToken, label: string | null) => {
      if (label === null || NON_CREATING_TOOLS.has(token.tool)) return null;
      const id = `b${++seq}`;
      items = [...items, {
        id,
        tool: token.tool,
        label: itemLabelFrom(label, token.tool),
        shapeIds: [`shape:${id}`],
        eqItemIds: [],
        owner: token.tool === "add_student_attempt" ? "student" : "tutor",
        createdAt: Date.now(),
      }];
      return id;
    },
    getBoardSummary: () => formatBoardItems(items, title),
    startNewProblem: (t: string) => { items = []; title = t; },
    clearWhiteboard: () => { items = []; title = undefined; },
    withDirectMeta: (_meta, fn) => fn(),
    setPlacement: () => undefined,
    pointAt: (target: string) => resolveItemTarget(items, target),
    circleItem: (target: string) => resolveItemTarget(items, target),
    highlight: (target: string) => {
      const item = resolveItemTarget(items, target);
      return item ? { item, part: "item" as const } : null;
    },
    eraseItems: (targets: string[]) => {
      const gone: string[] = [];
      for (const t of targets) {
        const item = resolveItemTarget(items, t);
        if (item) { gone.push(item.label); items = items.filter((i) => i.id !== item.id); }
      }
      return gone;
    },
    eraseOlder: (keep: number) => {
      const body = items.filter((i) => !isHeadingItem(i));
      const victims = body.slice(0, Math.max(0, body.length - keep));
      items = items.filter((i) => !victims.includes(i));
      return victims.map((v) => v.label);
    },
    highlightStep: () => true,
    crossOutStep: () => true,
    exportImage: async () => null,
    // Later-phase handle methods. Without these the Proxy below would answer
    // `undefined`, which the dispatcher reads as "Desmos is unavailable".
    canUseDesmos: () => true,
    itemsSnapshot: () => items,
    undoCall: () => undefined,
    takeNotes: () => [],
  };
  const handle = new Proxy(base as unknown as WhiteboardHandle, {
    get(target, prop) {
      if (prop in target) return (target as unknown as Record<string | symbol, unknown>)[prop];
      return () => undefined;
    },
  });
  return { handle, items: () => items, title: () => title };
}
