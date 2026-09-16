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
    .replace(/\\d?frac\{([^{}]+)\}\{([^{}]+)\}/g, "(($1)/($2))")
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
    .replace(/[?!]+/g, " ")
    .replace(/\b(i think|i guess|maybe|probably|um+|uh+|hmm+|so|it'?s|it is|the answer is|answer)\b:?/gi, " ")
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
  return { verdict: "cannot_check", message: `Can't check this automatically: ${message} Work it out yourself, step by step, before you respond.` };
}

function evalConstant(text: string): number | null {
  const f = createMathEvaluator(text);
  if (!f) return null;
  const v = f(0);
  return Number.isFinite(v) ? v : null;
}

export function checkAnswer(problem: string, studentAnswer: string): AnswerCheck {
  const prob = (problem ?? "").trim();
  const answer = (studentAnswer ?? "").trim();
  if (!prob || !answer) return cannot("it needs both the problem and the student's answer.");
  if (/[<>≤≥]/.test(prob) || /[<>≤≥]/.test(answer)) return cannot("inequalities aren't supported.");
  const sides = prob.split("=");
  if (sides.length > 2) return cannot(`"${prob}" has more than one equals sign.`);
  return sides.length === 2 ? checkEquation(sides[0], sides[1], prob, answer) : checkExpression(prob, answer);
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
  const hint = allSolutions ? ` (For you only: ${allSolutions}. Don't say it; help them find the mistake.)` : solutions?.length === 0 ? " (For you only: it has no real solution.)" : "";
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
      message: `Incorrect: the student's ${raw} is ${formatNumber(av)}. (For you only: ${problem} = ${formatNumber(pv)}. Don't say it; help them find the mistake.)`,
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
