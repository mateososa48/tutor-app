// What a kid would say for a typed student line, so `say` speaks the math.
//
// The simulated student writes "2x² − 3x + 1 = 0"; macOS `say` reads the minus
// as nothing, so the tutor heard "2x to the power of 2 3x + 1" and argued with
// Priya about the sign of b for three turns (Sept 28 2026). A kid says
// "two x squared minus three x plus one equals zero".

/** A token that is math, not a word: "2x²", "f(x)", "x", "4ac)", "3.5". */
function mathy(token: string): boolean {
  const t = token.replace(/^-/, "").replace(/[,.?!;:]+$/, "");
  if (!/^[\d.a-zA-Z²³()√^]+$/.test(t) || !/[\da-zA-Z]/.test(t)) return false;
  // A lone letter is a variable ("b - 3"); "is" or "so" is a word.
  return /\d/.test(t) || /[²³()√^]/.test(t) || t.length === 1;
}

export function spokenMath(text: string): string {
  let s = text.replace(/−/g, "-");
  // A minus between two terms is "minus"; hyphenated words ("two-step") stay.
  s = s.replace(/(\S+?)\s*-\s*(?=(\S+))/g, (m, left: string, right: string) =>
    mathy(left) && mathy(right) ? `${left} minus ` : m);
  // A minus in front of a number or a letter is "negative".
  s = s.replace(/(^|[\s(=,])-(?=[\d.a-zA-Z(√])/g, "$1negative ");
  return s
    .replace(/±|\+\/-/g, " plus or minus ")
    .replace(/√\s*/g, "square root of ")
    .replace(/\^\s*2(?!\d)|²/g, " squared")
    .replace(/\^\s*3(?!\d)|³/g, " cubed")
    .replace(/\^\s*\(?(-?\d+)\)?/g, " to the power of $1")
    .replace(/×|(?<=\d)\s*\*\s*(?=\d)|\s\*\s/g, " times ")
    .replace(/÷/g, " divided by ")
    .replace(/\s*<=\s*|\s*≤\s*/g, " is at most ")
    .replace(/\s*>=\s*|\s*≥\s*/g, " is at least ")
    .replace(/\s*<\s*/g, " is less than ")
    .replace(/\s*>\s*/g, " is greater than ")
    .replace(/\s*=\s*/g, " equals ")
    .replace(/\s*\+\s*/g, " plus ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
