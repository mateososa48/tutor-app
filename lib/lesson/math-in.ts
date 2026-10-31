// The math in a line of words (Oct 31 2026): the problem a student brings, or
// the expression in their answer. Its own module so the assessment and the
// lesson state can both use it without importing each other.

import { spokenToDigits } from "../answer-check";

/** The math in a line of text, when it has one: "x^2-5x+6=0", "3x + 7 = 22", "1/2+1/3". */
export function mathIn(text: string): string | null {
  // What follows "because" is their reasoning, not the problem ("I wrote 15
  // because 12 + 3" made "12 + 3" the heading, Oct 31).
  text = text.split(/\b(?:because|cause|'cause|cuz|coz|since|bc)\b/i)[0];
  const t = spokenToDigits(text).replace(/[−–]/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
  // Pieces of math: words of two or more letters break them, single letters
  // (variables) stay (Oct 31: "3(x - 2) = 3x - 6" had been cut to "3(x - 2) = 3",
  // and "y = -2x + 3" to "y = -2").
  const pieces = t
    .split(/[?!;:,]|\.(?=\s|$)/)
    .flatMap((sentence) => sentence.split(/\b[a-z]{2,}\b/i))
    .map((x) => x.replace(/\s+/g, " ").trim().replace(/^[=+*/^)]+|[-=+*/^(]+$/g, "").trim())
    .filter((x) => /\d/.test(x) && /[-+*/^=<>≤≥]/.test(x.replace(/^-/, "")));
  const relation = (x: string) => /(?:=|<|>|≤|≥)/.test(x);
  // An equation with a letter: the problem itself ("3x + 7 = 22").
  const eqs = pieces.filter((x) => relation(x) && /[a-z]/i.test(x) && /^[\d\sa-z()+\-*/^.=<>≤≥]+$/i.test(x));
  if (eqs.length) return eqs.sort((a, b) => b.length - a.length)[0];
  // Arithmetic: "42 - 27", or the left side of a claim about it ("1/2 + 1/3 = 2/5" is their answer, not the problem).
  for (const x of pieces) {
    const left = relation(x) ? x.split(/=|<|>|≤|≥/)[0].trim() : x;
    if (/^-?\d+(?:\.\d+)?(?:\/\d+)?(?:\s*[-+*/]\s*-?\d+(?:\.\d+)?(?:\/\d+)?)+$/.test(left)) return left;
  }
  return null;
}

/**
 * A problem a student brings up mid-session, with its answer when the code can
 * work it out: "which is bigger, 0.35 or 0.5" (Oct 31: the tutor told Maya
 * "the correct answer there is zero point five" before she had thought).
 */
export function posedProblem(text: string): { statement: string; math?: string; solution?: { answer: string; work: string } } | null {
  const t = spokenToDigits(text.replace(/[−–]/g, "-"));
  const NUM = String.raw`-?\d+(?:\.\d+)?(?:\/\d+)?`;
  const cmp = new RegExp(String.raw`\bwhich(?: one)? is (bigger|larger|greater|more|smaller|less|lower)\b[^\d-]*(${NUM})\s*(?:or|and|vs\.?|,)\s*(${NUM})`, "i").exec(t);
  if (cmp) {
    const [a, b] = [cmp[2], cmp[3]];
    const va = Number(a.includes("/") ? Number(a.split("/")[0]) / Number(a.split("/")[1]) : a);
    const vb = Number(b.includes("/") ? Number(b.split("/")[0]) / Number(b.split("/")[1]) : b);
    const big = /bigger|larger|greater|more/i.test(cmp[1]);
    const answer = (big ? va >= vb : va <= vb) ? a : b;
    return { statement: `Which is ${cmp[1].toLowerCase()}, ${a} or ${b}?`, solution: { answer, work: answer } };
  }
  const math = mathIn(text);
  if (math && /[?]|\b(?:solve|what is|find|work out|how (?:many|much))\b|^\s*(?:it was|the problem (?:is|was)|question)\b/i.test(text)) return { statement: text.trim().slice(0, 200), math };
  return null;
}

/** The numbers in a line, in digits ("five sixths" is 5/6). */
export function numbersOf(text: string): string[] {
  return (spokenToDigits(text.replace(/[−–]/g, "-")).match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) ?? []).map((n) => n.replace(/^-0$/, "0"));
}
