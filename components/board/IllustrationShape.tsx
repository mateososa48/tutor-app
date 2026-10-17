"use client";

import { HTMLContainer, Rectangle2d, ShapeUtil, T, type RecordProps, type TLBaseShape } from "tldraw";

// An illustration on the board (Oct 2026): a picture the illustrator described
// as a scene and lib/illustration/scene.ts laid out and drew as SVG. The shape
// keeps the SVG, the scene it came from (to draw it again), and the boxes of
// its named parts in the picture's own pixels, so the tutor can point at "jar2"
// or ring "bundle1". The SVG is drawn inline, not as an image, so its labels
// use the board's own face; every word in it was escaped by the layout, and
// only built-in objects are drawn (no model-written SVG).
//
// `reveal` wipes it in from the left, like typeset math and graphs.

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
    const { w, h, svg, reveal } = shape.props;
    const shown = reveal >= 1;
    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "none" }}>
        <div
          aria-label="Illustration"
          role="img"
          style={{
            width: w,
            height: h,
            opacity: shown ? 1 : Math.min(1, reveal * 1.6),
            clipPath: shown ? undefined : `inset(-6px ${(1 - reveal) * 100}% -6px -6px)`,
          }}
          dangerouslySetInnerHTML={{ __html: fitted(svg, w, h) }}
        />
      </HTMLContainer>
    );
  }

  // The board picture the tutor sees: the same SVG, inline.
  override toSvg(shape: TLIllustrationShape) {
    const { w, h, svg } = shape.props;
    const box = svgViewBox(svg);
    const inner = svg.replace(/^[\s\S]*?<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    return <svg width={w} height={h} viewBox={box ? `${box.x} ${box.y} ${box.w} ${box.h}` : undefined} preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML={{ __html: inner }} />;
  }
}
