import { test } from "node:test";
import assert from "node:assert/strict";
import { guardLabels, illustratorPrompt, ILLUSTRATOR_SYSTEM } from "./prompt";
import type { Scene } from "./scene";

test("a label stating a result the student has not said becomes ?", () => {
  const scene: Scene = {
    root: { type: "row", children: [1, 2, 3].map((i) => ({ type: "container", shape: "jar", id: `j${i}`, label: "4 each", child: { type: "items", icon: "marble", count: 4 } })) },
    brackets: [{ over: ["j1", "j2", "j3"], label: "12 marbles" }],
  };
  const { scene: out, withheld } = guardLabels(scene, "Student: we have 12 marbles and 3 jars");
  const jar = (out.root as { children: Array<{ label?: string }> }).children[0];
  assert.equal(jar.label, "? each");
  assert.equal(out.brackets![0].label, "12 marbles");
  assert.deepEqual(withheld, ["4", "4", "4"]);
});

test("names like Jar 3 stay, and results after a result word go", () => {
  const scene: Scene = {
    root: { type: "column", children: [{ type: "label", text: "Jar 3" }, { type: "label", text: "Day 2" }, { type: "label", text: "total 15" }] },
  };
  const { scene: out } = guardLabels(scene, "2 cups make 12 cookies");
  const texts = (out.root as { children: Array<{ text: string }> }).children.map((c) => c.text);
  assert.deepEqual(texts, ["Jar 3", "Day 2", "total ?"]);
});

test("numbers already on the board or in the lesson stay, fractions and negatives too", () => {
  const scene: Scene = {
    root: { type: "axis", min: -12, max: 3, marks: [{ at: -7, label: "-7" }], moves: [{ from: -7, to: -11, label: "down 4" }] },
    title: "3/4 of a pizza",
  };
  const { scene: out, withheld } = guardLabels(scene, "Board: -7 - 4 = ? ; Tutor: you ate 3/4 of it");
  assert.equal(out.title, "3/4 of a pizza");
  const axis = out.root as { marks: Array<{ label: string }>; moves: Array<{ label: string }> };
  assert.equal(axis.marks[0].label, "-7");
  assert.equal(axis.moves[0].label, "down 4");
  // Where the move lands (-11) is the answer: its tick shows "?".
  assert.deepEqual((out.root as { hide?: number[] }).hide, [-11]);
  assert.deepEqual(withheld, ["-11"]);
});

test("model-written objects never get through", () => {
  const { scene } = guardLabels({ defs: { x: { svg: "<script/>", w: 24, h: 24 } }, root: { type: "label", text: "hi" } }, "");
  assert.equal(scene.defs, undefined);
});

test("the prompt carries the request and documents what the engine draws", () => {
  const p = illustratorPrompt({ grade: "6th grade", what: "12 marbles in 3 jars", notice: "each jar the same", conversation: [{ who: "student", text: "is it 4?" }], board: "b1 heading" });
  assert.match(p, /12 marbles in 3 jars/);
  assert.match(p, /Student: is it 4\?/);
  for (const t of ["bundles", "moves", "marble", "elevator"]) assert.match(ILLUSTRATOR_SYSTEM, new RegExp(t));
  assert.doesNotMatch(ILLUSTRATOR_SYSTEM, /"defs"/);
});

test("scaffolding numbers stay: zero, a whole, unit fractions of a whole already cut", () => {
  const scene: Scene = {
    root: { type: "column", children: [
      { type: "bar", parts: Array.from({ length: 8 }, () => ({ label: "1/8" })) },
      { type: "label", text: "0 ground" },
      { type: "label", text: "100% price" },
      { type: "label", text: "1/5 left" },
    ] },
  };
  const { scene: out, withheld } = guardLabels(scene, "3/8 + 1/4 = ?");
  const kids = (out.root as { children: Array<{ text?: string; parts?: Array<{ label?: string }> }> }).children;
  assert.equal(kids[0].parts![0].label, "1/8");
  assert.equal(kids[1].text, "0 ground");
  assert.equal(kids[2].text, "100% price");
  assert.equal(kids[3].text, "? left");
  assert.deepEqual(withheld, ["1/5"]);
});

test("numbers said in words count as seen", () => {
  const { scene, withheld } = guardLabels({ root: { type: "label", text: "10 sticks" } }, "3 bundles of ten sticks and 4 single sticks");
  assert.equal((scene.root as { text: string }).text, "10 sticks");
  assert.deepEqual(withheld, []);
});
