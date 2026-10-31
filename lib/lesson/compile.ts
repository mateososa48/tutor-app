// Board intents compiled into exact drawings (Oct 31 2026, Plan B B5/B6).
// The model says what it wants up ("the step −7 under both sides giving
// 3x = ?", "the 12 by 5 triangle in its rectangle"); this module builds the
// spec, checks it (a step keeps the equation's solutions, a figure's sizes are
// the problem's own facts, a graph grows on the one already up), renders it,
// and returns the ops the page applies as they are. Anything wrong comes back
// as an issue for the model to fix, never as a drawing.

import { checkStep, sameExpression, spokenToDigits } from "../answer-check";
import { describeBlocks, parseBlocks, renderBlocks } from "../board-blocks";
import { describeGroups, parseGroups, renderGroups } from "../board-groups";
import { buildPlane, describePlane, renderPlane, type PlaneSpec } from "../board-plane";
import { describeTable, mergeTable, parseTable, renderTable, sameColumns, type TableSpec } from "../board-table";
import { addLine, addStep, describeWork, fillLine, isPending, lastLine, plainMath, renderWork, startWork, type WorkSpec } from "../board-work";
import { geometryFacts, polygon, rectangle, renderGeometry, rightTriangle, type GeometrySpec } from "../board-geometry";
import { falseAssertions } from "../math-claims";
import { isTheirProblem } from "../worked-example";
import { currentProblem, offPage } from "./state";
import type { BoardIntent, BoardObject, BoardOp, LessonState, PictureKind, RenderedPicture } from "./types";

export type Compiled = { ops: BoardOp[]; objects: BoardObject[]; issues: string[]; notes: string[] };

/** The numbers in a line, in digits ("twenty" counts as 20). */
function numbersIn(text: string): string[] {
  return (spokenToDigits(text.replace(/[−–]/g, "-")).match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) ?? []).map((n) => n.replace(/^-0$/, "0"));
}

/**
 * Math spelled out in words ("one half times 12 times 5"): the working column
 * is math, not sentences; it rendered as "onehalftimes12times5" on Oct 31.
 */
/** Words in a line beyond a label: the working is math; sentences belong in speech ("first red : 3/5 of all"). */
export function wordyLine(text: string): boolean {
  // Formula words are fine ("Area = 1/2 × base × height"); sentences are not,
  // and they show in their small words ("both red = 3/5 of the time, then…").
  const small = (text.match(/\b(?:the|of|then|those|these|is|are|a|an|to|for|with|that|this|it|we|you|when|if|each|time|times?)\b/gi) ?? []).length;
  return small >= 2;
}

export function spelledMath(text: string): boolean {
  return (text.match(/\b(?:times|plus|minus|divided|over|half|halves|third|quarter|equals|squared|cubed)\b/gi) ?? []).length >= 1 && !/^\s*\w+\s*$/.test(text);
}

const workSid = (problemId: string | null) => `work:${problemId ?? "none"}`;

/** The board object a ref names: "work" (this problem's working), "work.L2", "fig1.diagonal", "graph1". */
export function resolveRef(s: LessonState, objects: BoardObject[], ref: string): { obj: BoardObject; part: string | null } | null {
  const [head, ...rest] = ref.trim().split(".");
  const part = rest.length ? rest.join(".") : null;
  const sid = head === "work" ? workSid(s.current) : head;
  const obj = objects.find((o) => o.sid === sid) ?? s.board.find((o) => o.sid === sid);
  if (!obj) return null;
  return { obj, part };
}

function partsOf(r: RenderedPicture): string[] {
  return [...new Set([...Object.keys(r.parts), ...Object.keys(r.aliases)])];
}

/** The words and numbers a picture shows: its SVG's text, without the small numbers along a graph's axes. */
export function shownText(svg: string): string[] {
  return [...svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)]
    // Axis numbers (a plane's small ones, a number line's ticks) are the scale, not something it says.
    .filter((m) => !/font-size="11\.5"|data-tick/.test(m[1]))
    .map((m) => m[2].replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim())
    .filter(Boolean);
}

/** One operation on a side ("−7", "÷ 3", "×5", "+2"), as a rewrite of that side. */
function sideOp(op: string | undefined): ((side: string) => string) | null {
  const m = /^\s*([+\-−–×*÷/])\s*(\d+(?:\.\d+)?)\s*$/.exec(op ?? "");
  if (!m) return null;
  const n = m[2];
  const sym = m[1] === "×" ? "*" : m[1] === "÷" ? "/" : /[−–]/.test(m[1]) ? "-" : m[1];
  return (side) => `(${side}) ${sym} ${n}`;
}

/** Why the step's result is not the line above with its operations done, or null when it is (or when it cannot tell). */
function sideMismatch(above: string, result: string, left?: string, right?: string): string | null {
  const opL = sideOp(left);
  const opR = sideOp(right);
  if (!opL || !opR) return null;
  const [aL, aR] = plainMath(above).split("=");
  const [rL, rR] = plainMath(result).split("=");
  if (aR === undefined || rR === undefined) return null;
  if (sameExpression(opL(aL), rL) && sameExpression(opR(aR), rR)) return null;
  // Simplified the other way round ("15 = 3x") is still the same step.
  if (sameExpression(opL(aL), rR) && sameExpression(opR(aR), rL)) return null;
  return `doing ${left} to "${aL.trim()}" and ${right} to "${aR.trim()}" does not give "${result}"; write the line it does give, or do one operation at a time`;
}

function picture(sid: string, kind: PictureKind, problemId: string | null, spec: unknown, rendered: RenderedPicture, facts: string[], prev?: BoardObject): BoardObject {
  return { sid, kind, problemId, spec, parts: partsOf(rendered), facts, shown: shownText(rendered.svg), status: prev?.status === "applied" ? "applied" : "pending", ...(prev?.itemId ? { itemId: prev.itemId } : {}) };
}

/** A fact value by id ("F2") or a number that is one of the problem's givens. */
function sizeFrom(s: LessonState, v: number | string | undefined, what: string): { value: number; unit?: string } | { error: string } {
  const p = currentProblem(s);
  if (v === undefined || v === "") return { error: `figure needs its ${what}` };
  const byId = typeof v === "string" ? p?.givens.find((f) => f.id.toLowerCase() === v.trim().toLowerCase()) : undefined;
  if (byId) return { value: byId.value, ...(byId.unit ? { unit: byId.unit } : {}) };
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return { error: `figure ${what} "${v}" is not a number or a fact id` };
  // A problem with given sizes is drawn with those sizes and no others
  // (session o8rpq1: height 5 became 10 on the way to the picture).
  if (p && p.givens.length && !p.givens.some((f) => Math.abs(f.value - n) < 1e-9)) {
    return { error: `figure ${what} ${n} is not one of the problem's givens (${p.givens.map((f) => `${f.id} ${f.name} = ${f.value}${f.unit ? ` ${f.unit}` : ""}`).join(", ")}); use the given sizes` };
  }
  const unit = p?.givens.find((f) => Math.abs(f.value - n) < 1e-9)?.unit;
  return { value: n, ...(unit ? { unit } : {}) };
}

/** The ops and objects for one turn's intents, or the issues that stop them. */
export function compileBoard(s: LessonState, intents: BoardIntent[], opPrefix: string): Compiled {
  const ops: BoardOp[] = [];
  const objects: BoardObject[] = [];
  const issues: string[] = [];
  const notes: string[] = [];
  let n = 0;
  const opId = () => `${opPrefix}.o${++n}`;
  // A picture on a page that was turned is out of sight: the same id is drawn again, fresh.
  const latest = (sid: string) => objects.find((o) => o.sid === sid) ?? s.board.find((o) => o.sid === sid && o.status !== "failed" && !offPage(s, o));
  const put = (o: BoardObject) => {
    const at = objects.findIndex((x) => x.sid === o.sid);
    if (at >= 0) objects[at] = o;
    else objects.push(o);
  };
  const p = currentProblem(s);

  // This problem's working column: drawn the first time a step needs it.
  const work = (): { spec: WorkSpec; obj: BoardObject | undefined } => {
    const obj = latest(workSid(s.current));
    if (obj?.spec) return { spec: obj.spec as WorkSpec, obj };
    // A word problem has no first line of math: the column starts empty and
    // its first line is the first one written.
    return { spec: p?.math ? startWork(p.math) : { kind: "work", lines: [], moves: [] }, obj: undefined };
  };
  const putWork = (spec: WorkSpec, fresh: Set<string>, obj: BoardObject | undefined, label = "the working") => {
    const r = renderWork(spec, obj ? fresh : new Set());
    const o = picture(workSid(s.current), "work", s.current, spec, r, [describeWork(spec)], obj);
    put(o);
    if (obj || ops.some((x) => x.type === "draw" && x.sid === o.sid)) ops.push({ opId: opId(), type: "edit", sid: o.sid, kind: "work", spec, rendered: r, label });
    else ops.push({ opId: opId(), type: "draw", sid: o.sid, kind: "work", spec, rendered: r, label, reserveH: 160 });
  };

  for (const b of intents) {
    switch (b.do) {
      case "work_step": {
        const { spec, obj } = work();
        if (!spec.lines.length) {
          issues.push("work_step: the working has no line yet; write its first line with work_line");
          break;
        }
        const above = lastLine(spec);
        const result = b.result?.trim() || null;
        if (result && spelledMath(result)) {
          issues.push(`work_step result "${result}": write it in symbols, not words`);
          break;
        }
        // A result the tutor writes must follow from the line above.
        if (result && !/\?/.test(result) && /=/.test(above.text) && !isPending(above)) {
          const ok = checkStep(above.text, result);
          if (ok && ok.verdict === "incorrect") {
            issues.push(`work_step result "${result}" does not follow from "${above.text}": ${ok.message.split("(")[0].trim()}`);
            break;
          }
        }
        if (!b.left && !b.right && !b.note) {
          issues.push("work_step needs what is done to each side (left, right)");
          break;
        }
        // What is written under each side is what was done to it: "3x + 14 =
        // 29", then ÷3 on both sides, does not give "x = 5", though x = 5 is
        // its answer (Oct 31: that chain stayed up, checked, as the solution).
        if (result && !/\?/.test(result) && /=/.test(above.text) && !isPending(above)) {
          const bad = sideMismatch(above.text, result, b.left, b.right);
          if (bad) {
            issues.push(`work_step: ${bad}`);
            break;
          }
        }
        const r = addStep(spec, { left: b.left, right: b.right, ...(b.note ? { note: b.note } : {}), result, by: "tutor" });
        if ("error" in r) {
          issues.push(`work_step: ${r.error}`);
          break;
        }
        putWork(r.spec, r.fresh, obj);
        notes.push(`work ${r.move} under ${above.id}, giving ${r.line}`);
        break;
      }
      case "work_fill": {
        const { spec, obj } = work();
        const line = spec.lines.find((l) => l.id.toLowerCase() === b.line.toLowerCase());
        if (!line || !isPending(line)) {
          issues.push(`work_fill: ${b.line} is not a waiting line`);
          break;
        }
        // Their hand writes only what they said: the new numbers must be in
        // their newest line (Oct 31: "5h ≤ 20" written as theirs when they
        // had said "I got 4 hours… 24, which is under 23").
        const theirs = [...s.transcript].reverse().find((t) => t.role === "student")?.text ?? "";
        const had = new Set(numbersIn(line.text));
        const fresh = numbersIn(b.text).filter((n) => !had.has(n));
        const saidNums = new Set(numbersIn(theirs));
        if (fresh.some((n) => !saidNums.has(n))) {
          issues.push(`work_fill: they have not said ${fresh.filter((n) => !saidNums.has(n)).join(", ")}; ask for it (leave the line waiting), or write it yourself as a work_step if you are showing it`);
          break;
        }
        const r = fillLine(spec, line.id, b.text, "student");
        if ("error" in r) {
          issues.push(`work_fill: ${r.error}`);
          break;
        }
        putWork(r.spec, r.fresh, obj);
        break;
      }
      case "work_line": {
        const { spec, obj } = work();
        // "L3: both red = …" is the model's label for the line, not part of it.
        // "L3:" is the model's label for the line, "1." the sheet's number: neither is part of it.
        const text = b.text.replace(/^\s*L\d+(?:\s*[:.)]\s*|\s+)/i, "").replace(/^\s*(?:#|no\.?\s*)?\d{1,2}\s*[.)]\s+(?=[-−(\d a-z])/i, "");
        // A practice problem as printed ("A lemonade recipe uses 2 cups… How much
        // water goes with 10 cups?") is a statement, not working: it may go up.
        const statement = /\d/.test(text) && /\?\s*$/.test(text) && text.length <= 160;
        if (wordyLine(text) && !statement) {
          issues.push(`work_line "${text}": the working holds math, not sentences; say the words aloud and write only the math`);
          break;
        }
        // A line already in the working is not written again (Oct 31: the
        // problem appeared three times, heading included, and no work).
        const same = (x: string) => plainMath(x).replace(/\s+/g, "");
        if (spec.lines.some((l) => same(l.text) === same(text)) || (p?.math && same(p.math) === same(text) && spec.lines.length)) {
          notes.push(`"${text}" is already on the board`);
          break;
        }
        if (spelledMath(text)) {
          issues.push(`work_line "${text}": write it in symbols ("1/2 × 12 × 5"), not words; say the words aloud instead`);
          break;
        }
        const bad = falseAssertions(text);
        if (bad.length) {
          issues.push(`work_line "${text}" is false: ${bad.map((c) => c.correct).join("; ")}`);
          break;
        }
        const above = spec.lines.length ? lastLine(spec) : null;
        if (above && /=/.test(text) && /[a-z]/i.test(text) && !/\?/.test(text) && !isPending(above) && /=/.test(above.text)) {
          const ok = checkStep(above.text, text);
          if (ok && ok.verdict === "incorrect") {
            issues.push(`work_line "${text}" does not follow from "${above.text}"`);
            break;
          }
        }
        const r = addLine(spec, text, "tutor");
        putWork(r.spec, r.fresh, obj);
        break;
      }
      case "table": {
        // A title that is an id ("P1", "table1") is not a caption: the old one stays.
        const title = b.title && !/^(?:p|table|fig|graph|pic|work)\d*$/i.test(b.title.trim()) ? b.title : (latest(b.id || "table1")?.spec as TableSpec | undefined)?.title;
        const next = parseTable(b.columns, b.rows, title);
        if ("error" in next) {
          issues.push(`table: ${next.error}`);
          break;
        }
        const sid = b.id || "table1";
        const prev = latest(sid);
        if (prev?.spec && prev.kind === "table" && sameColumns(prev.spec as TableSpec, next)) {
          const m = mergeTable(prev.spec as TableSpec, next);
          if (!m.changed) break;
          const r = renderTable(m.spec, m.fresh);
          put(picture(sid, "table", s.current, m.spec, r, [describeTable(m.spec)], prev));
          ops.push({ opId: opId(), type: "edit", sid, kind: "table", spec: m.spec, rendered: r, label: `table ${describeTable(m.spec)}` });
        } else {
          if (prev && prev.kind === "table") {
            issues.push(`table ${sid} already has columns ${(prev.spec as TableSpec).columns.join(" | ")}; give a new id for a different table`);
            break;
          }
          const r = renderTable(next);
          put(picture(sid, "table", s.current, next, r, [describeTable(next)]));
          ops.push({ opId: opId(), type: "draw", sid, kind: "table", spec: next, rendered: r, label: `table ${describeTable(next)}`, reserveH: next.rows.length < 6 ? 120 : 0 });
        }
        break;
      }
      case "graph": {
        const sid = b.id || "graph1";
        const prev = latest(sid);
        const built = buildPlane(prev?.kind === "plane" && !b.new ? (prev.spec as PlaneSpec) : null, { points: b.points, lines: b.lines, arrows: b.arrows, view: b.view });
        if ("error" in built) {
          issues.push(`graph: ${built.error}`);
          break;
        }
        const old = prev?.kind === "plane" && !b.new;
        if (old && built.fresh.size === 0 && !built.rescaled) break;
        const r = renderPlane(built.spec, old ? built.fresh : new Set());
        put(picture(sid, "plane", s.current, built.spec, r, [describePlane(built.spec)], old ? prev : undefined));
        ops.push(old && prev ? { opId: opId(), type: "edit", sid, kind: "plane", spec: built.spec, rendered: r, label: `graph: ${describePlane(built.spec)}` } : { opId: opId(), type: "draw", sid, kind: "plane", spec: built.spec, rendered: r, label: `graph: ${describePlane(built.spec)}` });
        break;
      }
      case "figure": {
        // One figure a problem: a new id on a problem that has one edits it
        // (Oct 31: "fig2" drew a second triangle beside the first).
        const figOfProblem = [...objects, ...s.board].find((o) => o.kind === "geometry" && o.problemId === s.current && o.status !== "failed");
        const sid = b.id && latest(b.id) ? b.id : figOfProblem?.sid ?? b.id ?? "fig1";
        // An edit keeps what the figure had unless told otherwise: the triangle
        // asked for "inside its rectangle" stays a triangle (Oct 31: redrawn as a
        // plain rectangle, its shading gone while the tutor said "here is the
        // triangle").
        const before = latest(sid);
        const old = before?.kind === "geometry" ? (before.spec as GeometrySpec) : undefined;
        const wasTriangle = Boolean(old?.polygons.some((x) => x.id === "triangle"));
        const shape = b.shape === "rectangle" && wasTriangle ? "right_triangle" : b.shape;
        const inRectangle = b.in_rectangle ?? (b.shape === "rectangle" && wasTriangle ? true : old ? old.segments.some((x) => x.role === "diagonal") : undefined);
        const shadeOther = b.shade_other ?? (old ? old.polygons.some((x) => x.id === "other") : undefined);
        let spec: GeometrySpec | { error: string };
        if (shape === "polygon") {
          spec = polygon(b.vertices ?? [], { labels: b.labels, unit: b.unit });
        } else {
          const base = sizeFrom(s, b.base, shape === "rectangle" ? "width" : "base");
          const height = sizeFrom(s, b.height, "height");
          if ("error" in base || "error" in height) {
            issues.push(("error" in base ? base.error : "") || (height as { error: string }).error);
            break;
          }
          const unit = b.unit ?? base.unit ?? height.unit;
          spec = shape === "right_triangle" ? rightTriangle(base.value, height.value, { unit, inRectangle, shadeOther }) : rectangle(base.value, height.value, { unit, diagonal: inRectangle });
        }
        if ("error" in spec) {
          issues.push(`figure: ${spec.error}`);
          break;
        }
        const prev = before;
        // The same figure again changes nothing: no op (it read as "drawn fresh" over an unchanged board).
        if (prev?.kind === "geometry" && JSON.stringify(prev.spec) === JSON.stringify(spec)) {
          notes.push(`${sid} is already on the board as asked`);
          break;
        }
        const r = renderGeometry(spec);
        put(picture(sid, "geometry", s.current, spec, r, geometryFacts(spec), prev?.kind === "geometry" ? prev : undefined));
        ops.push(prev?.kind === "geometry" ? { opId: opId(), type: "edit", sid, kind: "geometry", spec, rendered: r, label: "figure" } : { opId: opId(), type: "draw", sid, kind: "geometry", spec, rendered: r, label: "figure" });
        break;
      }
      case "example": {
        if (isTheirProblem(b.problem, p?.math ?? p?.statement)) {
          issues.push("example is their own problem: use the same kind with other, easier numbers");
          break;
        }
        const steps = b.steps.split("|").map((x) => x.trim()).filter(Boolean);
        const why = (b.why ?? "").split("|").map((x) => x.trim());
        let spec: WorkSpec = { kind: "work", title: "Example", lines: [], moves: [] };
        if (!steps.length || steps[0].replace(/\s+/g, "") !== b.problem.replace(/\s+/g, "")) steps.unshift(b.problem);
        let bad = "";
        steps.forEach((line, i) => {
          if (i > 0 && /=/.test(line) && /[a-z]/i.test(line)) {
            const ok = checkStep(steps[i - 1], line);
            if (ok && ok.verdict === "incorrect") bad = `example step "${line}" does not follow from "${steps[i - 1]}"`;
          }
          if (i === 0) spec = { ...spec, lines: [{ id: "L1", text: line, by: "tutor" }] };
          else {
            const r = addStep(spec, { left: "", right: "", note: why[i - 1] || undefined, result: line });
            if (!("error" in r)) spec = r.spec;
          }
        });
        if (bad) {
          issues.push(bad);
          break;
        }
        const sid = `example${s.board.filter((x) => x.sid.startsWith("example")).length + objects.filter((x) => x.sid.startsWith("example")).length + 1}`;
        const r = renderWork(spec);
        put(picture(sid, "work", s.current, spec, r, [describeWork(spec)]));
        ops.push({ opId: opId(), type: "draw", sid, kind: "work", spec, rendered: r, label: `example ${b.problem}` });
        break;
      }
      case "groups": {
        const spec = parseGroups(b.groups);
        if ("error" in spec) {
          issues.push(spec.error);
          break;
        }
        const old = [...objects, ...s.board].find((o) => o.kind === "groups" && o.problemId === s.current && o.status !== "failed");
        const sid = b.id && latest(b.id) ? b.id : old?.sid ?? b.id ?? "groups1";
        const prev = latest(sid);
        if (prev?.kind === "groups" && JSON.stringify(prev.spec) === JSON.stringify(spec)) {
          notes.push(`${sid} is already on the board as asked`);
          break;
        }
        const r = renderGroups(spec);
        put(picture(sid, "groups", s.current, spec, r, describeGroups(spec), prev?.kind === "groups" ? prev : undefined));
        ops.push(prev?.kind === "groups" ? { opId: opId(), type: "edit", sid, kind: "groups", spec, rendered: r, label: "groups" } : { opId: opId(), type: "draw", sid, kind: "groups", spec, rendered: r, label: "groups" });
        break;
      }
      case "blocks": {
        const spec = parseBlocks(b.rows);
        if ("error" in spec) {
          issues.push(spec.error);
          break;
        }
        // One blocks picture a problem: a new one replaces the last (same id).
        const old = [...objects, ...s.board].find((o) => o.kind === "blocks" && o.problemId === s.current && o.status !== "failed");
        const sid = b.id && latest(b.id) ? b.id : old?.sid ?? b.id ?? "blocks1";
        const prev = latest(sid);
        if (prev?.kind === "blocks" && JSON.stringify(prev.spec) === JSON.stringify(spec)) {
          notes.push(`${sid} is already on the board as asked`);
          break;
        }
        const r = renderBlocks(spec);
        put(picture(sid, "blocks", s.current, spec, r, describeBlocks(spec), prev?.kind === "blocks" ? prev : undefined));
        ops.push(prev?.kind === "blocks" ? { opId: opId(), type: "edit", sid, kind: "blocks", spec, rendered: r, label: "base-ten blocks" } : { opId: opId(), type: "draw", sid, kind: "blocks", spec, rendered: r, label: "base-ten blocks" });
        break;
      }
      case "grid": {
        if (b.rows < 1 || b.rows > 20 || b.columns < 1 || b.columns > 20 || b.shaded < 0 || b.shaded > b.rows * b.columns) {
          issues.push(`grid: ${b.rows} by ${b.columns} with ${b.shaded} shaded does not fit (at most 20 by 20)`);
          break;
        }
        const used = new Set([...objects, ...s.board].map((o) => o.sid));
        let sid = b.id && !used.has(b.id) ? b.id : "grid1";
        for (let k = 2; used.has(sid); k++) sid = `grid${k}`;
        // How it is shaded, so the tutor says rows, not columns (Oct 31).
        const full = Math.floor(b.shaded / b.columns);
        const rest = b.shaded % b.columns;
        const words = `a ${b.rows} by ${b.columns} grid with ${b.shaded} of ${b.rows * b.columns} squares shaded, row by row from the top: ${full} full row${full === 1 ? "" : "s"} of ${b.columns}${rest ? ` and ${rest} square${rest === 1 ? "" : "s"} of the next row` : ""}${b.label ? `, captioned "${b.label}"` : ""}`;
        put({ sid, kind: "fraction", problemId: s.current, parts: [], facts: [words], shown: b.label ? [b.label] : [], status: "pending" });
        ops.push({ opId: opId(), type: "tool", sid, name: "draw_grid", args: { rows: b.rows, columns: b.columns, shaded: b.shaded, ...(b.label ? { label: b.label } : {}) }, label: words });
        break;
      }
      case "fractions": {
        const fr = [...b.fractions.matchAll(/(-?\d+)\s*\/\s*(\d+)/g)].slice(0, 2).map((m) => ({ n: Number(m[1]), d: Number(m[2]) }));
        if (!fr.length || fr.some((f) => f.d < 1 || f.d > 24 || f.n < 0 || f.n > 3 * f.d)) {
          issues.push(`fractions "${b.fractions}": give one or two fractions like "1/2, 1/3" (denominators up to 24)`);
          break;
        }
        if (b.common !== undefined && (b.common < 2 || b.common > 24 || fr.some((f) => b.common! % f.d !== 0))) {
          issues.push(`fractions: ${b.common} parts cannot cut ${fr.map((f) => `${f.n}/${f.d}`).join(" and ")} evenly; use a common multiple of ${fr.map((f) => f.d).join(" and ")}`);
          break;
        }
        const used = new Set([...objects, ...s.board].map((o) => o.sid));
        let sid = b.id && !used.has(b.id) ? b.id : "frac1";
        for (let k = 2; used.has(sid); k++) sid = `frac${k}`;
        const words = `${fr.map((f) => `${f.n}/${f.d}`).join(" and ")} as ${b.model === "circle" ? "circles" : "bars"} of the same whole${b.common ? `, each cut into ${b.common} equal parts (${fr.map((f) => `${f.n}/${f.d} = ${(f.n * b.common!) / f.d}/${b.common}`).join(", ")})` : ""}`;
        const args: Record<string, unknown> = { fraction: `${fr[0].n}/${fr[0].d}`, model: b.model ?? "bar", ...(fr[1] ? { second_fraction: `${fr[1].n}/${fr[1].d}` } : {}), ...(b.common ? { common_denominator: b.common } : {}) };
        put({ sid, kind: "fraction", problemId: s.current, parts: [], facts: [words], shown: fr.map((f) => (b.common ? `= ${(f.n * b.common) / f.d}/${b.common}` : `${f.n}/${f.d}`)), status: "pending" });
        ops.push({ opId: opId(), type: "tool", sid, name: "draw_fraction", args, label: words });
        break;
      }
      case "picture": {
        const used = new Set([...objects, ...s.board].map((o) => o.sid));
        let sid = b.id && !used.has(b.id) ? b.id : "pic1";
        for (let k = 2; used.has(sid); k++) sid = `pic${k}`;
        put({ sid, kind: "illustration", problemId: s.current, parts: [], facts: [`a picture: ${b.what}`], status: "pending" });
        ops.push({ opId: opId(), type: "illustrate", sid, what: b.what, ...(b.notice ? { notice: b.notice } : {}), label: b.what.slice(0, 80) });
        break;
      }
      case "mark": {
        const hit = resolveRef(s, objects, b.ref);
        if (!hit) {
          issues.push(`mark: nothing on the board is "${b.ref}"`);
          break;
        }
        if (!objects.includes(hit.obj) && offPage(s, hit.obj)) {
          issues.push(`mark: ${hit.obj.sid} is on an earlier page, filed away and out of sight; draw what you need on this page instead`);
          break;
        }
        if (hit.part && !hit.obj.parts.some((x) => x.toLowerCase() === hit.part!.toLowerCase().replace(/\s+/g, "")) && !hit.obj.parts.includes(hit.part)) {
          issues.push(`mark: ${hit.obj.sid} has no part "${hit.part}" (parts: ${hit.obj.parts.slice(0, 16).join(", ")})`);
          break;
        }
        // A cross is for the student's own superseded line, never for a line
        // the problem gave or the tutor wrote (Oct 31: a correct setup line
        // was marked as if it were the mistake).
        if (b.how === "cross") {
          const line = hit.obj.kind === "work" && hit.part ? (hit.obj.spec as WorkSpec | undefined)?.lines.find((l) => l.id.toLowerCase() === hit.part!.toLowerCase().split(".")[0]) : undefined;
          if (!line || line.by !== "student") {
            issues.push(`mark: cross only marks a line the student wrote that is now superseded; ${b.ref} is ${line ? `a line ${line.by === "given" ? "the problem gave" : "you wrote"}` : "not one of their lines"}. Point at it or underline it instead`);
            break;
          }
        }
        ops.push({ opId: opId(), type: "mark", ref: `${hit.obj.sid}${hit.part ? `.${hit.part}` : ""}`, how: b.how });
        break;
      }
    }
  }
  return { ops, objects, issues, notes };
}

/**
 * The app's own move when an answer filled a blank: the "?" line or cell gets
 * their answer, and a right final answer is boxed (Plan B B5: the checked
 * answer and the board change in one transaction).
 */
export function fillBlank(s: LessonState, fill: string, value: string, opPrefix: string, final: boolean): Compiled {
  const hit = resolveRef(s, [], fill);
  const ops: BoardOp[] = [];
  const objects: BoardObject[] = [];
  if (!hit || !hit.obj.spec) return { ops, objects, issues: [`no blank ${fill}`], notes: [] };
  if (hit.obj.kind === "work" && hit.part) {
    const r = fillLine(hit.obj.spec as WorkSpec, hit.part, value, "student");
    if ("error" in r) return { ops, objects, issues: [r.error], notes: [] };
    const rendered = renderWork(r.spec, r.fresh);
    objects.push(picture(hit.obj.sid, "work", hit.obj.problemId, r.spec, rendered, [describeWork(r.spec)], hit.obj));
    ops.push({ opId: `${opPrefix}.f1`, type: "edit", sid: hit.obj.sid, kind: "work", spec: r.spec, rendered, label: "the working" });
    if (final) ops.push({ opId: `${opPrefix}.f2`, type: "mark", ref: `${hit.obj.sid}.${hit.part}`, how: "check" });
    return { ops, objects, issues: [], notes: [`filled ${hit.part} with "${value}"`] };
  }
  if (hit.obj.kind === "table" && hit.part) {
    const m = /^r(\d+)c(\d+)$/i.exec(hit.part);
    if (!m) return { ops, objects, issues: [`${fill} is not a table cell`], notes: [] };
    const spec = hit.obj.spec as TableSpec;
    const rows = spec.rows.map((row) => [...row]);
    const r = Number(m[1]) - 1, c = Number(m[2]) - 1;
    if (!rows[r] || c >= spec.columns.length) return { ops, objects, issues: [`${fill} is not in the table`], notes: [] };
    rows[r][c] = value;
    const next: TableSpec = { ...spec, rows };
    const rendered = renderTable(next, new Set([hit.part]));
    objects.push(picture(hit.obj.sid, "table", hit.obj.problemId, next, rendered, [describeTable(next)], hit.obj));
    ops.push({ opId: `${opPrefix}.f1`, type: "edit", sid: hit.obj.sid, kind: "table", spec: next, rendered, label: `table ${describeTable(next)}` });
    return { ops, objects, issues: [], notes: [`filled ${hit.part} with "${value}"`] };
  }
  return { ops, objects, issues: [`${fill} is not a blank`], notes: [] };
}
