// What the brain writes is what the student hears (the LiveKit voice path,
// Oct 2026). The brain is told to write spoken words, and mostly does; this
// is the deterministic layer behind it, so a stray "x²", "$\frac{3}{4}$",
// "0.35" or tool name never reaches the voice as symbols or as the wrong
// words. Pure and tested (speech.test.ts).
//
// Three pieces:
//   speakMath(text)    one sentence of mixed prose and math -> words to say
//   SentenceStream     streamed tokens -> whole sentences (and one early clause)
//   stripPraise(text)  the praise opener raters marked down every time
//
// What the board shows is separate: the board keeps "x² + 3x", the voice says
// "x squared plus three x".

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** A whole number in words, up to the billions ("1205" -> "one thousand two hundred five"). */
export function numberWords(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n < 0) return `negative ${numberWords(-n)}`;
  if (!Number.isInteger(n)) return String(n);
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWords(n % 100)}` : ""}`;
  for (const [size, name] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]] as const) {
    if (n >= size) return `${numberWords(Math.floor(n / size))} ${name}${n % size ? ` ${numberWords(n % size)}` : ""}`;
  }
  return String(n);
}

const ORDINAL_DENOM: Record<number, [string, string]> = {
  2: ["half", "halves"], 3: ["third", "thirds"], 4: ["fourth", "fourths"], 5: ["fifth", "fifths"],
  6: ["sixth", "sixths"], 7: ["seventh", "sevenths"], 8: ["eighth", "eighths"], 9: ["ninth", "ninths"],
  10: ["tenth", "tenths"], 11: ["eleventh", "elevenths"], 12: ["twelfth", "twelfths"],
  15: ["fifteenth", "fifteenths"], 16: ["sixteenth", "sixteenths"], 20: ["twentieth", "twentieths"],
  25: ["twenty-fifth", "twenty-fifths"], 100: ["hundredth", "hundredths"],
};

/** "3/4" -> "three fourths", "1/2" -> "one half", "17/25" -> "seventeen twenty-fifths", "17/31" -> "seventeen over thirty-one". */
export function fractionWords(num: number, den: number): string {
  const named = ORDINAL_DENOM[den];
  if (named && num >= 0 && num < 1000) return `${numberWords(num)} ${num === 1 ? named[0] : named[1]}`;
  return `${numberWords(num)} over ${numberWords(den)}`;
}

/** "0.35" -> "zero point three five" (digit by digit after the point: "point thirty-five" is Maya's own misconception). */
export function decimalWords(text: string): string {
  const neg = text.startsWith("-");
  const [whole, frac = ""] = text.replace(/^-/, "").split(".");
  const head = numberWords(Number(whole || "0"));
  const tail = frac.split("").map((d) => ONES[Number(d)]).join(" ");
  return `${neg ? "negative " : ""}${head}${tail ? ` point ${tail}` : ""}`;
}

const POWER_WORDS: Record<string, string> = { "2": "squared", "3": "cubed" };
const SUPERSCRIPT: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "ⁿ": "n" };

function powerWords(exp: string): string {
  const e = exp.trim();
  if (POWER_WORDS[e]) return POWER_WORDS[e];
  if (/^\d+$/.test(e)) {
    const n = Number(e);
    const ord: Record<number, string> = { 4: "fourth", 5: "fifth", 6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth", 0: "zeroth", 1: "first" };
    return `to the ${ord[n] ?? `power of ${numberWords(n)}`}`;
  }
  if (/^-\d+$/.test(e)) return `to the negative ${powerWords(e.slice(1)).replace(/^to the /, "").replace(/^squared$/, "second").replace(/^cubed$/, "third")}`;
  if (/^[a-z]$/i.test(e)) return `to the ${e}`;
  return `to the power of ${e}`;
}

const LATEX_SYMBOLS: Array<[RegExp, string]> = [
  [/\\times|\\cdot/g, " times "],
  [/\\div/g, " divided by "],
  [/\\pm/g, " plus or minus "],
  [/\\le(?:q)?\b/g, " is less than or equal to "],
  [/\\ge(?:q)?\b/g, " is greater than or equal to "],
  [/\\neq?\b/g, " is not equal to "],
  [/\\approx/g, " is about "],
  [/\\pi\b/g, " pi "],
  [/\\theta\b/g, " theta "],
  [/\\infty\b/g, " infinity "],
  [/\\degree|\^\\circ|\\circ/g, " degrees "],
  [/\\%/g, " percent "],
  [/\\(?:left|right|displaystyle|,|;|!|quad|qquad)/g, " "],
];

/** LaTeX to plain math the rest of speakMath reads ("\frac{3}{4}" -> "3/4", "\sqrt{x}" -> "√(x)"). */
function unLatex(text: string): string {
  let t = text.replace(/\$\$?|\\\(|\\\)|\\\[|\\\]/g, " ");
  for (let i = 0; i < 4; i++) {
    t = t
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, a: string, b: string) => (/^\s*-?\d+\s*$/.test(a) && /^\s*\d+\s*$/.test(b) ? `${a.trim()}/${b.trim()}` : ` (${a}) over (${b}) `))
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)")
      .replace(/\\text\s*\{([^{}]*)\}/g, " $1 ")
      .replace(/\\(?:mathrm|mathbf|operatorname)\s*\{([^{}]*)\}/g, "$1");
  }
  for (const [re, words] of LATEX_SYMBOLS) t = t.replace(re, words);
  // Other commands (\sin, \log) keep their name; anything else goes.
  t = t.replace(/\\(sin|cos|tan|log|ln)\b/g, "$1").replace(/\\[a-zA-Z]+/g, " ");
  return t;
}

// A tool call or a snake_case name read aloud is never words for the student.
const TOOL_NAME = /\b[a-z]+(?:_[a-z]+)+\b(?:\s*\([^)]*\))?/g;

/**
 * One sentence (or clause) of the brain's text, as words to speak. Prose is
 * left alone; math is read the way a tutor reads it aloud.
 */
export function speakMath(input: string): string {
  let t = input;
  // Never spoken: private notes, markup, tool names, the model's silence marks.
  t = t.replace(/<!--[\s\S]*?(?:-->|$)/g, " ").replace(/<no speech>|\{pause\}/gi, " ").replace(/\[[^\]]*\]/g, " ");
  t = t.replace(TOOL_NAME, " ");
  t = t.replace(/\*\*|__|[*_#`~•]/g, "");
  t = unLatex(t);
  // Unicode math to ASCII forms read below.
  t = t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻ⁿ]+/g, (m) => `^${m.split("").map((c) => SUPERSCRIPT[c] ?? c).join("")}`);
  t = t.replace(/−|–(?=\s*\d)/g, "-").replace(/×|·/g, " times ").replace(/÷/g, " divided by ").replace(/≤/g, " is less than or equal to ").replace(/≥/g, " is greater than or equal to ").replace(/≠/g, " is not equal to ").replace(/±/g, " plus or minus ").replace(/≈/g, " is about ").replace(/π/g, " pi ").replace(/°/g, " degrees ");
  t = t.replace(/√\s*\(([^()]*)\)/g, " the square root of $1 ").replace(/√\s*(\w+)/g, " the square root of $1 ");
  // Powers on a bracketed negative: "(-3)^2" is "negative three, all squared"; "-3^2" is "the negative of three squared".
  t = t.replace(/\(\s*-\s*(\d+(?:\.\d+)?)\s*\)\s*\^\s*\{?(-?\w+)\}?/g, (_m, n: string, e: string) => ` negative ${n}, all ${powerWords(e)} `);
  t = t.replace(/(^|[\s=(+])-(\d+)\s*\^\s*\{?(-?\w+)\}?/g, (_m, pre: string, n: string, e: string) => `${pre} the negative of ${n} ${powerWords(e)} `);
  t = t.replace(/\)\s*\^\s*\{?(-?\w+)\}?/g, (_m, e: string) => `), all ${powerWords(e)} `);
  t = t.replace(/([a-zA-Z0-9.])\s*\^\s*\{?(-?\w+)\}?/g, (_m, b: string, e: string) => `${b} ${powerWords(e)} `);
  // Function notation: f(x) is "f of x", f'(x) "f prime of x". Only one letter before the bracket.
  t = t.replace(/\b([fghpq])'\s*\(\s*([^()]{1,12})\s*\)/g, "$1 prime of $2").replace(/\b([fghpq])\s*\(\s*([^()]{1,12})\s*\)/g, "$1 of $2");
  // A remainder: "6 r 5", "6 R 5".
  t = t.replace(/\b(\d+)\s*[rR]\s*(\d+)\b/g, "$1 remainder $2");
  // Ratios "2:3" (not clock times "3:30").
  t = t.replace(/\b(\d{1,3})\s*:\s*(\d{1,2})\b(?!\s*(?:am|pm|a\.m|p\.m))/gi, (m, a: string, b: string) => (b.length === 2 && Number(b) >= 10 && Number(a) <= 12 ? m : `${a} to ${b}`));
  // Mixed numbers "2 1/4" and fractions "3/4" (digits only; "x/2" is "x over 2").
  t = t.replace(/(^|[^\d/.])(-?)(\d+)\s+(\d+)\/(\d+)(?![\d/])/g, (_m, pre: string, neg: string, w: string, a: string, b: string) => `${pre}${neg ? "negative " : ""}${numberWords(Number(w))} and ${fractionWords(Number(a), Number(b))}`);
  t = t.replace(/(^|[^\d/.])(-?)(\d+)\/(\d+)(?![\d/])/g, (_m, pre: string, neg: string, a: string, b: string) => `${pre}${neg ? "negative " : ""}${fractionWords(Number(a), Number(b))}`);
  t = t.replace(/\b([a-z])\s*\/\s*(\d+|[a-z])\b/gi, "$1 over $2");
  // Decimals, digit by digit after the point; a leading "-" on a number is "negative".
  t = t.replace(/(^|[\s(=+*,:;]|\bis\s)-(\d)/g, "$1negative $2");
  t = t.replace(/(?<![\d.])(-?\d*\.\d+)(?![\d.])/g, (m) => decimalWords(m.startsWith(".") ? `0${m}` : m));
  t = t.replace(/(\d)\s*%/g, "$1 percent");
  // Operators between terms.
  t = t.replace(/\s*\+\s*/g, " plus ").replace(/\s*=\s*/g, " equals ").replace(/\s+-\s+/g, " minus ").replace(/(\w)\s*\*\s*(\w)/g, "$1 times $2");
  t = t.replace(/\s*<\s*/g, " is less than ").replace(/\s*>\s*/g, " is greater than ");
  // "3x" is "three x" when the TTS would run it together; numbers stay digits (voices read them).
  t = t.replace(/\b(\d+)([a-z])\b/g, "$1 $2");
  t = t.replace(/[{}\\|^$<>]/g, " ").replace(/\(\s*\)/g, " ");
  // Brackets left in prose are pauses at most.
  t = t.replace(/[()]/g, "");
  return t.replace(/\s+([,.!?;:])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

/** The brain's sentence as text to show and to keep (the transcript, the lesson state): markup, notes and tool names go, digits and symbols stay. */
export function displayText(input: string): string {
  return input
    .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
    .replace(/<no speech>|\{pause\}/gi, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(TOOL_NAME, " ")
    .replace(/\*\*|__|[*#`~•]/g, "")
    .replace(/\$+/g, "")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Praise openers ("Exactly!", "Spot on."): raters marked them down every time,
// and the prompt's ban is not always followed. A sentence that is only praise
// goes; an opener in front of real words is cut.
const OPENER = /^\s*(?:(?:yes|yeah|yep|right|okay|ok|oh|so)[,.!]?\s+)?(?:spot on|exactly|perfect(?:ly)?|great(?: job| work| thinking)?|nice(?: work| job| one)?|awesome|excellent|amazing|fantastic|brilliant|well done|good job|you got it|nailed it|bingo|good catch|great catch|nice catch|good thinking|good question|great question|that's (?:right|it|correct|exactly right)|correct)\b[,.!]*\s*/i;
const BARE = /^\s*(?:right|great|good|yes|yep|yeah|correct|nice|cool|awesome|perfect)\s*[.!]+\s*/i;
// Praise that rides after a word of agreement ("Right, you're spot on: …").
const TAIL = /^\s*(?:(?:yes|yeah|yep|right|okay|ok|so)[,.!]?\s+)?(?:you(?:'re| are) (?:spot on|exactly right|totally right|so right)|you nailed it|good thinking|great thinking|great question|good question)\b[,.!:;]*\s*/i;

/** The sentence without a praise opener; "" when it was nothing but praise. */
export function stripPraise(sentence: string): string {
  const out = sentence.replace(OPENER, "").replace(BARE, "").replace(TAIL, "");
  if (!out.replace(/[\s.!?,]/g, "")) return "";
  return out === sentence ? sentence : out.charAt(0).toUpperCase() + out.slice(1);
}

// The voice is fed whole sentences: a TTS given a few tokens at a time loses
// its prosody. The first clause may go early (a comma after enough words), so
// the first sound comes sooner on a long opening sentence.
const SENTENCE_END = /([.!?])(["”')\]]*)(\s+|$)/g;

export class SentenceStream {
  private buf = "";
  private emitted = 0;
  constructor(private readonly opts: { earlyClauseWords?: number } = {}) {}

  /** Text that streamed in; returns any whole sentences now complete. */
  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    for (;;) {
      SENTENCE_END.lastIndex = 0;
      let cut = -1;
      let m: RegExpExecArray | null;
      while ((m = SENTENCE_END.exec(this.buf))) {
        const before = this.buf.slice(0, m.index);
        // "0.5", "e.g.", "Mr." are not sentence ends; an end must be followed by space or the stream's end.
        if (m[1] === "." && (/\d$/.test(before) && /^\d/.test(this.buf.slice(m.index + 1)))) continue;
        if (m[1] === "." && /\b(?:e\.g|i\.e|vs|mr|mrs|ms|dr|etc)$/i.test(before)) continue;
        if (!m[3]) break; // the end of what has arrived: wait for what follows
        cut = m.index + m[1].length + m[2].length;
        break;
      }
      if (cut < 0) {
        const early = this.opts.earlyClauseWords ?? 0;
        if (early && this.emitted === 0) {
          const comma = /^(.{12,}?[,;—])\s+/.exec(this.buf);
          if (comma && comma[1].trim().split(/\s+/).length >= early) {
            out.push(comma[1].trim());
            this.buf = this.buf.slice(comma[0].length);
            this.emitted++;
            continue;
          }
        }
        break;
      }
      const s = this.buf.slice(0, cut).trim();
      this.buf = this.buf.slice(cut).trimStart();
      if (s) {
        out.push(s);
        this.emitted++;
      }
    }
    return out;
  }

  /** The rest, when the stream ends. */
  end(): string[] {
    const s = this.buf.trim();
    this.buf = "";
    return s ? [s] : [];
  }
}

// A sentence that points at the board: it should not be heard before the
// drawing it points at is there (the brief: "do not say look at this graph
// until the browser acknowledges that the graph exists"). Announcing a drawing
// ("Let me draw that.") is not pointing at one, and never waits.
const DEICTIC = /\b(look at|see (?:the|this|these|how)|here'?s|here are|on the board|i(?:'ve| have) (?:drawn|drew|put)|this (?:picture|drawing|graph|grid|line|bar|table|diagram|circle|number line)|these (?:bars|circles|pieces|squares|dots)|the (?:picture|drawing|graph|grid|number line|table|diagram) (?:shows|has))\b/i;

export function pointsAtBoard(sentence: string): boolean {
  return DEICTIC.test(sentence);
}
