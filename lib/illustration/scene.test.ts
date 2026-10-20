import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScene, renderScene, type Scene } from "./scene";

const count = (svg: string, needle: string) => svg.split(needle).length - 1;

test("items are drawn exactly as many times as asked", () => {
  const out = renderScene({ root: { type: "items", icon: "marble", count: 12, per_row: 4, id: "m" } });
  // Each built-in marble draws one highlight ellipse.
  assert.equal(count(out.svg, "<ellipse"), 12);
  assert.deepEqual(out.problems, []);
  assert.ok(out.parts.m);
});

test("a bundle holds exactly ten countable sticks, and loose sticks stand apart", () => {
  const out = renderScene({ root: { type: "bundles", bundles: 3, loose: 4, id: "b" } });
  assert.equal(count(out.svg, 'height="70"'), 34);
  assert.ok(out.parts["b.bundle1"] && out.parts["b.bundle3"] && out.parts["b.loose"]);
  assert.ok(out.parts["b.loose"].x > out.parts["b.bundle3"].x + out.parts["b.bundle3"].w, "loose sticks after the bundles");
});

test("a move along a vertical axis is an arrow from one value to the other", () => {
  const out = renderScene({ root: { type: "axis", orientation: "vertical", min: -12, max: 3, marks: [{ at: -7, icon: "elevator", label: "elevator" }], moves: [{ from: -7, to: -11, label: "down 4" }], id: "a" } });
  assert.match(out.svg, /down 4/);
  assert.deepEqual(out.problems, []);
});

test("labels that lines can cross carry a white halo", () => {
  const out = renderScene({ root: { type: "axis", orientation: "vertical", min: -3, max: 3, marks: [{ at: 0, label: "Ground" }] } });
  assert.match(out.svg, /paint-order="stroke"[^>]*>Ground</);
});

test("the title sits above a bracket's label, never on it", () => {
  const scene: Scene = {
    title: "Sharing 12 marbles",
    root: { type: "row", children: [1, 2, 3].map((i) => ({ type: "container", shape: "jar", id: `j${i}`, child: { type: "items", icon: "marble", count: 4, per_row: 2 } })) },
    brackets: [{ over: ["j1", "j2", "j3"], side: "top", label: "12 marbles in all" }],
  };
  const out = renderScene(scene);
  const ys = [...out.svg.matchAll(/<text x="[^"]+" y="([^"]+)"[^>]*>([^<]+)</g)].map((m) => ({ y: Number(m[1]), t: m[2] }));
  const title = ys.find((r) => r.t === "Sharing 12 marbles")!;
  const label = ys.find((r) => r.t === "12 marbles in all")!;
  assert.ok(title.y < label.y - 20, `title ${title.y} above label ${label.y}`);
});

test("the picture grows to hold what arrows and brackets reach past it", () => {
  const out = renderScene({ root: { type: "items", icon: "apple", count: 3, id: "a" }, brackets: [{ over: "a", side: "top", label: "a fairly long bracket label here" }] });
  const [vx, vy, vw] = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+)/.exec(out.svg)!.slice(1).map(Number);
  assert.ok(vy < 0 || vw > 0, "viewBox grows");
  assert.ok(vx <= 0);
});

test("bad references and unknown objects are reported, never thrown", () => {
  const out = renderScene({ root: { type: "items", icon: "no_such_thing", count: 2, id: "x" }, arrows: [{ from: "x", to: "nowhere" }], brackets: [{ over: "ghost" }] });
  // One per missing icon drawn (two), the arrow, the bracket.
  assert.equal(out.problems.length, 4);
  assert.ok(out.problems.some((p) => /no_such_thing/.test(p)) && out.problems.some((p) => /nowhere/.test(p)) && out.problems.some((p) => /ghost/.test(p)));
  const weird = renderScene({ root: { type: "mystery" } as unknown as Scene["root"] });
  assert.ok(weird.problems.some((p) => /unknown node type/.test(p)));
});

test("a scene is read from model output with or without a code fence", () => {
  assert.ok(parseScene('```json\n{"root":{"type":"label","text":"hi"}}\n```'));
  assert.ok(parseScene('Here: {"root":{"type":"label","text":"hi"}}'));
  assert.equal(parseScene("no json here"), null);
  assert.equal(parseScene('{"title":"no root"}'), null);
});

test("a bracket that repeats a label inside it is left out, and marks that repeat their tick lose the label", () => {
  const out = renderScene({ root: { type: "grid", rows: 3, cols: 4, top_label: "4 ft", id: "g" }, brackets: [{ over: "g", side: "top", label: "4 ft" }] });
  assert.equal(count(out.svg, ">4 ft<"), 1);
  const axis = renderScene({ root: { type: "axis", orientation: "vertical", min: -3, max: 3, marks: [{ at: 2, label: "+2" }, { at: -1, label: "start" }] } });
  assert.doesNotMatch(axis.svg, />\+2</);
  assert.match(axis.svg, />start</);
});

test("an arrow's label never lands on other words", () => {
  const out = renderScene({
    root: { type: "row", gap: 30, children: [{ type: "label", text: "1 cup", id: "a" }, { type: "label", text: "6 cookies", id: "b" }] },
    arrows: [{ from: "a", to: "b", label: "makes" }],
  });
  const boxes = [...out.svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)"[^>]*font-size="(\d+)"[^>]*>([^<]*)</g)].map((m) => ({ x: +m[1], y: +m[2] - +m[3], w: m[4].length * +m[3] * 0.55, h: +m[3] * 1.3, t: m[4] }));
  const arrow = boxes.find((b) => b.t === "makes")!;
  for (const b of boxes.filter((b) => b.t !== "makes")) assert.ok(!(arrow.x < b.x + b.w && b.x < arrow.x + arrow.w && arrow.y < b.y + b.h && b.y < arrow.y + arrow.h), `"makes" overlaps "${b.t}"`);
});

test("an arrow from a part to itself is reported, and the picture still has a size", () => {
  const out = renderScene({ root: { type: "axis", orientation: "vertical", min: -10, max: 10, id: "s" }, arrows: [{ from: "s", to: "s", label: "warmer" }] });
  assert.ok(Number.isFinite(out.w) && out.w > 0 && Number.isFinite(out.h));
  assert.ok(out.problems.some((p) => /two different parts/.test(p)));
});

test("two brackets over overlapping spans on one side stack instead of colliding", () => {
  const out = renderScene({
    root: { type: "bar", parts: [{ label: "$10" }, { label: "$10" }, { label: "$10" }, { label: "$10" }], total_label: "$40 price", id: "bar" },
    brackets: [{ over: "bar", side: "top", label: "4 equal parts" }],
  });
  const ys = [...out.svg.matchAll(/<text x="[-\d.]+" y="([-\d.]+)"[^>]*>([^<]+)</g)].map((m) => ({ y: +m[1], t: m[2] }));
  const a = ys.find((r) => r.t === "4 equal parts")!;
  const b = ys.find((r) => r.t === "$40 price")!;
  assert.ok(Math.abs(a.y - b.y) >= 22, `bracket label ${a.y} vs total ${b.y}`);
});

test("coins are drawn as themselves, with their value on the face, by loose names too", () => {
  const out = renderScene({ root: { type: "row", children: [{ type: "items", icon: "pennies", count: 3, id: "p" }, { type: "items", icon: "dime coins", count: 2, id: "d" }, { type: "icon", icon: "Quarter" }] } });
  assert.deepEqual(out.problems, []);
  assert.equal(count(out.svg, ">1¢<"), 3);
  assert.equal(count(out.svg, ">10¢<"), 2);
  assert.equal(count(out.svg, ">25¢<"), 1);
});

test("a bracket over things inside a container sits outside the container", () => {
  const out = renderScene({
    root: { type: "container", shape: "bag", id: "bag", child: { type: "row", children: [{ type: "items", icon: "red_marble", count: 3, id: "red" }, { type: "items", icon: "blue_marble", count: 5, id: "blue" }] } },
    brackets: [{ over: "blue", side: "top", label: "5 blue" }],
  });
  const label = [...out.svg.matchAll(/<text x="[-\d.]+" y="([-\d.]+)"[^>]*>5 blue</g)][0];
  // In the SVG's own coordinates; the bag's top is at its part's y less the viewBox shift.
  const vy = Number(/viewBox="[-\d.]+ ([-\d.]+)/.exec(out.svg)![1]);
  assert.ok(Number(label[1]) < out.parts.bag.y + vy, `label baseline ${label[1]} above the bag top ${out.parts.bag.y + vy}`);
});

test("an axis reaches a step past its furthest move, so no arrow runs off it or stops on its end", () => {
  const out = renderScene({ root: { type: "axis", orientation: "vertical", min: -10, max: 0, moves: [{ from: -7, to: -11, label: "down 4" }] } });
  assert.match(out.svg, />-12</);
  assert.deepEqual(out.problems, []);
});

test("two bars cut into different numbers of pieces are the same length", () => {
  const out = renderScene({ root: { type: "column", children: [
    { type: "bar", parts: Array.from({ length: 8 }, () => ({})), id: "eighths" },
    { type: "bar", parts: Array.from({ length: 4 }, () => ({})), id: "fourths" },
  ] } });
  assert.equal(out.parts.eighths.w, out.parts.fourths.w);
});

test("objects take a colour and a fill; a lineup stands to scale; a bar can count in units; a hidden tick has no number", () => {
  const socks = renderScene({ root: { type: "row", children: [{ type: "items", icon: "socks", count: 2, color: "black", id: "b" }, { type: "items", icon: "sock", count: 1, color: "white", id: "w" }] } });
  assert.deepEqual(socks.problems, []);
  assert.equal(count(socks.svg, "#3a3a42"), 2);
  const cups = renderScene({ root: { type: "row", children: [0.5, 0.75].map((f) => ({ type: "icon" as const, icon: "measuring_cup", fill: f })) } });
  assert.equal(count(cups.svg, "#f4ecd8"), 2);
  const kids = renderScene({ root: { type: "lineup", values: [140, 152, 135], id: "k" } });
  assert.ok(kids.parts["k.2"].h > kids.parts["k.3"].h, "taller value, taller figure");
  const tape = renderScene({ root: { type: "column", children: [
    { type: "bar", unit: 60, parts: [{}], id: "lia" },
    { type: "bar", unit: 60, parts: [{}, {}, {}], id: "sam" },
  ] } });
  assert.equal(tape.parts["sam.1"].w, tape.parts["lia.1"].w);
  // With a value hidden only landmarks keep numbers, and the hidden one has none.
  const axis = renderScene({ root: { type: "axis", orientation: "vertical", min: -12, max: 4, hide: [-11], moves: [{ from: -7, to: -11 }] } });
  assert.doesNotMatch(axis.svg, />-11</);
  assert.doesNotMatch(axis.svg, />-9</);
  assert.match(axis.svg, />-10</);
  assert.match(axis.svg, />-7</);
  assert.doesNotMatch(axis.svg, />\?</);
});

test("a spinner's parts take their own colours", () => {
  const out = renderScene({ root: { type: "pie", slices: 4, colors: ["red", "blue", "green", "yellow"], id: "s" } });
  for (const hex of ["#ff7a7e", "#6fb6ff", "#6fd69a", "#ffd45e"]) assert.match(out.svg, new RegExp(hex));
});

test("a bar's `shaded` fills from the left, and its shaded stretch is a part", () => {
  const out = renderScene({ root: { type: "bar", id: "b", shaded: 1.5, parts: Array.from({ length: 10 }, () => ({ label: "$2" })) } });
  const one = out.parts["b.1"];
  const s = out.parts["b.shaded"];
  assert.ok(s, "b.shaded exists");
  assert.ok(Math.abs(s.w - one.w * 1.5) < 1, `shaded stretch is 1.5 pieces (${s.w} vs ${one.w})`);
  // A part-shaded piece writes the labels under the bar, not through the shading's edge.
  const ys = [...out.svg.matchAll(/<text x="[-\d.]+" y="([-\d.]+)"[^>]*>\$2</g)].map((m) => Number(m[1]));
  assert.equal(ys.length, 10);
  assert.ok(ys.every((y) => y > one.y + one.h), "labels under the bar");
});

test("a long row of like boxes wraps onto lines instead of shrinking", () => {
  const box = (i: number) => ({ type: "container" as const, shape: "box" as const, id: `g${i}`, child: { type: "items" as const, icon: "boy", count: 5 } });
  const out = renderScene({ root: { type: "row", children: [1, 2, 3, 4, 5, 6].map(box) } });
  const ys = new Set([1, 2, 3, 4, 5, 6].map((i) => Math.round(out.parts[`g${i}`].y)));
  assert.ok(ys.size >= 2, "more than one line");
  assert.ok(out.w < 760, `picture width ${out.w}`);
});

test("arrows that share an edge fan out along it", () => {
  const icon = (id: string, icon: string) => ({ type: "icon" as const, icon, id });
  const scene: Scene = {
    root: { type: "row", gap: 80, nowrap: true, children: [{ type: "column", gap: 16, children: [icon("s1", "shirt"), icon("s2", "shirt"), icon("s3", "shirt")] }, { type: "column", gap: 16, children: [icon("p1", "pants"), icon("p2", "pants")] }] },
    arrows: ["s1", "s2", "s3"].flatMap((s) => ["p1", "p2"].map((p) => ({ from: s, to: p }))),
  };
  const out = renderScene(scene);
  const heads = [...out.svg.matchAll(/<path d="M[-\d.]+ [-\d.]+Q[-\d.]+ [-\d.]+ ([-\d.]+) ([-\d.]+)"/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
  assert.equal(heads.length, 6);
  for (const p of ["p1", "p2"]) {
    const r = out.parts[p];
    const on = heads.filter((h) => h.y >= r.y && h.y <= r.y + r.h && Math.abs(h.x - r.x) < 8);
    assert.equal(on.length, 3, `three heads land on ${p}'s left edge`);
    assert.equal(new Set(on.map((h) => Math.round(h.y))).size, 3, "at three different heights");
  }
});
