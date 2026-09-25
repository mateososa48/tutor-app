// The session plan, written on the board (Sept 24 2026).
//
// Like a tutor's "Math plan for tonight": after the opening the tutor says a
// two-to-four step plan in one breath ("what fractions are, then adding
// them, then practice"), and the board writes it as one quiet row at the top
// of every page. Each step gets a green check once a checked right answer
// finishes a problem in it, so the student can see how far they have come.
//
// Pure: parsing the tutor's plan string, the state after start_problem and
// after a right answer, the line the tutor reads back, and the row's layout.
// TldrawCore measures the labels and draws what this says.

export type PlanStep = { label: string; done: boolean };

export type BoardPlan = {
  steps: PlanStep[];
  /** The step the page belongs to, 1-based: the last `step` given (1 until then). */
  current: number;
};

export const PLAN_MAX_STEPS = 4;
export const PLAN_LABEL_MAX = 32;

/** A label cut to at most PLAN_LABEL_MAX characters, at a word when it can be. */
function clampLabel(label: string): string {
  if (label.length <= PLAN_LABEL_MAX) return label;
  const cut = label.slice(0, PLAN_LABEL_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space >= 16 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, "")}…`;
}

/**
 * The tutor's plan as step labels: "What fractions are | Adding them | Practice"
 * (or an array). Numbering the model adds ("1. ", "Step 2:") is dropped, each
 * label is trimmed and cut to PLAN_LABEL_MAX, and steps past PLAN_MAX_STEPS
 * are dropped and counted. Null when nothing usable is left.
 */
export function parsePlan(input: unknown): { steps: string[]; dropped: number } | null {
  const raw = Array.isArray(input)
    ? input.map((v) => (typeof v === "string" ? v : v == null ? "" : String(v)))
    : typeof input === "string"
      ? input.split(/\s*\|\s*|\n+/)
      : [];
  const labels = raw
    .map((s) =>
      s
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^(?:step\s*)?\d+\s*[.):-]?\s+/i, "")
        .replace(/^[-•*]\s+/, "")
        .replace(/[.;,]+$/, "")
        .trim(),
    )
    .filter((s) => /[\p{L}\p{N}]/u.test(s))
    .map((s) => clampLabel(s.charAt(0).toUpperCase() + s.slice(1)));
  if (labels.length === 0) return null;
  return { steps: labels.slice(0, PLAN_MAX_STEPS), dropped: Math.max(0, labels.length - PLAN_MAX_STEPS) };
}

const same = (a: string, b: string) => a.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") === b.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** True when `step` names a step of a plan with `count` steps. */
export function validStep(step: unknown, count: number): step is number {
  return typeof step === "number" && Number.isInteger(step) && step >= 1 && step <= count;
}

/**
 * The plan after start_problem. A new plan replaces the old one (a step with
 * the same words keeps its check); `step` moves the page to that step and
 * checks every step before it. A step out of range is ignored (`ignoredStep`).
 */
export function planAfterStart(prev: BoardPlan | null, labels: string[] | null | undefined, step?: number): { plan: BoardPlan | null; ignoredStep: boolean } {
  let plan: BoardPlan | null = prev;
  if (labels && labels.length > 0) {
    const steps = labels.slice(0, PLAN_MAX_STEPS).map((label) => ({ label, done: Boolean(prev?.steps.some((s) => s.done && same(s.label, label))) }));
    const firstOpen = steps.findIndex((s) => !s.done);
    plan = { steps, current: firstOpen < 0 ? steps.length : firstOpen + 1 };
  }
  if (step === undefined) return { plan, ignoredStep: false };
  if (!plan || !validStep(step, plan.steps.length)) return { plan, ignoredStep: true };
  return {
    plan: { steps: plan.steps.map((s, i) => (i < step - 1 ? { ...s, done: true } : s)), current: step },
    ignoredStep: false,
  };
}

/** The plan once a problem in the current step was answered right: that step is checked. */
export function planAfterCorrect(plan: BoardPlan | null): { plan: BoardPlan | null; changed: boolean } {
  if (!plan) return { plan, changed: false };
  const i = plan.current - 1;
  if (!plan.steps[i] || plan.steps[i].done) return { plan, changed: false };
  return { plan: { ...plan, steps: plan.steps.map((s, k) => (k === i ? { ...s, done: true } : s)) }, changed: true };
}

/** How the tutor reads it back: "Plan: ✓1 What fractions are · 2 Adding them (now) · 3 Practice". */
export function planSummary(plan: BoardPlan | null): string {
  if (!plan || plan.steps.length === 0) return "";
  const parts = plan.steps.map((s, i) => `${s.done ? "✓" : ""}${i + 1} ${s.label}${i + 1 === plan.current && !s.done ? " (now)" : ""}`);
  return `Plan: ${parts.join(" · ")}`;
}

/** The note on start_problem's result: "Plan: 3 steps, now on 1." */
export function planNote(plan: BoardPlan | null): string {
  if (!plan) return "";
  const n = plan.steps.length;
  return `Plan: ${n} step${n === 1 ? "" : "s"}, now on ${plan.current}.`;
}

/** A plan read back from a saved board, or null when it is not one. */
export function readPlan(value: unknown): BoardPlan | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { steps?: unknown; current?: unknown };
  if (!Array.isArray(v.steps)) return null;
  const steps = v.steps
    .filter((s): s is { label: string; done?: unknown } => Boolean(s) && typeof (s as { label?: unknown }).label === "string")
    .slice(0, PLAN_MAX_STEPS)
    .map((s) => ({ label: s.label, done: s.done === true }));
  if (steps.length === 0) return null;
  const current = validStep(v.current, steps.length) ? v.current : 1;
  return { steps, current };
}

// ── The row ─────────────────────────────────────────────────────────────────

export type PlanRowOptions = {
  /** The width the row may take (the page's writing width). */
  maxW: number;
  /** The width of the "Plan" label at the row's start (0: none). */
  lead: number;
  /** Space after the lead label. */
  leadGap: number;
  /** Space between two steps (a separator dot sits in its middle). */
  gap: number;
  /** One line's height. */
  lineH: number;
  /** Space between two lines when the row wraps. */
  lineGap: number;
};

export type PlanRowLayout = {
  /** Each step's top-left corner, relative to the row's. */
  pos: Array<{ x: number; y: number }>;
  /** Separator dots between steps on the same line: the centre x and the line's top. */
  dots: Array<{ x: number; y: number }>;
  w: number;
  h: number;
  lines: number;
};

/**
 * Where each step goes, given its measured width: one line after the lead
 * label while it fits, else the next line, starting under the first step (or
 * at the row's left edge when a step would not fit beside the lead). Text is
 * never shrunk: a step wider than the row starts its own line and runs over.
 */
export function layoutPlanRow(widths: number[], o: PlanRowOptions): PlanRowLayout {
  const start = o.lead > 0 ? o.lead + o.leadGap : 0;
  const widest = widths.length > 0 ? Math.max(...widths) : 0;
  const indent = start + widest <= o.maxW ? start : 0;
  const pos: PlanRowLayout["pos"] = [];
  const dots: PlanRowLayout["dots"] = [];
  let x = start;
  let line = 0;
  let right = start;
  const top = (l: number) => l * (o.lineH + o.lineGap);
  widths.forEach((w, i) => {
    if (i === 0) {
      // The first step goes beside the lead, or on the next line when it cannot.
      if (start > 0 && start + w > o.maxW + 0.5) {
        line = 1;
        x = 0;
      } else {
        x = start;
      }
    } else if (x + o.gap + w > o.maxW + 0.5) {
      line++;
      x = indent;
    } else {
      dots.push({ x: x + o.gap / 2, y: top(line) });
      x += o.gap;
    }
    const y = top(line);
    pos.push({ x, y });
    x += w;
    right = Math.max(right, x);
  });
  const lines = line + 1;
  return { pos, dots, w: Math.ceil(right), h: lines * o.lineH + (lines - 1) * o.lineGap, lines };
}
