import { Hanken_Grotesk, Schibsted_Grotesk, Shantell_Sans } from "next/font/google";

// Scoped to the landing page so the product UI keeps its system stack.
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

// The same face tldraw uses for its "draw" font, so board annotations in the
// mockups look like the ones the real whiteboard renders.
export const hand = Shantell_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--lp-font-hand",
  display: "swap",
});
