"use client";

import { HTMLContainer, Rectangle2d, ShapeUtil, T, type RecordProps, type TLBaseShape } from "tldraw";
import { PENCIL_HEX, SKY } from "@/components/board/board-theme";
import { planSummary, readPlan, type BoardPlan } from "@/lib/board-plan";

// The session plan, in a box at the top right of every page (Sept 24 2026,
// Mateo: "a nice lil box"). The tutor says the plan in one breath after the
// opening and writes it with set_plan; each step has a numbered badge: sky
// for the step they are on, green with a check once a checked answer finishes
// a problem in it, pencil grey for what is still to come. It is not a board
// item: nothing erases it, nothing is placed over it, and a new page draws it
// again. The tutor's picture of the board carries it too (toSvg).

export type TLPlanShapeProps = { w: number; h: number; data: string };

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    plan: TLPlanShapeProps;
  }
}

export type TLPlanShape = TLBaseShape<"plan", TLPlanShapeProps>;

const INK = "#121215";
const INK_2 = "#4a4a55";
const GREEN = "#15803d";
const BORDER = "rgba(18, 18, 21, 0.14)";

export const PLAN_BOX = {
  padX: 18,
  padY: 14,
  titlePx: 13,
  titleH: 18,
  titleGap: 8,
  rowH: 32,
  px: 18,
  badge: 24,
  badgeGap: 12,
  minW: 220,
  maxW: 380,
  radius: 14,
} as const;

// The app's body face; the SVG export (the tutor's picture) uses a plain sans.
const FACE_VAR = "--lp-font-body";
const FACE_FALLBACK = "'Hanken Grotesk', system-ui, sans-serif";
const PLAN_FONT = `var(${FACE_VAR}), ${FACE_FALLBACK}`;

let measurer: CanvasRenderingContext2D | null = null;

function labelWidth(text: string, weight: number): number {
  if (typeof document === "undefined") return text.length * PLAN_BOX.px * 0.55;
  if (!measurer) measurer = document.createElement("canvas").getContext("2d");
  if (!measurer) return text.length * PLAN_BOX.px * 0.55;
  const face = getComputedStyle(document.documentElement).getPropertyValue(FACE_VAR).trim() || FACE_FALLBACK;
  measurer.font = `${weight} ${PLAN_BOX.px}px ${face}`;
  return Math.ceil(measurer.measureText(text).width);
}

/** The box's size for a plan: as wide as its longest step, within bounds. */
export function measurePlanBox(plan: BoardPlan): { w: number; h: number } {
  const widest = Math.max(0, ...plan.steps.map((s) => labelWidth(s.label, 600)));
  const w = Math.min(PLAN_BOX.maxW, Math.max(PLAN_BOX.minW, PLAN_BOX.padX * 2 + PLAN_BOX.badge + PLAN_BOX.badgeGap + widest));
  const h = PLAN_BOX.padY * 2 + PLAN_BOX.titleH + PLAN_BOX.titleGap + plan.steps.length * PLAN_BOX.rowH;
  return { w, h };
}

export function planFromShape(data: string): BoardPlan | null {
  try {
    return readPlan(JSON.parse(data));
  } catch {
    return null;
  }
}

type Look = { badgeFill: string; badgeStroke: string; number: string; label: string; weight: number };

function lookOf(step: { done: boolean }, index: number, current: number): Look {
  if (step.done) return { badgeFill: GREEN, badgeStroke: GREEN, number: "#ffffff", label: GREEN, weight: 500 };
  if (index + 1 === current) return { badgeFill: SKY, badgeStroke: SKY, number: "#ffffff", label: INK, weight: 600 };
  return { badgeFill: "transparent", badgeStroke: PENCIL_HEX, number: PENCIL_HEX, label: PENCIL_HEX, weight: 500 };
}

const CHECK_PATH = "M6.5 12.6 C 7.6 13.6, 8.4 14.6, 9.4 16 C 11.2 12.4, 13.2 9.6, 16.2 7";

export class PlanShapeUtil extends ShapeUtil<TLPlanShape> {
  static override type = "plan" as const;
  static override props: RecordProps<TLPlanShape> = { w: T.number, h: T.number, data: T.string };

  getDefaultProps(): TLPlanShapeProps {
    return { w: 1, h: 1, data: "{}" };
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
  getGeometry(shape: TLPlanShape) {
    return new Rectangle2d({ width: Math.max(1, shape.props.w), height: Math.max(1, shape.props.h), isFilled: true });
  }
  override getIndicatorPath(shape: TLPlanShape): Path2D {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }

  component(shape: TLPlanShape) {
    const plan = planFromShape(shape.props.data);
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const ease = (props: string) => (reduce ? "none" : props);
    const B = PLAN_BOX;
    return (
      <HTMLContainer style={{ pointerEvents: "none", width: shape.props.w, height: shape.props.h }} aria-label={plan ? planSummary(plan) : undefined}>
        <div
          style={{
            width: shape.props.w,
            height: shape.props.h,
            boxSizing: "border-box",
            borderRadius: B.radius,
            background: "#ffffff",
            border: `1.5px solid ${BORDER}`,
            padding: `${B.padY}px ${B.padX}px`,
            fontFamily: PLAN_FONT,
            color: INK,
          }}
        >
          <div style={{ fontSize: B.titlePx, lineHeight: `${B.titleH}px`, fontWeight: 600, color: INK_2, marginBottom: B.titleGap }}>Plan</div>
          {plan?.steps.map((s, i) => {
            const look = lookOf(s, i, plan.current);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: B.badgeGap, height: B.rowH }}>
                <span
                  aria-hidden
                  style={{
                    position: "relative",
                    flex: "none",
                    width: B.badge,
                    height: B.badge,
                    borderRadius: "50%",
                    boxSizing: "border-box",
                    background: look.badgeFill,
                    border: `1.5px solid ${look.badgeStroke}`,
                    color: look.number,
                    fontSize: 13,
                    fontWeight: 700,
                    lineHeight: `${B.badge - 3}px`,
                    textAlign: "center",
                    transition: ease("background 500ms ease, border-color 500ms ease, color 500ms ease"),
                  }}
                >
                  <span style={{ opacity: s.done ? 0 : 1, transition: ease("opacity 200ms ease") }}>{i + 1}</span>
                  <svg
                    viewBox="0 0 22 22"
                    width={B.badge - 3}
                    height={B.badge - 3}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      opacity: s.done ? 1 : 0,
                      transform: s.done ? "scale(1)" : "scale(0.5)",
                      transformOrigin: "45% 60%",
                      transition: ease("opacity 250ms ease 120ms, transform 450ms cubic-bezier(0.34, 1.4, 0.64, 1) 120ms"),
                    }}
                  >
                    <path d={CHECK_PATH} stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                </span>
                <span
                  style={{
                    fontSize: B.px,
                    lineHeight: `${B.rowH}px`,
                    fontWeight: look.weight,
                    color: look.label,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    transition: ease("color 500ms ease"),
                  }}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </HTMLContainer>
    );
  }

  override toSvg(shape: TLPlanShape) {
    const plan = planFromShape(shape.props.data);
    const B = PLAN_BOX;
    const { w, h } = shape.props;
    const font = "Helvetica, Arial, sans-serif";
    const rowTop = B.padY + B.titleH + B.titleGap;
    return (
      <g fontFamily={font}>
        <rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} rx={B.radius} fill="#ffffff" stroke={BORDER} strokeWidth={1.5} />
        <text x={B.padX} y={B.padY + 13} fontSize={B.titlePx} fontWeight={600} fill={INK_2}>
          Plan
        </text>
        {plan?.steps.map((s, i) => {
          const look = lookOf(s, i, plan.current);
          const cy = rowTop + i * B.rowH + B.rowH / 2;
          const cx = B.padX + B.badge / 2;
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={B.badge / 2 - 0.75} fill={look.badgeFill} stroke={look.badgeStroke} strokeWidth={1.5} />
              {s.done ? (
                <path d={CHECK_PATH} transform={`translate(${cx - 11}, ${cy - 11})`} stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              ) : (
                <text x={cx} y={cy + 4.5} textAnchor="middle" fontSize={13} fontWeight={700} fill={look.number}>
                  {i + 1}
                </text>
              )}
              <text x={B.padX + B.badge + B.badgeGap} y={cy + 6} fontSize={B.px} fontWeight={look.weight} fill={look.label}>
                {s.label}
              </text>
            </g>
          );
        })}
      </g>
    );
  }
}
