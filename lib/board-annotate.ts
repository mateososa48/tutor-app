// The tutor's handwriting on a line (Oct 24 2026). Mateo, with photos of a
// tutor's whiteboard: "−22" written under both sides of 2x + 22 = 7 with
// "subtract 22" beside it, and a bar with 2 under 2x and under 7 for the
// division: "make it seem more like a tutor and not like a board that has
// perfect font". So a step can be shown on the line itself, in the tutor's
// sky-blue hand, the way a person works an equation on a whiteboard.
//
// annotate(target, marks): `marks` is a short list split by " | ":
//   under <term>: <text>    written under that part of the line ("under 22: −22")
//   over <term>: <text>     written above it
//   divide <term>: <text>   a short bar under the term and the text under it ("divide 2x: 2")
//   cancel <term>           a hand stroke through the term (the +7 and −7 that cancel)
//   right: <text>           a note beside the line ("right: subtract 22 from both sides")
//   below: <text>           a note under the whole line
// Pure: the parser. TldrawCore draws them.

export type AnnotationKind = "under" | "over" | "divide" | "cancel" | "right" | "below";

export type Annotation = { kind: AnnotationKind; term: string | null; text: string };

export const ANNOTATE_MAX = 6;
const TEXT_MAX = 40;

const WITH_TERM: ReadonlySet<AnnotationKind> = new Set(["under", "over", "divide", "cancel"]);

/** The marks a call asks for, or an error to send back. */
export function parseAnnotations(input: unknown): Annotation[] | { error: string } {
  if (typeof input !== "string" || !input.trim()) return { error: 'Give "marks", split by " | ": "under 22: −22 | under 7: −22 | right: subtract 22".' };
  const out: Annotation[] = [];
  for (const raw of input.split(/\s+\|\s+|\s*\n\s*/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = /^(under|below|over|above|divide|cancel|cross|right|beside|note)\b\s*([^:]*?)\s*(?::\s*(.*))?$/i.exec(part);
    if (!m) return { error: `"${part.slice(0, 40)}" is not a mark: start it with under, over, divide, cancel, right or below.` };
    const word = m[1].toLowerCase();
    const kind: AnnotationKind = word === "above" ? "over" : word === "cross" ? "cancel" : word === "beside" || word === "note" ? "right" : (word as AnnotationKind);
    const term = m[2].trim() || null;
    const text = (m[3] ?? "").trim().slice(0, TEXT_MAX);
    // "below 7: 2" is the same as "under 7: 2"; "below: note" is a note under the line.
    const k: AnnotationKind = kind === "below" && term ? "under" : kind;
    if (WITH_TERM.has(k) && !term) return { error: `"${part.slice(0, 40)}" needs the part of the line it goes with: "${k} 22: …".` };
    if (k !== "cancel" && !text) return { error: `"${part.slice(0, 40)}" has nothing to write after the colon.` };
    out.push({ kind: k, term: WITH_TERM.has(k) ? term : null, text: k === "cancel" ? "" : text });
  }
  if (!out.length) return { error: 'Give "marks", split by " | ".' };
  if (out.length > ANNOTATE_MAX) return { error: `That is ${out.length} marks; a line takes ${ANNOTATE_MAX} at most. Keep the ones that show the step.` };
  return out;
}

/** The marks as the result says them back: "−22 under 22, −22 under 7, a note: subtract 22". */
export function describeAnnotations(marks: Annotation[]): string {
  return marks
    .map((m) => (m.kind === "cancel" ? `${m.term} cancelled` : m.kind === "right" || m.kind === "below" ? `a note: ${m.text}` : m.kind === "divide" ? `÷${m.text} under ${m.term}` : `${m.text} ${m.kind} ${m.term}`))
    .join(", ");
}
