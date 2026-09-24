// Small pure rules behind the board's page grammar (Sept 22 2026).
//
//   bothSidesOp   "take 3 away from both sides" → "-3": the operation written
//                 in sky under both sides of the line above, the way a teacher
//                 does, so "do the same to both sides" is seen, not just said.
//   detectUnknown "Solve 2x + 3 = 11" → "x": the letter the page is about.
//   splitAnswerLine "x = ?" → the math before the blank.

// A number, a fraction, or a term with its letter ("2x" in "subtract 2x from
// both sides": it read "-2" until Sept 22 2026, wrong math on the board).
// A letter must stand alone: "add the same-size pieces" read as "+t" (Sept 23).
const NUM = String.raw`(-?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?[a-z]?|[a-z])(?![a-z])`;

/**
 * The operation a note describes, as LaTeX, when it is done to both sides.
 * Only notes that say so ("both sides", "each side") or are a bare operation
 * ("subtract 3", "÷ 2") count: "add the tops" is not an equation move.
 */
export function bothSidesOp(note: string | undefined | null): string | null {
  if (!note) return null;
  const n = note
    .toLowerCase()
    .replace(/[−–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return null;
  const whole = /\b(both|each) sides?\b/.test(n);
  const bare = n.split(" ").length <= 4;
  if (!whole && !bare) return null;
  const pick = (re: RegExp): string | null => {
    const m = n.match(re);
    return m ? m[1].replace(/\s+/g, "") : null;
  };
  const frac = (v: string) => (/^-?\d+\/\d+$/.test(v) ? v.replace(/^(-?)(\d+)\/(\d+)$/, "$1\\tfrac{$2}{$3}") : v);
  let v: string | null;
  if ((v = pick(new RegExp(String.raw`(?:subtract|take away|minus|take off|remove)\s+${NUM}`)))) return `-\\,${frac(v)}`;
  if ((v = pick(new RegExp(String.raw`(?:take|takes)\s+${NUM}\s+(?:away|off)`)))) return `-\\,${frac(v)}`;
  if ((v = pick(new RegExp(String.raw`^-\s*${NUM}\b`)))) return `-\\,${frac(v)}`;
  if ((v = pick(new RegExp(String.raw`(?:add|plus)\s+${NUM}`)))) return `+\\,${frac(v)}`;
  if ((v = pick(new RegExp(String.raw`^\+\s*${NUM}\b`)))) return `+\\,${frac(v)}`;
  if ((v = pick(new RegExp(String.raw`(?:divide|divided|split)\s+(?:both sides\s+|each side\s+)?(?:by|into)\s+${NUM}`)))) return `\\div\\,${frac(v)}`;
  if ((v = pick(new RegExp(String.raw`^(?:÷|\/)\s*${NUM}\b`)))) return `\\div\\,${frac(v)}`;
  if ((v = pick(new RegExp(String.raw`(?:multiply|multiplied|times)\s+(?:both sides\s+|each side\s+)?(?:by\s+)?${NUM}`)))) return `\\times\\,${frac(v)}`;
  if ((v = pick(new RegExp(String.raw`^(?:×|\*|x)\s*${NUM}\b`)))) return `\\times\\,${frac(v)}`;
  return null;
}

// Letters that are never "the unknown": e and i are constants; f, g and h are
// function names only when written as one, f(x) (lettersIn skips those).
const NOT_UNKNOWNS = new Set(["e", "i"]);

/** The math parts of a line: $…$ segments, or the whole line when it has none but looks like math. */
function mathParts(text: string): string[] {
  const inline = splitInlineMath(text).filter((seg) => seg.kind === "math").map((seg) => seg.value);
  if (inline.length > 0) return inline;
  // Dollars and words only ("$20 a month plus $5"): no math to read a letter from.
  if (text.includes("$")) return [];
  // "Solve 2x + 3 = 11" without $: take what follows a leading word or two.
  const eq = text.match(/[0-9a-z(][^=<>≤≥]*[=<>≤≥].*$/i);
  return eq ? [eq[0]] : [];
}

function lettersIn(latex: string): string[] {
  const cleaned = latex
    .replace(/\\(text|mathrm|operatorname|textbf|mathbf)\{[^}]*\}/g, " ")
    .replace(/\\[a-zA-Z]+/g, " ");
  const out: string[] = [];
  const re = /(^|[^a-zA-Z])([a-zA-Z])(?![a-zA-Z])/g;
  for (let m = re.exec(cleaned); m; m = re.exec(cleaned)) {
    const after = cleaned.slice(m.index + m[0].length).trimStart();
    // f(x), g(t): a function's name, not a quantity.
    if (/^[fgh]$/.test(m[2]) && after.startsWith("(")) continue;
    out.push(m[2]);
  }
  return out;
}

/**
 * The one letter a problem is solving for: "Solve 2x + 3 = 11" → "x",
 * "$\frac{n}{4} = 3$" → "n". Null when there is none, or more than one
 * (a system, y = mx + b), where colouring one letter would be a guess.
 */
export function detectUnknown(problem: string | null | undefined): string | null {
  if (!problem) return null;
  const letters = new Set<string>();
  for (const part of mathParts(problem)) {
    for (const l of lettersIn(part)) {
      if (!NOT_UNKNOWNS.has(l.toLowerCase())) letters.add(l);
    }
  }
  return letters.size === 1 ? [...letters][0] : null;
}

/**
 * "x = ?" → { prefix: "x =", blank: true }. Only a trailing blank becomes a box
 * the student's answer fills; a "?" inside the math stays math.
 */
export type AnswerLine = {
  prefix: string;
  blank: boolean;
  suffix: string;
  /** The box stands for a fraction with one part given ("?/6"): a bare answer ("3") is its other part. */
  fraction?: { num?: string; den?: string };
};

export function splitAnswerLine(line: string | null | undefined): AnswerLine {
  // "\\text{?}" and "\\boxed{}" are the model's ways of writing the box too.
  const t = (line ?? "").trim().replace(/\\text\{\s*\?\s*\}/g, "?").replace(/\\boxed\{\s*\}/g, "?");
  // "1/2 = ?/6": a fraction with a "?" in it is the whole answer, one box
  // (a typeset "?" in a numerator was never a box and never filled; Sept 23).
  // A bare "3" said into it reads "3/6" in the box, not "1/2 = 3".
  // "?/?" (both parts unknown) is one box too.
  const both = t.match(/^(.*?)(?:\\[dt]?frac\{\s*\?\s*\}\{\s*\?\s*\}|\?\s*\/\s*\?)\s*$/);
  if (both && both[1].trim()) return { prefix: both[1].trim(), blank: true, suffix: "" };
  const frac = t.match(/^(.*?)(?:\\[dt]?frac\{\s*\?\s*\}\{([^{}]*)\}|\\[dt]?frac\{([^{}]*)\}\{\s*\?\s*\}|\?\s*\/\s*(\d+)|(\d+)\s*\/\s*\?)\s*$/);
  if (frac && frac[1].trim()) {
    const den = (frac[2] ?? frac[4])?.trim();
    const num = (frac[3] ?? frac[5])?.trim();
    return { prefix: frac[1].trim(), blank: true, suffix: "", fraction: den ? { den } : num ? { num } : undefined };
  }
  const m = t.match(/^(.*?)(?:\\boxed\{\s*\?\s*\}|\[\s*\?\s*\]|_{2,}|\?)\s*$/);
  if (m) return { prefix: m[1].trim(), blank: true, suffix: "" };
  // "? = 7": the box comes first, the rest of the line after it.
  const lead = t.match(/^(?:\\boxed\{\s*\?\s*\}|\[\s*\?\s*\]|_{2,}|\?)\s*((?:=|<|>|≤|≥|\\le\b|\\ge\b).+)$/);
  if (lead) return { prefix: "", blank: true, suffix: lead[1].trim() };
  return { prefix: t, blank: false, suffix: "" };
}

// ── Words with math in them ─────────────────────────────────────────────────
// The model is asked to wrap math in $…$ inside words ("Solve $2x + 3 = 11$"),
// but a live model forgets. autoMath finds the math in a plain line so it is
// typeset anyway: runs of tokens with an operator in them. A number on its own
// stays a word ("of 20 apples").

// No bare "*": it is markdown bold in a note ("**Goal:**"), and kids' math uses × or ·.
const OP = /[=+×÷/^<>≤≥−\\]|(^|\s)-(\s|\d|$)/;
const FN_WORDS = /^(sin|cos|tan|log|ln|sqrt|frac|dfrac|tfrac|cdot|times|div|left|right|pi|theta|le|ge|ne|leq|geq|neq|text|pm|circ)$/i;

function mathy(tok: string): boolean {
  if (tok.includes("**")) return false;
  const t = tok.replace(/[?.,:;!]+$/, "");
  if (!t) return false;
  // Words joined by a slash are words ("up/down", "rise/run" said as a phrase).
  if (/^\(?[a-z]{2,}\/[a-z]{2,}\)?$/i.test(t)) return false;
  if (OP.test(t)) return true;
  if (/^\(?-?\d*\.?\d*[a-z]\)?$/i.test(t) && /\d/.test(t)) return true; // 2x, (3y)
  if (/^-?\d+([.,]\d+)?%?$/.test(t)) return true; // a number: math only inside a run
  if (/^\(?[a-z]\)?$/i.test(t)) return true; // a lone letter: math only inside a run
  return false;
}

/** "Solve 2x + 3 = 11" → "Solve $2x + 3 = 11$". Text that already has $…$ is left alone. */
export function autoMath(text: string): string {
  if (!text) return text;
  if (splitInlineMath(text).some((seg) => seg.kind === "math")) return text;
  if (text.includes("$")) return text.replace(/(?<!\\)\$/g, "\\$"); // only dollars: keep them as dollars
  const trimmed = text.trim();
  // All math (no real words): the whole line.
  const words = trimmed.replace(/\\[a-zA-Z]+/g, " ").match(/[A-Za-z]{2,}/g) ?? [];
  if (words.every((w) => FN_WORDS.test(w)) && OP.test(trimmed)) return `$${trimmed.replace(/[?.:]+$/, "")}$${trimmed.match(/[?.:]+$/)?.[0] ?? ""}`;
  const toks = text.split(/(\s+)/);
  const out: string[] = [];
  let i = 0;
  while (i < toks.length) {
    if (/^\s+$/.test(toks[i]) || !mathy(toks[i])) {
      out.push(toks[i]);
      i++;
      continue;
    }
    // A run of math tokens (spaces between them included).
    let j = i;
    let last = i;
    while (j < toks.length && (/^\s+$/.test(toks[j]) || mathy(toks[j]))) {
      if (!/^\s+$/.test(toks[j])) last = j;
      j++;
    }
    const run = toks.slice(i, last + 1).join("");
    const tail = run.match(/[?.,:;!]+$/)?.[0] ?? "";
    const core = tail ? run.slice(0, -tail.length) : run;
    if (OP.test(core) && !/^[a-z]$/i.test(core.trim())) out.push(`$${core}$${tail}`);
    else out.push(run);
    i = last + 1;
  }
  return out.join("");
}

/** Apply `fn` to every $…$ math segment of a line of words (dollars stay dollars). */
export function mapMath(text: string, fn: (latex: string) => string): string {
  return splitInlineMath(text)
    .map((s) => (s.kind === "math" ? `$${fn(s.value)}$` : s.value.replace(/\$/g, "\\$")))
    .join("");
}

// ── $…$ versus dollars ──────────────────────────────────────────────────────
// Word problems are full of money: "$20 a month plus $5 per GB" must not turn
// "20 a month plus " into math. A $…$ pair counts as math only when what is
// between looks like math (an operator, a command, a letter next to a digit,
// or no real words); otherwise the first $ is a dollar sign. "\$" is always one.

export type TextSegment = { kind: "text" | "math"; value: string };

function looksLikeMath(inner: string): boolean {
  const t = inner.trim();
  if (!t) return false;
  const words = t.replace(/\\[a-zA-Z]+/g, " ").match(/[A-Za-z]{3,}/g) ?? [];
  const op = /[=+×÷^_{}\\<>≤≥−*/]/.test(t);
  // Prose between two dollar amounts ("20 a month plus "): not math.
  if (words.length >= 2 && !op) return false;
  if (op) return true;
  if (/\d[a-z]\b|\b[a-z]\d/i.test(t)) return true; // 2x, x2
  return words.length === 0 && !/^\d+([.,]\d+)?\s/.test(t);
}

export function splitInlineMath(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) out.push({ kind: "text", value: buf });
    buf = "";
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\" && text[i + 1] === "$") {
      buf += "$";
      i += 2;
      continue;
    }
    if (ch === "\\" && text[i + 1] === "(") {
      const end = text.indexOf("\\)", i + 2);
      if (end > 0) {
        flush();
        out.push({ kind: "math", value: text.slice(i + 2, end).trim() });
        i = end + 2;
        continue;
      }
    }
    if (ch === "$") {
      const end = text.indexOf("$", i + 1);
      if (end > i + 1 && looksLikeMath(text.slice(i + 1, end))) {
        flush();
        out.push({ kind: "math", value: text.slice(i + 1, end).trim() });
        i = end + 1;
        continue;
      }
      buf += "$";
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out.filter((s) => s.value.length > 0);
}

// ── The board's version of a spoken question ────────────────────────────────
// A live model puts its whole spoken turn into ask's question ("Okay, two
// quick ones first so I don't waste your time. Which two numbers multiply to
// twelve and add up to seven?"). The board needs the question itself: the last
// sentence that asks something, else the part after a colon.

export function boardQuestion(text: string, max = 90): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const sentences = t.match(/[^.?!]+[.?!]+/g)?.map((x) => x.trim()) ?? [];
  const asks = sentences.filter((x) => x.endsWith("?"));
  for (const q of asks.reverse()) {
    if (q.length <= max) return q;
    const tail = q.split(/[:;,—–]\s+/).pop()?.trim();
    if (tail && tail.length <= max && tail.length >= 8) return tail.charAt(0).toUpperCase() + tail.slice(1);
  }
  return null;
}

/** A line to complete that is really words ("The two numbers are ? and ?"): not a math line. */
export function wordyAnswerLine(line: string): boolean {
  const t = line.replace(/\\[a-zA-Z]+/g, " ");
  const words = t.match(/[A-Za-z]{3,}/g) ?? [];
  return words.length >= 2 && !/[=<>≤≥]/.test(t);
}

/**
 * "Solve $x/4 + 2 = 6$" → "x/4 + 2 = 6": the equation a solve problem starts
 * from, written as the first line of working (the way a teacher copies it
 * down), so the first step has a line above it for its both-sides row. Null
 * unless the problem asks to solve exactly one equation in one letter.
 */
export function firstLineOf(problem: string): string | null {
  const text = autoMath(problem.trim());
  if (!/^\s*(solve|find x\b|find the value of)/i.test(text)) return null;
  const math = splitInlineMath(text).filter((seg) => seg.kind === "math").map((seg) => seg.value.trim());
  if (math.length !== 1) return null;
  const relations = math[0].match(/=|<|>|\\le|\\ge|≤|≥/g) ?? [];
  if (relations.length !== 1) return null;
  if (!detectUnknown(`$${math[0]}$`)) return null;
  return math[0];
}

/**
 * The row that records a checked answer when no blank was waiting for it
 * (Sept 22 2026). Evals showed the tutor asking the next quick problem out
 * loud after a right answer ("What's 30% of 80?") however often it was told to
 * write it, so the board writes it: an expression becomes "30% of 80 = [24]";
 * an equation gets its own line, then "x = [2]". Null for a word problem, an
 * inequality, or anything too long for one line: those keep the old way (the
 * student's words under the work).
 */
export function answerRowFor(problem: string): { equation: string | null; prefix: string } | null {
  const p = problem
    .replace(/\$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:what\s+is|what's|whats|find|solve|calculate|compute|evaluate|simplify|work\s+out)\b[:\s]*/i, "")
    .replace(/\s*(?:=\s*)?\?\s*$/, "")
    .replace(/[.!]+$/, "")
    .trim();
  if (!p || p.length > 48) return null;
  // Words that are not math mean a word problem: "Sam has 12 apples…".
  const words = (p.match(/[A-Za-z]{2,}/g) ?? []).filter(
    (w) => !/^(of|sqrt|frac|tfrac|dfrac|sin|cos|tan|log|ln|pi|text|times|div|cdot|left|right)$/i.test(w),
  );
  if (words.length > 0) return null;
  if (/[<>≤≥]|\\le|\\ge/.test(p)) return null;
  const relations = p.match(/=/g) ?? [];
  if (relations.length > 1) return null;
  if (relations.length === 1) {
    const letter = detectUnknown(`$${p}$`);
    return letter ? { equation: p, prefix: `${letter} =` } : null;
  }
  // "16 / 2" with spaces is a division, not the fraction 16/2 it typeset as.
  const div = /^(-?\d+(?:\.\d+)?)\s+\/\s+(-?\d+(?:\.\d+)?)$/.exec(p);
  if (div) return { equation: null, prefix: `${div[1]} \\div ${div[2]} =` };
  return { equation: null, prefix: `${p} =` };
}


// ── Lines that already show their move ───────────────────────────────────────

/** LaTeX flattened for matching: fractions as a/b, operators as symbols, no spaces, braces or brackets. */
function flatMath(latex: string): string {
  let t = latex.replace(/\$/g, "");
  // The page's letter arrives wrapped in its colour: \textcolor{#cc4600}{x}.
  for (let i = 0; i < 3; i++) t = t.replace(/\\(?:textcolor|color)\{[^{}]*\}\{([^{}]*)\}/g, "$1");
  for (let i = 0; i < 4; i++) t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2");
  return t
    .replace(/\\(left|right)/g, "")
    .replace(/\\div/g, "÷")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\[,;:! ]/g, "")
    .replace(/[−–]/g, "-")
    .replace(/[\s{}()\[\]]/g, "");
}

/**
 * Whether a step's line already shows the move its both-sides row would
 * repeat: "3x + 7 - 7 = 25 - 7" already says −7 on both sides, and
 * "\frac{3x}{3} = \frac{18}{3}" already divides both by 3. The row is left
 * out then (Sept 22 2026: the board said −7 twice).
 */
export function lineShowsOp(latex: string, op: string): boolean {
  const sides = flatMath(latex).split(/=|<|>|≤|≥/);
  if (sides.length !== 2) return false;
  const o = flatMath(op);
  const m = /^(-|\+|÷|×)(.+)$/.exec(o);
  if (!m) return false;
  const v = m[2];
  const forms = m[1] === "-" ? [`-${v}`] : m[1] === "+" ? [`+${v}`] : m[1] === "÷" ? [`/${v}`, `÷${v}`] : [`×${v}`, `·${v}`, `*${v}`];
  const shows = (side: string) => forms.some((f) => side.includes(f)) || (m[1] === "×" && side.startsWith(v));
  return shows(sides[0]) && shows(sides[1]);
}

/** Plain arithmetic, nothing to solve for: "25 - 7", "\frac{18}{3}", "3.5 × 4". */
export function pureArithmetic(text: string): boolean {
  const t = flatMath(text).replace(/\\[a-z]+/gi, "");
  return /\d/.test(t) && /^[\d.,+\-×÷·*/^]+$/.test(t);
}

/**
 * The math a problem asks about, without its words: "Solve $5(x - 2) = 20$"
 * → "5(x - 2) = 20", "What is 25% of 80?" → "25% of 80". Null when words are
 * left over (a word problem).
 */
export function problemMath(problem: string): string | null {
  const row = answerRowFor(problem);
  if (!row) return null;
  return row.equation ?? row.prefix.replace(/\s*=\s*$/, "");
}

/**
 * What goes on the board for a question: the question itself. The live model
 * sends its whole turn ("Yep, we can subtract 2x from both sides. What does
 * that leave on the left?"), and praise in front of a question was refused
 * outright, costing a round trip while the voice waited (Sept 22 2026).
 * Keeps the last sentence that asks something, without a leading "Nice." /
 * "Okay, and".
 */
export function questionOnly(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  const sentences = t.split(/(?<=[.?!])\s+(?=[A-Z0-9"'(“$])/).map((x) => x.trim()).filter(Boolean);
  const asks = sentences.filter((x) => x.endsWith("?"));
  const pick = sentences.length > 1 && asks.length > 0 ? asks[asks.length - 1] : t;
  const m = /^(?:(?:nice|great|good|awesome|perfect|exactly|spot on|yes|yep|yeah|correct|right|okay|ok|alright|all right|there|cool)(?: job| work| one| thinking)?[,.!:]\s+)+(.+)$/i.exec(pick);
  let rest = m ? m[1] : pick;
  if (m) rest = rest.replace(/^(?:and|so|now|then)\s+/i, "");
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

// ── Captions and questions that add nothing (Sept 23 2026) ──────────────────

// A caption that only names fractions ("one half", "1/2 and 1/3"). Word by
// word: a single pattern over the whole caption backtracked for ever on one
// that did not match.
const FRACTION_WORDS = new Set([
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "a", "an",
  "half", "halves", "third", "thirds", "fourth", "fourths", "quarter", "quarters", "fifth", "fifths", "sixth", "sixths",
  "seventh", "sevenths", "eighth", "eighths", "ninth", "ninths", "tenth", "tenths", "eleventh", "elevenths", "twelfth", "twelfths",
  "and", "&", "plus", "vs", "vs.", "or", "+",
]);
export function namesOnlyFractions(label: string): boolean {
  const t = label.replace(/[$]/g, "").replace(/\\frac\{(\d+)\}\{(\d+)\}/g, "$1/$2").replace(/,/g, " ").toLowerCase().trim();
  if (!t) return false;
  return t.split(/\s+/).every((w) => FRACTION_WORDS.has(w) || /^\d+\/\d+$/.test(w));
}

// Questions that add nothing to a box beside them.
export const GENERIC_QUESTION = /^\s*(?:(?:so,?\s*)?what(?:'s| is) (?:the |your )?(?:answer|result|total|sum)|what do (?:you|we) get|what does (?:it|that) (?:equal|make)|your turn|all yours|solve (?:it|this)|go ahead|try (?:it|this one))\s*[?.!]*\s*$/i;

// A question that asks what fraction a picture shows ("What fraction of this
// bar is shaded?", "How many pieces are shaded?"): the picture must not say it.
export const FRACTION_QUESTION = /\b(?:what|which) fraction\b|\bhow much of (?:the|this|that|it)\b|\bwhat part of\b|\bhow many\b[^?]{0,30}\b(?:shaded|colou?red|filled)\b/i;
