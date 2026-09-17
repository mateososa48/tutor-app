"use client";

import { useMemo } from "react";
import { PENCIL_HEX, SKY, SKY_DEEP } from "@/components/board/board-theme";
import { HTMLContainer, Rectangle2d, ShapeUtil, T, type RecordProps, type TLBaseShape } from "tldraw";
import katex from "katex";
import { latexToPlain } from "@/lib/latex-plain";
import { normalizeLatex } from "@/lib/latex-normalize";

// Typeset math as a real tldraw shape. KaTeX renders it on the canvas; the
// shape carries its cross-out, highlight ring, side annotation, and the
// "being written" reveal, exports itself as text, and persists in the store.

export type MathHighlight = "" | "circle" | "underline" | "box";

export type TLMathShapeProps = {
  w: number;
  h: number;
  /** Width of the typeset math alone (the annotation sits to its right). */
  mathW: number;
  latex: string;
  color: string;
  display: boolean;
  annotation: string;
  crossOut: boolean;
  highlight: MathHighlight;
  /** 0..1 while being written; 1 once shown. */
  reveal: number;
  /** "label" for typeset captions on diagrams (never an equation step). */
  role: "" | "label";
  /** Font scale, below 1 when a long line has to fit its column. */
  scale: number;
};

// Registers "math" as a shape type across tldraw's typings.
declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    math: TLMathShapeProps;
  }
}

export type TLMathShape = TLBaseShape<"math", TLMathShapeProps>;

export const MATH_FONT_PX = 23.2; // 1.45rem at the root 16px
// Marks on a line are the tutor's sky pen (Sept 16); strikes use the deeper sky.
export const MATH_CORRECT_HEX = SKY;
export const MATH_WRONG_HEX = SKY_DEEP;
// The note beside a line ("subtract 3 from both sides"): the board's sans in
// the student's pencil grey, 16 px everywhere it is measured, drawn and
// exported (Sept 16 2026: it was 13 px and 2.9:1, too small to read on a phone).
const ANNOTATION_PX = 16;
const ANNOTATION_FONT = "'tldraw_sans', sans-serif";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Parse errors throw here (undefined commands, unbalanced braces), so the
// caller can try a cleaner form instead of showing KaTeX's error markup.
function tryKatex(latex: string, display: boolean): string | null {
  try {
    return katex.renderToString(latex, { throwOnError: true, displayMode: display, strict: "ignore" });
  } catch {
    return null;
  }
}

// As written, then normalised, then as plain text in the math face: the
// board never shows KaTeX's red error markup.
export function renderMathHtml(latex: string, display: boolean): string {
  const direct = tryKatex(latex, display);
  if (direct) return direct;
  const normalised = tryKatex(normalizeLatex(latex), display);
  if (normalised) return normalised;
  const plain = tryKatex(`\\text{${latexToPlain(latex).replace(/[{}\\]/g, "")}}`, display);
  return plain ?? `<span class="katex">${escapeHtml(latexToPlain(latex))}</span>`;
}

let measurer: HTMLDivElement | null = null;

// Measure by laying the same HTML out off-screen, so the shape box fits.
export function measureMath(latex: string, display: boolean, annotation = "", scale = 1): { w: number; h: number; mathW: number } {
  if (typeof document === "undefined") return { w: 160, h: 48, mathW: 160 };
  if (!measurer || !measurer.isConnected) {
    measurer = document.createElement("div");
    measurer.className = "chalk-math";
    measurer.style.cssText = "position:absolute;left:-20000px;top:-20000px;visibility:hidden;pointer-events:none;white-space:nowrap;display:inline-block;";
    document.body.appendChild(measurer);
  }
  measurer.innerHTML =
    `<span style="display:inline-block;font-size:${MATH_FONT_PX * scale}px;padding:2px 4px;line-height:normal">${renderMathHtml(latex, display)}</span>` +
    (annotation ? `<span style="display:inline-block;margin-left:18px;font-size:${ANNOTATION_PX}px;font-family:${ANNOTATION_FONT};vertical-align:middle">${escapeHtml(annotation)}</span>` : "");
  const math = measurer.children[0] as HTMLElement | undefined;
  const mathRect = math?.getBoundingClientRect();
  const all = measurer.getBoundingClientRect();
  const mathW = Math.ceil(mathRect?.width ?? 100);
  const h = Math.ceil(Math.max(mathRect?.height ?? 40, 28));
  return { w: Math.ceil(Math.max(all.width, mathW)), h, mathW };
}

export class MathShapeUtil extends ShapeUtil<TLMathShape> {
  static override type = "math" as const;
  static override props: RecordProps<TLMathShape> = {
    w: T.number,
    h: T.number,
    mathW: T.number,
    latex: T.string,
    color: T.string,
    display: T.boolean,
    annotation: T.string,
    crossOut: T.boolean,
    highlight: T.literalEnum("", "circle", "underline", "box"),
    reveal: T.number,
    role: T.literalEnum("", "label"),
    scale: T.number,
  };

  getDefaultProps(): TLMathShape["props"] {
    return { w: 160, h: 48, mathW: 160, latex: "", color: "#383838", display: true, annotation: "", crossOut: false, highlight: "", reveal: 1, role: "", scale: 1 };
  }

  override canEdit() {
    return false;
  }
  override canResize() {
    return false;
  }
  override hideRotateHandle() {
    return true;
  }
  override isAspectRatioLocked() {
    return true;
  }

  getGeometry(shape: TLMathShape) {
    return new Rectangle2d({ width: Math.max(1, shape.props.w), height: Math.max(1, shape.props.h), isFilled: true });
  }

  component(shape: TLMathShape) {
    return <MathView shape={shape} />;
  }

  override getIndicatorPath(shape: TLMathShape): Path2D {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 4);
    return path;
  }

  // Exports (and the picture the tutor sees) get the math as plain text.
  override toSvg(shape: TLMathShape) {
    const { w, h, mathW, latex, color, annotation, crossOut, highlight, scale } = shape.props;
    const text = latexToPlain(latex);
    const fontPx = Math.round(23 * (scale || 1));
    const base = h * 0.68;
    // Plain text can run wider than the typeset math; keep the annotation clear of it.
    const textW = Math.max(mathW, text.length * fontPx * 0.52);
    return (
      <g>
        {highlight === "box" && <rect x={-6} y={-4} width={mathW + 12} height={h + 8} fill="none" stroke={MATH_CORRECT_HEX} strokeWidth={1.5} strokeDasharray="4 3" rx={6} />}
        {highlight === "circle" && <ellipse cx={mathW / 2} cy={h / 2} rx={mathW / 2 + 16} ry={h / 2 + 10} fill="none" stroke={MATH_CORRECT_HEX} strokeWidth={2} strokeDasharray="4 1.5" />}
        <text x={4} y={base} fontFamily="'Times New Roman', Times, serif" fontSize={fontPx} fill={color}>
          {text}
        </text>
        {highlight === "underline" && <line x1={0} y1={h - 2} x2={mathW} y2={h - 2} stroke={MATH_CORRECT_HEX} strokeWidth={2} />}
        {crossOut && <line x1={-4} y1={h / 2 + 2} x2={mathW + 4} y2={h / 2 - 3} stroke={MATH_WRONG_HEX} strokeWidth={2} />}
        {annotation && (
          <text x={textW + 18} y={base} fontFamily={ANNOTATION_FONT} fontSize={ANNOTATION_PX} fill={PENCIL_HEX}>
            {annotation}
          </text>
        )}
        <rect width={w} height={h} fill="none" />
      </g>
    );
  }
}

function MathView({ shape }: { shape: TLMathShape }) {
  const { w, h, mathW, latex, color, display, annotation, crossOut, highlight, reveal, scale } = shape.props;
  const html = useMemo(() => renderMathHtml(latex, display), [latex, display]);
  const fontPx = MATH_FONT_PX * (scale || 1);
  const shown = reveal >= 1;
  return (
    <HTMLContainer style={{ pointerEvents: "none", width: w, height: h }}>
      <div
        className="chalk-math"
        style={{
          position: "relative",
          width: w,
          height: h,
          opacity: shown ? 1 : Math.min(1, reveal * 1.6),
          clipPath: shown ? undefined : `inset(-10px ${(1 - reveal) * 100}% -10px -10px)`,
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, width: mathW, height: h }}>
          <span
            style={{ fontSize: fontPx, color, display: "block", padding: "2px 4px", whiteSpace: "nowrap", lineHeight: "normal" }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          {crossOut && (
            <div
              style={{
                position: "absolute",
                top: "calc(50% - 1px)",
                left: -4,
                right: -4,
                height: 2,
                background: MATH_WRONG_HEX,
                opacity: 0.85,
                transform: "rotate(-1.5deg)",
                transformOrigin: "left center",
                borderRadius: 1,
              }}
            />
          )}
          {highlight === "underline" && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: MATH_CORRECT_HEX, borderRadius: 1, opacity: 0.85 }} />
          )}
          {highlight === "box" && (
            <div style={{ position: "absolute", inset: "-6px -10px", border: `1.5px dashed ${MATH_CORRECT_HEX}`, borderRadius: 6, opacity: 0.85 }} />
          )}
          {highlight === "circle" && (
            <svg style={{ position: "absolute", inset: "-12px -18px", width: "calc(100% + 36px)", height: "calc(100% + 24px)", overflow: "visible" }} fill="none">
              <ellipse cx="50%" cy="50%" rx="48%" ry="45%" stroke={MATH_CORRECT_HEX} strokeWidth={2} opacity={0.85} strokeDasharray="4 1.5" />
            </svg>
          )}
        </div>
        {annotation && (
          <span
            style={{
              position: "absolute",
              left: mathW + 18,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: ANNOTATION_PX,
              fontFamily: ANNOTATION_FONT,
              fontWeight: 400,
              color: PENCIL_HEX,
              whiteSpace: "nowrap",
            }}
          >
            {annotation}
          </span>
        )}
      </div>
    </HTMLContainer>
  );
}
