"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Group, Range, Segmented, Swatch, Toggle, TunerPanel } from "./tuner-parts";
import { asLiteral, useTuner } from "./useTuner";

export { rgba } from "./useTuner";

// A temporary instrument for the "Math only" icon wall, on the same pattern
// as the line tuner and the hero's shader tuner: Mateo tunes visual constants
// himself when he has one, and his tuned values have beaten guesses every time.
//
// Open it with Shift+T, ?topics in the URL, or a double-click on the wall. It
// only exists in development or on a build loaded with ?tune or ?topics.
// Settings save to this browser only; Copy returns a `TOPIC_WALL_DEFAULT`
// literal to paste over the one below, which makes a setting the shipped one.

export type Edge = "none" | "solid" | "dashed";
export type Marks = "none" | "ticks" | "nodes";
export type Frame = "hard" | "fade";

export type TopicWall = {
  rows: number;
  tile: number;
  icon: number;
  stroke: number;
  gap: number;
  rowGap: number;
  radius: number;
  /** One grid: no gaps, tiles share their hairlines, the page's grid in miniature. */
  seamless: boolean;
  fill: boolean;
  fillColor: string;
  fillAlpha: number;
  edge: Edge;
  edgeColor: string;
  edgeAlpha: number;
  marks: Marks;
  markSize: number;
  markColor: string;
  markAlpha: number;
  iconColor: string;
  travel: number;
  alternate: boolean;
  stagger: boolean;
  frame: Frame;
  fadeWidth: number;
};

// What ships: Mateo's own values from the tuner (Sept 22), the Corners look.
// No tile at all, just four ink corner ticks framing each glyph, soft edges
// fading into the rails. An untouched tuner changes nothing.
export const TOPIC_WALL_DEFAULT: TopicWall = {
  rows: 3,
  tile: 80,
  icon: 28,
  stroke: 1.75,
  gap: 15,
  rowGap: 15,
  radius: 0,
  seamless: false,
  fill: false,
  fillColor: "#3d9cff",
  fillAlpha: 0.1,
  edge: "none",
  edgeColor: "#3d9cff",
  edgeAlpha: 0.12,
  marks: "ticks",
  markSize: 14,
  markColor: "#121215",
  markAlpha: 0.35,
  iconColor: "#2f8ef7",
  travel: 220,
  alternate: true,
  stagger: true,
  frame: "fade",
  fadeWidth: 176,
};

// Starting points that each move several dials at once, toward the page's own
// language: square corners, the grid's ink, its square crossing nodes.
const PRESETS: [string, Partial<TopicWall>][] = [
  ["Tiles", { seamless: false, radius: 16, fill: true, fillAlpha: 0.1, edge: "solid", edgeColor: "#3d9cff", edgeAlpha: 0.12, marks: "none", gap: 12, rowGap: 12 }],
  ["Square", { seamless: false, radius: 0, fill: true, fillAlpha: 0.1, edge: "solid", edgeColor: "#3d9cff", edgeAlpha: 0.12, marks: "none", gap: 12, rowGap: 12 }],
  ["Corners", { seamless: false, radius: 0, fill: false, edge: "none", marks: "ticks", markSize: 10, markColor: "#121215", markAlpha: 0.35, gap: 16, rowGap: 16 }],
  ["Nodes", { seamless: false, radius: 0, fill: true, fillAlpha: 0.06, edge: "dashed", edgeColor: "#121215", edgeAlpha: 0.18, marks: "nodes", markSize: 7, markColor: "#121215", markAlpha: 0.3, gap: 16, rowGap: 16 }],
  ["Grid", { seamless: true, radius: 0, fill: false, edge: "solid", edgeColor: "#121215", edgeAlpha: 0.16, marks: "none" }],
  ["Grid + nodes", { seamless: true, radius: 0, fill: true, fillAlpha: 0.05, edge: "solid", edgeColor: "#121215", edgeAlpha: 0.14, marks: "nodes", markSize: 7, markColor: "#121215", markAlpha: 0.3 }],
];

/** The wall's settings, and the panel that edits them (null while closed). */
export function useTopicWall(): { wall: TopicWall; panel: ReactNode; openTuner: (() => void) | null } {
  const t = useTuner({ store: "chalk.topics.v1", defaults: TOPIC_WALL_DEFAULT, param: "topics", hotkey: "T" });
  const wall = t.value;
  const change = t.change;
  const set = t.set;
  const px = (v: number) => `${v}px`;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const panel = t.open ? (
    <TunerPanel
      title="Topics wall"
      hint="Shift+T toggles. Esc closes."
      at={{ x: Math.max(12, window.innerWidth - 352), y: 96 }}
      onReset={t.reset}
      onCopy={() => asLiteral("TOPIC_WALL_DEFAULT", "TopicWall", "components/landing/TopicsTuner.tsx", wall)}
      onClose={t.close}
    >
      <Group title="Presets">
        <div className="grid grid-cols-3 gap-1 pb-1">
          {PRESETS.map(([name, patch]) => (
            <button
              key={name}
              type="button"
              onClick={() => change({ ...wall, ...patch })}
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
        <Range label="Rows" value={wall.rows} min={1} max={6} step={1} format={(v) => `${v}`} onChange={(v) => set("rows", v)} />
        <Range label="Tile" value={wall.tile} min={40} max={128} step={2} format={px} onChange={(v) => set("tile", v)} />
        <Range label="Gap" value={wall.gap} min={0} max={40} step={1} format={px} disabled={wall.seamless} onChange={(v) => set("gap", v)} />
        <Range label="Row gap" value={wall.rowGap} min={0} max={48} step={1} format={px} disabled={wall.seamless} onChange={(v) => set("rowGap", v)} />
        <Toggle label="Seamless grid" checked={wall.seamless} onChange={(v) => set("seamless", v)} />
      </Group>

      <Group title="Tile">
        <Range label="Corner radius" value={wall.radius} min={0} max={40} step={1} format={px} disabled={wall.seamless} onChange={(v) => set("radius", v)} />
        <Toggle label="Fill" checked={wall.fill} onChange={(v) => set("fill", v)} />
        <Swatch label="Fill colour" value={wall.fillColor} disabled={!wall.fill} onChange={(v) => set("fillColor", v)} />
        <Range label="Fill strength" value={wall.fillAlpha} min={0} max={0.5} step={0.01} format={pct} disabled={!wall.fill} onChange={(v) => set("fillAlpha", v)} />
      </Group>

      <Group title="Edge">
        <Segmented
          value={wall.edge}
          options={[
            ["none", "None"],
            ["solid", "Solid"],
            ["dashed", "Dashed"],
          ]}
          onChange={(v) => set("edge", v)}
        />
        <Swatch label="Edge colour" value={wall.edgeColor} disabled={wall.edge === "none"} onChange={(v) => set("edgeColor", v)} />
        <Range label="Edge strength" value={wall.edgeAlpha} min={0.02} max={1} step={0.01} format={pct} disabled={wall.edge === "none"} onChange={(v) => set("edgeAlpha", v)} />
      </Group>

      <Group title="Corner marks">
        <Segmented
          value={wall.marks}
          options={[
            ["none", "None"],
            ["ticks", "Ticks"],
            ["nodes", "Nodes"],
          ]}
          onChange={(v) => set("marks", v)}
        />
        <Range label="Size" value={wall.markSize} min={3} max={24} step={1} format={px} disabled={wall.marks === "none"} onChange={(v) => set("markSize", v)} />
        <Swatch label="Colour" value={wall.markColor} disabled={wall.marks === "none"} onChange={(v) => set("markColor", v)} />
        <Range label="Strength" value={wall.markAlpha} min={0.05} max={1} step={0.01} format={pct} disabled={wall.marks === "none"} onChange={(v) => set("markAlpha", v)} />
      </Group>

      <Group title="Icon">
        <Range label="Size" value={wall.icon} min={12} max={56} step={1} format={px} onChange={(v) => set("icon", v)} />
        <Range label="Stroke" value={wall.stroke} min={0.75} max={3} step={0.25} format={(v) => v.toFixed(2)} onChange={(v) => set("stroke", v)} />
        <Swatch label="Colour" value={wall.iconColor} onChange={(v) => set("iconColor", v)} />
      </Group>

      <Group title="Motion">
        <Range label="Travel" value={wall.travel} min={0} max={600} step={10} format={px} onChange={(v) => set("travel", v)} />
        <Toggle label="Alternate direction" checked={wall.alternate} onChange={(v) => set("alternate", v)} />
        <Toggle label="Stagger rows" checked={wall.stagger} onChange={(v) => set("stagger", v)} />
      </Group>

      <Group title="Frame">
        <Segmented
          value={wall.frame}
          options={[
            ["hard", "Cut at rails"],
            ["fade", "Fade out"],
          ]}
          onChange={(v) => set("frame", v)}
        />
        <Range label="Fade width" value={wall.fadeWidth} min={16} max={320} step={8} format={px} disabled={wall.frame !== "fade"} onChange={(v) => set("fadeWidth", v)} />
      </Group>
    </TunerPanel>
  ) : null;

  return { wall, panel, openTuner: t.openTuner };
}
