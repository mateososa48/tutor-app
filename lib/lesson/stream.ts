// The first sentence of a turn, said while the rest is still being planned
// (Oct 31 2026, Plan B: the blind judges preferred Sonnet 5.5's teaching on
// every pair, and it takes 4 to 6 s to write a whole plan). The plan streams
// in as JSON with the question and verdict before the speech; the moment its
// first sentence is complete, the code checks what can be checked on that
// sentence alone and, if it passes, the voice starts. The whole plan is still
// checked when it is done; a repair is told the sentence was already said.

import { falseAssertions } from "../math-claims";
import type { InputAssessment } from "./assess";
import type { LessonState } from "./types";
import { AFFIRMS, DENIES, cleanSpeech, knownNumbers, numbersOf, states } from "./validate";
import { resolveRef } from "./compile";

/** The end of the JSON value starting at i (exclusive), or -1 while it is still incomplete. */
function valueEnd(s: string, i: number): number {
  const c = s[i];
  if (c === undefined) return -1;
  if (c === '"') {
    for (let k = i + 1; k < s.length; k++) {
      if (s[k] === "\\") k++;
      else if (s[k] === '"') return k + 1;
    }
    return -1;
  }
  if (c === "{" || c === "[") {
    let depth = 0;
    for (let k = i; k < s.length; k++) {
      const ch = s[k];
      if (ch === '"') {
        const e = valueEnd(s, k);
        if (e < 0) return -1;
        k = e - 1;
      } else if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) return k + 1;
      }
    }
    return -1;
  }
  // A number, true, false or null: complete only once something follows it.
  const m = /^[^,}\]\s]+/.exec(s.slice(i));
  if (!m) return -1;
  const end = i + m[0].length;
  return end < s.length ? end : -1;
}

const ws = (s: string, i: number) => {
  while (i < s.length && /[\s,]/.test(s[i])) i++;
  return i;
};

/**
 * What a partial plan already holds: its complete top-level fields, and the
 * complete items of its speech array even while the array is still open.
 */
export function scanPartial(json: string): { fields: Record<string, unknown>; speech: unknown[]; order: string[] } {
  const fields: Record<string, unknown> = {};
  const speech: unknown[] = [];
  const order: string[] = [];
  let i = json.indexOf("{");
  if (i < 0) return { fields, speech, order };
  i++;
  for (;;) {
    i = ws(json, i);
    if (i >= json.length || json[i] === "}") break;
    if (json[i] !== '"') break;
    const keyEnd = valueEnd(json, i);
    if (keyEnd < 0) break;
    const key = JSON.parse(json.slice(i, keyEnd)) as string;
    i = ws(json, keyEnd);
    if (json[i] !== ":") break;
    i = ws(json, i + 1);
    if (i >= json.length) break;
    order.push(key);
    if (key === "speech" && json[i] === "[") {
      let k = i + 1;
      for (;;) {
        k = ws(json, k);
        if (k >= json.length || json[k] === "]") break;
        const e = valueEnd(json, k);
        if (e < 0) break;
        try {
          speech.push(JSON.parse(json.slice(k, e)));
        } catch {
          break;
        }
        k = e;
      }
    }
    const end = valueEnd(json, i);
    if (end < 0) break;
    try {
      fields[key] = JSON.parse(json.slice(i, end));
    } catch {
      /* a malformed value: leave it to the full parse */
    }
    i = end;
  }
  return { fields, speech, order };
}

/**
 * The first sentence, said early, or null: only when it needs nothing on the
 * board, states nothing false, does not contradict the checker, and does not
 * give away the question's answer (which must already be known: the question
 * field came first, or the sentence has no number the student has not had).
 */
export function earlySentence(state: LessonState, a: InputAssessment, partial: ReturnType<typeof scanPartial>): string | null {
  const first = partial.speech[0] as { say?: unknown; text?: unknown; needs?: unknown } | undefined;
  if (!first) return null;
  const say = typeof first.say === "string" ? first.say : typeof first.text === "string" ? first.text : "";
  const needs = Array.isArray(first.needs) ? first.needs.filter((n): n is string => typeof n === "string" && Boolean(n.trim())) : [];
  // What it talks about must already be up from an earlier turn: a drawing of
  // this turn is not there yet when the sentence is said.
  const upAlready = (n: string) => {
    const hit = resolveRef(state, [], n);
    return Boolean(hit && hit.obj.status === "applied" && (!hit.part || hit.obj.parts.some((p) => p.toLowerCase() === hit.part!.toLowerCase())));
  };
  if (!needs.every(upAlready)) return null;
  let text = cleanSpeech(say);
  // A grid shaded row by row is described in rows, as in the full turn (validate 4h).
  const rowGrid = state.board.some((b) => b.status !== "failed" && b.facts.some((f) => /shaded, row by row/.test(f))) && !state.board.some((b) => b.kind === "table");
  if (rowGrid) text = text.replace(/\b(C|c)olumn(s?)\b/g, (_m, c: string, pl: string) => `${c === "C" ? "R" : "r"}ow${pl}`);
  if (!text || text.split(/\s+/).length > 60) return null;
  if (falseAssertions(text).length) return null;
  const affirms = AFFIRMS.test(text);
  const denies = DENIES.test(text);
  const verdict = a.final?.verdict ?? a.answer?.verdict;
  if (verdict === "incorrect" && affirms && !denies) return null;
  if (verdict === "correct" && denies && !affirms) return null;
  const known = knownNumbers(state);
  // The question is known once its field has fully arrived (null counts: no question).
  const questionKnown = "question" in partial.fields;
  const q = partial.fields.question as { expects?: unknown } | null | undefined;
  const givesAnswer = partial.fields.gives_answer === true;
  if (questionKnown) {
    if (!givesAnswer && q && typeof q.expects === "string" && q.expects && states(text, q.expects, known)) return null;
  } else if (numbersOf(text).some((n) => !known.has(n))) return null;
  // A student who wants to stop gets the close; nothing else is said early then.
  if (a.signals.includes("stop") && /\?/.test(text)) return null;
  return text;
}
