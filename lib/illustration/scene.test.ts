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
