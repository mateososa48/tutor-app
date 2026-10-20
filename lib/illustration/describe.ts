// A scene read back in plain words (Oct 19 2026), for the illustrator's check:
// after it writes a scene, it gets this inventory and the request, and either
// answers OK or sends a corrected scene. The test bench showed most remaining
// failures were instructions not followed (jars left empty when the request
// said shared into them, a tip never shaded, plates without their counts),
// which a reader of the inventory can see at once, with no image needed.

import type { Scene, SceneNode } from "./scene";

const q = (s: string | undefined) => (s ? `"${s}"` : "");

function describe(node: SceneNode | undefined, depth = 0): string[] {
  if (!node) return [];
  const pad = "  ".repeat(depth);
  const id = "id" in node && node.id ? ` [${node.id}]` : "";
  switch (node.type) {
    case "row":
    case "column": {
      const kids = (node.children ?? []).flatMap((c) => describe(c, depth + 1));
      return [`${pad}${node.type === "row" ? "side by side" : "one above another"}${id}:`, ...kids];
    }
    case "items":
      return [`${pad}${node.count} ${node.color ? `${node.color} ` : ""}${node.icon}${node.fill !== undefined ? ` filled ${node.fill}` : ""}${node.per_row ? `, ${node.per_row} to a row` : ""}${node.crossed ? `, last ${node.crossed} crossed out` : ""}${node.highlight ? `, first ${node.highlight} highlighted` : ""}${id}`];
    case "icon":
      return [`${pad}1 ${node.color ? `${node.color} ` : ""}${node.icon}${node.fill !== undefined ? ` filled ${node.fill}` : ""}${id}`];
    case "container": {
      const inside = describe(node.child, depth + 1).filter((l) => !/^\s*(gap|space)$/.test(l));
      const empty = !node.child || node.child.type === "spacer";
      return [`${pad}${node.shape} ${q(node.label)}${id}${empty ? " (empty)" : " holding:"}`, ...(empty ? [] : inside)];
    }
    case "label":
      return [`${pad}text ${q(node.text)}${id}`];
    case "bar": {
      const parts = node.parts ?? [];
      const amt = (p: (typeof parts)[number], i: number) =>
        typeof node.shaded === "number" ? Math.max(0, Math.min(1, node.shaded - i)) : p.shade === true ? 1 : typeof p.shade === "number" ? Math.max(0, Math.min(1, p.shade)) : 0;
      const sum = parts.reduce((s, p, i) => s + amt(p, i), 0);
      const shaded = parts.map((p, i) => (amt(p, i) === 1 ? `${i + 1}` : amt(p, i) > 0 ? `${amt(p, i)} of ${i + 1}` : "")).filter(Boolean);
      const labels = parts.map((p) => p.label).filter(Boolean);
      return [`${pad}bar of ${parts.length} parts${node.unit ? ` (unit ${node.unit})` : ""}${node.total_label ? `, whole labelled ${q(node.total_label)}` : ""}${labels.length ? `, parts labelled ${labels.map((l) => q(l)).join(" ")}` : ""}, shaded: ${sum ? `${Math.round(sum * 100) / 100} parts in all (${shaded.join(", ")})` : "none"}${id}`];
    }
    case "grid":
      return [`${pad}grid ${node.rows} rows by ${node.cols} columns${node.shaded ? `, ${node.shaded} shaded` : ""}${node.top_label ? `, top ${q(node.top_label)}` : ""}${node.side_label ? `, side ${q(node.side_label)}` : ""}${id}`];
    case "pie":
      return [`${pad}${node.style === "pizza" ? "pizza" : "circle"} cut into ${node.slices} equal slices${node.shaded ? `, ${node.shaded} shaded` : ""}${node.colors?.length ? `, coloured ${node.colors.join(", ")}` : ""}${node.label ? `, labelled ${q(node.label)}` : ""}${id}`];
    case "balance":
      return [`${pad}balance${id}${node.tilt ? (node.tilt < 0 ? ", left down" : ", right down") : ", level"}; left pan:`, ...describe(node.left, depth + 1), `${pad}right pan:`, ...describe(node.right, depth + 1)];
    case "axis":
      return [
        `${pad}${node.orientation === "vertical" ? "vertical" : "horizontal"} number line from ${node.min} to ${node.max}${node.unit ? ` (${node.unit})` : ""}${id}`,
        ...(node.marks ?? []).map((m) => `${pad}  mark at ${m.at}${m.icon ? ` with ${m.icon}` : ""}${m.label ? ` labelled ${q(m.label)}` : ""}`),
        ...(node.moves ?? []).map((m) => `${pad}  arrow from ${m.from} to ${m.to}${m.label ? ` labelled ${q(m.label)}` : ""}`),
        ...(node.hide?.length ? [`${pad}  numbers not shown at: ${node.hide.join(", ")}`] : []),
      ];
    case "bundles":
      return [`${pad}${node.bundles} bundles of ${node.size ?? 10} sticks and ${node.loose ?? 0} loose sticks${id}`];
    case "lineup":
      return [`${pad}${(node.values ?? []).length} ${node.icon ?? "kid"} figures as tall as ${(node.values ?? []).join(", ")}${node.labels?.length ? `, labelled ${node.labels.map((l) => q(l)).join(" ")}` : ""}${id}`];
    case "pictograph":
      return [`${pad}picture graph${id}:`, ...(node.rows ?? []).map((r) => `${pad}  row ${q(r.label)}: ${r.count} ${r.color ? `${r.color} ` : ""}${r.icon}`)];
    case "spacer":
      return [];
    default:
      return [`${pad}${(node as { type: string }).type}${id}`];
  }
}

/** The scene as an inventory: every part, its contents, labels, brackets and arrows, and any drawing problems. */
export function describeScene(scene: Scene, problems: string[] = []): string {
  const lines = [...(scene.title ? [`title ${q(scene.title)}`] : []), ...describe(scene.root)];
  for (const b of scene.brackets ?? []) lines.push(`bracket ${q(b.label)} on the ${b.side ?? "top"} of ${(Array.isArray(b.over) ? b.over : [b.over]).join(", ")}`);
  for (const a of scene.arrows ?? []) lines.push(`arrow from ${a.from} to ${a.to}${a.label ? ` labelled ${q(a.label)}` : ""}`);
  if (problems.length) lines.push(`could not draw: ${[...new Set(problems)].slice(0, 6).join("; ")}`);
  return lines.join("\n");
}

export const CHECK_PROMPT = (inventory: string) => `This is what your scene draws, read back by the layout engine:
${inventory}

Check it against the request, point by point: every object and count asked for; what goes where (in the containers or beside them); every label the request asks for; how many parts are shaded in all; brackets over exactly the parts they name; the withheld number never written (objects to count are fine). If everything matches, reply with just OK. If anything is missing or wrong, reply with the whole corrected scene JSON and nothing else.`;
