import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBoardItems, itemLabelFrom, parseTargetList, resolveItemTarget, ringPoints, type BoardItem } from "./board-items";

const item = (id: string, tool: string, label: string, owner: "tutor" | "student" = "tutor"): BoardItem => ({
  id, tool, label, shapeIds: [`shape:${id}`], eqItemIds: [], owner, createdAt: 0,
});
const items = [
  item("b1", "start_new_problem", "One half"),
  item("b2", "draw_fraction", "1 circle cut into 2 equal parts, 1 shaded (1/2), captioned \"one half of the pizza\""),
  item("b3", "add_student_attempt", "a half means one piece out of two", "student"),
  item("b4", "add_number_line", "number line from 0 to 2, ticks every 1/4"),
];

test("targets resolve by id, label fragment, kind, or 'last'", () => {
  assert.equal(resolveItemTarget(items, "b2")?.id, "b2");
  assert.equal(resolveItemTarget(items, " B3")?.id, "b3");
  assert.equal(resolveItemTarget(items, "3")?.id, "b3");
  assert.equal(resolveItemTarget(items, "pizza")?.id, "b2");
  assert.equal(resolveItemTarget(items, "number line")?.id, "b4");
  assert.equal(resolveItemTarget(items, "last")?.id, "b4");
  assert.equal(resolveItemTarget(items, "the shaded pizza circle")?.id, "b2");
  assert.equal(resolveItemTarget(items, "b9"), null);
  assert.equal(resolveItemTarget(items, "zebra"), null);
});

test("labels come from the result sentence, trimmed", () => {
  assert.equal(itemLabelFrom("Drew 1 circle cut into 2 equal parts, 1 shaded (1/2).", "x"), "1 circle cut into 2 equal parts, 1 shaded (1/2)");
  assert.equal(itemLabelFrom("Wrote the line x = 4.", "x"), "x = 4");
  assert.equal(itemLabelFrom("", "draw_sketch"), "draw_sketch");
  assert.ok(itemLabelFrom("a".repeat(200), "x").length <= 90);
});

test("the summary lists ids, kinds, and owners", () => {
  const s = formatBoardItems(items, "One half");
  assert.ok(s.startsWith('"One half". 4 items: b1 heading: One half; b2 fraction: 1 circle'));
  assert.ok(s.includes("b3 student attempt (student):"));
  assert.ok(s.includes("point_at"));
  assert.equal(formatBoardItems([], "T"), '"T". The board is empty.');
  assert.ok(formatBoardItems(items, undefined, 2).includes("(oldest 2 not listed)"));
});

test("target lists split on pipes and commas; rings close on themselves", () => {
  assert.deepEqual(parseTargetList("b3|b4, b5"), ["b3", "b4", "b5"]);
  const pts = ringPoints({ x: 0, y: 0, w: 100, h: 40 });
  assert.equal(pts.length, 45);
  assert.ok(pts.every((p) => p.x > -30 && p.x < 130 && p.y > -30 && p.y < 70));
});

test("long labels keep their caption", async () => {
  const { itemLabelFrom } = await import("./board-items");
  const long = `Drew a tape diagram: 1 box = 100 pieces ${"| ".repeat(40)}, captioned "a whole is 100%".`;
  const label = itemLabelFrom(long, "draw_tape_diagram");
  assert.ok(label.startsWith("a whole is 100%: "), label);
  assert.ok(label.length <= 92, String(label.length));
});

test("targets with separators match by tokens", async () => {
  const { resolveItemTarget } = await import("./board-items");
  const items = [
    { id: "b1", tool: "draw_figure", label: "a right triangle with sides 3, 4, ?; vertices A, B, C", shapeIds: [], eqItemIds: [], owner: "tutor" as const, createdAt: 0 },
    { id: "b2", tool: "draw_angle", label: "a 110° angle next to a 70° angle labelled ?", shapeIds: [], eqItemIds: [], owner: "tutor" as const, createdAt: 0 },
  ];
  assert.equal(resolveItemTarget(items, "3 | 4")?.id, "b1");
  assert.equal(resolveItemTarget(items, "sides 3, 4")?.id, "b1");
  assert.equal(resolveItemTarget(items, "70°")?.id, "b2");
  assert.equal(resolveItemTarget(items, "180"), null);
});

test("a bare number prefers an item whose label says it, else the id", async () => {
  const { resolveItemTarget } = await import("./board-items");
  const items = [
    { id: "b1", tool: "start_new_problem", label: "7 apples, 3 eaten", shapeIds: [], eqItemIds: [], owner: "tutor" as const, createdAt: 0 },
    { id: "b2", tool: "draw_icons", label: "7 apples, 3 crossed out", shapeIds: [], eqItemIds: [], owner: "tutor" as const, createdAt: 0 },
    { id: "b3", tool: "add_student_attempt", label: "\"4\"", shapeIds: [], eqItemIds: [], owner: "student" as const, createdAt: 0 },
  ];
  assert.equal(resolveItemTarget(items, "4")?.id, "b3");
  assert.equal(resolveItemTarget(items, "b2")?.id, "b2");
  assert.equal(resolveItemTarget(items, "2")?.id, "b2");
});
