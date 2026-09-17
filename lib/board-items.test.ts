import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBoardItems, highlightSizeFor, highlightSwipeFor, itemLabelFrom, matchVariants, mergeLineRects, normalizeForMatch, swipePoints, parseTargetList, resolveItemTarget, ringPoints, RING_OVERLAP, toolRole, type BoardItem } from "./board-items";

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
  assert.equal(pts.length, 49);
  assert.ok(pts.every((p) => p.x > -40 && p.x < 140 && p.y > -40 && p.y < 80));
});

test("rings enclose every corner of wide, square and tall items", () => {
  const inside = (pt: { x: number; y: number }, poly: Array<{ x: number; y: number }>) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };
  for (const [w, h] of [[40, 40], [100, 40], [300, 40], [560, 110], [800, 40], [40, 300]]) {
    const pts = ringPoints({ x: 0, y: 0, w, h }, 10);
    // One full turn (the ring overlaps its start a little past that).
    const loop = pts.slice(0, Math.floor((pts.length * 2 * Math.PI) / (2 * Math.PI + RING_OVERLAP)));
    for (const corner of [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: 0, y: h }, { x: w, y: h }]) {
      assert.ok(inside(corner, loop), `${w}×${h}: corner ${corner.x},${corner.y} is outside the ring`);
    }
    // Snug: no more than about a tenth wider than the item plus its padding.
    const widest = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    assert.ok(widest <= (w + 20) * 1.12 + 4, `${w}×${h}: ring is needlessly wide (${Math.round(widest)} for ${w})`);
  }
});

test("marks, erasing, looking and memory never count as drawing", () => {
  for (const mark of ["point_at", "circle_item", "highlight", "highlight_step", "cross_out_step"]) assert.equal(toolRole(mark), "mark");
  assert.equal(toolRole("erase_older"), "erase");
  assert.equal(toolRole("look_at_board"), "look");
  assert.equal(toolRole("remember_about_student"), "memory");
  assert.equal(toolRole("draw_fraction"), "draw");
  assert.equal(toolRole("draw_desmos"), "draw");
});

test("a stacked fraction gets an upright swipe as wide as the text; a word gets a flat one", () => {
  const tall = highlightSwipeFor({ x: 200, y: 100, w: 16, h: 50 });
  assert.ok(tall.points.every((pt) => pt.x === 208), "vertical");
  assert.ok(tall.width <= 27, `pen fits the fraction's width, got ${tall.width}`);
  assert.ok(Math.min(...tall.points.map((p) => p.y)) >= 100 && Math.max(...tall.points.map((p) => p.y)) <= 150);
  const wide = highlightSwipeFor({ x: 100, y: 50, w: 80, h: 30 });
  const ys = wide.points.map((p) => p.y);
  assert.ok(Math.max(...ys) - Math.min(...ys) <= 2.01, "flat");
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

test("the summary can say where items sit and where the board is empty", () => {
  const s = formatBoardItems(items, "One half", 10, { places: { b2: "top left", b4: "right" }, free: "the bottom third", page: 2 });
  assert.ok(s.includes("b2 fraction (top left): 1 circle"), s);
  assert.ok(s.includes("b4 number line (right):"), s);
  assert.ok(s.includes("Free space: the bottom third."), s);
  assert.ok(s.includes("board page 2"), s);
  assert.ok(s.includes("highlight"), s);
});

test("the summary names the page of work the student cannot see", () => {
  const s = formatBoardItems(items, "One half", 10, { places: { b2: "page 1", b4: "top left" }, page: 2, seen: 1 });
  assert.ok(s.includes("b2 fraction (page 1)"), s);
  assert.ok(s.includes("New work goes on board page 2; the student is looking at page 1."), s);
  assert.ok(s.includes("out of sight until you point at them"), s);
  const one = formatBoardItems(items, "One half", 10, { places: { b2: "top left" }, page: 1, seen: 1 });
  assert.ok(!one.includes("page"), one);
});

test("highlight text matches typeset forms", () => {
  assert.equal(normalizeForMatch("2x + 3 \u2212 1"), "2x+3-1");
  assert.equal(normalizeForMatch("x^2"), normalizeForMatch("x²"));
  assert.equal(normalizeForMatch("x^{10}"), normalizeForMatch("x¹⁰"));
  assert.equal(normalizeForMatch("a_1"), normalizeForMatch("a₁"));
  assert.equal(normalizeForMatch("3 \u22c5 4"), normalizeForMatch("3*4"));
  assert.deepEqual(matchVariants("3/4"), ["3/4", "34", "43"]);
  assert.equal(normalizeForMatch("1\u200b2"), "12");
  assert.deepEqual(matchVariants(" 11 "), ["11"]);
});

test("highlighter strokes fit the words they cover", () => {
  assert.equal(highlightSizeFor(32).size, "m");
  assert.equal(highlightSizeFor(40).size, "l");
  assert.equal(highlightSizeFor(20).size, "s");
  const w = 26.88;
  const pts = swipePoints({ x: 100, y: 50, w: 80, h: 30 }, w);
  assert.ok(Math.abs(pts[0].x - w / 2 - 95) < 0.01, "left end just past the words");
  assert.ok(Math.abs(pts[pts.length - 1].x + w / 2 - 185) < 0.01, "right end just past the words");
  assert.ok(pts.every((pt) => Math.abs(pt.y - 65) <= 1));
  // A short word gets a swipe tldraw will not collapse into a dot: the run
  // clears the two dropped end zones (a third of the stroke size each) with
  // 1px points between them.
  const narrow = swipePoints({ x: 100, y: 0, w: 10, h: 30 }, w);
  const first = narrow[0].x;
  const last = narrow[narrow.length - 1].x;
  const size = w + 1;
  assert.ok(Math.abs((first + last) / 2 - 105) < 0.01, "centred on the word");
  assert.ok(last - first >= (size * 2) / 3 + 4 - 0.01, `run ${last - first}`);
  const inner = narrow.filter((pt) => pt.x - first > size / 3 && last - pt.x > size / 3);
  assert.ok(inner.length >= 2, `points that survive smoothing: ${inner.length}`);
});

test("glyph rectangles merge into lines", () => {
  const rects = [{ x: 0, y: 0, w: 10, h: 20 }, { x: 12, y: 1, w: 10, h: 20 }, { x: 0, y: 30, w: 15, h: 20 }];
  assert.deepEqual(mergeLineRects(rects), [{ x: 0, y: 0, w: 22, h: 21 }, { x: 0, y: 30, w: 15, h: 20 }]);
  assert.deepEqual(mergeLineRects(rects, true), [{ x: 0, y: 0, w: 22, h: 50 }]);
  assert.deepEqual(mergeLineRects([]), []);
});

test("the summary flags a graph that did not draw", () => {
  const s = formatBoardItems(items, "One half", 10, { issues: { b2: "could not draw: y=sin x" } });
  assert.ok(s.includes("[could not draw: y=sin x]"), s);
});
