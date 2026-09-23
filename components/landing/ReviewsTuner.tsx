"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Group, Range, Segmented, Swatch, Toggle, TunerPanel } from "./tuner-parts";
import { asLiteral, useTuner } from "./useTuner";

// A temporary instrument for the Reviews section, on the pattern of the topics
// wall and the line tuner. Open it with Shift+R, ?reviews in the URL, or a
// double-click on the wall; development only, or a build loaded with ?tune or
// ?reviews. Copy returns a `REVIEWS_DEFAULT` literal to paste over the one
// below, which makes the look the shipped one.

export type Layout = "columns" | "rows" | "grid";
export type Width = "container" | "rails";
export type Edge = "none" | "solid" | "dashed";
export type Marks = "none" | "ticks" | "nodes";
export type QuoteMark = "none" | "inline" | "big";
export type Highlight = "marker" | "underline" | "ink" | "bold" | "none";
export type Avatar = "circle" | "square" | "none";
export type Font = "body" | "display";
export type Align = "left" | "center";

export type ReviewsLook = {
  layout: Layout;
  columns: number;
  rows: number;
  height: number;
  cardWidth: number;
  gap: number;
  width: Width;
  speed: number;
  alternate: boolean;
  hoverPause: boolean;
  fade: number;
  fillColor: string;
  fillAlpha: number;
  edge: Edge;
  edgeColor: string;
  edgeAlpha: number;
  radius: number;
  marks: Marks;
  markSize: number;
  markColor: string;
  markAlpha: number;
  shadow: number;
  padding: number;
  align: Align;
  font: Font;
  textSize: number;
  quoteMark: QuoteMark;
  highlight: Highlight;
  highlightColor: string;
  highlightAlpha: number;
  stars: boolean;
  starColor: string;
  starSize: number;
  avatar: Avatar;
};

// What ships: Mateo's own values from the tuner (Sept 22). No card at all,
// just the corner ticks the topics wall uses, so the two sections read as one
// system, with the key words in bold rather than the highlighter. An untouched
// tuner changes nothing.
export const REVIEWS_DEFAULT: ReviewsLook = {
  layout: "columns",
  columns: 3,
  rows: 2,
  height: 620,
  cardWidth: 340,
  gap: 20,
  width: "container",
  speed: 20,
  alternate: true,
  hoverPause: true,
  fade: 11,
  fillColor: "#ffffff",
  fillAlpha: 0,
  edge: "none",
  edgeColor: "#121215",
  edgeAlpha: 0.09,
  radius: 0,
  marks: "ticks",
  markSize: 18,
  markColor: "#121215",
  markAlpha: 0.35,
  shadow: 0,
  padding: 21,
  align: "left",
  font: "body",
  textSize: 15,
  quoteMark: "inline",
  highlight: "bold",
  highlightColor: "#3d9cff",
  highlightAlpha: 0.26,
  stars: true,
  starColor: "#f0b429",
  starSize: 15,
  avatar: "circle",
};

const INK = "#121215";

// Starting points that move several dials at once. "Corners" is the look Mateo
// shipped on the topics wall the same day, so the two sections can match.
const PRESETS: [string, Partial<ReviewsLook>][] = [
  ["Current", REVIEWS_DEFAULT],
  // The Sept 21 look this replaced: white rounded cards with the highlighter.
  ["Cards", { fillColor: "#ffffff", fillAlpha: 1, edge: "solid", edgeColor: INK, edgeAlpha: 0.09, radius: 16, marks: "none", padding: 20, highlight: "marker" }],
  ["Corners", { fillAlpha: 0, edge: "none", radius: 0, marks: "ticks", markSize: 14, markColor: INK, markAlpha: 0.35, shadow: 0, padding: 24 }],
  ["Grid", { fillColor: "#ffffff", fillAlpha: 0.6, edge: "dashed", edgeColor: INK, edgeAlpha: 0.2, radius: 0, marks: "nodes", markSize: 7, markColor: INK, markAlpha: 0.3, shadow: 0 }],
  ["Tinted", { fillColor: "#3d9cff", fillAlpha: 0.06, edge: "solid", edgeColor: "#3d9cff", edgeAlpha: 0.14, radius: 16, marks: "none", shadow: 0 }],
  ["Lifted", { fillColor: "#ffffff", fillAlpha: 1, edge: "solid", edgeColor: INK, edgeAlpha: 0.06, radius: 20, marks: "none", shadow: 0.8 }],
  ["Minimal", { fillAlpha: 0, edge: "none", marks: "none", radius: 0, stars: false, avatar: "none", quoteMark: "big", padding: 8, shadow: 0 }],
  ["Big quotes", { columns: 2, font: "display", textSize: 21, quoteMark: "big", stars: false, padding: 28, highlight: "ink" }],
  ["Marquee", { layout: "rows", rows: 2, cardWidth: 360, fade: 12 }],
  ["Still grid", { layout: "grid", columns: 3 }],
];

/** The section's look, and the panel that edits it (null while closed). */
export function useReviewsLook(): { look: ReviewsLook; panel: ReactNode; openTuner: (() => void) | null } {
  const t = useTuner({ store: "chalk.reviews.v1", defaults: REVIEWS_DEFAULT, param: "reviews", hotkey: "R" });
  const v = t.value;
  const set = t.set;
  const px = (n: number) => `${n}px`;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const none = (x: string) => x === "none";

  const panel = t.open ? (
    <TunerPanel
      title="Reviews"
      hint="Shift+R toggles. Esc closes."
      at={{ x: Math.max(12, window.innerWidth - 352), y: 96 }}
      onReset={t.reset}
      onCopy={() => asLiteral("REVIEWS_DEFAULT", "ReviewsLook", "components/landing/ReviewsTuner.tsx", v)}
      onClose={t.close}
    >
      <Group title="Presets">
        <div className="grid grid-cols-3 gap-1 pb-1">
          {PRESETS.map(([name, patch]) => (
            <button
              key={name}
              type="button"
              onClick={() => t.change({ ...v, ...patch })}
              className={cn(
                "h-7 cursor-pointer rounded-[7px] bg-(--lp-ink)/[0.06] text-[12px] font-medium text-(--lp-ink-2) outline-none transition-colors duration-150",
                "hover:bg-white hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
              )}
            >
              {name}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Layout">
        <Segmented
          value={v.layout}
          options={[
            ["columns", "Columns"],
            ["rows", "Rows"],
            ["grid", "Still"],
          ]}
          onChange={(x) => set("layout", x)}
        />
        <Range label="Columns" value={v.columns} min={1} max={4} step={1} format={(n) => `${n}`} disabled={v.layout === "rows"} onChange={(n) => set("columns", n)} />
        <Range label="Rows" value={v.rows} min={1} max={3} step={1} format={(n) => `${n}`} disabled={v.layout !== "rows"} onChange={(n) => set("rows", n)} />
        <Range label="Height" value={v.height} min={320} max={900} step={10} format={px} disabled={v.layout !== "columns"} onChange={(n) => set("height", n)} />
        <Range label="Card width" value={v.cardWidth} min={240} max={520} step={10} format={px} disabled={v.layout !== "rows"} onChange={(n) => set("cardWidth", n)} />
        <Range label="Gap" value={v.gap} min={0} max={48} step={1} format={px} onChange={(n) => set("gap", n)} />
        <Segmented
          value={v.width}
          options={[
            ["container", "Container"],
            ["rails", "Rail to rail"],
          ]}
          onChange={(x) => set("width", x)}
        />
      </Group>

      <Group title="Motion">
        <Range label="Speed" value={v.speed} min={0} max={80} step={1} format={(n) => `${n}px/s`} disabled={v.layout === "grid"} onChange={(n) => set("speed", n)} />
        <Toggle label="Alternate direction" checked={v.alternate} onChange={(x) => set("alternate", x)} />
        <Toggle label="Pause on hover" checked={v.hoverPause} onChange={(x) => set("hoverPause", x)} />
        <Range label="Edge fade" value={v.fade} min={0} max={30} step={1} format={(n) => `${n}%`} disabled={v.layout === "grid"} onChange={(n) => set("fade", n)} />
      </Group>

      <Group title="Card">
        <Swatch label="Fill" value={v.fillColor} onChange={(x) => set("fillColor", x)} />
        <Range label="Fill strength" value={v.fillAlpha} min={0} max={1} step={0.01} format={pct} onChange={(n) => set("fillAlpha", n)} />
        <Range label="Corner radius" value={v.radius} min={0} max={32} step={1} format={px} onChange={(n) => set("radius", n)} />
        <Range label="Padding" value={v.padding} min={4} max={44} step={1} format={px} onChange={(n) => set("padding", n)} />
        <Range label="Shadow" value={v.shadow} min={0} max={1} step={0.05} format={pct} onChange={(n) => set("shadow", n)} />
      </Group>

      <Group title="Edge">
        <Segmented
          value={v.edge}
          options={[
            ["none", "None"],
            ["solid", "Solid"],
            ["dashed", "Dashed"],
          ]}
          onChange={(x) => set("edge", x)}
        />
        <Swatch label="Colour" value={v.edgeColor} disabled={none(v.edge)} onChange={(x) => set("edgeColor", x)} />
        <Range label="Strength" value={v.edgeAlpha} min={0.02} max={1} step={0.01} format={pct} disabled={none(v.edge)} onChange={(n) => set("edgeAlpha", n)} />
      </Group>

      <Group title="Corner marks">
        <Segmented
          value={v.marks}
          options={[
            ["none", "None"],
            ["ticks", "Ticks"],
            ["nodes", "Nodes"],
          ]}
          onChange={(x) => set("marks", x)}
        />
        <Range label="Size" value={v.markSize} min={3} max={28} step={1} format={px} disabled={none(v.marks)} onChange={(n) => set("markSize", n)} />
        <Swatch label="Colour" value={v.markColor} disabled={none(v.marks)} onChange={(x) => set("markColor", x)} />
        <Range label="Strength" value={v.markAlpha} min={0.05} max={1} step={0.01} format={pct} disabled={none(v.marks)} onChange={(n) => set("markAlpha", n)} />
      </Group>

      <Group title="Text">
        <Segmented
          value={v.font}
          options={[
            ["body", "Body face"],
            ["display", "Display face"],
          ]}
          onChange={(x) => set("font", x)}
        />
        <Range label="Size" value={v.textSize} min={13} max={28} step={0.5} format={px} onChange={(n) => set("textSize", n)} />
        <Segmented
          value={v.align}
          options={[
            ["left", "Left"],
            ["center", "Centre"],
          ]}
          onChange={(x) => set("align", x)}
        />
        <Segmented
          value={v.quoteMark}
          options={[
            ["none", "No quotes"],
            ["inline", "Inline"],
            ["big", "Big mark"],
          ]}
          onChange={(x) => set("quoteMark", x)}
        />
      </Group>

      <Group title="Highlighted words">
        <Segmented
          value={v.highlight}
          options={[
            ["marker", "Marker"],
            ["underline", "Line"],
            ["ink", "Blue"],
            ["bold", "Bold"],
            ["none", "None"],
          ]}
          onChange={(x) => set("highlight", x)}
        />
        <Swatch label="Colour" value={v.highlightColor} disabled={v.highlight === "none" || v.highlight === "bold"} onChange={(x) => set("highlightColor", x)} />
        <Range label="Strength" value={v.highlightAlpha} min={0.05} max={1} step={0.01} format={pct} disabled={v.highlight !== "marker"} onChange={(n) => set("highlightAlpha", n)} />
      </Group>

      <Group title="Stars and person">
        <Toggle label="Stars" checked={v.stars} onChange={(x) => set("stars", x)} />
        <Swatch label="Star colour" value={v.starColor} disabled={!v.stars} onChange={(x) => set("starColor", x)} />
        <Range label="Star size" value={v.starSize} min={10} max={24} step={1} format={px} disabled={!v.stars} onChange={(n) => set("starSize", n)} />
        <Segmented
          value={v.avatar}
          options={[
            ["circle", "Circle"],
            ["square", "Square"],
            ["none", "No avatar"],
          ]}
          onChange={(x) => set("avatar", x)}
        />
      </Group>
    </TunerPanel>
  ) : null;

  return { look: v, panel, openTuner: t.openTuner };
}
