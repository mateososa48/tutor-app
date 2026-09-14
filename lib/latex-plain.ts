// LaTeX → readable plain text, for board pictures sent to the model and for
// labels. Not a full renderer: it covers what a tutor writes on a board.

const SYMBOLS: Array<[RegExp, string]> = [
  [/\\times/g, "×"],
  [/\\cdot/g, "·"],
  [/\\div/g, "÷"],
  [/\\pm/g, "±"],
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
];

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

export function latexToPlain(latex: string): string {
  let s = latex.replace(/\\left|\\right|\\,|\;|\\!|\\quad|\\qquad/g, (m) => (m === "\\quad" || m === "\\qquad" ? " " : ""));
  s = replaceCommand(s, "dfrac", 2, (a, b) => `${wrap(a)}/${wrap(b)}`);
  s = replaceCommand(s, "tfrac", 2, (a, b) => `${wrap(a)}/${wrap(b)}`);
  s = replaceCommand(s, "frac", 2, (a, b) => `${wrap(a)}/${wrap(b)}`);
  s = replaceCommand(s, "sqrt", 1, (a) => `√(${a})`);
  s = replaceCommand(s, "text", 1, (a) => a);
  s = replaceCommand(s, "mathrm", 1, (a) => a);
  s = replaceCommand(s, "textbf", 1, (a) => a);
  s = replaceCommand(s, "overline", 1, (a) => `‾${a}`);
  s = replaceCommand(s, "vec", 1, (a) => `${a}⃗`);
  for (const [re, rep] of SYMBOLS) s = s.replace(re, rep);
  // superscripts and subscripts keep their caret/underscore, braces dropped
  s = s.replace(/\^\{([^{}]*)\}/g, "^$1").replace(/_\{([^{}]*)\}/g, "_$1");
  s = s.replace(/\\[a-zA-Z]+/g, "").replace(/[{}]/g, "");
  return s.replace(/\s+/g, " ").trim();
}

function wrap(s: string): string {
  const t = stripGroup(s.trim());
  return /^[\w.]+$/.test(t) ? t : `(${t})`;
}
