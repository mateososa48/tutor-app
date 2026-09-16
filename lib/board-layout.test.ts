import { test } from "node:test";
import assert from "node:assert/strict";
import { findSpot, freeSpace, overlaps, parsePlace, regionName, type Rect } from "./board-layout";

const usable: Rect = { x: 0, y: 0, w: 1120, h: 600 };

test("an empty board starts at the top left", () => {
  assert.deepEqual(findSpot({ w: 300, h: 100 }, [], usable), { x: 0, y: 0 });
});

test("work continues down the first column, then moves to the next", () => {
  const first = { x: 0, y: 0, w: 520, h: 240 };
  assert.deepEqual(findSpot({ w: 520, h: 200 }, [first], usable), { x: 0, y: 268 });
  const full = [first, { x: 0, y: 268, w: 520, h: 300 }];
  const spot = findSpot({ w: 520, h: 200 }, full, usable);
  assert.ok(spot, "there is room in the second column");
  assert.equal(spot.y, 0);
  assert.ok(spot.x >= 520, `second column, got x=${spot.x}`);
});

test("beside and below sit next to the named item", () => {
  const anchor = { x: 0, y: 100, w: 300, h: 80 };
  assert.deepEqual(findSpot({ w: 200, h: 120 }, [anchor], usable, { kind: "beside", anchor }), { x: 328, y: 100 });
  const top = { x: 0, y: 0, w: 300, h: 80 };
  const underIt = { x: 0, y: 108, w: 300, h: 50 };
  assert.deepEqual(findSpot({ w: 300, h: 60 }, [top, underIt], usable, { kind: "below", anchor: top }), { x: 0, y: 186 });
});

test("nothing overlaps, and a full board returns null", () => {
  const placed: Rect[] = [];
  const sizes = [
    { w: 420, h: 90 }, { w: 520, h: 220 }, { w: 300, h: 180 }, { w: 220, h: 150 },
    { w: 480, h: 120 }, { w: 360, h: 200 }, { w: 260, h: 90 },
  ];
  for (const size of sizes) {
    const spot = findSpot(size, placed, usable);
    if (!spot) continue;
    const r = { ...spot, ...size };
    assert.ok(!placed.some((p) => overlaps(r, p)), `overlap at ${JSON.stringify(r)}`);
    assert.ok(r.x + r.w <= usable.x + usable.w && r.y + r.h <= usable.y + usable.h, "inside the board");
    placed.push(r);
  }
  assert.ok(placed.length >= 5, `placed ${placed.length}`);
  assert.equal(findSpot({ w: 200, h: 200 }, [usable], usable), null);
});

test("an area hint keeps an item on its side", () => {
  const spot = findSpot({ w: 300, h: 200 }, [], usable, { kind: "area", area: "right" });
  assert.ok(spot && spot.x >= usable.w / 2 - usable.w * 0.1, `right side, got ${JSON.stringify(spot)}`);
});

test("place arguments read naturally", () => {
  assert.deepEqual(parsePlace("beside b3"), { kind: "beside", target: "b3" });
  assert.deepEqual(parsePlace("Next to the balance"), { kind: "beside", target: "the balance" });
  assert.deepEqual(parsePlace("below b4"), { kind: "below", target: "b4" });
  assert.deepEqual(parsePlace("under 2x + 3 = 11"), { kind: "below", target: "2x + 3 = 11" });
  assert.deepEqual(parsePlace("right"), { kind: "area", area: "right" });
  assert.deepEqual(parsePlace("new page"), { kind: "new_page" });
  assert.equal(parsePlace(""), null);
  assert.equal(parsePlace("somewhere nice"), null);
  assert.equal(parsePlace(7), null);
});

test("positions and free space are described in words", () => {
  assert.equal(regionName({ x: 0, y: 0, w: 200, h: 80 }, usable), "top left");
  assert.equal(regionName({ x: 900, y: 500, w: 200, h: 80 }, usable), "bottom right");
  assert.equal(regionName({ x: 500, y: 260, w: 100, h: 80 }, usable), "middle");
  assert.equal(freeSpace([], usable), "the whole board");
  assert.equal(freeSpace([{ x: 0, y: 0, w: 740, h: 600 }], usable), "the right third");
  assert.match(freeSpace([{ x: 0, y: 0, w: 1120, h: 380 }], usable), /bottom third/);
});

test("writing continues after the last item instead of filling an earlier gap", () => {
  const first = { x: 0, y: 0, w: 300, h: 80 };
  const last = { x: 0, y: 108, w: 520, h: 80 };
  const size = { w: 150, h: 60 };
  assert.deepEqual(findSpot(size, [first, last], usable), { x: 328, y: 0 });
  assert.deepEqual(findSpot(size, [first, last], usable, { kind: "flow", after: last }), { x: 0, y: 216 });
});
