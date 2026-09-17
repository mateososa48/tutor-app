import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeLatex, splitLatexLines } from "./latex-normalize";

test("unicode operators become LaTeX commands", () => {
  assert.equal(normalizeLatex("3 × 4 = 12"), "3 \\times 4 = 12");
  assert.equal(normalizeLatex("x² + y² ≤ 25"), "x^{2} + y^{2} \\le 25");
  assert.equal(normalizeLatex("12 ÷ 4 = 3"), "12 \\div 4 = 3");
  assert.equal(normalizeLatex("√16 = 4"), "\\sqrt{16} = 4");
  assert.equal(normalizeLatex("√(a² + b²)"), "\\sqrt{a^{2} + b^{2}}");
  assert.equal(normalizeLatex("½ + ⅓"), "\\tfrac{1}{2} + \\tfrac{1}{3}");
  assert.equal(normalizeLatex("90° − 37°"), "90^\\circ - 37^\\circ");
  assert.equal(normalizeLatex("50% of 80 = 40"), "50\\% \\text{ of } 80 = 40");
  assert.equal(normalizeLatex("25\\% + 5\\%"), "25\\% + 5\\%");
});

test("words get \\text, variables and functions stay", () => {
  assert.equal(normalizeLatex("area = 8 × 3"), "\\text{area } = 8 \\times 3");
  assert.equal(normalizeLatex("2x + 3 = 11"), "2x + 3 = 11");
  assert.equal(normalizeLatex("\\sin x + \\frac{1}{2}"), "\\sin x + \\frac{1}{2}");
  assert.equal(normalizeLatex("sin x"), "sin x");
  assert.equal(normalizeLatex("\\text{area} = b \\times h"), "\\text{area} = b \\times h");
  assert.equal(normalizeLatex("3 = 12 and 12 = 3"), "3 = 12 \\text{ and } 12 = 3");
  assert.equal(normalizeLatex("5 cm + 3 cm"), "5\\,\\text{cm} + 3\\,\\text{cm}");
  assert.equal(normalizeLatex("24 cm²"), "24\\,\\text{cm}^{2}");
  assert.equal(normalizeLatex("total cost = 12"), "\\text{total cost } = 12");
});

test("lone fractions typeset, ratios of expressions stay slashes", () => {
  assert.equal(normalizeLatex("3/4 + 1/4 = 1"), "\\tfrac{3}{4} + \\tfrac{1}{4} = 1");
  assert.equal(normalizeLatex("40 / 2 = 20"), "40 / 2 = 20");
  assert.equal(normalizeLatex("\\frac{3}{4}"), "\\frac{3}{4}");
});

test("line breaks split into lines", () => {
  assert.deepEqual(splitLatexLines("a = 1 \\\\ b = 2"), ["a = 1", "b = 2"]);
  assert.deepEqual(splitLatexLines("x = 4\ny = 5"), ["x = 4", "y = 5"]);
  assert.deepEqual(splitLatexLines("2x = 8"), ["2x = 8"]);
  assert.deepEqual(splitLatexLines("5x + 2 = 3x + 10 \\implies 2x + 2 = 10 \\implies 2x = 8"), ["5x + 2 = 3x + 10", "2x + 2 = 10", "2x = 8"]);
  assert.deepEqual(splitLatexLines("\\begin{cases} x + y = 5 \\\\ x - y = 1 \\end{cases}"), ["\\begin{cases} x + y = 5 \\\\ x - y = 1 \\end{cases}"]);
});

test("variable products stay math, long powers keep their digits together", () => {
  assert.equal(normalizeLatex("y = mx + b"), "y = mx + b");
  assert.equal(normalizeLatex("ab + cd = 12"), "ab + cd = 12");
  assert.equal(normalizeLatex("x is 4"), "x \\text{ is } 4");
  assert.equal(normalizeLatex("x^10 + 2^16"), "x^{10} + 2^{16}");
  assert.equal(normalizeLatex("a_12"), "a_{12}");
  assert.equal(normalizeLatex("x^2y"), "x^2y");
});
