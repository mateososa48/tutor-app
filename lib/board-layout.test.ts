import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AREA_NAMES,
  areaFromWords,
  areaRect,
  findSpot,
  freeSpace,
  inArea,
  overlaps,
  pageAt,
  parsePlace,
  planSection,
  regionName,
  shouldOpenPage,
  usedCells,
  type AreaName,
  type Rect,
} from "./board-layout";

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
  assert.deepEqual(parsePlace("on a new page"), { kind: "new_page" });
  assert.deepEqual(parsePlace("the next page"), { kind: "new_page" });
  assert.deepEqual(parsePlace("the bottom third"), { kind: "area", area: "the bottom third" });
  assert.deepEqual(parsePlace("bottom left"), { kind: "area", area: "bottom left" });
  assert.equal(parsePlace(""), null);
  assert.equal(parsePlace("somewhere nice"), null);
  assert.equal(parsePlace(7), null);
});

test("positions and free space are described in words", () => {
  assert.equal(regionName({ x: 0, y: 0, w: 200, h: 80 }, usable), "top left");
  assert.equal(regionName({ x: 900, y: 500, w: 200, h: 80 }, usable), "bottom right");
  assert.equal(regionName({ x: 500, y: 260, w: 100, h: 80 }, usable), "centre");
  assert.equal(regionName({ x: 500, y: 0, w: 100, h: 80 }, usable), "top middle");
  assert.equal(regionName({ x: 0, y: 260, w: 100, h: 80 }, usable), "middle left");
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

test("every place the summary names can be used as a place", () => {
  // Boards with work in different spots, so freeSpace emits every kind of phrase.
  const boards: Rect[][] = [
    [],
    [{ x: 0, y: 0, w: 1120, h: 150 }],
    [{ x: 0, y: 0, w: 300, h: 600 }],
    [{ x: 400, y: 250, w: 300, h: 100 }],
    [{ x: 0, y: 0, w: 740, h: 600 }],
    [{ x: 0, y: 0, w: 1120, h: 380 }],
    [{ x: 0, y: 0, w: 350, h: 150 }, { x: 800, y: 450, w: 300, h: 140 }],
    [{ x: 380, y: 0, w: 350, h: 600 }],
    [{ x: 0, y: 220, w: 1120, h: 160 }],
  ];
  const seen = new Set<string>();
  for (const occupied of boards) {
    const free = freeSpace(occupied, usable);
    if (free === "none") continue;
    for (const phrase of free.split(", ")) seen.add(phrase);
    for (const r of occupied) seen.add(regionName(r, usable));
  }
  for (let x = 0; x < 1120; x += 200) for (let y = 0; y < 600; y += 150) seen.add(regionName({ x, y, w: 40, h: 40 }, usable));
  assert.ok(seen.size >= 12, `only ${seen.size} phrases exercised: ${[...seen].join(" / ")}`);
  for (const phrase of seen) {
    const place = parsePlace(phrase);
    assert.ok(place && place.kind === "area", `"${phrase}" is not a place`);
    assert.ok(place.kind === "area" && Object.prototype.hasOwnProperty.call(AREA_NAMES, place.area));
  }
});

test("area names are read the way people write them", () => {
  const cases: Array<[string, AreaName | null]> = [
    ["in the bottom third of the board", "the bottom third"],
    ["Top-Right corner", "top right"],
    ["the right half", "right"],
    ["left side", "left"],
    ["center", "centre"],
    ["the middle", "centre"],
    ["middle band", "the middle band"],
    ["lower left", "bottom left"],
    ["top center", "top middle"],
    ["left third", "the left third"],
    ["whole board", "the whole board"],
    ["upper", "top"],
    ["somewhere nice", null],
    ["b3", null],
  ];
  for (const [words, area] of cases) assert.equal(areaFromWords(words), area, words);
});

test("an area hint puts the item in that area, or as near as it fits", () => {
  const occupied = [{ x: 0, y: 0, w: 520, h: 180 }];
  const size = { w: 300, h: 120 };
  for (const area of ["bottom left", "the right third", "top right", "centre", "bottom"] as AreaName[]) {
    const spot = findSpot(size, occupied, usable, { kind: "area", area });
    assert.ok(spot, area);
    const r = { ...spot, ...size };
    const a = areaRect(area, usable);
    assert.ok(r.x >= a.x - 0.5 && r.y >= a.y - 0.5 && r.x + r.w <= a.x + a.w + 0.5 && r.y + r.h <= a.y + a.h + 0.5, `${area}: ${JSON.stringify(r)} is outside ${JSON.stringify(a)}`);
    assert.ok(!overlaps(r, occupied[0]));
  }
  // Too wide for a third-sized cell: it still lands centred on that cell's side of the board.
  const wide = { w: 600, h: 100 };
  const spot = findSpot(wide, occupied, usable, { kind: "area", area: "bottom right" });
  assert.ok(spot && inArea({ ...spot, ...wide }, "bottom", usable), JSON.stringify(spot));
  assert.ok(spot && spot.x + wide.w / 2 > usable.w / 2, `on the right, got ${JSON.stringify(spot)}`);
});

test("a section opens beside the work, then under it, then nowhere", () => {
  const area: Rect = { x: 0, y: 100, w: 1382, h: 600 };
  const dock: Rect = { x: 1382 - 384, y: 700 - 282, w: 384, h: 282 };
  assert.deepEqual(planSection([], area, [dock]), { region: area, kind: "page" });
  // Work down the left column: the next section is a panel on the right.
  const left = [{ x: 0, y: 100, w: 520, h: 300 }];
  const panel = planSection(left, area, [dock]);
  assert.equal(panel?.kind, "panel");
  assert.ok(panel && panel.region.x >= 520 + 28 && panel.region.y === 100, JSON.stringify(panel));
  // Work already across the width: a band under it.
  const wide = [{ x: 0, y: 100, w: 1300, h: 160 }];
  const band = planSection(wide, area, [dock]);
  assert.equal(band?.kind, "band");
  assert.ok(band && band.region.y >= 260 && band.region.x === 0, JSON.stringify(band));
  // A deep left column and a short right one: a panel under the right-hand work.
  const uneven = [{ x: 0, y: 100, w: 600, h: 560 }, { x: 700, y: 100, w: 620, h: 120 }];
  const lower = planSection(uneven, area, []);
  assert.equal(lower?.kind, "panel");
  assert.ok(lower && lower.region.x >= 600 && lower.region.y >= 220, JSON.stringify(lower));
  // Room under wide work on the right, beside narrower work on the left.
  const underRight = planSection([{ x: 0, y: 100, w: 400, h: 520 }, { x: 420, y: 100, w: 540, h: 100 }], area, [dock]);
  assert.equal(underRight?.kind, "panel");
  assert.ok(underRight && underRight.region.x === 456 && underRight.region.y === 256, JSON.stringify(underRight));
  // Full: no section fits on this page.
  assert.equal(planSection([{ x: 0, y: 100, w: 1382, h: 520 }], area, [dock]), null);
  // A second row of sections fills along the row before starting a third.
  const rows = [
    { x: 0, y: 100, w: 700, h: 280 }, // the problem
    { x: 760, y: 100, w: 300, h: 200 }, // "Check it", beside it
    { x: 0, y: 436, w: 420, h: 44 }, // the "Your turn" heading's words, a band under both
    { x: 0, y: 500, w: 300, h: 60 }, // its first line
  ];
  const beside = planSection(rows, area, [dock], { rowTop: 436 });
  assert.equal(beside?.kind, "panel");
  assert.ok(beside && beside.region.y === 436 && beside.region.x >= 420 + 28 && beside.region.x < 760, JSON.stringify(beside));
  // The dock takes the bottom right, so a short band beside it is not enough room.
  const low = [{ x: 0, y: 100, w: 1382, h: 330 }];
  assert.equal(planSection(low, area, [{ x: 400, y: 460, w: 982, h: 240 }]), null);
});

test("a new page opens only when work does not fit, or when asked on a mostly full page", () => {
  assert.equal(shouldOpenPage({ fits: false, usedCells: 1 }), true);
  assert.equal(shouldOpenPage({ fits: true, askedForNewPage: true, usedCells: 3 }), false);
  assert.equal(shouldOpenPage({ fits: true, askedForNewPage: true, usedCells: 6 }), true);
  assert.equal(shouldOpenPage({ fits: true, usedCells: 9 }), false);
  assert.equal(usedCells([], usable), 0);
  assert.equal(usedCells([usable], usable), 9);
  assert.equal(usedCells([{ x: 0, y: 0, w: 740, h: 600 }], usable), 6);
});

test("page numbers follow the pages laid out left to right", () => {
  assert.equal(pageAt(0, 1454, 240), 1);
  assert.equal(pageAt(1453, 1454, 240), 1);
  assert.equal(pageAt(1454 + 240, 1454, 240), 2);
  assert.equal(pageAt(2 * (1454 + 240) + 700, 1454, 240), 3);
  assert.equal(pageAt(-50, 1454, 240), 1);
});
