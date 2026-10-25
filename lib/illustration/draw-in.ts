// A picture drawn as a hand would draw it (Oct 24 2026). Mateo: when a picture
// goes up it "shouldn't just appear or be swiped into existence… it should
// look like it's being drawn". The board's writing queue gives each picture a
// `reveal` from 0 to 1 (the same clock the pen follows); this turns that one
// number into a drawing:
//   - every outline is traced along its own path (pathLength 1 and a dash
//     offset, so no length has to be measured), and its fill comes in just
//     after its outline closes;
//   - shapes with no outline (an emoji's coloured patches, a highlight) and
//     the words fade in, in their turn;
//   - in document order, which is the order the scene draws in: the
//     containers and the balance before what sits in them.
// Each piece gets a short window of the whole, overlapping the next, so a
// picture of 300 pieces still finishes on time. At 1 every inline style comes
// off and the SVG is exactly as rendered.

export type DrawItem = {
  el: SVGElement;
  /** Traced along its path (it has a visible stroke), or faded in. */
  trace: boolean;
  /** Its own opacity, to fade back up to. */
  opacity: number;
  hasFill: boolean;
  start: number;
  span: number;
};

const SHAPES = "path,line,polyline,polygon,rect,circle,ellipse,text";

/** The window piece `i` of `n` is drawn in, as fractions of the whole reveal. Pure. */
export function drawWindow(i: number, n: number): { start: number; span: number } {
  if (n <= 1) return { start: 0, span: 1 };
  // A short stroke at a time, overlapping: four pieces in flight at once at most.
  const span = Math.min(0.5, Math.max(0.08, 4 / n));
  return { start: (i / (n - 1)) * (1 - span), span };
}

/** How far piece `start`/`span` has got at overall progress `t` (0..1). Pure. */
export function localProgress(t: number, start: number, span: number): number {
  if (t <= start) return 0;
  if (t >= start + span) return 1;
  // Ease out: a stroke starts quick and settles, as a hand does.
  const x = (t - start) / span;
  return 1 - (1 - x) * (1 - x);
}

function attr(el: Element, name: string): string | null {
  for (let node: Element | null = el; node && node.tagName.toLowerCase() !== "svg"; node = node.parentElement) {
    const v = node.getAttribute(name);
    if (v !== null) return v;
  }
  return null;
}

/** The pieces of the picture inside `host`, in drawing order. */
export function drawPlan(host: Element): DrawItem[] {
  const els = Array.from(host.querySelectorAll(SHAPES)) as SVGElement[];
  return els.map((el, i) => {
    const stroke = attr(el, "stroke");
    const tag = el.tagName.toLowerCase();
    // Words, and the white halo drawn behind them, fade in rather than trace.
    const trace = tag !== "text" && Boolean(stroke) && stroke !== "none" && stroke !== "#ffffff" && !attr(el, "stroke-dasharray") && Number(attr(el, "stroke-width") ?? "1") > 0;
    const fill = attr(el, "fill");
    const { start, span } = drawWindow(i, els.length);
    return { el, trace, opacity: Number(el.getAttribute("opacity") ?? "1"), hasFill: fill !== "none", start, span };
  });
}

/** Show the picture at overall progress `t`. */
export function drawProgress(items: DrawItem[], t: number): void {
  for (const it of items) {
    const s = it.el.style;
    if (t >= 1) {
      s.removeProperty("stroke-dasharray");
      s.removeProperty("stroke-dashoffset");
      s.removeProperty("fill-opacity");
      s.removeProperty("opacity");
      if (it.trace) it.el.removeAttribute("pathLength");
      continue;
    }
    const q = localProgress(t, it.start, it.span);
    if (it.trace) {
      it.el.setAttribute("pathLength", "1");
      // Dash 1 and gap 2 over a length of 1: the offset slides the dash on.
      s.strokeDasharray = "1 2";
      const traced = Math.min(1, q / 0.7);
      s.strokeDashoffset = String(1 - traced);
      if (it.hasFill) s.fillOpacity = String(Math.max(0, (q - 0.55) / 0.45));
      s.opacity = q > 0 ? String(it.opacity) : "0";
    } else {
      s.opacity = String(q * it.opacity);
    }
  }
}
