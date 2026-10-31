// Every arithmetic and comparison claim in a line, checked one by one (Oct 31
// 2026, Plan B step B3). The bike session (7wr9ea) showed why the final
// answer is not enough: "I got 4 hours because 5 times 4 plus 3 is 24, which
// is under 23" has a right conclusion and two false claims, and the planner
// repeated "five times four plus three is twenty-four" as fact. So a line is
// read into its claims ("5*4+3 = 24", "24 < 23"), each with where it sits in
// the line, and each is evaluated exactly: verified_true, verified_false (with
// the true fact), or unsupported when it is not plain arithmetic.
//
// The same reader runs over the tutor's planned speech before it is spoken: a
// false computation the tutor would assert is refused. A claim the tutor
// attributes to the student ("you said 5 times 4 plus 3 is 24") or denies
// ("isn't 24") is not the tutor asserting it.
//
// Pure: no model, no board.

import { spokenToDigits } from "./answer-check";

export type Relation = "=" | "<" | ">" | "<=" | ">=" | "!=";
export type ClaimVerdict = "verified_true" | "verified_false" | "ambiguous" | "unsupported";

export type Claim = {
  /** The claim as it reads in the line, digits for number words. */
  text: string;
  /** Where it sits in the digit form of the line. */
  span: [number, number];
  lhs: string;
  rhs: string;
  rel: Relation;
  /** "you said …", "your …": the speaker reports someone else's claim. */
  attributed: boolean;
};

export type ClaimAssessment = Claim & {
  verdict: ClaimVerdict;
  /** The values of the two sides, when they could be computed. */
  values?: [number, number];
  /** The true statement, for a false claim: "5 × 4 + 3 = 23", "24 > 23". */
  correct?: string;
};

// Words that are units or nouns after a number: they do not break an
// expression ("5 dollars times 4").
const UNIT = /^(?:dollars?|cents?|cm|mm|m|km|meters?|metres?|inch(?:es)?|in|feet|foot|ft|yards?|miles?|hours?|hrs?|minutes?|mins?|seconds?|secs?|days?|weeks?|years?|kg|g|grams?|pounds?|lbs?|ounces?|oz|liters?|litres?|ml|cups?|units?|squares?|sq|degrees?|points?|pieces?|cookies?|marbles?|apples?|people|kids|students|each|per|percent)$/i;

const OPS: Array<[RegExp, string]> = [
  [/\bmultiplied by\b|\btimes\b|×|·|\\times|\\cdot/gi, " * "],
  [/\bdivided by\b|\bover\b(?=\s*[\d(])|÷|\\div/gi, " / "],
  [/\bplus\b|\badded to\b/gi, " + "],
  [/\bminus\b|\btake away\b|−|–/gi, " - "],
  [/\bsquared\b/gi, " ^ 2 "],
  [/\bcubed\b/gi, " ^ 3 "],
];

// Relation phrases, longest first. `neg` flips the relation.
const RELATIONS: Array<{ re: RegExp; rel: Relation }> = [
  { re: /^(?:is|'s)\s+(?:not|n't)\s+(?:equal to|the same as)\b|^(?:isn't|isnt|doesn't equal|does not equal|doesnt equal|is not|≠|!=)/i, rel: "!=" },
  { re: /^(?:is\s+)?(?:at most|no more than|less than or equal to)\b|^≤|^<=/i, rel: "<=" },
  { re: /^(?:is\s+)?(?:at least|no less than|greater than or equal to)\b|^≥|^>=/i, rel: ">=" },
  { re: /^(?:is\s+|'s\s+)?(?:less than|smaller than|fewer than|under|below|lower than)\b|^</i, rel: "<" },
  { re: /^(?:is\s+|'s\s+)?(?:more than|greater than|bigger than|larger than|over|above|higher than)\b|^>/i, rel: ">" },
  { re: /^(?:is equal to|equals?|is|'s|makes|gives(?: you)?|comes to|gets you|=)\b|^=/i, rel: "=" },
];

const NUMBER = /^-?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?%?$/;

/** The line with number words as digits and spoken operators as symbols. */
export function mathForm(text: string): string {
  let t = spokenToDigits(text.replace(/\$/g, " ").replace(/,(?=\d{3}\b)/g, ""));
  for (const [re, sym] of OPS) t = t.replace(re, sym);
  // "5x4" between two numbers is a times sign; never inside a word.
  t = t.replace(/(\d)\s*[x]\s*(?=\d)/g, "$1 * ");
  return t.replace(/[ \t]+/g, " ");
}

type Tok = { s: string; at: number };

function tokens(t: string): Tok[] {
  const out: Tok[] = [];
  const re = /-?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?%?|[A-Za-z']+|[-+*/^()=<>≤≥≠!]+|\S/g;
  for (const m of t.matchAll(re)) out.push({ s: m[0], at: m.index ?? 0 });
  return out;
}

const isOp = (s: string) => /^[-+*/^]$/.test(s);
const isNum = (s: string) => NUMBER.test(s);

/**
 * An arithmetic expression read forward from token i: numbers, operators,
 * brackets, and unit words between them. Returns the token range or null.
 */
function readExpr(toks: Tok[], i: number): { end: number; expr: string; ops: number } | null {
  let j = i;
  let expr = "";
  let ops = 0;
  let depth = 0;
  let expectOperand = true;
  let lastGood = -1;
  let lastExpr = "";
  let lastOps = 0;
  while (j < toks.length) {
    const s = toks[j].s;
    if (expectOperand) {
      if (isNum(s)) {
        expr += s.replace(/%$/, "/100");
        expectOperand = false;
      } else if (s === "(") {
        expr += "(";
        depth++;
      } else if (s === "-" && j + 1 < toks.length && isNum(toks[j + 1].s)) {
        expr += "-";
      } else break;
    } else {
      if (UNIT.test(s)) {
        j++;
        continue;
      }
      if (isOp(s)) {
        // "^" needs a number after it; "-" and "+" must lead somewhere.
        if (j + 1 >= toks.length) break;
        expr += ` ${s} `;
        ops++;
        expectOperand = true;
      } else if (s === ")" && depth > 0) {
        expr += ")";
        depth--;
      } else break;
    }
    if (!expectOperand && depth === 0) {
      lastGood = j;
      lastExpr = expr;
      lastOps = ops;
    }
    j++;
  }
  // Unit words right after the last operand belong to it.
  if (lastGood < 0) return null;
  let end = lastGood;
  while (end + 1 < toks.length && UNIT.test(toks[end + 1].s)) end++;
  return { end, expr: lastExpr.trim(), ops: lastOps };
}

/** The relation phrase starting at token i, as text matched against RELATIONS. */
function readRelation(t: string, from: number): { rel: Relation; to: number } | null {
  // No comma between a value and its relation: "the chance is 0, at least 1
  // of them…" is not "0 ≥ 1" (Oct 31: read as a false claim).
  const rest = t.slice(from).replace(/^\s*/, "");
  const skipped = t.length - from - rest.length;
  for (const { re, rel } of RELATIONS) {
    const m = re.exec(rest);
    if (m) return { rel, to: from + skipped + m[0].length };
  }
  return null;
}

const ATTRIBUTION = /\b(?:you|you've|you'd|your|they|their|he|she|his|her|student)\b[^.?!]*$|\b(?:said|wrote|thought|guessed|claimed|put|had)\b\s*(?:that\s*)?$/i;

/** Every claim in the line. */
export function extractClaims(text: string): Claim[] {
  const t = mathForm(text);
  const toks = tokens(t);
  const claims: Claim[] = [];
  let prevValueExpr: string | null = null;
  let prevEnd = -1;
  for (let i = 0; i < toks.length; i++) {
    // "which is under 23", "and that is less than 23": the last value said.
    if (/^(?:which|that|this|it)$/i.test(toks[i].s) && prevValueExpr && i - prevEnd <= 3) {
      const rel = readRelation(t, toks[i].at + toks[i].s.length);
      if (rel) {
        const j = toks.findIndex((k) => k.at >= rel.to);
        const right = j >= 0 ? readExpr(toks, j) : null;
        if (right && rel.rel !== "=") {
          const start = toks[i].at;
          const stop = toks[right.end].at + toks[right.end].s.length;
          claims.push({ text: `${prevValueExpr} ${rel.rel} ${right.expr}`, span: [start, stop], lhs: prevValueExpr, rhs: right.expr, rel: rel.rel, attributed: ATTRIBUTION.test(t.slice(0, start)) });
          prevValueExpr = right.expr;
          prevEnd = right.end;
          i = right.end;
          continue;
        }
      }
    }
    if (!isNum(toks[i].s) && toks[i].s !== "(" && !(toks[i].s === "-" && i + 1 < toks.length && isNum(toks[i + 1].s))) continue;
    // Not the middle of an expression already read.
    const left = readExpr(toks, i);
    if (!left) continue;
    const afterLeft = toks[left.end].at + toks[left.end].s.length;
    const rel = readRelation(t, afterLeft);
    if (!rel) {
      i = left.end;
      continue;
    }
    const j = toks.findIndex((k) => k.at >= rel.to);
    const right = j >= 0 ? readExpr(toks, j) : null;
    if (!right) {
      i = left.end;
      continue;
    }
    // "it is 24" is an answer, not a claim: an equation needs a computation on
    // one side; a comparison needs a number on each side.
    const computes = left.ops > 0 || right.ops > 0;
    if (rel.rel === "=" && !computes) {
      i = left.end;
      continue;
    }
    // "x is 4 because 2 plus 2 is 4": a letter before the number is not ours.
    const before = toks[i - 1]?.s ?? "";
    if (/^[a-z]$/i.test(before) && !/^(?:a|i)$/i.test(before)) {
      i = left.end;
      continue;
    }
    const start = toks[i].at;
    const stop = toks[right.end].at + toks[right.end].s.length;
    claims.push({ text: t.slice(start, stop).replace(/\s+/g, " ").trim(), span: [start, stop], lhs: left.expr, rhs: right.expr, rel: rel.rel, attributed: ATTRIBUTION.test(t.slice(Math.max(0, t.lastIndexOf(".", start) + 1), start)) });
    prevValueExpr = right.expr;
    prevEnd = right.end;
    i = right.end;
  }
  return claims;
}

/** An arithmetic expression's value: + - * / ^ and brackets, or null. */
export function evaluate(expr: string): number | null {
  const toks = expr.replace(/\s+/g, "").match(/\d+(?:\.\d+)?|[-+*/^()]/g);
  if (!toks || toks.join("") !== expr.replace(/\s+/g, "")) return null;
  let i = 0;
  const peek = () => toks[i];
  const atom = (): number | null => {
    const s = peek();
    if (s === "-") {
      i++;
      const v = atom();
      return v === null ? null : -v;
    }
    if (s === "(") {
      i++;
      const v = sum();
      if (peek() !== ")") return null;
      i++;
      return v;
    }
    if (s !== undefined && /^\d/.test(s)) {
      i++;
      return Number(s);
    }
    return null;
  };
  const power = (): number | null => {
    const b = atom();
    if (b === null) return null;
    if (peek() === "^") {
      i++;
      const e = power();
      return e === null ? null : b ** e;
    }
    return b;
  };
  const product = (): number | null => {
    let v = power();
    while (v !== null && (peek() === "*" || peek() === "/")) {
      const op = toks[i++];
      const r = power();
      if (r === null) return null;
      v = op === "*" ? v * r : r === 0 ? null : v / r;
    }
    return v;
  };
  const sum = (): number | null => {
    let v = product();
    while (v !== null && (peek() === "+" || peek() === "-")) {
      const op = toks[i++];
      const r = product();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const v = sum();
  return v !== null && i === toks.length && Number.isFinite(v) ? v : null;
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** A number as it is written: 23, 0.5, 2/3 for a short fraction. */
export function fmtValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  for (const d of [2, 3, 4, 5, 6, 8, 9, 10, 12]) {
    const n = v * d;
    if (close(n, Math.round(n))) return `${Math.round(n)}/${d}`;
  }
  return String(Math.round(v * 1e6) / 1e6);
}

const pretty = (e: string) => e.replace(/\s*\*\s*/g, " × ").replace(/\s*\/\s*/g, " ÷ ").replace(/\s*-\s*/g, " − ").replace(/\s*\+\s*/g, " + ").replace(/^ − /, "−").replace(/\s+/g, " ").trim();

/** One claim, checked. */
export function verifyClaim(c: Claim): ClaimAssessment {
  const a = evaluate(c.lhs.replace(/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/g, "($1/$2)"));
  const b = evaluate(c.rhs.replace(/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/g, "($1/$2)"));
  if (a === null || b === null) return { ...c, verdict: "unsupported" };
  const holds = c.rel === "=" ? close(a, b) : c.rel === "!=" ? !close(a, b) : c.rel === "<" ? a < b && !close(a, b) : c.rel === ">" ? a > b && !close(a, b) : c.rel === "<=" ? a < b || close(a, b) : a > b || close(a, b);
  if (holds) return { ...c, verdict: "verified_true", values: [a, b] };
  const truth = close(a, b) ? "=" : a < b ? "<" : ">";
  const correct = c.rel === "=" || c.rel === "!=" ? `${pretty(c.lhs)} = ${fmtValue(a)}` : `${pretty(c.lhs)} ${truth} ${pretty(c.rhs)}`;
  return { ...c, verdict: "verified_false", values: [a, b], correct };
}

/** Every claim in a line, each checked. */
export function assessClaims(text: string): ClaimAssessment[] {
  return extractClaims(text).map(verifyClaim);
}

/**
 * The false computations a speaker would assert as their own: what the tutor
 * may not say. A claim reported as the student's, or denied, is not asserted.
 */
export function falseAssertions(text: string): ClaimAssessment[] {
  return assessClaims(text).filter((c) => c.verdict === "verified_false" && !c.attributed);
}
