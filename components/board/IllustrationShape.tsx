"use client";

import { useLayoutEffect, useRef } from "react";
import { HTMLContainer, Rectangle2d, ShapeUtil, T, type RecordProps, type TLBaseShape } from "tldraw";
import { drawPlan, drawProgress, type DrawItem } from "@/lib/illustration/draw-in";

// An illustration on the board (Oct 2026): a picture the illustrator described
// as a scene and lib/illustration/scene.ts laid out and drew as SVG. The shape
// keeps the SVG, the scene it came from (to draw it again), and the boxes of
// its named parts in the picture's own pixels, so the tutor can point at "jar2"
// or ring "bundle1". The SVG is drawn inline, not as an image, so its labels
// use the board's own face; every word in it was escaped by the layout, and
// only built-in objects are drawn (no model-written SVG).
//
// It sits on a white card with a soft grey rounded border (Oct 24 2026, Mateo:
// "a rounded soft grey border around them"), `pad` px of card around the
// picture; the parts' boxes are in the picture's own pixels, so pointing adds
// the pad. `reveal` draws it as a hand would (lib/illustration/draw-in.ts):
// each outline traced along its path, its colour filled in after, the words
// written in order. It used to wipe in from the left like typeset math, which
// read as pasted.

export type TLIllustrationShapeProps = { w: number; h: number; svg: string; parts: string; scene: string; reveal: number };

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    illustration: TLIllustrationShapeProps;
  }
}

export type TLIllustrationShape = TLBaseShape<"illustration", TLIllustrationShapeProps>;

/** The SVG's own size, from its viewBox (the shape may draw it smaller). */
export function svgViewBox(svg: string): { x: number; y: number; w: number; h: number } | null {
  const m = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  return m ? { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) } : null;
}

/** The card's padding and border, in board px. */
export const ILLUSTRATION_PAD = 14;
const CARD_RADIUS = 18;
const CARD_BORDER = "rgba(18, 18, 21, 0.11)";

/** The pad a picture was drawn with (pictures from before the card have none). */
export function illustrationPad(parts: string): number {
  try {
    const p = JSON.parse(parts) as { pad?: number };
    return typeof p.pad === "number" ? p.pad : 0;
  } catch {
    return 0;
  }
}

/** The SVG to draw at the shape's size: the root's own width and height go, the viewBox scales it. */
function fitted(svg: string, w: number, h: number): string {
  return svg.replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(?:width|height)="[^"]*"/g, "").replace("<svg", `<svg width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"`));
}

export class IllustrationShapeUtil extends ShapeUtil<TLIllustrationShape> {
  static override type = "illustration" as const;
  static override props: RecordProps<TLIllustrationShape> = {
    w: T.number,
    h: T.number,
    svg: T.string,
    parts: T.string,
    scene: T.string,
    reveal: T.number,
  };

  getDefaultProps(): TLIllustrationShapeProps {
    return { w: 320, h: 200, svg: "", parts: "{}", scene: "", reveal: 1 };
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
  getGeometry(shape: TLIllustrationShape) {
    return new Rectangle2d({ width: Math.max(1, shape.props.w), height: Math.max(1, shape.props.h), isFilled: true });
  }
  override getIndicatorPath(shape: TLIllustrationShape): Path2D {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }

  component(shape: TLIllustrationShape) {
    return <IllustrationBody shape={shape} />;
  }

  // The board picture the tutor sees: the same SVG, inline.
  override toSvg(shape: TLIllustrationShape) {
    const { w, h, svg, parts } = shape.props;
    const pad = illustrationPad(parts);
    const box = svgViewBox(svg);
    const inner = svg.replace(/^[\s\S]*?<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    return (
      <g>
        {pad > 0 && <rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} rx={CARD_RADIUS} fill="#ffffff" stroke={CARD_BORDER} strokeWidth={1.5} />}
        <svg x={pad} y={pad} width={w - pad * 2} height={h - pad * 2} viewBox={box ? `${box.x} ${box.y} ${box.w} ${box.h}` : undefined} preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML={{ __html: inner }} />
      </g>
    );
  }
}

function IllustrationBody({ shape }: { shape: TLIllustrationShape }) {
  const { w, h, svg, parts, reveal } = shape.props;
  const pad = illustrationPad(parts);
  const host = useRef<HTMLDivElement>(null);
  const plan = useRef<{ svg: string; items: DrawItem[] } | null>(null);
  // Before paint, so a picture created hidden never flashes whole.
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    // Again when the picture's markup was rebuilt (the shape re-mounts while it
    // is revealed), or the styles land on pieces no longer on the page.
    if (!plan.current || plan.current.svg !== svg || !plan.current.items.every((it) => el.contains(it.el))) plan.current = { svg, items: drawPlan(el) };
    drawProgress(plan.current.items, reveal);
  }, [svg, reveal]);
  const card = pad > 0;
  return (
    <HTMLContainer style={{ width: w, height: h, pointerEvents: "none" }}>
      <div
        aria-label="Illustration"
        role="img"
        style={{
          width: w,
          height: h,
          boxSizing: "border-box",
          padding: pad,
          background: card ? "#ffffff" : undefined,
          border: card ? `1.5px solid ${CARD_BORDER}` : undefined,
          borderRadius: card ? CARD_RADIUS : undefined,
          // The card itself comes in first, quickly; the picture draws on it.
          opacity: reveal >= 1 ? 1 : Math.min(1, reveal * 8),
        }}
      >
        <div ref={host} dangerouslySetInnerHTML={{ __html: fitted(svg, w - pad * 2, h - pad * 2) }} />
      </div>
    </HTMLContainer>
  );
}
