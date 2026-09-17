import { test } from "node:test";
import assert from "node:assert/strict";
import { latexToPlain } from "./latex-plain";

test("fractions, roots, and symbols read as plain text", () => {
  assert.equal(latexToPlain("\\frac{3}{4}"), "3/4");
  assert.equal(latexToPlain("\\tfrac{2}{4} = \\tfrac{1}{2}"), "2/4 = 1/2");
  assert.equal(latexToPlain("\\dfrac{x+1}{2}"), "(x+1)/2");
  assert.equal(latexToPlain("2x + 3 = 11"), "2x + 3 = 11");
  assert.equal(latexToPlain("a^2 + b^2 = c^2"), "a² + b² = c²");
  assert.equal(latexToPlain("x^{10} \\times \\sqrt{16} \\le 40"), "x¹⁰ × √(16) ≤ 40");
  assert.equal(latexToPlain("\\text{area} = 8 \\cdot 3"), "area = 8 · 3");
  assert.equal(latexToPlain("\\left( x \\right)"), "( x )");
  assert.equal(latexToPlain("3 \\div 4 \\neq 1"), "3 ÷ 4 ≠ 1");
  assert.equal(latexToPlain("\\begin{cases} x + y = 5 \\\\ x - y = 1 \\end{cases}"), "x + y = 5 ; x - y = 1");
  assert.equal(latexToPlain("24\\,\\text{cm}^{2}"), "24cm²");
});

test("the relations and escapes real sessions produced", () => {
  // \pmod used to come out as "±od6": \pm matched the front of the command.
  assert.equal(latexToPlain("47 \\equiv 5 \\pmod{6}"), "47 ≡ 5 (mod 6)");
  assert.equal(latexToPlain("125 \\equiv 8 \\pmod{9}"), "125 ≡ 8 (mod 9)");
  assert.equal(latexToPlain("\\pm 5"), "± 5");
  // These vanished entirely: unknown commands are stripped.
  assert.equal(latexToPlain("6 \\quad \\nmid \\quad 45"), "6 ∤ 45");
  assert.equal(latexToPlain("17 \\quad \\mid \\quad 68"), "17 ∣ 68");
  // Escaped punctuation printed its backslashes.
  assert.equal(latexToPlain("6 \\quad \\_\\_\\_ \\quad 45"), "6 ___ 45");
  assert.equal(latexToPlain("x \\in \\{1, 2\\}"), "x ∈ {1, 2}");
});

test("the tutor's picture shows powers, indices and roots as they look", () => {
  assert.equal(latexToPlain("6^2 + 8^2 = x^2"), "6² + 8² = x²");
  assert.equal(latexToPlain("e^{-x}"), "e⁻ˣ");
  assert.equal(latexToPlain("x^{n+1}"), "xⁿ⁺¹");
  assert.equal(latexToPlain("2^{q}"), "2^(q)");
  assert.equal(latexToPlain("a_1 + a_{n}"), "a₁ + aₙ");
  assert.equal(latexToPlain("\\log_2 8 = 3"), "log₂ 8 = 3");
  assert.equal(latexToPlain("\\sin x"), "sin x");
  assert.equal(latexToPlain("\\sqrt[3]{27} = 3"), "∛(27) = 3");
  assert.equal(latexToPlain("\\sqrt[5]{x}"), "⁵√(x)");
  assert.equal(latexToPlain("f'(x) = f^{\\prime}(x)"), "f'(x) = f′(x)");
  assert.equal(latexToPlain("90^\\circ"), "90°");
});
