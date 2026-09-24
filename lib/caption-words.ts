// A turn's live caption as words that keep their identity (Sept 23 2026).
//
// The caption of one tutor turn arrives as one growing string, about 3.5 new
// words a second, in step with the voice. The pet's bubble used to be keyed on
// the whole string, so every new word threw the bubble away and typed it again
// from the first word. Here every word gets a key that never changes for the
// life of the turn: its index among the turn's words. Appending never re-keys
// a word, a half-arrived word that completes ("tri", then "tricky") is the
// same word, and cutting the head for a short tail keeps each remaining word's
// key. A new turn (text that does not continue the last one, or a reset to "")
// starts a new key namespace. A live caption that drops its last word for a
// moment (audio arriving ahead of its transcript) is the same turn, and keeps
// showing the longer line (`live`, below).
//
// Words also carry their sentence, so a bubble per sentence can be built on
// this later without re-keying anything: group `words` by `sentence`.

export type CaptionWord = {
  /** Stable for the life of the turn: the turn's namespace and the word's index. */
  key: string;
  /** Position among the whole turn's words, from 0. */
  index: number;
  text: string;
  /** Which sentence of the turn it belongs to, from 0. */
  sentence: number;
  /** The update (within the turn, from 1) in which the word first appeared. */
  born: number;
  /** Its place among the words that appeared in that same update, from 0. */
  order: number;
  /** How many words appeared in that update. */
  batch: number;
};

export type CaptionLine = {
  /** The turn's namespace. It changes when a new turn starts. */
  turn: number;
  /** The whole turn's text so far, trimmed. */
  text: string;
  words: CaptionWord[];
  /** Updates applied to this turn so far. */
  updates: number;
  /**
   * The line ends on "—": the student cut in (the client appends " —"), so it
   * is shown as a finished line. A dash can also be a pause the tutor spoke
   * mid-sentence, caught before the next word, so a line that goes on growing
   * past it is still the same turn.
   */
  interrupted: boolean;
};

export const EMPTY_LINE: CaptionLine = { turn: 0, text: "", words: [], updates: 0, interrupted: false };

export type CaptionOptions = {
  /**
   * The text is a live caption revealed in step with the voice (lib/gemini-tutor.ts
   * shows `revealByFraction(turnText, played / turnAudioMs)` every 80 ms). When
   * a burst of audio arrives ahead of its transcript the fraction falls, and the
   * caption drops its last word or two for about 100 ms ("…you need them to",
   * then "…you need them"). Read as a new turn, that threw the bubble away and
   * typed every word again. With `live`, a caption that only lost whole words
   * off its end keeps the longer line: within a turn the shown words never
   * shrink.
   *
   * The cost: a new turn whose first words are exactly the start of the line
   * still showing (no "" in between) keeps that line until it says something
   * different, a few hundred ms. A turn counter from the client would remove
   * the guess; until then this errs toward keeping words, because a wrong
   * "new turn" re-types the whole bubble and a wrong "same turn" only holds a
   * line a moment longer.
   */
  live?: boolean;
};

// The client appends " —" to the caption when the student interrupts.
const INTERRUPT = /(^|\s)[—–]$/;
const DASH = /^[—–]$/;

/** The next state of a caption given its newest text. Returns `prev` itself when nothing changed. */
export function advanceCaption(prev: CaptionLine, raw: string, options: CaptionOptions = {}): CaptionLine {
  const text = raw.trim();
  if (text === prev.text) return prev;
  if (!text) return { ...EMPTY_LINE, turn: prev.turn };

  const tokens = text.split(/\s+/);
  const interrupted = INTERRUPT.test(text);
  if (options.live && !interrupted && droppedTail(prev, tokens)) return prev;
  const kept = sameTurn(prev, tokens, interrupted);

  if (kept < 0) {
    // A new turn: every word is new, all born in its first update.
    const turn = prev.turn + 1;
    return { turn, text, words: build(turn, tokens, [], 1, 0), updates: 1, interrupted };
  }
  const updates = prev.updates + 1;
  const words = build(prev.turn, tokens, prev.words.slice(0, kept), updates, prev.words.length);
  return { turn: prev.turn, text, words, updates, interrupted };
}

/**
 * How many of the previous turn's words carry over, or -1 for a new turn.
 * A turn changes itself in only two ways: it appends (which may complete its
 * last word, "tri" then "tricky"), and when the student cuts in it stops at
 * the last word heard, which may be short of the last word shown, and adds
 * "—". Anything else is the next turn.
 */
function sameTurn(prev: CaptionLine, tokens: string[], interrupted: boolean): number {
  const old = prev.words;
  if (!old.length) return -1;
  let common = 0;
  while (common < old.length && common < tokens.length && tokens[common] === old[common].text) common++;
  if (common === old.length) return common;
  // Only the last word can still be arriving, so only it may have grown.
  const last = old.length - 1;
  if (common === last && common < tokens.length && !DASH.test(tokens[common]) && tokens[common].startsWith(old[last].text)) return old.length;
  if (interrupted) {
    const heard = tokens.length - 1; // the words before "—"
    if (common === heard && common >= 1) return common;
    // Heard part of a word: it stays the same word, shortened.
    if (common === heard - 1 && old[common].text.startsWith(tokens[common])) return common + 1;
  }
  return -1;
}

/** The new words are the old line with only whole words taken off its end. */
function droppedTail(prev: CaptionLine, tokens: string[]): boolean {
  const old = prev.words;
  if (!tokens.length || tokens.length >= old.length) return false;
  // A line that ended on the student's dash is finished: what follows is new.
  if (prev.interrupted) return false;
  for (let i = 0; i < tokens.length; i++) if (tokens[i] !== old[i].text) return false;
  return true;
}

// `used` is how many indices this turn has handed out before: an index below
// it that is not kept belonged to a word that was cut away (the "—" of an
// interruption lands where the unheard word was), so the new word gets a key
// of its own and React treats it as new rather than editing the old one.
function build(turn: number, tokens: string[], kept: CaptionWord[], update: number, used: number): CaptionWord[] {
  const words: CaptionWord[] = [];
  const fresh = tokens.length - kept.length;
  let sentence = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (i > 0 && endsSentence(tokens[i - 1])) sentence++;
    const had = kept[i];
    if (had) {
      // Same word: the key, the sentence and the arrival stay; only a
      // half-arrived word's text can have grown.
      words.push(had.text === tokens[i] ? had : { ...had, text: tokens[i] });
      continue;
    }
    words.push({
      key: i < used ? `t${turn}.w${i}.u${update}` : `t${turn}.w${i}`,
      index: i,
      text: tokens[i],
      sentence,
      born: update,
      order: i - kept.length,
      batch: fresh,
    });
  }
  return words;
}

const ABBREVIATION = /^(?:mr|mrs|ms|dr|st|vs|etc|approx|e\.g|i\.e)\.$/i;

/** A word that ends a sentence: `.`, `!` or `?`, maybe inside a closing quote or bracket. "3.5" does not. */
export function endsSentence(word: string): boolean {
  return /[.!?]+["'”’)\]]*$/.test(word) && !ABBREVIATION.test(word);
}

/**
 * The words to show once a long turn outgrows its bubble: the whole turn while
 * it fits in `max` characters, else its last sentence, plus the one before
 * while the two fit in `max + 40`. Always whole sentences, so the head is cut
 * only where a sentence starts, and every word keeps its key.
 */
export function visibleWords(words: CaptionWord[], max: number): CaptionWord[] {
  if (!words.length) return words;
  if (lengthOf(words) <= max) return words;
  const last = words[words.length - 1].sentence;
  const lastStart = words.findIndex((w) => w.sentence === last);
  const prevStart = words.findIndex((w) => w.sentence === last - 1);
  if (prevStart >= 0 && lengthOf(words.slice(prevStart)) <= max + 40) return words.slice(prevStart);
  return words.slice(lastStart);
}

function lengthOf(words: CaptionWord[]): number {
  let n = Math.max(0, words.length - 1);
  for (const w of words) n += w.text.length;
  return n;
}

/** The text of `visibleWords`, for plain captions. */
export function captionTail(text: string, max = 160): string {
  const line = advanceCaption(EMPTY_LINE, text);
  return visibleWords(line.words, max)
    .map((w) => w.text)
    .join(" ");
}

/** Stagger for a word's fade-in: words from one update arrive `step` ms apart, the whole batch within `cap` ms. */
export function wordDelayMs(word: CaptionWord, step = 35, cap = 450): number {
  const each = word.batch > 1 ? Math.min(step, cap / (word.batch - 1)) : step;
  return Math.round(word.order * each);
}

export type CaptionBubble = {
  /** Stable for the life of the turn: the sentence the bubble starts with. */
  id: number;
  words: CaptionWord[];
};

/**
 * A turn's words as separate bubbles, like texts sent one after another
 * (Mateo, Sept 24 2026: "like a double text"). A new bubble starts at a
 * sentence once the bubble before it holds at least `minWords` words, so a
 * short "Yep." rides with the sentence after it. Words only ever append, so a
 * bubble's words never change once the next one has started, and its id (its
 * first sentence) never changes at all.
 */
export function splitBubbles(words: CaptionWord[], minWords = 4): CaptionBubble[] {
  const bubbles: CaptionBubble[] = [];
  for (const word of words) {
    const current = bubbles[bubbles.length - 1];
    const startsSentence = current && word.sentence !== current.words[current.words.length - 1].sentence;
    if (!current || (startsSentence && current.words.length >= minWords)) bubbles.push({ id: word.sentence, words: [word] });
    else current.words.push(word);
  }
  return bubbles;
}
