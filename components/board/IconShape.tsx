"use client";

import { HTMLContainer, Rectangle2d, ShapeUtil, T, type RecordProps, type TLBaseShape } from "tldraw";
import { BOARD_ICONS } from "@/lib/board-icons.generated";
import type { BoardIconName } from "@/lib/board-icon-names.generated";

// A real thing on the board: an apple, a coin, a car. Fluent Emoji Flat
// (MIT) rendered inline as SVG so it stays crisp at any zoom and exports.

export type TLIconShapeProps = {
  w: number;
  h: number;
  icon: string;
  /** A red X over it: taken away, eaten, spent. */
  crossed: boolean;
  /** 0..1 while being placed; 1 once shown. */
  reveal: number;
};

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    icon: TLIconShapeProps;
  }
}

export type TLIconShape = TLBaseShape<"icon", TLIconShapeProps>;

const CROSS = "#e03131";

function iconFor(name: string) {
  return BOARD_ICONS[name as BoardIconName];
}

export class IconShapeUtil extends ShapeUtil<TLIconShape> {
  static override type = "icon" as const;
  static override props: RecordProps<TLIconShape> = {
    w: T.number,
    h: T.number,
    icon: T.string,
    crossed: T.boolean,
    reveal: T.number,
  };

  getDefaultProps(): TLIconShapeProps {
    return { w: 44, h: 44, icon: "apple", crossed: false, reveal: 1 };
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

  getGeometry(shape: TLIconShape) {
    return new Rectangle2d({ width: Math.max(1, shape.props.w), height: Math.max(1, shape.props.h), isFilled: true });
  }

  override getIndicatorPath(shape: TLIconShape): Path2D {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 6);
    return path;
  }

  component(shape: TLIconShape) {
    const { w, h, icon, crossed, reveal } = shape.props;
    const data = iconFor(icon);
    const shown = reveal >= 1;
    return (
      <HTMLContainer style={{ pointerEvents: "none", width: w, height: h }}>
        <div
          style={{
            width: w,
            height: h,
            position: "relative",
            opacity: shown ? 1 : Math.min(1, reveal * 1.4),
            transform: shown ? undefined : `scale(${0.6 + 0.4 * reveal})`,
            transformOrigin: "50% 100%",
          }}
        >
          {data ? (
            <svg viewBox={`0 0 ${data.w} ${data.h}`} width={w} height={h} style={{ display: "block" }} dangerouslySetInnerHTML={{ __html: data.body }} />
          ) : (
            <div style={{ width: w, height: h, borderRadius: 8, background: "#e9ecef", color: "#868e96", display: "grid", placeItems: "center", fontSize: 18 }}>?</div>
          )}
          {crossed && (
            <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }} fill="none">
              <line x1={w * 0.12} y1={h * 0.12} x2={w * 0.88} y2={h * 0.88} stroke={CROSS} strokeWidth={3.5} strokeLinecap="round" />
              <line x1={w * 0.88} y1={h * 0.12} x2={w * 0.12} y2={h * 0.88} stroke={CROSS} strokeWidth={3.5} strokeLinecap="round" />
            </svg>
          )}
        </div>
      </HTMLContainer>
    );
  }

  override toSvg(shape: TLIconShape) {
    const { w, h, icon, crossed } = shape.props;
    const data = iconFor(icon);
    return (
      <g>
        {data ? (
          <g transform={`scale(${w / data.w} ${h / data.h})`} dangerouslySetInnerHTML={{ __html: data.body }} />
        ) : (
          <rect width={w} height={h} rx={8} fill="#e9ecef" />
        )}
        {crossed && (
          <g stroke={CROSS} strokeWidth={3.5} strokeLinecap="round">
            <line x1={w * 0.12} y1={h * 0.12} x2={w * 0.88} y2={h * 0.88} />
            <line x1={w * 0.88} y1={h * 0.12} x2={w * 0.12} y2={h * 0.88} />
          </g>
        )}
      </g>
    );
  }
}
