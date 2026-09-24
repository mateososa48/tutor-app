// The board's fonts, loaded before its first text is measured (Sept 23 2026).
//
// Board text is measured off-screen the moment a tool call writes it, and its
// box, wrap width and place in the flow come from that measurement. KaTeX's
// fonts are only fetched once some math uses them, and the app's faces may
// still be on their way when a session's first call lands, so the first texts
// were measured in a fallback font: a header measured one line tall became two
// lines once its font arrived, and its divider ran through the row under it.
// So the board asks for every face it draws with when it mounts, and the first
// tool call waits for them, never more than `timeoutMs`: a blocked font must
// not stall the board (the late re-measure in TldrawCore is the fallback).
//
// No dependencies, so the session page can wait on it without pulling in the
// board's code.

let loading: Promise<void> | null = null;
let settled = false;

/** The faces the board draws with, as the CSS names them (the app's faces are next/font variables). */
function boardFaces(): string[] {
  const root = getComputedStyle(document.documentElement);
  const face = (variable: string, fallback: string) => root.getPropertyValue(variable).trim() || fallback;
  const body = face("--lp-font-body", "'Hanken Grotesk'");
  const display = face("--lp-font-display", "'Schibsted Grotesk'");
  const hand = face("--lp-font-hand", "'Shantell Sans'");
  return [
    // BoardTextShape roles: notes, captions, step notes, asks, rules, bold words.
    `400 20px ${body}`,
    `500 20px ${body}`,
    `600 20px ${body}`,
    `700 20px ${body}`,
    // Headers and section headings.
    `600 31px ${display}`,
    // The student's words and answers.
    `500 24px ${hand}`,
    `600 30px ${hand}`,
    // KaTeX: digits, operators and upright words; letters in italic.
    "20px KaTeX_Main",
    "bold 20px KaTeX_Main",
    "italic 20px KaTeX_Math",
  ];
}

/**
 * Starts loading the board's fonts (once) and resolves when they have loaded,
 * or failed, or after `timeoutMs`, whichever comes first.
 */
export function loadBoardFonts(timeoutMs = 1500): Promise<void> {
  if (loading) return loading;
  if (typeof document === "undefined" || !("fonts" in document)) {
    settled = true;
    loading = Promise.resolve();
    return loading;
  }
  let faces: string[] = [];
  try {
    faces = boardFaces();
  } catch {
    faces = [];
  }
  const all = Promise.allSettled(faces.map((f) => document.fonts.load(f, "Aa0=+")));
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  loading = Promise.race([all.then(() => undefined), timeout]).then(() => {
    settled = true;
  });
  return loading;
}

/** True once loadBoardFonts has resolved: measuring now uses the real fonts (or has waited long enough). */
export function boardFontsSettled(): boolean {
  return settled;
}
