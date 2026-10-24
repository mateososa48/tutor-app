// What the brain writes is what the student hears, so a few things are
// removed on the way to the voice: a praise opener ("Spot on.", "Exactly!"),
// which blind raters marked down every time, and symbols a speech engine
// would read aloud or stumble on (markdown, LaTeX dollars, brackets).
// The first sentence is held until it is complete, then cleaned; the rest
// streams through with only the symbol cleanup.
const OPENER = /^\s*(?:(?:yes|yeah|yep|right|okay|ok|oh|so)[,.!]?\s+)?(?:spot on|exactly|perfect(?:ly)?|great(?: job| work| thinking)?|nice(?: work| job)?|awesome|excellent|well done|good job|you got it|nailed it|bingo|that's (?:right|it|correct|exactly right)|correct)\b[,.!]*\s*/i;
const BARE = /^\s*(?:right|great|good|yes|yep|yeah|correct|nice|cool|awesome|perfect)\s*[.!]+\s+/i;

export function clean(text: string): string {
  return text
    .replace(/\$+/g, "")
    .replace(/[*_#`~|<>{}\[\]\\]/g, "")
    .replace(/\s{2,}/g, " ");
}

export function stripOpener(sentence: string): string {
  const out = sentence.replace(OPENER, "").replace(BARE, "");
  if (!out.trim()) return sentence;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// A tool call written as text ("set_plan(steps=...)", "setplan(steps=...)"):
// everything from it on is dropped (the backup model leaked one on Sept 29).
const LEAKED_CALL = /\b[a-z_]{4,}\s*\(\s*[a-z_]+\s*=/i;

export class SpeechFilter {
  private head = "";
  private released = false;
  private stopped = false;

  private guard(text: string): string {
    if (this.stopped) return "";
    const m = LEAKED_CALL.exec(text);
    if (!m) return text;
    this.stopped = true;
    return text.slice(0, m.index);
  }

  /** Text to speak now (may be empty while the first sentence is held). */
  push(chunk: string): string {
    if (this.released) return clean(this.guard(chunk));
    this.head += chunk;
    for (;;) {
      const end = /[.!?](\s|$)/.exec(this.head);
      if (!end && this.head.length < 90) return "";
      // A first sentence that is nothing but praise ("Exactly!") is dropped whole.
      const first = end ? this.head.slice(0, end.index + 1) : this.head;
      if (end && !first.replace(OPENER, "").replace(BARE, "").replace(/[\s.!?,]/g, "")) {
        this.head = this.head.slice(end.index + 1).trimStart();
        if (!this.head) return "";
        continue;
      }
      this.released = true;
      return clean(this.guard(stripOpener(this.head)));
    }
  }

  /** Whatever is still held when the reply ends. */
  end(): string {
    if (this.released || !this.head.trim()) return "";
    this.released = true;
    return clean(this.guard(stripOpener(this.head)));
  }
}
