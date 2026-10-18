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
