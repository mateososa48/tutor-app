import { Hanken_Grotesk, Schibsted_Grotesk, Shantell_Sans, Sora } from "next/font/google";

// Loaded once in app/layout.tsx; the landing and the product UI share one brand face.
export const display = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--lp-font-display",
  display: "swap",
});

export const body = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--lp-font-body",
  display: "swap",
});

// The wordmark face: the word "chalk" beside the mark is always Sora (use the
// `.lp-brand` class). Variable, so any weight is available.
export const brand = Sora({
  subsets: ["latin"],
  variable: "--lp-font-brand",
  display: "swap",
});

// The same face tldraw uses for its "draw" font, so board annotations in the
// mockups look like the ones the real whiteboard renders.
export const hand = Shantell_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--lp-font-hand",
  display: "swap",
});
