// Which board pictures Desmos draws (Sept 17 2026). Shared by the server
// (tool declarations) and the browser (the board), so every name below is a
// NEXT_PUBLIC_ variable read in full, which Next inlines into client code.
//
// NEXT_PUBLIC_DESMOS_TOOLS lists the pictures rebuilt on Desmos: "all",
// "none", or names ("add_number_line,draw_bar_chart,draw_figure"). Unset,
// every build draws them all on Desmos: Mateo compared them with the vector
// versions on Sept 17 2026 and chose Desmos ("desmos looks good"). Set it to
// "none" to go back. Graphs (add_function_graph, plot_points) use Desmos
// whenever it is here, and nothing uses it without a key.

/** Pictures that have a Desmos version and a vector version. */
export const DESMOS_PICTURE_TOOLS = ["add_number_line", "draw_bar_chart", "draw_figure"] as const;

/** Tools that only exist on Desmos: not offered without it. */
export const DESMOS_ONLY_TOOLS: ReadonlySet<string> = new Set(["draw_desmos", "draw_data_plot"]);

/** Whether this build can load Desmos at all (a key, or development's demo key). */
export function desmosConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_DESMOS_API_KEY?.trim()) || process.env.NODE_ENV !== "production";
}

/**
 * The pictures to draw on Desmos. `override` is a development URL switch
 * (?desmostools=none) for side-by-side screenshots.
 */
export function desmosPictureTools(setting: string | undefined = process.env.NEXT_PUBLIC_DESMOS_TOOLS, override?: string | null): Set<string> {
  const raw = (override ?? setting)?.trim().toLowerCase();
  if (raw === undefined || raw === "") return new Set(DESMOS_PICTURE_TOOLS);
  if (raw === "all") return new Set(DESMOS_PICTURE_TOOLS);
  if (raw === "none") return new Set();
  const known = new Set<string>(DESMOS_PICTURE_TOOLS);
  return new Set(raw.split(/[\s,]+/).filter((name) => known.has(name)));
}
