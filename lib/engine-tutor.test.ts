import { test } from "node:test";
import assert from "node:assert/strict";
import { opToCall } from "./engine-tutor";

test("marks become the board's own tools, with the part where each tool reads it", () => {
  const items = new Map([["work:P1", "b2"], ["fig1", "b4"]]);
  assert.deepEqual(opToCall({ opId: "t1.m", type: "mark", ref: "work:P1.L1", how: "underline" }, items), { name: "highlight", args: { target: "b2", text: "L1", how: "underline" } });
  assert.deepEqual(opToCall({ opId: "t1.m", type: "mark", ref: "fig1.triangle", how: "swipe" }, items), { name: "highlight", args: { target: "b4", text: "triangle" } });
  assert.deepEqual(opToCall({ opId: "t1.m", type: "mark", ref: "work:P1.L3", how: "check" }, items), { name: "mark_correct", args: { target: "b2.L3" } });
  assert.deepEqual(opToCall({ opId: "t1.m", type: "mark", ref: "fig1.diagonal", how: "ring" }, items), { name: "circle_item", args: { target: "b4.diagonal", keep: true } });
  assert.ok("skip" in opToCall({ opId: "t1.m", type: "mark", ref: "graph1.P1", how: "point" }, items));
});

test("an exact fraction model goes to draw_fraction as compiled", () => {
  const call = opToCall({ opId: "t1.o1", type: "tool", sid: "frac1", name: "draw_fraction", args: { fraction: "1/2", second_fraction: "1/3", common_denominator: 6, model: "bar" }, label: "x" }, new Map());
  assert.deepEqual(call, { name: "draw_fraction", args: { fraction: "1/2", second_fraction: "1/3", common_denominator: 6, model: "bar" } });
});
