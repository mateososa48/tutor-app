// The model is told to write LaTeX, but it also writes "3 × 4", "x²", "≤",
// "½" and the odd stray unicode. KaTeX rejects most of those, so lines are
// normalised before typesetting. Pure; unit-tested.

const UNICODE: Array<[RegExp, string]> = [
  [/×/g, " \\times "],
  [/÷/g, " \\div "],
  [/·/g, " \\cdot "],
  [/−/g, "-"],
  [/–/g, "-"],
  [/≤/g, " \\le "],
  [/≥/g, " \\ge "],
  [/≠/g, " \\ne "],
  [/≈/g, " \\approx "],
  [/±/g, " \\pm "],
  [/∞/g, " \\infty "],
  [/π/g, " \\pi "],
  [/θ/g, " \\theta "],
  [/°/g, "^\\circ "],
  [/→/g, " \\rightarrow "],
  [/√\s*\(([^)]*)\)/g, "\\sqrt{$1}"],
  [/√\s*(\d+|[a-z])/g, "\\sqrt{$1}"],
  [/½/g, "\\tfrac{1}{2}"],
  [/⅓/g, "\\tfrac{1}{3}"],
  [/⅔/g, "\\tfrac{2}{3}"],
  [/¼/g, "\\tfrac{1}{4}"],
  [/¾/g, "\\tfrac{3}{4}"],
  [/⅕/g, "\\tfrac{1}{5}"],
  [/⅛/g, "\\tfrac{1}{8}"],
  [/²/g, "^{2}"],
  [/³/g, "^{3}"],
  [/⁴/g, "^{4}"],
  [/¹/g, "^{1}"],
  [/⁰/g, "^{0}"],
  [/…/g, "\\ldots"],
  // A bare % starts a LaTeX comment and swallows the rest of the line.
  [/(^|[^\\])%/g, "$1\\%"],
];

// Words inside math are set in italic with no spacing: "area = 8 \times 3"
// comes out as a-r-e-a. Wrap runs of two or more letters (not commands) in
// \text{}. Single letters stay variables.
function wrapWords(latex: string): string {
  return latex.replace(/(^|[^\\a-zA-Z{])([A-Za-z]{2,}(?:\s+[A-Za-z]{2,})*)(?![a-zA-Z}])/g, (m, before: string, word: string, offset: number) => {
    if (KNOWN.has(word)) return m;
    if (UNITS.has(word)) return `${before.trimEnd()}\\,\\text{${word}}`;
    // Math mode drops the spaces around \text; keep them inside it so
    // "12 and 12" does not set as "12and12".
    const lead = offset + before.length > 0 && /\S/.test(latex.slice(0, offset + before.length)) ? " " : "";
    const rest = latex.slice(offset + m.length);
    const trail = /\S/.test(rest) ? " " : "";
    return `${before}\\text{${lead}${word}${trail}}`;
  });
}

// Letters that are fine in math mode as written (functions, variable runs).
const KNOWN = new Set(["sin", "cos", "tan", "log", "ln", "exp", "lim", "max", "min", "dx", "dy", "abc", "xyz"]);
// Units are set upright with a thin space: 24\\,\\text{cm}.
const UNITS = new Set(["cm", "mm", "km", "kg", "mg", "mph", "ft", "lb", "lbs", "oz", "ml", "kph", "hrs", "min", "sec", "mi", "yd"]);

export function normalizeLatex(input: string): string {
  let s = input.replace(/\r/g, "").trim();
  for (const [re, rep] of UNICODE) s = s.replace(re, rep);
  // "40 / 2" stays a slash; "3/4" as a lone fraction reads better typeset.
  s = s.replace(/(^|[\s=(+\-])(\d+)\/(\d+)(?=$|[\s=)+\-])/g, (m, before: string, a: string, b: string) => `${before}\\tfrac{${a}}{${b}}`);
  s = wrapWords(s);
  return s.replace(/\s+/g, " ").trim();
}

// "a = 1 \\ b = 2", a newline, or a chain of implications: separate lines
// on the board, one step each.
export function splitLatexLines(input: string): string[] {
  // Inside an environment (cases, aligned, matrix) \\ is a row break, not a new line.
  if (/\\begin\{/.test(input)) return [input.replace(/\n/g, " ").trim()].filter(Boolean);
  return input
    .split(/\\\\|\n|\\implies\b|\\Rightarrow\b|\\Longrightarrow\b|\\therefore\b|⟹|⇒/)
    .map((t) => t.trim())
    .filter(Boolean);
}
