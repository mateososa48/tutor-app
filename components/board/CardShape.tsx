"use client";

import { HTMLContainer, Rectangle2d, ShapeUtil, T, type RecordProps, type TLBaseShape } from "tldraw";

// A finished board, framed (Oct 14 2026, Mateo: "a border around the whole
// section of the whiteboard shown gets put in a box… it fades in. and then,
// the box smoothly slides to the left and the tutor continues with a fresh
// board"). The frame is drawn behind the work it holds, with the plan box's
// hairline and corners, and a small green "Solved" tab on its top edge when a
// checked final answer finished the problem. It is not a board item: the
// tutor never points at it, and the board's picture for the tutor leaves
// archived boards out.

export type TLCardShapeProps = { w: number; h: number; solved: boolean };

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    card: TLCardShapeProps;
  }
}

export type TLCardShape = TLBaseShape<"card", TLCardShapeProps>;

const BORDER = "rgba(18, 18, 21, 0.16)";
const GREEN = "#15803d";
export const CARD_RADIUS = 16;

const FACE = "var(--lp-font-body), 'Hanken Grotesk', system-ui, sans-serif";

export class CardShapeUtil extends ShapeUtil<TLCardShape> {
  static override type = "card" as const;
  static override props: RecordProps<TLCardShape> = { w: T.number, h: T.number, solved: T.boolean };

  getDefaultProps(): TLCardShapeProps {
    return { w: 1, h: 1, solved: false };
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
  override hideSelectionBoundsFg() {
    return true;
  }
  getGeometry(shape: TLCardShape) {
    return new Rectangle2d({ width: Math.max(1, shape.props.w), height: Math.max(1, shape.props.h), isFilled: false });
  }
  override getIndicatorPath(shape: TLCardShape): Path2D {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }

  component(shape: TLCardShape) {
    const { w, h, solved } = shape.props;
    return (
      <HTMLContainer style={{ pointerEvents: "none", width: w, height: h }} aria-label={solved ? "Finished board, solved" : "Finished board"}>
        <div style={{ position: "absolute", inset: 0, boxSizing: "border-box", borderRadius: CARD_RADIUS, border: `1.5px solid ${BORDER}` }} />
        {solved ? (
          <div
            style={{
              position: "absolute",
              top: -14,
              right: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "0 12px 0 9px",
              borderRadius: 999,
              background: "#ffffff",
              border: `1.5px solid ${BORDER}`,
              fontFamily: FACE,
              fontSize: 14,
              fontWeight: 600,
              color: GREEN,
              whiteSpace: "nowrap",
            }}
          >
            <svg viewBox="0 0 22 22" width={16} height={16} aria-hidden>
              <path d="M5.5 11.8 C 6.8 13, 7.8 14.2, 9 15.8 C 11 12, 13.4 8.8, 16.8 6.4" stroke={GREEN} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            Solved
          </div>
        ) : null}
      </HTMLContainer>
    );
  }

  override toSvg(shape: TLCardShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={CARD_RADIUS} fill="none" stroke={BORDER} strokeWidth={1.5} />;
  }
}
