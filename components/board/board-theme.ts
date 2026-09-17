// The board's colours beyond tldraw's palette (Sept 16 2026).
//
// Every tutor mark is one colour, the sky blue of the app (--lp-sky), because
// Mateo asked for the markings to match Settings instead of a set of meaning
// colours. Strikes use the deeper sky: #3d9cff is only 2.9:1 on white and a
// line through black text has to read. The student's pencil moved from
// tldraw's grey (#9fa8b2, 2.4:1) to the app's second ink (6.9:1).
//
// These are new colour names, not repaints of tldraw's own, so diagram pens
// (blue, violet, green…) look exactly as before. TldrawEditor registers every
// colour in the themes it is given, which also lets saved boards that use
// them load.
import { DEFAULT_THEME, type TLDefaultColor, type TLTheme, type TLThemes } from "tldraw";

declare module "@tldraw/tlschema" {
  interface TLThemeDefaultColors {
    /** The tutor's pen: highlights, rings, underlines, boxes, the pointer. */
    sky: TLDefaultColor;
    /** Strikes through a wrong step. */
    "sky-deep": TLDefaultColor;
    /** The student's pencil and quiet captions. */
    pencil: TLDefaultColor;
  }
}

export const SKY = "#3d9cff";
export const SKY_DEEP = "#1d7ee6";
export const SKY_SOFT = "#e9f3ff";
export const PENCIL_HEX = "#5b5b66";
// Behind ink at tldraw's 82% underlay opacity: light enough that black text on it stays easy to read.
const SKY_HIGHLIGHT = "#8cc4ff";

function color(solid: string, semi: string, highlight: string, highlightP3: string, frame: string): TLDefaultColor {
  return {
    solid,
    semi,
    pattern: solid,
    fill: solid,
    linedFill: semi,
    frameHeadingStroke: frame,
    frameHeadingFill: "#fafcff",
    frameStroke: frame,
    frameFill: "#fcfdff",
    frameText: "#121215",
    noteFill: semi,
    noteText: "#121215",
    highlightSrgb: highlight,
    highlightP3,
  };
}

const sky = color(SKY, SKY_SOFT, SKY_HIGHLIGHT, "color(display-p3 0.56 0.76 0.99)", "#7ab8ff");
const skyDeep = color(SKY_DEEP, SKY_SOFT, SKY_HIGHLIGHT, "color(display-p3 0.56 0.76 0.99)", "#5a9ff0");
const pencil = color(PENCIL_HEX, "#ececf0", "#cbe7f1", "color(display-p3 0.8163 0.9023 0.9416)", "#8a8a94");

export const CHALK_THEME: TLTheme = {
  ...DEFAULT_THEME,
  colors: {
    // The board is white on screen (PlainBackground); exports used tldraw's
    // #f9fafb, which framed every white Desmos picture in a faint box.
    light: { ...DEFAULT_THEME.colors.light, background: "#ffffff", sky, "sky-deep": skyDeep, pencil },
    dark: { ...DEFAULT_THEME.colors.dark, sky, "sky-deep": skyDeep, pencil },
  },
};

// Module level, so the Tldraw component sees the same object on every render.
export const BOARD_THEMES: Partial<TLThemes> = { default: CHALK_THEME };
