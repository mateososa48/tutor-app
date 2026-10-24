import { test } from "node:test";
import assert from "node:assert/strict";
import { modelLine, teachingModel } from "./teaching-models";

test("the worksheet's problems each get the model a teacher would use", () => {
  assert.equal(teachingModel("3x + 7 = 22")?.id, "equation");
  assert.equal(teachingModel("5(x - 2) = 30")?.id, "brackets");
  assert.equal(teachingModel("4a + 3a - 2")?.id, "like-terms");
  assert.equal(teachingModel("y = 2x - 1")?.id, "graph-line");
  assert.equal(teachingModel("x^2 + 5x + 6")?.id, "factoring");
});

test("more specific topics win over a bare equals sign", () => {
  assert.equal(teachingModel("f(3) where f(x) = 2x + 1")?.id, "function");
  assert.equal(teachingModel("1/2 + 1/4 = ?")?.id, "fractions");
  assert.equal(teachingModel("25% of 80")?.id, "percent");
  assert.equal(teachingModel("-7 - 4")?.id, "integers");
});

test("the topic is read when the problem says nothing", () => {
  assert.equal(teachingModel(null, "Graphing a linear equation")?.id, "graph-line");
  assert.equal(teachingModel("", "")?.id ?? null, null);
});

test("the line carries the idea, the drawing and where it breaks", () => {
  const line = modelLine(teachingModel("3x + 7 = 22")!);
  assert.match(line, /balance/);
  assert.match(line, /Draw: illustrate/);
  assert.match(line, /Careful: /);
});

test("a graph is never handed over finished", () => {
  assert.match(modelLine(teachingModel("y = 2x - 1")!), /never draw the finished line first/);
});
