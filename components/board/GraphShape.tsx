"use client";

import { HTMLContainer, Rectangle2d, ShapeUtil, T, type RecordProps, type TLBaseShape } from "tldraw";
import { parseGraphSpec } from "@/lib/desmos-spec";

// A graph on the board: a Desmos picture (SVG) of a graph spec
// (lib/desmos-spec.ts), rendered by components/board/desmos-renderer.ts.
// The spec is kept so a graph can be drawn again (board snapshots leave the
// picture out), and so the tutor can point at a labelled point by its
// coordinates.

export type TLGraphShapeProps = {
  w: number;
  h: number;
  /** JSON of a GraphSpec (version 2; version 1 is upgraded on read). */
  spec: string;
  /** The rendered SVG markup; empty until Desmos has drawn it, and in saved snapshots. */
  svg: string;
  status: "rendering" | "ready" | "error";
  /** Expressions Desmos could not graph, "latex: message | …". */
  issues: string;
  /** 0..1 while being written; 1 once shown. */
  reveal: number;
};

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    graph: TLGraphShapeProps;
  }
}

export type TLGraphShape = TLBaseShape<"graph", TLGraphShapeProps>;

/** A thin strip under the picture for the Desmos credit, so it never covers the plot. */
export const GRAPH_CREDIT_H = 14;

// Grey that reads 4.8:1 on white.
const CREDIT_HEX = "#71717c";

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export class GraphShapeUtil extends ShapeUtil<TLGraphShape> {
  static override type = "graph" as const;
  static override props: RecordProps<TLGraphShape> = {
    w: T.number,
    h: T.number,
    spec: T.string,
    svg: T.string,
    status: T.literalEnum("rendering", "ready", "error"),
    issues: T.string,
    reveal: T.number,
  };

  getDefaultProps(): TLGraphShape["props"] {
    return { w: 480, h: 360, spec: "", svg: "", status: "rendering", issues: "", reveal: 1 };
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

  getGeometry(shape: TLGraphShape) {
    return new Rectangle2d({ width: Math.max(1, shape.props.w), height: Math.max(1, shape.props.h + GRAPH_CREDIT_H), isFilled: true });
  }

  component(shape: TLGraphShape) {
    return <GraphView shape={shape} />;
  }

  override getIndicatorPath(shape: TLGraphShape): Path2D {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h + GRAPH_CREDIT_H);
    return path;
  }

  // Board pictures (what the tutor sees) include the graph and its credit; an
  // export that arrives before the picture waits for Desmos.
  override async toSvg(shape: TLGraphShape) {
    const { w, h, spec } = shape.props;
    let svg = shape.props.svg;
    if (!svg && spec) {
      try {
        const parsed = parseGraphSpec(spec, { w, h });
        const { renderDesmosGraph, desmosAvailable } = await import("./desmos-renderer");
        if (parsed && desmosAvailable()) svg = (await renderDesmosGraph(parsed, { w, h })).svg;
      } catch {
        svg = "";
      }
    }
    return (
      <g>
        {svg ? <image href={svgDataUrl(svg)} width={w} height={h} /> : <rect width={w} height={h} fill="#ffffff" stroke="#e4e5ea" />}
        <text x={w - 2} y={h + 11} textAnchor="end" fontSize={10} fontWeight={500} letterSpacing="0.02em" fill={CREDIT_HEX} fontFamily="'tldraw_sans', sans-serif">
          desmos
        </text>
      </g>
    );
  }
}

function GraphPlaceholder({ w, h, failed }: { w: number; h: number; failed: boolean }) {
  const lines = [];
  for (let i = 1; i < 8; i++) lines.push(<line key={`v${i}`} x1={(w * i) / 8} y1={0} x2={(w * i) / 8} y2={h} />);
  for (let i = 1; i < 6; i++) lines.push(<line key={`h${i}`} x1={0} y1={(h * i) / 6} x2={w} y2={(h * i) / 6} />);
  return (
    <svg width={w} height={h} style={{ display: "block" }} aria-hidden="true">
      <g stroke="#ededf1" strokeWidth={1}>
        {lines}
      </g>
      {failed && (
        <text x={w / 2} y={h / 2} textAnchor="middle" fill="#c2413b" fontSize={14} fontFamily="var(--tl-font-sans, sans-serif)">
          Couldn&apos;t draw this graph
        </text>
      )}
    </svg>
  );
}

function GraphView({ shape }: { shape: TLGraphShape }) {
  const { w, h, svg, status, reveal } = shape.props;
  const shown = reveal >= 1;
  return (
    <HTMLContainer style={{ width: w, height: h + GRAPH_CREDIT_H, pointerEvents: "none" }}>
      <div
        style={{
          position: "relative",
          width: w,
          height: h + GRAPH_CREDIT_H,
          opacity: shown ? 1 : Math.min(1, reveal * 1.6),
          clipPath: shown ? undefined : `inset(-4px ${(1 - reveal) * 100}% -4px -4px)`,
        }}
      >
        {svg && status !== "error" ? (
          // eslint-disable-next-line @next/next/no-img-element -- a generated SVG data URL, not a static asset
          <img src={svgDataUrl(svg)} alt="Graph" width={w} height={h} draggable={false} style={{ display: "block", width: w, height: h, userSelect: "none" }} />
        ) : (
          <GraphPlaceholder w={w} h={h} failed={status === "error"} />
        )}
        {/* Desmos asks for attribution on images made with its tools; it sits under the plot. */}
        <span
          style={{
            position: "absolute",
            right: 2,
            top: h + 2,
            font: "500 10px/1 var(--tl-font-sans, ui-sans-serif, system-ui, sans-serif)",
            letterSpacing: "0.02em",
            color: CREDIT_HEX,
          }}
        >
          desmos
        </span>
      </div>
    </HTMLContainer>
  );
}
