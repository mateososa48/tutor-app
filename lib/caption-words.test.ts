import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceCaption, captionTail, EMPTY_LINE, endsSentence, splitBubbles, visibleWords, wordDelayMs, type CaptionLine } from "./caption-words";

const feed = (texts: string[], from: CaptionLine = EMPTY_LINE) => texts.reduce((line, text) => advanceCaption(line, text), from);
const keyOf = (line: CaptionLine) => Object.fromEntries(line.words.map((w) => [w.index, w.key]));

test("appending keeps every existing word's key", () => {
  const a = feed(["Think", "Think of", "Think of it"]);
  const b = advanceCaption(a, "Think of it like trying");
  assert.deepEqual(
    a.words.map((w) => w.key),
    b.words.slice(0, 3).map((w) => w.key),
  );
  assert.equal(b.turn, a.turn);
  assert.deepEqual(
    b.words.map((w) => w.text),
    ["Think", "of", "it", "like", "trying"],
  );
  // The untouched words are the very same objects, so nothing re-renders them as new.
  assert.equal(b.words[0], a.words[0]);
});

test("the same text twice is no update at all", () => {
  const a = feed(["Think of"]);
  assert.equal(advanceCaption(a, "Think of"), a);
  assert.equal(advanceCaption(a, "Think of "), a);
});

test("a half-arrived word that completes updates in place, with its key", () => {
  const a = feed(["That one is tri"]);
  const b = advanceCaption(a, "That one is tricky");
  assert.equal(b.words.length, 4);
  assert.equal(b.words[3].key, a.words[3].key);
  assert.equal(b.words[3].text, "tricky");
  assert.equal(b.words[3].born, a.words[3].born, "it arrived when it first showed");
  const c = advanceCaption(b, "That one is tricky, so");
  assert.equal(c.words[3].key, a.words[3].key);
  assert.equal(c.words[3].text, "tricky,");
  assert.equal(c.turn, a.turn);
});

test("cutting the head for the tail keeps each remaining word's key", () => {
  const long =
    "Think of it like trying to add apples and oranges; you need them to be the same type to combine them correctly. " +
    "A common denominator makes sure the slices of the pie are the same size, so you're not adding one big piece to one small piece.";
  const words = long.split(" ");
  let line = EMPTY_LINE;
  const seen = new Map<string, string>(); // key -> text when first shown
  let cut = false;
  for (let n = 1; n <= words.length; n++) {
    line = advanceCaption(line, words.slice(0, n).join(" "));
    const shown = visibleWords(line.words, 160);
    if (shown.length < line.words.length) cut = true;
    for (const w of shown) {
      const first = seen.get(w.key);
      if (first !== undefined) assert.ok(w.text.startsWith(first.replace(/[,.;]$/, "")), `${w.key} changed from ${first} to ${w.text}`);
      else seen.set(w.key, w.text);
      // The key is the word's index in the whole turn, however much is cut.
      assert.equal(w.key, `t${line.turn}.w${w.index}`);
      assert.equal(w.text, words[w.index]);
    }
  }
  assert.ok(cut, "the turn outgrew 160 characters, so the head was cut");
  const shown = visibleWords(line.words, 160);
  assert.equal(shown[0].text, "A", "cut where a sentence starts");
});

test("a new turn gets new keys", () => {
  const a = feed(["Nice. What is 8 split into 2?"]);
  const b = advanceCaption(a, "Okay, now try this one.");
  assert.equal(b.turn, a.turn + 1);
  const oldKeys = new Set(a.words.map((w) => w.key));
  for (const w of b.words) assert.ok(!oldKeys.has(w.key), `${w.key} reused`);
});

test("a reset to empty starts a new namespace, even for the same words", () => {
  const a = feed(["Your turn"]);
  const empty = advanceCaption(a, "");
  assert.equal(empty.words.length, 0);
  const b = advanceCaption(empty, "Your turn");
  assert.notEqual(b.turn, a.turn);
  assert.notEqual(b.words[0].key, a.words[0].key);
});

test("an interruption ends the line on a dash and keeps the heard words", () => {
  const a = feed(["A common denominator makes sure"]);
  // Everything shown was heard.
  const b = advanceCaption(a, "A common denominator makes sure —");
  assert.equal(b.interrupted, true);
  assert.equal(b.turn, a.turn);
  assert.equal(b.words.at(-1)?.text, "—");
  assert.deepEqual(
    b.words.slice(0, 5).map((w) => w.key),
    a.words.map((w) => w.key),
  );
  // The dash is a new word, so it fades in like one.
  assert.equal(b.words.at(-1)?.born, b.updates);
  // The next thing said is the next turn.
  const c = advanceCaption(b, "Go on, what were you going to say?");
  assert.equal(c.turn, b.turn + 1);
});

test("an interruption can stop short of the last word shown", () => {
  const a = feed(["A common denominator makes sure"]);
  const b = advanceCaption(a, "A common denominator makes —");
  assert.equal(b.turn, a.turn, "same turn: the heard words keep their keys");
  assert.deepEqual(
    b.words.slice(0, 4).map((w) => w.key),
    a.words.slice(0, 4).map((w) => w.key),
  );
  // The dash takes the index "sure" had, but not its key: it is a new word.
  assert.equal(b.words[4].text, "—");
  assert.notEqual(b.words[4].key, a.words[4].key);
  // Heard only part of a word: it stays that word, shortened.
  const c = advanceCaption(a, "A common denominator makes su —");
  assert.equal(c.turn, a.turn);
  assert.equal(c.words[4].key, a.words[4].key);
  assert.equal(c.words[4].text, "su");
});

test("a dash the tutor spoke mid-sentence is just a word, even caught at the end of a reveal", () => {
  const a = feed(["Two ways", "Two ways —"]);
  const b = advanceCaption(a, "Two ways — add first");
  assert.equal(b.interrupted, false);
  assert.equal(b.turn, a.turn, "the line went on, so it was a pause, not the student cutting in");
  assert.deepEqual(
    b.words.slice(0, 3).map((w) => w.key),
    a.words.map((w) => w.key),
  );
  assert.equal(b.words[2].text, "—");
});

test("a plain (not live) text that gets shorter is a new line", () => {
  // A lab or a static bubble switching from one line to a shorter one.
  const a = feed(["So the answer is 4."]);
  const b = advanceCaption(a, "So the");
  assert.equal(b.turn, a.turn + 1);
});

const live = { live: true } as const;
const feedLive = (texts: string[], from: CaptionLine = EMPTY_LINE) => texts.reduce((line, text) => advanceCaption(line, text, live), from);

test("live: a caption that drops its last words for a moment keeps the longer line", () => {
  // Seen at 1x: audio jumped from 13310 to 14430 ms with no new text, the
  // reveal fraction fell from 0.283 to 0.262, and "to" went away for 100 ms.
  const a = feedLive(["Think of it like trying to add apples and oranges; you need them to"]);
  const b = advanceCaption(a, "Think of it like trying to add apples and oranges; you need them", live);
  assert.equal(b, a, "the same line, untouched: nothing re-renders");
  const c = advanceCaption(b, "Think of it like trying to add apples and oranges; you need them to be", live);
  assert.equal(c.turn, a.turn);
  assert.deepEqual(
    c.words.slice(0, a.words.length).map((w) => w.key),
    a.words.map((w) => w.key),
  );
  assert.equal(c.words.at(-1)?.text, "be");
  // Several words at once, too: whatever the fraction falls by.
  assert.equal(advanceCaption(a, "Think of it like", live), a);
});

test("live: a shorter line with other words is still a new turn", () => {
  const a = feedLive(["So the answer is 4."]);
  const b = advanceCaption(a, "Now try", live);
  assert.equal(b.turn, a.turn + 1);
  // A half word is not a whole word taken off the end.
  const c = advanceCaption(a, "So the ans", live);
  assert.equal(c.turn, a.turn + 1);
});

test("live: the student cutting in after a held line stops at the words heard", () => {
  const a = feedLive(["A common denominator makes sure", "A common denominator makes"]);
  assert.equal(a.text, "A common denominator makes sure", "held");
  const b = advanceCaption(a, "A common denominator makes —", live);
  assert.equal(b.turn, a.turn);
  assert.equal(b.interrupted, true);
  assert.deepEqual(
    b.words.map((w) => w.text),
    ["A", "common", "denominator", "makes", "—"],
  );
  assert.deepEqual(
    b.words.slice(0, 4).map((w) => w.key),
    a.words.slice(0, 4).map((w) => w.key),
  );
  // After the dash the line is finished: a shorter one is what comes next.
  const c = advanceCaption(b, "A common", live);
  assert.equal(c.turn, b.turn + 1);
});

test("words from one update are staggered, and a big batch stays short", () => {
  const a = feed(["One"]);
  const b = advanceCaption(a, "One two three four");
  const fresh = b.words.filter((w) => w.born === b.updates);
  assert.deepEqual(
    fresh.map((w) => w.text),
    ["two", "three", "four"],
  );
  assert.deepEqual(
    fresh.map((w) => wordDelayMs(w)),
    [0, 35, 70],
  );
  assert.equal(wordDelayMs(b.words[0]), 0, "an old word never waits again");
  const whole = feed(["This whole sentence arrived in one update because the caption was set at once without any audio pacing at all okay."]);
  const last = whole.words.at(-1)!;
  assert.ok(wordDelayMs(last) <= 450, `the last of ${whole.words.length} waits ${wordDelayMs(last)}ms`);
});

test("sentences: decimals, abbreviations and quotes", () => {
  assert.equal(endsSentence("correctly."), true);
  assert.equal(endsSentence("right?"), true);
  assert.equal(endsSentence('"slices."'), true);
  assert.equal(endsSentence("3.5"), false);
  assert.equal(endsSentence("Mr."), false);
  assert.equal(endsSentence("e.g."), false);
  const line = feed(["Mr. Lee has 3.5 apples. He gives away half."]);
  assert.deepEqual(
    line.words.map((w) => w.sentence),
    [0, 0, 0, 0, 0, 1, 1, 1, 1],
  );
});

test("captionTail keeps the old contract: whole when short, last sentence or two when long", () => {
  assert.equal(captionTail("Short line.", 160), "Short line.");
  const s1 = "First sentence is here and it is long enough to matter for this check of the tail.";
  const s2 = "Second one is also fairly long so that both together pass the limit easily.";
  const s3 = "Third.";
  assert.equal(captionTail(`${s1} ${s2}`, 110), s2);
  assert.equal(captionTail(`${s1} ${s2} ${s3}`, 110), `${s2} ${s3}`);
  // The old regex split "3.5" into "3." and "5", so a tail could start "5 apples".
  const d = `${s1} It costs 3.5 dollars and that is the whole price for the lot, all of it.`;
  assert.ok(!captionTail(d, 110).startsWith("5"), captionTail(d, 110));
});

// One real Gemini Live turn (Sept 23 2026), revealed the way lib/gemini-tutor.ts
// reveals it: in step with the audio, cut at spaces, sometimes mid-word when
// the transcript itself stopped mid-word.
const REAL_TURN =
  'Think of it like trying to add apples and oranges; you need them to be the same type to combine them correctly. A common denominator makes sure the "slices" of the pie are the same size, so you\'re not adding one big piece to one small piece. Once they have the same denominator, you can just add the top numbers, which tells you how many total pieces you have. Does that make a little more sense?';

test("a real turn, caption by caption: one namespace, keys never move, the head is cut only at sentences", () => {
  let line = EMPTY_LINE;
  const texts: string[] = [];
  let end = 0;
  for (let n = 1; n <= REAL_TURN.length; n += 3) {
    if (n <= end) continue; // the caption only ever grows
    const space = REAL_TURN.indexOf(" ", n);
    // Every fifth step stops mid-word, as a transcript fragment can.
    end = n % 5 === 0 ? n : space === -1 ? REAL_TURN.length : space;
    texts.push(REAL_TURN.slice(0, end));
  }
  texts.push(REAL_TURN);
  let cuts = 0;
  for (const text of texts) {
    const next = advanceCaption(line, text);
    assert.equal(next.turn, 1, `one turn throughout (at ${JSON.stringify(text.slice(-20))})`);
    for (const [i, key] of Object.entries(keyOf(line))) assert.equal(keyOf(next)[Number(i)], key);
    line = next;
    for (const max of [160, 110]) {
      const shown = visibleWords(line.words, max);
      if (shown.length < line.words.length) {
        cuts++;
        const before = line.words[shown[0].index - 1];
        assert.ok(endsSentence(before.text), `cut after ${before.text}`);
      }
    }
  }
  assert.ok(cuts > 0);
  assert.equal(line.words.length, REAL_TURN.split(" ").length);
  assert.deepEqual(
    visibleWords(line.words, 160).map((w) => w.text).join(" "),
    "Once they have the same denominator, you can just add the top numbers, which tells you how many total pieces you have. Does that make a little more sense?",
  );
});

// The arrival of that turn's audio and transcript on a real Gemini Live
// session (gemini-3.1-flash-live-preview, Sept 23 2026): [ms, audio ms so far]
// for audio, [ms, text] for a transcript fragment.
const ARRIVAL: [number, number | string][] = [
  [599, 0], [599, "Think of"], [611, 150], [625, 310], [709, 510], [709, " it like"], [722, 670], [727, 710],
  [809, 870], [809, " trying"], [913, 1030], [913, 1070], [913, 1230], [913, " to add"], [921, 1390], [934, 1470],
  [1042, 1630], [1042, " apples"], [1052, 1790], [1071, 1950], [1073, 1990], [1220, 2390], [1220, " and oranges;"],
  [1267, 2670], [1491, 3310], [1491, " you need"], [1536, 3510], [1536, " them to"], [1581, 3750], [1581, " be the"],
  [1708, 4190], [1708, " same"], [1829, 4630], [1829, " type"], [1950, 4950], [1950, " to combine"], [1950, 5190],
  [2172, 5870], [2172, " them correctly."], [2320, 6430], [2320, " A common"], [2373, 6750], [2477, 6830],
  [2556, 7310], [2556, " denominator"], [2599, 7590], [2776, 7950], [2776, " makes"], [3000, 8190], [3000, " sure"],
  [3001, 8550], [3001, " the \"slices\""], [3001, 8870], [3012, 8990], [3070, 9190], [3070, " of the"], [3142, 9510],
  [3142, " pie"], [3213, 9750], [3213, " are the"], [3524, 9990], [3524, " same"], [3642, 10550], [3642, " size,"],
  [3685, 11030], [3685, " so you're"], [3685, 11070], [3721, 11350], [3721, " not"], [4048, 11830],
  [4048, " adding"], [4049, 12110], [4049, " one"], [4173, 12350], [4173, " big"], [4206, 12710], [4206, " piece"],
  [4333, 13070], [4333, " to one"], [4357, 13310], [4357, " small"], [4436, 13670], [4436, " piece."], [4475, 14310],
  [4475, " Once"], [4478, 14430], [4579, 14750], [4579, " they have"], [4658, 15110], [4658, " the same"],
  [4809, 15590], [4809, " denominator,"], [4846, 15870], [4966, 16230], [4966, " you can"], [4967, 16270],
  [5161, 16590], [5161, " just"], [5361, 16830], [5361, " add"], [5404, 17190], [5404, " the top"], [5447, 17550],
  [5447, " numbers,"], [5448, 17670], [5492, 17990], [5492, " which"], [5623, 18270], [5623, " tells"],
  [5982, 18510], [5982, " you how"], [6013, 18710], [6013, " many"], [6038, 19030], [6038, " total"], [6145, 19390],
  [6145, " pieces"], [6146, 19790], [6146, " you have."], [6157, 20190], [6157, " Does that"], [6157, 20510],
  [6158, 20590], [6337, 20790], [6337, " make a"], [6361, 20990], [6361, " little"], [6515, 21510],
  [6515, " more sense?"], [6519, 21790],
];

// A copy of lib/gemini-tutor.ts's reveal (it is private there). Keep in step.
function revealByFraction(text: string, frac: number): string {
  if (!text) return "";
  if (frac >= 0.995) return text;
  let n = Math.floor(text.length * frac);
  if (n <= 0) return "";
  const space = text.indexOf(" ", n);
  n = space === -1 ? text.length : space;
  return text.slice(0, n);
}

// What the client shows every 80 ms: playback starts 120 ms after the first
// audio and runs at `rate` (the speed setting), the meter at `phase`.
function captions(rate: number, phase: number): string[] {
  const out: string[] = [];
  const start = (ARRIVAL.find(([, v]) => typeof v === "number")?.[0] ?? 0) + 120;
  let text = "";
  let audio = 0;
  let played = 0;
  let i = 0;
  let shown = "";
  for (let t = phase; t < 60_000; t += 80) {
    while (i < ARRIVAL.length && ARRIVAL[i][0] <= t) {
      const v = ARRIVAL[i++][1];
      if (typeof v === "number") audio = v;
      else text += v;
    }
    if (t >= start) played = Math.min(audio, played + Math.min(80, t - start) * rate);
    const cap = text ? revealByFraction(text, audio > 0 ? Math.min(1, played / audio) : 0) : "";
    if (cap !== shown) out.push((shown = cap));
    if (i >= ARRIVAL.length && played >= audio) break;
  }
  return out;
}

test("live: the real turn, revealed the way the client reveals it, is one turn at every speed and meter phase", () => {
  let shrinks = 0;
  for (const rate of [0.7, 0.8, 1, 1.2, 1.4])
    for (let phase = 0; phase < 80; phase += 5) {
      let line = EMPTY_LINE;
      let before = "";
      for (const cap of captions(rate, phase)) {
        if (cap.length < before.length) shrinks++;
        before = cap;
        const next = advanceCaption(line, cap, live);
        if (line.words.length) {
          assert.equal(next.turn, line.turn, `new turn at ${rate}x, phase ${phase}: ${JSON.stringify(cap.slice(-24))}`);
          assert.ok(next.words.length >= line.words.length, "the shown words never shrink");
          for (const [i, key] of Object.entries(keyOf(line))) assert.equal(keyOf(next)[Number(i)], key);
        }
        line = next;
      }
      assert.equal(line.words.length, REAL_TURN.split(" ").length);
    }
  // The case this guards: at 1x the caption lost a word at 4.5 s in seven of
  // the sixteen meter phases (and at 0.8x and 1.4x in others).
  assert.ok(shrinks >= 7, `the raw captions shrank ${shrinks} times`);
});

test("a turn splits into bubbles at sentences, short ones riding along", () => {
  let line = EMPTY_LINE;
  const steps = ["Yep.", "Yep. Same move", "Yep. Same move as before.", "Yep. Same move as before. What would", "Yep. Same move as before. What would you take away first?", "Yep. Same move as before. What would you take away first? Ok."];
  const seen = new Map<number, string>();
  for (const s of steps) {
    line = advanceCaption(line, s, { live: true });
    const bubbles = splitBubbles(line.words);
    // A bubble that has been followed by another never changes again.
    for (const b of bubbles.slice(0, -1)) {
      const text = b.words.map((w) => w.text).join(" ");
      if (seen.has(b.id)) assert.equal(seen.get(b.id), text);
      seen.set(b.id, text);
    }
  }
  const final = splitBubbles(line.words).map((b) => b.words.map((w) => w.text).join(" "));
  assert.deepEqual(final, ["Yep. Same move as before.", "What would you take away first?", "Ok."]);
});
