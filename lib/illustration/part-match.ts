// Which part of a picture a tutor means (Oct 24 2026): it said "right pan" for
// a part the illustrator had called "r", and "loose blocks" for "l", and the
// point_at failed, which woke the model into a second reply. Pure.

const SHORT: Record<string, string> = { l: "left", r: "right", t: "top", b: "bottom", eq: "equation", qty: "quantity" };
const STOP = new Set(["the", "a", "an", "of", "on", "in", "at", "to", "and", "its", "their"]);

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => SHORT[w] ?? w)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));

/** The part id `want` names, exactly or by its words ("right pan" → "right_pan" or "r"), or null. */
export function matchPart(keys: readonly string[], want: string): string | null {
  const exact = keys.find((k) => k.toLowerCase() === want.trim().toLowerCase());
  if (exact) return exact;
  const w = words(want);
  if (!w.length) return null;
  let best: { key: string; score: number } | null = null;
  for (const key of keys) {
    const k = words(key);
    if (!k.length) continue;
    const shared = k.filter((x) => w.includes(x)).length;
    // Every word of the part's id is in what was said ("r" → "right" in "right pan"),
    // or every word said is in the id ("bags" → "x_bags").
    const covers = shared === k.length || shared === w.length;
    if (!shared || !covers) continue;
    const score = shared / Math.max(k.length, w.length);
    if (!best || score > best.score) best = { key, score };
  }
  return best?.key ?? null;
}
