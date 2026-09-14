import { test } from "node:test";
import assert from "node:assert/strict";
import { latexToPlain } from "./latex-plain";

test("fractions, roots, and symbols read as plain text", () => {
  assert.equal(latexToPlain("\\frac{3}{4}"), "3/4");
  assert.equal(latexToPlain("\\tfrac{2}{4} = \\tfrac{1}{2}"), "2/4 = 1/2");
  assert.equal(latexToPlain("\\dfrac{x+1}{2}"), "(x+1)/2");
  assert.equal(latexToPlain("2x + 3 = 11"), "2x + 3 = 11");
  assert.equal(latexToPlain("a^2 + b^2 = c^2"), "a^2 + b^2 = c^2");
  assert.equal(latexToPlain("x^{10} \\times \\sqrt{16} \\le 40"), "x^10 × √(16) ≤ 40");
  assert.equal(latexToPlain("\\text{area} = 8 \\cdot 3"), "area = 8 · 3");
  assert.equal(latexToPlain("\\left( x \\right)"), "( x )");
  assert.equal(latexToPlain("3 \\div 4 \\neq 1"), "3 ÷ 4 ≠ 1");
});
