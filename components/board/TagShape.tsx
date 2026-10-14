"use client";

import { HTMLContainer, Rectangle2d, ShapeUtil, T, type RecordProps, type TLBaseShape } from "tldraw";

// The "You said" label in front of a student's line (Oct 14 2026). It was a
// square grey box drawn with tldraw's geo rectangle, which has no corner
// radius and read like a disabled form field. This is a small speech label:
// a soft rounded fill, the words in the student's pencil grey, and a short
// tail pointing at what they said. It is decoration on the attempt's item:
// marks measure the words beside it, never the label.

export type TLTagShapeProps = { w: number; h: number; text: string };

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    tag: TLTagShapeProps;
  }
}

export type TLTagShape = TLBaseShape<"tag", TLTagShapeProps>;

const FILL = "#efeff3";
const INK = "#5b5b66";
const FACE = "var(--lp-font-body), 'Hanken Grotesk', system-ui, sans-serif";
/** How far the tail reaches past the label's right edge. */
export const TAG_TAIL = 6;
export const TAG_FONT_PX = 14;
export const TAG_PAD_X = 10;
export const TAG_H = 26;
const RADIUS = 8;

export class TagShapeUtil extends ShapeUtil<TLTagShape> {
  static override type = "tag" as const;
  static override props: RecordProps<TLTagShape> = { w: T.number, h: T.number, text: T.string };

  getDefaultProps(): TLTagShapeProps {
    return { w: 80, h: TAG_H, text: "You said" };
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
  getGeometry(shape: TLTagShape) {
    return new Rectangle2d({ width: Math.max(1, shape.props.w), height: Math.max(1, shape.props.h), isFilled: true });
  }

  component(shape: TLTagShape) {
    const { w, h, text } = shape.props;
    return (
      <HTMLContainer style={{ pointerEvents: "none", width: w + TAG_TAIL, height: h }}>
        <svg width={w + TAG_TAIL} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }} aria-hidden>
          <path d={tagPath(w, h)} fill={FILL} />
        </svg>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: w,
            height: h,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FACE,
            fontSize: TAG_FONT_PX,
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: "0.005em",
            color: INK,
            whiteSpace: "nowrap",
          }}
        >
          {text}
        </div>
      </HTMLContainer>
    );
  }

  override toSvg(shape: TLTagShape) {
    const { w, h, text } = shape.props;
    return (
      <g>
        <path d={tagPath(w, h)} fill={FILL} />
        <text x={w / 2} y={h / 2 + TAG_FONT_PX * 0.35} textAnchor="middle" fontFamily="Hanken Grotesk, system-ui, sans-serif" fontSize={TAG_FONT_PX} fontWeight={500} fill={INK}>
          {text}
        </text>
      </g>
    );
  }

  override getIndicatorPath(shape: TLTagShape): Path2D {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}

/** A rounded label with a small tail on its right edge, pointing at the answer. */
function tagPath(w: number, h: number): string {
  const r = Math.min(RADIUS, h / 2);
  const mid = h / 2;
  const t = 4.5; // half the tail's base
  return [
    `M ${r} 0`,
    `H ${w - r}`,
    `Q ${w} 0 ${w} ${r}`,
    `V ${mid - t}`,
    `L ${w + TAG_TAIL} ${mid}`,
    `L ${w} ${mid + t}`,
    `V ${h - r}`,
    `Q ${w} ${h} ${w - r} ${h}`,
    `H ${r}`,
    `Q 0 ${h} 0 ${h - r}`,
    `V ${r}`,
    `Q 0 0 ${r} 0`,
    "Z",
  ].join(" ");
}
