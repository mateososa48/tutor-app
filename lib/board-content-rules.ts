// What the board accepts as writing (Sept 16 2026). Pure; unit-tested.
//
// A recorded session wrote 23 texts and 13 of them had something wrong:
// " | " printed as a pipe instead of a new line, "i dont know" written in the
// student's hand as their attempt, "Perfect slope calculation!" and "Let's
// wrap up… Ready?" as sticky notes, and the same note twice. The dispatcher
// runs every text through these rules. A refusal says what to do instead,
// because the model ignores tool descriptions but reacts to tool errors.

/** A literal "\n", or " | " between words, written as text means a new line. */
export function boardLines(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/[ \t]+\|[ \t]+/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n")
    .trim();
}

/**
 * Pipe-separated slots with the empty ones kept, so "factor || solve" puts
 * "solve" on the third line. Trailing empty slots are dropped.
 */
export function splitSlots(input: string | undefined): string[] {
  const slots = (input ?? "").split("|").map((s) => s.trim());
  while (slots.length > 0 && slots[slots.length - 1] === "") slots.pop();
  return slots;
}

/**
 * Lines of an equation block. " | " between lines is the separator; a bare
 * "|" only counts when no spaced one is present, so "|x| = 3 | x = 3" keeps
 * its absolute value.
 */
export function splitSteps(input: string): string[] {
  const parts = /\s\|\s/.test(input) ? input.split(/\s+\|\s+/) : input.split("|");
  return parts.map((s) => s.trim()).filter(Boolean);
}

// ── Non-answers ─────────────────────────────────────────────────────────────
// Whole replies that say "I don't know" or "what?", in the languages a session
// can run in. Short on purpose: "I don't know if it's 4" is an answer.
const NON_ANSWERS: RegExp[] = [
  // English
  /^(i )?(do ?n'?t|dont|do not|dunno) know( (it|that|this|how|what to do))?$/,
  // (A bare "no" can answer a yes-or-no question, so it is not here.)
  /^(idk|dunno|no idea|not sure|no clue|i forgot|i give up|pass|skip|help|i'?m lost|i'?m confused|i'?m not sure|um+|uh+|hmm+|huh|what|wait what|sorry|i can'?t|can'?t)$/,
  // German
  /^(ich )?(weiß|weiss) (es )?nicht$/, /^(keine ahnung|k ?a|was|hä|häh|keine idee)$/,
  // Spanish
  /^(no (lo )?s[eé]|ni idea|qu[eé]|no entiendo|ayuda|no tengo idea)$/,
  // French
  /^(je (ne )?sais pas|j'?sais pas|chais pas|aucune idée|quoi|hein|je (ne )?comprends pas)$/,
  // Italian
  /^(non (lo )?so|boh|che|nessuna idea|non capisco)$/,
  // Portuguese
  /^(n[aã]o sei|sei l[aá]|o qu[eê]|nenhuma ideia|n[aã]o entendi)$/,
  // Polish
  /^(nie wiem|co|nie mam pojęcia|nie rozumiem)$/,
  // Turkish
  /^(bilmiyorum|ne|hiçbir fikrim yok|anlamadım)$/,
  // Ukrainian and Russian
  /^(не знаю|що|гадки не маю|не розумію|что|без понятия|понятия не имею|не понимаю)$/,
  // Arabic
  /^(لا أعرف|لا اعرف|ماذا|مش عارف|ما بعرف|لا أفهم)$/,
  // Mandarin
  /^(不知道|我不知道|不懂|什么|啥|不会)$/,
  // Vietnamese
  /^(không biết|em không biết|cái gì|chịu|không hiểu)$/,
];

function plainWords(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.,!?¿¡…"“”«»;:()\-–—。，？！]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a whole reply is "I don't know", "what?", "idk"… in any session language. */
export function isNonAnswer(text: string): boolean {
  const t = plainWords(text);
  if (!t) return true;
  return NON_ANSWERS.some((re) => re.test(t));
}

// ── Student attempts ────────────────────────────────────────────────────────
const ATTEMPT_MAX = 200;
// Narration about the student, not their words: "you said 16", "Student thinks…".
const ABOUT_THE_STUDENT = /^(you|your|you're|youre|the student|student|they said|he said|she said|du|dein|deine|tu|tú|vous|usted|ty)\b/i;

/** Why a student attempt should not be written, or null when it is fine. */
export function attemptProblem(text: string): string | null {
  const t = text.trim();
  if (isNonAnswer(t)) {
    return `"${t || "(nothing)"}" is not an attempt, so nothing was written. Ask a smaller question or offer two choices, and write their answer when they give one.`;
  }
  if (t.length > ATTEMPT_MAX) {
    return `That is ${t.length} characters. An attempt is the student's own short answer (${ATTEMPT_MAX} max): write the part they said, in their words.`;
  }
  if (ABOUT_THE_STUDENT.test(t)) {
    return "An attempt is the student's exact words, not a description of them. Write what they said, e.g. \"x = 16\".";
  }
  return null;
}

// ── Callouts ────────────────────────────────────────────────────────────────
// Math on a callout: a digit, an operator, or a lone letter used as a variable.
const HAS_MATH = /\d|[=+×÷^<>≤≥√π%/]|\\[a-z]+|(^|[^a-z'’])[b-hj-z]($|[^a-z'’])/i;
const PRAISE = /^(great|good|nice|awesome|perfect|excellent|well done|good job|great job|amazing|fantastic|brilliant|super|wonderful|correct|yes|yay|exactly|nailed it|you got it|way to go|keep it up|keep going|bravo|genial|parfait|perfecto|muy bien|très bien|sehr gut|toll)\b/i;
const CHAT = /\b(let'?s|lets|ready|wrap(ping)? up|we learned|we'?ll|we will|i'?ll|shall we|time to|next up|coming up|good work|great work|you'?re doing|proud of you|fun|challenge)\b/i;

/** Why a callout should not go on the board, or null. Praise and chat are said out loud. */
export function calloutProblem(text: string): string | null {
  const t = text.trim();
  if (PRAISE.test(t)) {
    return "Praise is said out loud, not written: nothing was added. Put up the math itself (the line, a ring on the answer) if it should stay.";
  }
  if (CHAT.test(t) && !HAS_MATH.test(t)) {
    return "That is conversation, so it was not written. Say it, and put up only what the student should look at: a question, a rule, or a number.";
  }
  return null;
}

// ── Duplicates ──────────────────────────────────────────────────────────────

/** What a text or a drawing says, reduced to compare: case, spacing and punctuation dropped. */
export function contentFingerprint(tool: string, content: string): string {
  const body = content
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\\(?:left|right|,|;|!|quad)/g, "")
    .replace(/[\s"'“”.,;:!?]+/g, "");
  return `${tool}:${body}`;
}

export type FingerprintedItem = { id: string; tool: string; content?: string };

const TEXT_TOOLS = new Set(["add_text_note", "add_callout", "add_worked_example_box", "add_student_attempt", "add_problem_setup"]);
const EQUATION_TOOLS = new Set(["draw_equation_step", "add_equation_sequence"]);

/**
 * The id of an item that already shows this content, or null. Text is
 * compared with all text since the problem started, an equation with the
 * newest equation only (writing a line again later can be deliberate), a
 * picture with the last six pictures.
 */
export function findDuplicate(tool: string, fingerprint: string, items: FingerprintedItem[]): string | null {
  const since = items.slice(items.map((i) => i.tool).lastIndexOf("start_new_problem") + 1);
  if (TEXT_TOOLS.has(tool)) {
    return since.find((i) => i.content === fingerprint)?.id ?? null;
  }
  if (EQUATION_TOOLS.has(tool)) {
    const newest = [...since].reverse().find((i) => EQUATION_TOOLS.has(i.tool));
    return newest?.content === fingerprint ? newest.id : null;
  }
  const pictures = since.filter((i) => !TEXT_TOOLS.has(i.tool) && !EQUATION_TOOLS.has(i.tool) && i.content).slice(-6);
  return pictures.find((i) => i.content === fingerprint)?.id ?? null;
}

/** A drawing's arguments as comparable content: placement and captions left out. */
export function pictureContent(args: Record<string, unknown>): string {
  const keys = Object.keys(args).filter((k) => !["place", "column", "label", "caption", "title"].includes(k)).sort();
  return keys.map((k) => `${k}=${String(args[k])}`).join("&");
}
