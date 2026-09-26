// Deterministic answer checking behind the tutor's check_answer tool.
//
// LLM tutors confirm wrong answers far more often than they reject right ones,
// so the tutor does not judge arithmetic in its head: it passes the problem and
// the student's answer here and gets a verdict it can trust. Built on the
// board's expression evaluator (lib/math-expression.ts), which only knows the
// variable x and has no implicit multiplication, so inputs are normalised first.

import { createMathEvaluator } from "./math-expression";

export type CheckVerdict = "correct" | "partial" | "incorrect" | "cannot_check";
export type AnswerCheck = { verdict: CheckVerdict; message: string };

const KNOWN_WORDS = new Set(["abs", "cos", "exp", "ln", "log", "sin", "sqrt", "tan", "pi", "e"]);
const SAMPLE_POINTS = [2, 3, -1, 5, 0.5, -2.5, 7];

type Prepared = { ok: true; text: string; variable: string | null } | { ok: false; reason: string };

// Rewrites a student-style math string into something math-expression.ts can
// parse: unicode and LaTeX symbols, percent, "of", mixed numbers, implicit
// multiplication, and a single variable renamed to x.
export function prepareExpression(raw: string): Prepared {
  let s = raw.toLowerCase().trim();
  if (!s) return { ok: false, reason: "empty" };
  s = s
    .replace(/[−–—]/g, "-")
    .replace(/[×·✕]/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/√/g, "sqrt")
    .replace(/π/g, "pi")
    .replace(/\\left|\\right/g, "")
    .replace(/\\cdot|\\times/g, "*")
    .replace(/\\div/g, "/")
    // "2\frac{1}{2}" is typeset two and a half, not two times a half.
    .replace(/(\d)\s*\\[dt]?frac\{\s*(\d+)\s*\}\{\s*(\d+)\s*\}/g, "$1 $2/$3")
    .replace(/\\[dt]?frac\{([^{}]+)\}\{([^{}]+)\}/g, "(($1)/($2))")
    .replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)")
    .replace(/\\pi/g, "pi")
    .replace(/[{}]/g, (c) => (c === "{" ? "(" : ")"));
  if (/[<>≤≥]/.test(s)) return { ok: false, reason: "an inequality" };
  s = s.replace(/(\d),(\d{3})(?!\d)/g, "$1$2");
  s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)");
  s = s.replace(/\bof\b/g, "*");
  // Mixed numbers: "2 1/2" is two and a half.
  s = s.replace(/(^|[^\d.])(\d+)\s+(\d+)\s*\/\s*(\d+)/g, "$1($2+$3/$4)");
  // Anything else like "3 4" is ambiguous; never guess.
  if (/\d\s+\d/.test(s)) return { ok: false, reason: "numbers separated by a space" };
  if (/[^0-9a-z.+\-*/^()\s,]/.test(s)) return { ok: false, reason: "symbols it can't read" };

  const vars = new Set<string>();
  for (const word of s.match(/[a-z]+/g) ?? []) {
    if (KNOWN_WORDS.has(word)) continue;
    if (word.length === 1) vars.add(word);
    else return { ok: false, reason: `the word "${word}"` };
  }
  if (vars.size > 1) return { ok: false, reason: "more than one letter" };
  const variable = vars.size === 1 ? [...vars][0] : null;

  s = s.replace(/\s+/g, "");
  if (variable && variable !== "x") s = s.replace(new RegExp(`(^|[^a-z])${variable}(?![a-z])`, "g"), "$1x");
  // Implicit multiplication: 2x, 3(x+1), (x+1)(x-1), (2)3, x(x+1).
  s = s.replace(/(\d|\))(?=[a-z(])/g, "$1*");
  s = s.replace(/(^|[^a-z])x(?=[(\d])/g, "$1x*");
  s = s.replace(/\)(?=\d)/g, ")*");
  return { ok: true, text: s, variable };
}

function near(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

function toFraction(v: number): string | null {
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = v;
  for (let i = 0; i < 24; i++) {
    const a = Math.floor(b);
    [h1, h0] = [a * h1 + h0, h1];
    [k1, k0] = [a * k1 + k0, k1];
    if (k1 > 1000) return null;
    if (Math.abs(v - h1 / k1) < 1e-9) return `${h1}/${k1}`;
    const rest = b - a;
    if (rest === 0) return null;
    b = 1 / rest;
  }
  return null;
}

export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return "undefined";
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-9) return String(r === 0 ? 0 : r);
  const dec = Number(v.toFixed(4));
  const decText = dec === v ? String(dec) : `about ${dec}`;
  const frac = toFraction(v);
  return frac ? `${frac} (${decText})` : decText;
}

function tidy(v: number): number {
  return Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v;
}

// Solutions of f(x) = 0 when f is linear or quadratic; null when it is neither
// or has no single answer (0 = 0).
export function solveOneVariable(f: (x: number) => number): number[] | null {
  const f0 = f(0), f1 = f(1), fm1 = f(-1);
  const probes = [2, -1.5, 3.25];
  if (![f0, f1, fm1, ...probes.map(f)].every(Number.isFinite)) return null;
  const slope = f1 - f0;
  if (probes.every((x) => near(f(x), f0 + slope * x, 1e-7))) {
    if (near(slope, 0, 1e-12)) return null;
    return [tidy(-f0 / slope)];
  }
  const c = f0, a = (f1 + fm1) / 2 - c, b = (f1 - fm1) / 2;
  if (!probes.every((x) => near(f(x), a * x * x + b * x + c, 1e-7))) return null;
  const disc = b * b - 4 * a * c;
  if (disc < -1e-12) return [];
  if (Math.abs(disc) <= 1e-12) return [tidy(-b / (2 * a))];
  const r = Math.sqrt(disc);
  return [tidy((-b - r) / (2 * a)), tidy((-b + r) / (2 * a))].sort((p, q) => p - q);
}

function splitAnswers(raw: string): string[] {
  return raw.split(/\s*(?:\bor\b|\band\b|;|,(?!\d{3}(?!\d)))\s*/i).map((s) => s.trim()).filter(Boolean);
}

// Spoken filler around the whole answer: "um, 5/6? I think" → "5/6".
function stripFiller(raw: string): string {
  return raw
    .replace(/[?!]+|\.{2,}|…/g, " ")
    .replace(/\b(i think|i guess|maybe|probably|um+|uh+|hmm+|oh+|ok|okay|well|like|wait|yeah|so|is it|it'?s|it is|the answer is|answer)\b:?/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:]+|[\s,;:.]+$/g, "")
    .trim();
}

// One answer: "x is 4" → "4", "x = -3" → "-3".
function cleanAnswer(raw: string): string {
  let s = raw.trim().replace(/[\s.]+$/, "");
  s = s.replace(/\s+(equals|is)\s+/gi, " = ");
  const assigned = /^([a-z])\s*=\s*(.+)$/i.exec(s);
  if (assigned) s = assigned[2];
  return s.trim();
}

function decimalsIn(s: string): number | null {
  const m = /^-?\d*\.(\d+)$/.exec(s.trim());
  return m ? m[1].length : null;
}

function cannot(message: string): AnswerCheck {
  // An order, not an apology (Sept 25 2026: 3.8 acts on short fix-it orders and
  // ignores prose): resend in digits and symbols, or check it yourself.
  return { verdict: "cannot_check", message: `Can't check this automatically: ${message} Call check_answer again with the problem in digits and symbols (problem="12/2*5", problem="2(3)+1", problem="15% of 100"), or work it out yourself before you respond.` };
}

// "f(3) where f(x) = 2x + 1", "f(x) = 2x + 1, f(3)", "g(-2) if g(x) = x^2 + 3":
// the value goes in for the variable and the problem is the arithmetic left.
const FUNCTION_EVAL_FIRST = /^\s*([a-z])\s*\(\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*\)\s*(?:where|if|when|with|given|,|;|:)\s*\1\s*\(\s*([a-z])\s*\)\s*=\s*(.+?)\s*$/i;
const FUNCTION_EVAL_LAST = /^\s*([a-z])\s*\(\s*([a-z])\s*\)\s*=\s*(.+?)\s*(?:,|;|:|\.|\s+)\s*(?:find|evaluate|what is|whats|what's)?\s*\1\s*\(\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*\)\s*\??\s*$/i;

// "0.5 > 0.35" or "0.35 < 0.5" as the problem (Sept 25 2026: 3.8 passed its
// own verdict as the problem four times in one session): the student's answer
// is the bigger or smaller number, or a yes/no about the claim.
const COMPARISON = /^\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*\??\s*$/;
const YES = /^\s*(yes|yeah|yep|true|right|correct|it is|its true|that's right)\s*[.!?]*\s*$/i;
const NO = /^\s*(no|nope|false|wrong|incorrect|not true|it isn't|it's not)\s*[.!?]*\s*$/i;

// "0.35 vs 0.5", "0.35 or 0.5": which one is asked is in the answer ("0.35 is bigger").
const PAIR = /^\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*(?:vs\.?|versus|or|,)\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*\??\s*$/i;
const ANSWER_COMPARATIVE = /\b(bigger|larger|greater|more|higher|smaller|less|lower|fewer)\b/i;

function checkPairClaim(problem: string, answer: string): AnswerCheck | null {
  const m = PAIR.exec(problem);
  if (!m) return null;
  const said = answer.replace(/\$/g, "");
  const cmp = ANSWER_COMPARATIVE.exec(said)?.[1].toLowerCase();
  if (!cmp) return cannot(`"${problem}" lists two numbers but not which is asked; put it in the problem ("which is bigger, ${m[1]} or ${m[2]}").`);
  return checkComparison(`which is ${cmp}, ${m[1]} or ${m[2]}`, said);
}

function checkInequalityClaim(problem: string, answer: string): AnswerCheck | null {
  const m = COMPARISON.exec(problem);
  if (!m) return checkPairClaim(problem, answer);
  const a = readValue(m[1]);
  const b = readValue(m[3]);
  if (a === null || b === null) return null;
  const op = m[2];
  const holds = op === ">" ? a > b : op === "<" ? a < b : op === ">=" ? a >= b : a <= b;
  const bigger = a > b ? m[1] : m[3];
  const smaller = a > b ? m[3] : m[1];
  const wantsBigger = op === ">" || op === ">=";
  const said = cleanAnswer(stripFiller(spokenToDigits(answer.replace(/\$/g, ""))));
  if (YES.test(said)) return holds ? { verdict: "correct", message: `Correct: ${m[1]} ${op} ${m[3]} holds.` } : { verdict: "incorrect", message: `Incorrect: ${m[1]} ${op} ${m[3]} does not hold. (For you only: ${bigger} is the bigger one. Don't say it or write it; help them find the mistake.)` };
  if (NO.test(said)) return holds ? { verdict: "incorrect", message: `Incorrect: ${m[1]} ${op} ${m[3]} does hold. (For you only: ${bigger} is the bigger one. Don't say it or write it; help them find the mistake.)` } : { verdict: "correct", message: `Correct: ${m[1]} ${op} ${m[3]} does not hold.` };
  const v = readValue(said);
  if (v === null) return cannot(`couldn't read the student's answer "${answer}" as a number or a yes/no.`);
  // A number: the one the claim points at (the bigger for >, the smaller for <).
  const target = wantsBigger ? bigger : smaller;
  if (near(v, readValue(target)!)) return { verdict: "correct", message: `Correct: ${target} is the ${wantsBigger ? "bigger" : "smaller"} of ${m[1]} and ${m[3]}.` };
  return { verdict: "incorrect", message: `Incorrect: the student's ${said} is not the ${wantsBigger ? "bigger" : "smaller"} of ${m[1]} and ${m[3]}. (For you only: it is ${target}. Don't say it or write it; help them find the mistake.)` };
}

// "5 cups * 6 cookies" is "5 * 6": a unit word right after a number goes when
// the rest is arithmetic. Math words stay ("25% of 80", "2 pi", "3 halves").
const UNIT_KEEP = /^(of|pi|percent|mod|and|to|by|over|per|halves?|thirds?|quarters?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?|twelfths?|hundredths?|wholes?)$/i;
export function stripUnitWords(problem: string): string {
  if (!/[-+×÷*/]/.test(problem)) return problem;
  return problem.replace(/(\d(?:\.\d+)?)\s+([a-zA-Z]{2,})(?![a-zA-Z(])/g, (whole, num: string, word: string) => (UNIT_KEEP.test(word) ? whole : num)).replace(/\s{2,}/g, " ").trim();
}

/** "f(3) where f(x) = 2x + 1" as the arithmetic "2(3) + 1", or null when it is not that shape. */
export function substituteFunctionEval(problem: string): string | null {
  const m = FUNCTION_EVAL_FIRST.exec(problem);
  const [value, variable, body] = m ? [m[2], m[3], m[4]] : (() => { const l = FUNCTION_EVAL_LAST.exec(problem); return l ? [l[4], l[2], l[3]] : ["", "", ""]; })();
  if (!body) return null;
  const v = /^-|\//.test(value) ? `(${value})` : value;
  // The variable, standing alone (not inside a function name like "sin").
  const re = new RegExp(`(?<![a-z])${variable}(?![a-z])`, "gi");
  if (!re.test(body)) return null;
  return body.replace(re, `(${v})`).replace(/\(\((-?[\d./]+)\)\)/g, "($1)");
}

function evalConstant(text: string): number | null {
  const f = createMathEvaluator(text);
  if (!f) return null;
  const v = f(0);
  return Number.isFinite(v) ? v : null;
}

// The board's typeset line, copied back as the problem: "0.35 \\text{ vs } 0.5"
// (Sept 25 2026, Maya's auto-check found "symbols it can't read").
function unTextLatex(s: string): string {
  return s.replace(/\\(?:text|mathrm|textrm)\{([^{}]*)\}/g, " $1 ").replace(/\\[,;:!]/g, " ").replace(/\s+/g, " ").trim();
}

// "(3 ± 1)/4": both branches are the answer (Sept 26 2026: the final step of
// every quadratic-formula problem came back cannot_check, so it was judged by ear).
const PLUS_MINUS = /±|\\pm\b|\+\s*\/\s*-|\+-/;

function checkPlusMinus(problem: string, answer: string): AnswerCheck | null {
  if (!PLUS_MINUS.test(problem) || problem.includes("=")) return null;
  const plus = readValue(problem.replace(PLUS_MINUS, "+"));
  const minus = readValue(problem.replace(PLUS_MINUS, "-"));
  if (plus === null || minus === null) return null;
  const said = splitAnswers(stripFiller(spokenToDigits(answer.replace(/\$/g, ""), { the: true }))).map((a) => readValue(cleanAnswer(a))).filter((v): v is number => v !== null);
  if (!said.length) return cannot(`couldn't read the student's answer "${answer}" as numbers.`);
  const wanted = [plus, minus];
  const hit = wanted.filter((w) => said.some((v) => near(v, w)));
  const extra = said.filter((v) => !wanted.some((w) => near(v, w)));
  const both = `${approx(plus)} and ${approx(minus)}`;
  if (hit.length === 2 && !extra.length) return { verdict: "correct", message: `Correct: the two values are ${both}.` };
  if (hit.length >= 1 && !extra.length) return { verdict: "partial", message: `Partial: that is one of the two (for you only: ${both}). Ask for the other sign.` };
  return { verdict: "incorrect", message: `Incorrect: the student's answer is not ${plus === minus ? approx(plus) : "either value"}. (For you only: ${both}. Don't say it or write it; help them find the mistake.)` };
}

export function checkAnswer(problem: string, studentAnswer: string): AnswerCheck {
  problem = unTextLatex(problem ?? "");
  const pm = checkPlusMinus(problem, studentAnswer ?? "");
  if (pm) return pm;
  const claimed = checkInequalityClaim(problem, studentAnswer);
  if (claimed) return claimed;
  // "25\\%" is the board's LaTeX for 25%: the tutor copies it from there.
  const asked = (problem ?? "").trim().replace(/\\%/g, "%");
  const heard = (studentAnswer ?? "").trim().replace(/\\%/g, "%");
  if (!asked || !heard) return cannot("it needs both the problem and the student's answer.");
  // Diagnostic questions an opening asks, before anything is read as math.
  const diagnostic = checkHowMany(asked, heard) ?? checkComparison(asked, heard);
  if (diagnostic) return diagnostic;
  if (PICTURE_WORDS.test(asked)) return cannot(`"${asked}" is about a picture; look at the board.`);
  const read = readProblem(asked);
  if (typeof read !== "string") return read;
  const prob = read;
  // Voice transcripts spell numbers out: "two and a half", "negative four".
  const answer = spokenToDigits(heard, { the: true });
  if (/[<>≤≥]/.test(prob) || /[<>≤≥]/.test(answer)) return cannot("inequalities aren't supported.");
  const blank = checkWithBlank(prob, answer);
  if (blank) return blank;
  const sides = prob.split("=");
  if (sides.length > 2) return cannot(`"${prob}" has more than one equals sign.`);
  return sides.length === 2 ? checkEquation(sides[0], sides[1], prob, answer) : checkExpression(prob, answer);
}

// A line with a box in it ("1/2 = ?/6", "? + 5 = 12", "3/6 + 2/6 = ?"), the
// way the board asks (Sept 23 2026: "1/2 = ?/6" could not be checked, so the
// student's "3" never reached their box). The answer goes where the "?" is;
// an answer that is itself a fraction ("3/6") fills a whole "?/6" fraction.
const FRACTION_BLANK = /\\[dt]?frac\{\s*\?\s*\}\{[^{}]*\}|\\[dt]?frac\{[^{}]*\}\{\s*\?\s*\}|\?\s*\/\s*\d+|\d+\s*\/\s*\?/;

function checkWithBlank(problem: string, answer: string): AnswerCheck | null {
  if ((problem.match(/\?/g) ?? []).length !== 1) return null;
  const sides = problem.split("=");
  if (sides.length !== 2) return null;
  const [left, right] = sides.map((side) => side.trim());
  // "x - 2 = ?": the box is that side's value, which depends on the page's
  // problem (checkBlankInPage), not an expression to match (it judged a right
  // "5" wrong on Sept 23).
  const other = right === "?" ? left : left === "?" ? right : null;
  if (other !== null) {
    const O = prepareExpression(other);
    if (!other || (O.ok && O.variable)) return null;
    return checkExpression(other, answer);
  }
  const said = cleanAnswer(stripFiller(answer));
  const wholeFraction = /\//.test(said) && FRACTION_BLANK.test(problem);
  const filled = wholeFraction ? problem.replace(FRACTION_BLANK, `(${said})`) : problem.replace("?", `(${said})`);
  const [fl, fr] = filled.split("=");
  const L = prepareExpression(fl);
  const R = prepareExpression(fr);
  if (!L.ok || !R.ok || L.variable || R.variable) return null;
  const lv = evalConstant(L.text);
  const rv = evalConstant(R.text);
  if (lv === null || rv === null) return null;
  const line = problem.replace(/\s+/g, " ");
  if (near(lv, rv, 1e-9)) return { verdict: "correct", message: `Correct: ${said} in the box makes ${line} true.` };
  // What goes in the box, for the tutor only: solve with a letter in its place.
  const letter = ["n", "k", "t", "x"].find((l) => !new RegExp(`\\b${l}\\b`).test(problem)) ?? "n";
  const solved = checkAnswer(problem.replace("?", letter), "0");
  const value = new RegExp(`For you only: ${letter} = (.+?)\\. Don't`).exec(solved.message)?.[1];
  return {
    verdict: "incorrect",
    message: `Incorrect: ${said} in the box makes the two sides ${formatNumber(lv)} and ${formatNumber(rv)}.${value ? ` (For you only: the box is ${value}. Don't say it or write it; help them find the mistake.)` : ""}`,
  };
}

/**
 * A box beside an expression in the page's letter, checked against the page's
 * equation: "x - 2 = ?" while solving 4(x - 2) = 20 holds 5, because x = 7.
 * Null when the page is not a one-letter equation with one solution.
 */
export function checkBlankInPage(page: string, problem: string, answer: string): AnswerCheck | null {
  if ((problem.match(/\?/g) ?? []).length !== 1) return null;
  const sides = problem.split("=");
  if (sides.length !== 2) return null;
  const [left, right] = sides.map((side) => side.trim());
  const expr = right === "?" ? left : left === "?" ? right : null;
  if (!expr) return null;
  const E = prepareExpression(expr);
  const pageSides = page.replace(/\\%/g, "%").split("=");
  if (!E.ok || !E.variable || pageSides.length !== 2) return null;
  const PL = prepareExpression(pageSides[0]);
  const PR = prepareExpression(pageSides[1]);
  if (!PL.ok || !PR.ok) return null;
  const letter = PL.variable ?? PR.variable;
  if (!letter || letter !== E.variable || (PL.variable && PR.variable && PL.variable !== PR.variable)) return null;
  const fl = createMathEvaluator(PL.text);
  const fr = createMathEvaluator(PR.text);
  const fe = createMathEvaluator(E.text);
  if (!fl || !fr || !fe) return null;
  const solutions = solveOneVariable((x) => fl(x) - fr(x));
  if (!solutions || solutions.length !== 1) return null;
  const want = fe(solutions[0]);
  const said = cleanAnswer(stripFiller(answer));
  const A = prepareExpression(said);
  if (!A.ok || A.variable || !Number.isFinite(want)) return null;
  const got = evalConstant(A.text);
  if (got === null) return null;
  const where = `${expr} when ${letter} = ${formatNumber(solutions[0])} (${page.trim()})`;
  if (near(want, got, 1e-9)) return { verdict: "correct", message: `Correct: ${said} is ${where}.` };
  return {
    verdict: "incorrect",
    message: `Incorrect: ${said} is not ${expr} here. (For you only: ${expr} is ${formatNumber(want)}, since ${letter} = ${formatNumber(solutions[0])}. Don't say it or write it; help them find the mistake.)`,
  };
}

function checkEquation(left: string, right: string, problem: string, answer: string): AnswerCheck {
  const L = prepareExpression(left);
  const R = prepareExpression(right);
  if (!L.ok) return cannot(`the left side of "${problem}" has ${L.reason}.`);
  if (!R.ok) return cannot(`the right side of "${problem}" has ${R.reason}.`);
  if (L.variable && R.variable && L.variable !== R.variable) return cannot(`"${problem}" has more than one letter.`);
  const variable = L.variable ?? R.variable;
  if (!variable) return cannot(`"${problem}" has no letter to solve for; pass the expression to work out instead.`);
  const fl = createMathEvaluator(L.text);
  const fr = createMathEvaluator(R.text);
  if (!fl || !fr) return cannot(`couldn't read "${problem}".`);

  const values: { raw: string; v: number }[] = [];
  for (const part of splitAnswers(stripFiller(answer))) {
    const raw = cleanAnswer(part);
    const p = prepareExpression(raw);
    if (!p.ok || p.variable) return cannot(`couldn't read the student's answer "${answer}" as a number.`);
    const v = evalConstant(p.text);
    if (v === null) return cannot(`couldn't read the student's answer "${answer}" as a number.`);
    values.push({ raw, v });
  }
  if (values.length === 0) return cannot(`couldn't read the student's answer "${answer}".`);

  const solutions = solveOneVariable((x) => fl(x) - fr(x));
  const works = ({ raw, v }: { raw: string; v: number }) => {
    if (near(fl(v), fr(v), 1e-9)) return true;
    const k = decimalsIn(raw);
    return k !== null && Boolean(solutions?.some((s) => Math.abs(s - v) <= 0.5 * 10 ** -k + 1e-12));
  };
  const said = values.map((x) => `${variable} = ${x.raw}`).join(" or ");
  const allSolutions = solutions && solutions.length > 0 ? `${variable} = ${solutions.map(formatNumber).join(" or ")}` : null;

  const wrong = values.find((x) => !works(x));
  if (!wrong) {
    if (solutions && solutions.length > values.length) {
      return {
        verdict: "partial",
        message: `Partly right: ${said} works in ${problem}, but it has ${solutions.length} solutions (${allSolutions}). Don't say the missing one; help them find it.`,
      };
    }
    return { verdict: "correct", message: `Correct: ${said} makes both sides of ${problem} equal.` };
  }
  const lv = fl(wrong.v), rv = fr(wrong.v);
  const hint = allSolutions ? ` (For you only: ${allSolutions}. Don't say it or write it; help them find the mistake.)` : solutions?.length === 0 ? " (For you only: it has no real solution.)" : "";
  // "the right side is 11", not "the right side 11 is 11".
  const side = (label: string, text: string, hasLetter: boolean, value: number) =>
    hasLetter || !/^\s*-?\d+(\.\d+)?\s*$/.test(text) ? `the ${label} side ${text.trim()} is ${formatNumber(value)}` : `the ${label} side is ${formatNumber(value)}`;
  return {
    verdict: "incorrect",
    message: `Incorrect: with ${variable} = ${wrong.raw}, ${side("left", left, Boolean(L.variable), lv)} but ${side("right", right, Boolean(R.variable), rv)}.${hint}`,
  };
}

function checkExpression(problem: string, answer: string): AnswerCheck {
  const P = prepareExpression(problem);
  if (!P.ok) return cannot(`"${problem}" has ${P.reason}.`);
  const parts = splitAnswers(stripFiller(answer));
  if (parts.length !== 1) return cannot("an expression has one answer; pass them one at a time.");
  const raw = cleanAnswer(parts[0]);
  const A = prepareExpression(raw);
  if (!A.ok) return cannot(`the student's answer "${answer}" has ${A.reason}.`);
  const fp = createMathEvaluator(P.text);
  const fa = createMathEvaluator(A.text);
  if (!fp || !fa) return cannot(`couldn't read "${fp ? answer : problem}".`);

  if (!P.variable && !A.variable) {
    const pv = fp(0), av = fa(0);
    if (!Number.isFinite(pv)) return cannot(`"${problem}" doesn't have a value (division by zero?).`);
    if (!Number.isFinite(av)) return cannot(`the student's answer "${answer}" doesn't have a value.`);
    if (near(pv, av)) return { verdict: "correct", message: `Correct: ${problem} = ${formatNumber(pv)}, and the student's ${raw} matches.` };
    const k = decimalsIn(raw);
    if (k !== null && Math.abs(pv - av) <= 0.5 * 10 ** -k + 1e-12) {
      return { verdict: "correct", message: `Correct, rounded: ${problem} = ${formatNumber(pv)}, and ${raw} is right to ${k} decimal place${k === 1 ? "" : "s"}.` };
    }
    return {
      verdict: "incorrect",
      message: `Incorrect: the student's ${raw} is ${formatNumber(av)}. (For you only: ${problem} = ${formatNumber(pv)}. Don't say it or write it; help them find the mistake.)`,
    };
  }

  const letter = P.variable ?? A.variable ?? "x";
  let checked = 0;
  for (const x of SAMPLE_POINTS) {
    const a = fp(x), b = fa(x);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    checked++;
    if (!near(a, b)) {
      return {
        verdict: "incorrect",
        message: `Incorrect: ${raw} is not the same as ${problem}. With ${letter} = ${formatNumber(x)}, ${problem} is ${formatNumber(a)} but ${raw} is ${formatNumber(b)}.`,
      };
    }
  }
  if (checked < 3) return cannot(`couldn't compare "${answer}" with "${problem}".`);
  return { verdict: "correct", message: `Correct: ${raw} is the same as ${problem} for every value of ${letter}.` };
}

// ---------------------------------------------------------------------------
// Spoken numbers. Voice transcripts arrive as words ("two and a half",
// "negative four", "five sixths"), and an opening's diagnostic questions are
// often spoken too ("What is a half of 40?"). Only a run made entirely of
// number words is converted, so "x is 4" and "the answer is 5/6" pass through
// untouched and anything half-understood stays a word the checker refuses.

const UNIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEEN_WORDS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS_WORDS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

// "second" is left out on purpose: "the second" is a position far more often
// than a fraction, and "two seconds" is time.
const DENOMINATOR_WORDS: Record<string, number> = (() => {
  const singular: Record<string, number> = {
    half: 2, third: 3, fourth: 4, quarter: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
    eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
    eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30, fortieth: 40, fiftieth: 50, hundredth: 100, thousandth: 1000,
  };
  const all: Record<string, number> = { halves: 2 };
  for (const [w, d] of Object.entries(singular)) {
    all[w] = d;
    if (w !== "half") all[`${w}s`] = d;
  }
  return all;
})();

const NUMBER_WORDS = [...UNIT_WORDS, ...TEEN_WORDS, ...Object.keys(TENS_WORDS), "hundred", "thousand", ...Object.keys(DENOMINATOR_WORDS)];
const HYPHENATED = new RegExp(`\\b(${NUMBER_WORDS.join("|")})-(?=(${NUMBER_WORDS.join("|")})\\b)`, "gi");
const TOKEN = /[a-z]+|\d+(?:\.\d+)?|\s+|[\s\S]/gi;

type Cardinal = { value: number; end: number };

/**
 * Number words in `text` as digits: "twenty five" → "25", "a third" → "1/3",
 * "two and a half" → "2 1/2", "negative four" → "-4", "zero point five" →
 * "0.5", "fifty percent" → "50%". `the` also reads "the third" as 1/3, which
 * only an answer means ("which is bigger?" "the third").
 */
export function spokenToDigits(text: string, opts: { the?: boolean } = {}): string {
  const toks = (text.replace(HYPHENATED, "$1 ").match(TOKEN) ?? []) as string[];
  const isWord = (j: number) => j >= 0 && j < toks.length && /^[a-z]+$/i.test(toks[j]);
  const word = (j: number) => (isWord(j) ? toks[j].toLowerCase() : null);
  const digits = (j: number) => (j >= 0 && j < toks.length && /^\d+$/.test(toks[j]) ? Number(toks[j]) : null);
  // The next token of the same phrase: one space away, never glued on.
  const after = (j: number) => (j + 2 < toks.length && /^\s+$/.test(toks[j + 1]) ? j + 2 : -1);
  const denom = (j: number) => {
    const w = word(j);
    return w && w in DENOMINATOR_WORDS ? DENOMINATOR_WORDS[w] : null;
  };

  // "three hundred and five", "twenty five"; "two three" stops after "two".
  const cardinal = (k: number, start?: { cur: number; last: string }): Cardinal | null => {
    // `start` is "a" read as one, for "a hundred".
    let total = 0, cur = start?.cur ?? 0, last = start?.last ?? "none", end = -1, j = k;
    while (j !== -1) {
      const w = word(j);
      if (w === null) break;
      const unit = UNIT_WORDS.indexOf(w), teen = TEEN_WORDS.indexOf(w);
      if (unit >= 0 && ["none", "ten", "hundred", "thousand"].includes(last) && !(unit === 0 && last !== "none")) {
        cur += unit;
        last = unit === 0 ? "zero" : "unit";
      } else if (teen >= 0 && ["none", "hundred", "thousand"].includes(last)) {
        cur += 10 + teen;
        last = "teen";
      } else if (w in TENS_WORDS && ["none", "hundred", "thousand"].includes(last)) {
        cur += TENS_WORDS[w];
        last = "ten";
      } else if (w === "hundred" && (last === "unit" || last === "teen")) {
        cur *= 100;
        last = "hundred";
      } else if (w === "thousand" && ["unit", "teen", "ten", "hundred"].includes(last)) {
        total += cur * 1000;
        cur = 0;
        last = "thousand";
      } else if (w === "and" && (last === "hundred" || last === "thousand")) {
        const n = after(j);
        const nw = word(n);
        if (!nw || !(UNIT_WORDS.includes(nw) || TEEN_WORDS.includes(nw) || nw in TENS_WORDS)) break;
        j = n;
        continue;
      } else break;
      end = j;
      j = after(j);
    }
    return last === "none" ? null : { value: total + cur, end };
  };

  const numberAt = (k: number): (Cardinal & { spoken: boolean }) | null => {
    const d = digits(k);
    if (d !== null) return { value: d, end: k, spoken: false };
    const w = word(k);
    if ((w === "a" || w === "an") && (word(after(k)) === "hundred" || word(after(k)) === "thousand")) {
      const c = cardinal(after(k), { cur: 1, last: "unit" });
      return c ? { ...c, spoken: true } : null;
    }
    const c = cardinal(k);
    return c ? { ...c, spoken: true } : null;
  };

  // "a half", "one third", "three quarters", "3 fourths".
  const fractionAt = (k: number, allowThe: boolean): { n: number; d: number; end: number } | null => {
    const w = word(k);
    if (w === "a" || w === "an" || (allowThe && w === "the")) {
      const d = denom(after(k));
      return d ? { n: 1, d, end: after(k) } : null;
    }
    const num = numberAt(k);
    if (!num) return null;
    const d = denom(after(num.end));
    return d ? { n: num.value, d, end: after(num.end) } : null;
  };

  const phraseAt = (k: number): { out: string; end: number } | null => {
    let sign = "", s = k, spoken = false;
    const w0 = word(k);
    if (w0 === "negative" || w0 === "minus") {
      const n = after(k);
      if (n === -1 || (digits(n) === null && !phraseAt(n))) return null;
      sign = "-";
      s = n;
      spoken = true;
    }
    if (word(s) === "point") {
      const ds: number[] = [];
      let j = after(s), end = s;
      while (j !== -1 && UNIT_WORDS.includes(word(j) ?? "")) {
        ds.push(UNIT_WORDS.indexOf(word(j)!));
        end = j;
        j = after(j);
      }
      return ds.length ? { out: `${sign}0.${ds.join("")}`, end } : null;
    }
    if (word(s) === "half" && word(after(s)) === "of") return { out: `${sign}1/2`, end: s };
    const frac = fractionAt(s, Boolean(opts.the));
    let out: string, end: number;
    if (frac) {
      out = `${frac.n}/${frac.d}`;
      end = frac.end;
      spoken = true;
    } else {
      const num = numberAt(s);
      if (!num) return null;
      spoken ||= num.spoken;
      out = String(num.value);
      end = num.end;
      const next = after(end);
      const nw = word(next);
      if (nw === "point") {
        const ds: number[] = [];
        let j = after(next);
        while (j !== -1 && UNIT_WORDS.includes(word(j) ?? "")) {
          ds.push(UNIT_WORDS.indexOf(word(j)!));
          end = j;
          j = after(j);
        }
        if (ds.length) {
          out += `.${ds.join("")}`;
          spoken = true;
        }
      } else if (nw === "over") {
        const den = numberAt(after(next));
        if (den) {
          out = `${num.value}/${den.value}`;
          end = den.end;
          spoken = true;
        }
      } else if (nw === "and") {
        // "two and a half": a proper fraction after "and" makes a mixed number.
        const part = fractionAt(after(next), false);
        if (part && part.n < part.d) {
          out = `${num.value} ${part.n}/${part.d}`;
          end = part.end;
          spoken = true;
        }
      }
    }
    if (word(after(end)) === "percent") {
      out += "%";
      end = after(end);
      spoken = true;
    }
    return spoken ? { out: sign + out, end } : null;
  };

  const out: string[] = [];
  let i = 0;
  while (i < toks.length) {
    const glued = i > 0 && /[a-z0-9]$/i.test(toks[i - 1]);
    if (!glued && (isWord(i) || digits(i) !== null)) {
      const p = phraseAt(i);
      // A phrase glued to what follows ("one2") is not a number phrase.
      if (p && !(p.end + 1 < toks.length && /^[a-z0-9]/i.test(toks[p.end + 1]))) {
        out.push(p.out);
        i = p.end + 1;
        continue;
      }
    }
    out.push(toks[i]);
    i++;
  }
  return out
    .join("")
    .replace(/(\d|\))\s+(plus|times|multiplied by|divided by)\s+(?=[-\d(])/gi, (_m, a: string, op: string) =>
      `${a} ${op.toLowerCase() === "plus" ? "+" : op.toLowerCase() === "divided by" ? "/" : "*"} `,
    )
    // "negative three squared" is (-3)^2, "the square root of 16" is sqrt(16)
    // (Sept 25 2026: the tutor asks these aloud and the auto-check read neither).
    .replace(/(-?\d+(?:\.\d+)?|\))\s+squared\b/gi, "($1)^2")
    .replace(/(-?\d+(?:\.\d+)?|\))\s+cubed\b/gi, "($1)^3")
    .replace(/\b(?:the\s+)?square root of\s+(-?\d+(?:\.\d+)?)/gi, "sqrt($1)");
}

// Plain number or LaTeX number, spoken or written; null when it is not one.
function readValue(text: string): number | null {
  const p = prepareExpression(spokenToDigits(text.replace(/\$/g, "")));
  if (!p.ok || p.variable) return null;
  return evalConstant(p.text);
}

// How a choice reads back in a message: "\frac{2}{3}" and "two thirds" as 2/3.
function shown(text: string): string {
  return spokenToDigits(text.replace(/\$/g, ""))
    .replace(/\\left|\\right/g, "")
    .replace(/\\[dt]?frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2")
    .replace(/\s+/g, " ")
    .trim();
}

// A decimal the tutor can compare by eye: "about 0.3333", "0.25".
function approx(v: number): string {
  const r = Number(v.toFixed(4));
  return r === v ? String(r) : `about ${r}`;
}

// ---------------------------------------------------------------------------
// The problem as a line of math: "What is a half of 40?" → "1/2 of 40".

const PICTURE_WORDS = /\b(shaded|shown|pictured|picture|diagram|drawn|number line)\b/i;
const QUESTION_LEAD = /^\s*(?:what(?:'s|\s+is)|whats|find|calculate|compute|work\s+out)\s+(?:the\s+value\s+of\s+)?/i;

// "f(3)" with no rule for f (Sept 25 2026: read as f × 3 with f sampled at 2,
// "With f = 2, f(3) is 6", and the tutor took the nonsense for a verdict).
const BARE_FUNCTION_CALL = /(?<![\\a-z])([a-z])\s*\(\s*-?\d+(?:\.\d+)?\s*\)/i;

function readProblem(problem: string): string | AnswerCheck {
  const substituted = substituteFunctionEval(problem);
  if (!substituted && !problem.includes("=")) {
    const call = BARE_FUNCTION_CALL.exec(problem);
    if (call) return cannot(`"${call[0].trim()}" needs the rule ${call[1]} follows: put it in the problem (problem="${call[0].trim()} where ${call[1]}(x) = …").`);
  }
  let s = stripUnitWords(substituted ?? problem);
  const led = QUESTION_LEAD.test(s);
  if (led) s = s.replace(QUESTION_LEAD, "");
  // With an "=" a "?" is a box ("3/4 = 6/?"); without one it is a question mark.
  if (!s.includes("=")) s = s.replace(/\s*\?+\s*$/, "");
  s = spokenToDigits(s);
  if (led && !s.includes("=")) {
    const p = prepareExpression(s);
    if (p.ok && p.variable) return cannot(`"${problem}" needs a value for ${p.variable} first.`);
  }
  return s;
}

// ---------------------------------------------------------------------------
// "How many sixths is one third?" and its turns of phrase.

const HOW_MANY_FIRST = /^how many (\w+)\s+(?:are there in|are in|go into|fit into|fit in|make up|does it take to make|do you need to make|would make|makes?|equals?|is|are|in)\s+(.+)$/;
const HOW_MANY_LAST = /^(.+?)\s+(?:is equal to|is the same as|is|equals|makes)\s+how many (\w+)$/;

function checkHowMany(problem: string, answer: string): AnswerCheck | null {
  const text = problem.replace(/\$/g, "").toLowerCase().replace(/\s*\?+\s*$/, "").replace(/\s+/g, " ").trim();
  const first = HOW_MANY_FIRST.exec(text);
  const last = first ? null : HOW_MANY_LAST.exec(text);
  if (!first && !last) return null;
  const unitWord = first ? first[1] : last![2];
  const amountText = (first ? first[2] : last![1]).trim();
  if (/^seconds?$/.test(unitWord)) return cannot(`"${problem}": "seconds" could be time or a fraction.`);
  const per = unitWord === "wholes" || unitWord === "whole" ? 1 : DENOMINATOR_WORDS[unitWord];
  if (!per) return null;
  // "2 wholes", "a whole", "one whole" are just the number.
  const amountMath = amountText.replace(/^(a|an)\s+whole$/, "1").replace(/\s+wholes?$/, "");
  const amount = readValue(amountMath);
  if (amount === null) return cannot(`couldn't read "${amountText}" in "${problem}".`);
  const count = amount * per;
  const one = unitWord === "halves" ? "half" : unitWord.replace(/s$/, "");
  const many = (k: number) => `${formatNumber(k).replace(/ \(.*\)$/, "")} ${near(k, 1) ? one : unitWord}`;
  const amountShown = shown(amountMath);
  const truth = `${amountShown} is ${many(count)}`;

  const said = cleanAnswer(stripFiller(spokenToDigits(answer.replace(/\$/g, ""))))
    .replace(/\s+(of them|pieces?|parts?)$/i, "")
    .trim();
  const frac = /^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+)$/.exec(said);
  let got: number | null;
  if (frac && Number(frac[2]) === per) got = Number(frac[1]);
  else if (frac) {
    const value = Number(frac[1]) / Number(frac[2]);
    if (near(value, amount)) {
      return {
        verdict: "partial",
        message: `Partly right: ${said} is the same amount as ${amountShown}, but not counted in ${unitWord}. Ask how many ${unitWord} that is.`,
      };
    }
    return {
      verdict: "incorrect",
      message: `Incorrect: the student's ${said} is not ${amountShown}. (For you only: ${truth}. Don't say it or write it; help them find the mistake.)`,
    };
  } else got = readValue(said);
  if (got === null) return cannot(`couldn't read the student's answer "${answer}" as a number.`);
  if (near(got, count)) return { verdict: "correct", message: `Correct: ${truth} (${formatNumber(count).replace(/ \(.*\)$/, "")}/${per}).` };
  return {
    verdict: "incorrect",
    message: `Incorrect: the student said ${many(got)}, which is ${formatNumber(got / per)}, not ${amountShown}. (For you only: ${truth}. Don't say it or write it; help them find the mistake.)`,
  };
}

// ---------------------------------------------------------------------------
// "Which is bigger, 1/3 or 1/4?" The student can name the value ("a third",
// "1/3 is bigger", "the third") or its place ("the first one"). Left and
// right depend on how it was written, so they are never guessed.

const COMPARATIVES: Record<string, { want: "max" | "min"; than: string; most: string }> = {
  bigger: { want: "max", than: "bigger", most: "biggest" },
  biggest: { want: "max", than: "bigger", most: "biggest" },
  larger: { want: "max", than: "larger", most: "largest" },
  largest: { want: "max", than: "larger", most: "largest" },
  greater: { want: "max", than: "greater", most: "greatest" },
  greatest: { want: "max", than: "greater", most: "greatest" },
  higher: { want: "max", than: "higher", most: "highest" },
  highest: { want: "max", than: "higher", most: "highest" },
  more: { want: "max", than: "more", most: "most" },
  most: { want: "max", than: "more", most: "most" },
  smaller: { want: "min", than: "smaller", most: "smallest" },
  smallest: { want: "min", than: "smaller", most: "smallest" },
  less: { want: "min", than: "less", most: "least" },
  lesser: { want: "min", than: "less", most: "least" },
  least: { want: "min", than: "less", most: "least" },
  lower: { want: "min", than: "lower", most: "lowest" },
  lowest: { want: "min", than: "lower", most: "lowest" },
  fewer: { want: "min", than: "fewer", most: "fewest" },
  fewest: { want: "min", than: "fewer", most: "fewest" },
};
const COMPARATIVE = Object.keys(COMPARATIVES).join("|");
const WHICH_FIRST = new RegExp(`^which\\s+(?:one\\s+|number\\s+|fraction\\s+|decimal\\s+)?(?:is|'s|are)?\\s*(?:the\\s+)?(${COMPARATIVE})(?:\\s+one)?\\s*(?:[,:;—–]\\s*)?(.+)$`, "i");
const WHICH_LAST = new RegExp(`^(?:is|which\\s+is)\\s+(.+\\s+or\\s+.+?)\\s+(?:the\\s+)?(${COMPARATIVE})$`, "i");
const SAID_COMPARATIVE = new RegExp(`^(.+?)\\s+(?:is|'s|are)\\s+(?:the\\s+)?(${COMPARATIVE})(?:\\s+one)?(?:\\s+than\\s+.+)?$`, "i");

type Choice = { shown: string; value: number };

function checkComparison(problem: string, answer: string): AnswerCheck | null {
  const text = problem.replace(/\$/g, "").replace(/\s*\?+\s*$/, "").replace(/\s+/g, " ").trim();
  const first = WHICH_FIRST.exec(text);
  const last = first ? null : WHICH_LAST.exec(text);
  if (!first && !last) return null;
  const how = COMPARATIVES[(first ? first[1] : last![2]).toLowerCase()];
  const listed = (first ? first[2] : last![1]).trim();
  const parts = listed.split(/\s*,\s*or\s+|\s*,\s+|\s+or\s+/i).map((p) => p.replace(/^the\s+/i, "").replace(/[.,;:]+$/, "").trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return cannot(`couldn't find the choices in "${problem}".`);
  const choices: Choice[] = [];
  for (const part of parts) {
    const value = readValue(part);
    if (value === null) return cannot(`couldn't read the choice "${part}" in "${problem}".`);
    choices.push({ shown: shown(part), value });
  }

  const pick = pickChoice(answer, choices, how.want);
  if (pick.kind === "cannot") return cannot(pick.reason);
  const target = how.want === "max" ? Math.max(...choices.map((c) => c.value)) : Math.min(...choices.map((c) => c.value));
  const winners = choices.filter((c) => near(c.value, target));
  const list = (cs: Choice[]) => (cs.length === 2 ? `${cs[0].shown} and ${cs[1].shown}` : `${cs.slice(0, -1).map((c) => c.shown).join(", ")} and ${cs[cs.length - 1].shown}`);
  const values = choices.map((c) => `${c.shown} is ${approx(c.value)}`).join(", ");

  if (winners.length === choices.length) {
    const truth = `${list(choices)} are equal, so none is ${how.than}`;
    if (pick.kind === "equal") return { verdict: "correct", message: `Correct: ${truth}.` };
    return {
      verdict: "incorrect",
      message: `Incorrect: the student picked ${choices[pick.index].shown}. (For you only: ${truth}. Don't say it or write it; help them find the mistake.)`,
    };
  }
  if (winners.length > 1) return cannot(`two of the choices in "${problem}" are equal.`);
  const winner = winners[0];
  const others = choices.filter((c) => c !== winner);
  const truth = choices.length === 2 ? `${winner.shown} is ${how.than} than ${others[0].shown}` : `${winner.shown} is the ${how.most} of ${list(choices)}`;
  if (pick.kind === "equal") {
    return {
      verdict: "incorrect",
      message: `Incorrect: the student said they are equal. (For you only: ${truth}: ${values}. Don't say it or write it; help them find the mistake.)`,
    };
  }
  const chosen = choices[pick.index];
  if (chosen === winner) return { verdict: "correct", message: `Correct: ${truth}.` };
  return {
    verdict: "incorrect",
    message: `Incorrect: the student picked ${chosen.shown} as the ${choices.length === 2 ? how.than : how.most} one. (For you only: ${truth}: ${values}. Don't say it or write it; help them find the mistake.)`,
  };
}

type Pick = { kind: "equal" } | { kind: "pick"; index: number } | { kind: "cannot"; reason: string };

function pickChoice(answer: string, choices: Choice[], want: "max" | "min"): Pick {
  let s = stripFiller(answer.replace(/\$/g, "").toLowerCase())
    .split(/\s+(?:because|since|cause|'cause)\s+/)[0]
    .trim();
  const unread: Pick = { kind: "cannot", reason: `couldn't tell which choice the student's "${answer}" means.` };
  if (/\b(left|right|top|bottom|above|below)\b/.test(s)) return { kind: "cannot", reason: `"${answer}" depends on how the choices were written; ask them to say the number.` };
  if (/\bseconds\b/.test(s)) return { kind: "cannot", reason: `"${answer}" could be a place or a fraction; ask them to say the number.` };
  if (/\b(equal|same|neither|equivalent|tie|tied)\b/.test(s)) return { kind: "equal" };

  // "1/4 is smaller" answers "which is bigger?" by naming the other one.
  let flip = false;
  const said = SAID_COMPARATIVE.exec(s);
  if (said) {
    s = said[1].trim();
    flip = COMPARATIVES[said[2].toLowerCase()].want !== want;
  }
  s = s.replace(/(\S)\s+(one|number|fraction|decimal|option|choice)$/, "$1").trim();
  const bare = s.replace(/^the\s+/, "");

  let index: number;
  if (/^(first|1st|former)$/.test(bare)) index = 0;
  else if (/^(second|2nd|latter)$/.test(bare)) index = 1;
  else if (bare === "last") index = choices.length - 1;
  else if (choices.length > 2 && /^(third|3rd|fourth|4th|fifth|5th)$/.test(bare)) {
    return { kind: "cannot", reason: `"${answer}" could be a place or a fraction; ask them to say the number.` };
  } else {
    // "third" on its own, like "the third", is a third.
    let value = readValue(spokenToDigits(bare in DENOMINATOR_WORDS ? `the ${bare}` : s, { the: true }).replace(/^the\s+/, ""));
    if (value === null) {
      // "oh so 0.5 is bigger cause its 50 cents": the one choice it names.
      const named = choices.filter((c) => (spokenToDigits(s, { the: true }).match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) ?? []).some((n) => near(readValue(n) ?? NaN, c.value)));
      if (named.length !== 1) return unread;
      value = named[0].value;
    }
    const matches = choices.map((c, i) => (near(c.value, value) ? i : -1)).filter((i) => i >= 0);
    if (matches.length === 0) return { kind: "cannot", reason: `the student's "${answer}" isn't one of the choices.` };
    index = matches[0];
  }
  if (index >= choices.length) return unread;
  if (flip) {
    if (choices.length !== 2) return unread;
    index = 1 - index;
  }
  return { kind: "pick", index };
}
