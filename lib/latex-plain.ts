// LaTeX → readable plain text, for board pictures sent to the model and for
// labels. Not a full renderer: it covers what a tutor writes on a board.

const SYMBOLS: Array<[RegExp, string]> = [
  [/\\times/g, "×"],
  [/\\cdot/g, "·"],
  [/\\div/g, "÷"],
  [/\\pm(?![a-zA-Z])/g, "±"],
  [/\\equiv/g, "≡"],
  [/\\nmid/g, "∤"],
  [/\\mid/g, "∣"],
  [/\\cong/g, "≅"],
  [/\\propto/g, "∝"],
  [/\\perp/g, "⊥"],
  [/\\parallel/g, "∥"],
  [/\\angle/g, "∠"],
  [/\\in(?![a-zA-Z])/g, "∈"],
  [/\\cdots|\\ldots|\\dots/g, "…"],
  [/\\leq?\b/g, "≤"],
  [/\\geq?\b/g, "≥"],
  [/\\neq?\b/g, "≠"],
  [/\\approx/g, "≈"],
  [/\\infty/g, "∞"],
  [/\\pi\b/g, "π"],
  [/\\theta\b/g, "θ"],
  [/\\alpha\b/g, "α"],
  [/\\beta\b/g, "β"],
  [/\\degree|\^\\circ|\^\{\\circ\}/g, "°"],
  [/\\rightarrow|\\to\b/g, "→"],
  [/\\%/g, "%"],
  [/\\prime(?![a-zA-Z])/g, "′"],
  // Function names are words, not commands to drop: \log_2 8 reads "log₂ 8".
  [/\\(arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|log|ln|exp|lim|max|min|gcd)(?![a-zA-Z])/g, "$1"],
];

// What the tutor reads back from its own board (Sept 16 2026): "x^2" read as
// a caret and "x^10" as "x^10"; a picture of the board should say x² and x¹⁰.
// Only characters with a Unicode super- or subscript form convert; anything
// else keeps the caret with brackets: x^(n+1) stays readable.
const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", "′": "′",
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ", i: "ⁱ", j: "ʲ", k: "ᵏ", l: "ˡ", m: "ᵐ",
  n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ", t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ",
};
const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};

function script(text: string, table: Record<string, string>, mark: string): string {
  const t = text.replace(/\s+/g, "");
  if (!t) return "";
  const chars = [...t];
  return chars.every((ch) => ch in table) ? chars.map((ch) => table[ch]).join("") : `${mark}(${t})`;
}

function stripGroup(s: string): string {
  return s.startsWith("{") && s.endsWith("}") ? s.slice(1, -1) : s;
}

// Replace \cmd{a}{b} / \cmd{a} forms with a callback, handling nested braces.
function replaceCommand(input: string, cmd: string, arity: 1 | 2, fn: (...args: string[]) => string): string {
  let out = "";
  let i = 0;
  const needle = `\\${cmd}`;
  while (i < input.length) {
    const at = input.indexOf(needle, i);
    if (at === -1) {
      out += input.slice(i);
      break;
    }
    // Do not match a longer command that merely starts with this one.
    const after = input[at + needle.length];
    if (after && /[a-zA-Z]/.test(after)) {
      out += input.slice(i, at + needle.length);
      i = at + needle.length;
      continue;
    }
    out += input.slice(i, at);
    let pos = at + needle.length;
    const args: string[] = [];
    for (let k = 0; k < arity; k++) {
      while (input[pos] === " ") pos++;
      if (input[pos] !== "{") {
        // single-token argument, e.g. \frac12 or \sqrt x
        args.push(input[pos] ?? "");
        pos += 1;
        continue;
      }
      let depth = 0;
      let j = pos;
      for (; j < input.length; j++) {
        if (input[j] === "{") depth++;
        else if (input[j] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      args.push(input.slice(pos + 1, j));
      pos = j + 1;
    }
    out += fn(...args.map((a) => latexToPlain(a)));
    i = pos;
  }
  return out;
}

// \_ \{ \} and friends are literal characters, but they survive the command
// strip (not letters) and then lose their braces, so park them first.
const ESCAPES: Array<[RegExp, string, string]> = [
  [/\\_/g, "\u0011", "_"],
  [/\\\{/g, "\u0012", "{"],
  [/\\\}/g, "\u0013", "}"],
  [/\\&/g, "\u0014", "&"],
  [/\\#/g, "\u0015", "#"],
  [/\\\$/g, "\u0016", "$"],
];

export function latexToPlain(latex: string): string {
  let s = latex
    // environments: rows become "; ", alignment marks vanish
    .replace(/\\begin\{[a-z*]+\}|\\end\{[a-z*]+\}/g, " ")
    .replace(/\\\\/g, "; ")
    .replace(/&/g, "")
    .replace(/\\left|\\right|\\,|\\;|\\!|\\quad|\\qquad/g, (m) => (m === "\\quad" || m === "\\qquad" ? " " : ""));
  for (const [re, hold] of ESCAPES) s = s.replace(re, hold);
  // Before the symbol table, so \pm never matches the front of \pmod.
  s = replaceCommand(s, "pmod", 1, (a) => `(mod ${a})`);
  s = s.replace(/\\bmod\b/g, "mod");
  s = replaceCommand(s, "dfrac", 2, (a, b) => `${wrap(a)}/${wrap(b)}`);
  s = replaceCommand(s, "tfrac", 2, (a, b) => `${wrap(a)}/${wrap(b)}`);
  s = replaceCommand(s, "frac", 2, (a, b) => `${wrap(a)}/${wrap(b)}`);
  // \sqrt[3]{x} is a cube root: ∛(x).
  s = s.replace(/\\sqrt\s*\[\s*([^\]]+?)\s*\]/g, (_, n: string) => (n === "3" ? "\\cbrtmark" : n === "4" ? "\\qdrtmark" : `${script(n, SUPERSCRIPT, "^")}\\sqrt`));
  s = replaceCommand(s, "cbrtmark", 1, (a) => `∛(${a})`);
  s = replaceCommand(s, "qdrtmark", 1, (a) => `∜(${a})`);
  s = replaceCommand(s, "sqrt", 1, (a) => `√(${a})`);
  s = replaceCommand(s, "text", 1, (a) => a);
  s = replaceCommand(s, "mathrm", 1, (a) => a);
  s = replaceCommand(s, "operatorname", 1, (a) => a);
  s = replaceCommand(s, "mathbf", 1, (a) => a);
  s = replaceCommand(s, "textbf", 1, (a) => a);
  s = replaceCommand(s, "overline", 1, (a) => `‾${a}`);
  s = replaceCommand(s, "vec", 1, (a) => `${a}⃗`);
  for (const [re, rep] of SYMBOLS) s = s.replace(re, rep);
  // Superscripts and subscripts as the board shows them: x², a₁, x^(n+1).
  s = s.replace(/\^\s*(\{[^{}]*\}|[^\s{}\\])/g, (_, g: string) => script(stripGroup(g), SUPERSCRIPT, "^"));
  s = s.replace(/_\s*(\{[^{}]*\}|[^\s{}\\])/g, (_, g: string) => script(stripGroup(g), SUBSCRIPT, "_"));
  s = s.replace(/\\[a-zA-Z]+/g, "").replace(/[{}]/g, "");
  for (const [, hold, literal] of ESCAPES) s = s.split(hold).join(literal);
  return s.replace(/\s+/g, " ").trim();
}

function wrap(s: string): string {
  const t = stripGroup(s.trim());
  return /^[\w.]+$/.test(t) ? t : `(${t})`;
}
