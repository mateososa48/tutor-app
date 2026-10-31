// Board intents compiled into exact drawings (Oct 31 2026, Plan B B5/B6).
// The model says what it wants up ("the step −7 under both sides giving
// 3x = ?", "the 12 by 5 triangle in its rectangle"); this module builds the
// spec, checks it (a step keeps the equation's solutions, a figure's sizes are
// the problem's own facts, a graph grows on the one already up), renders it,
// and returns the ops the page applies as they are. Anything wrong comes back
// as an issue for the model to fix, never as a drawing.

import { checkStep } from "../answer-check";
import { buildPlane, describePlane, renderPlane, type PlaneSpec } from "../board-plane";
import { describeTable, mergeTable, parseTable, renderTable, sameColumns, type TableSpec } from "../board-table";
import { addLine, addStep, describeWork, fillLine, isPending, lastLine, renderWork, startWork, type WorkSpec } from "../board-work";
import { geometryFacts, polygon, rectangle, renderGeometry, rightTriangle, type GeometrySpec } from "../board-geometry";
import { falseAssertions } from "../math-claims";
import { isTheirProblem } from "../worked-example";
import { currentProblem } from "./state";
import type { BoardIntent, BoardObject, BoardOp, LessonState, PictureKind, RenderedPicture } from "./types";

export type Compiled = { ops: BoardOp[]; objects: BoardObject[]; issues: string[]; notes: string[] };

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

function picture(sid: string, kind: PictureKind, problemId: string | null, spec: unknown, rendered: RenderedPicture, facts: string[], prev?: BoardObject): BoardObject {
  return { sid, kind, problemId, spec, parts: partsOf(rendered), facts, status: prev?.status === "applied" ? "applied" : "pending", ...(prev?.itemId ? { itemId: prev.itemId } : {}) };
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
  const latest = (sid: string) => objects.find((o) => o.sid === sid) ?? s.board.find((o) => o.sid === sid && o.status !== "failed");
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
        const bad = falseAssertions(b.text);
        if (bad.length) {
          issues.push(`work_line "${b.text}" is false: ${bad.map((c) => c.correct).join("; ")}`);
          break;
        }
        const above = spec.lines.length ? lastLine(spec) : null;
        if (above && /=/.test(b.text) && /[a-z]/i.test(b.text) && !/\?/.test(b.text) && !isPending(above) && /=/.test(above.text)) {
          const ok = checkStep(above.text, b.text);
          if (ok && ok.verdict === "incorrect") {
            issues.push(`work_line "${b.text}" does not follow from "${above.text}"`);
            break;
          }
        }
        const r = addLine(spec, b.text, "tutor");
        putWork(r.spec, r.fresh, obj);
        break;
      }
      case "table": {
        const next = parseTable(b.columns, b.rows, b.title);
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
        const sid = b.id || "fig1";
        let spec: GeometrySpec | { error: string };
        if (b.shape === "polygon") {
          spec = polygon(b.vertices ?? [], { labels: b.labels, unit: b.unit });
        } else {
          const base = sizeFrom(s, b.base, b.shape === "rectangle" ? "width" : "base");
          const height = sizeFrom(s, b.height, "height");
          if ("error" in base || "error" in height) {
            issues.push(("error" in base ? base.error : "") || (height as { error: string }).error);
            break;
          }
          const unit = b.unit ?? base.unit ?? height.unit;
          spec = b.shape === "right_triangle" ? rightTriangle(base.value, height.value, { unit, inRectangle: b.in_rectangle, shadeOther: b.shade_other }) : rectangle(base.value, height.value, { unit, diagonal: b.in_rectangle });
        }
        if ("error" in spec) {
          issues.push(`figure: ${spec.error}`);
          break;
        }
        const prev = latest(sid);
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
      case "mark": {
        const hit = resolveRef(s, objects, b.ref);
        if (!hit) {
          issues.push(`mark: nothing on the board is "${b.ref}"`);
          break;
        }
        if (hit.part && !hit.obj.parts.some((x) => x.toLowerCase() === hit.part!.toLowerCase().replace(/\s+/g, "")) && !hit.obj.parts.includes(hit.part)) {
          issues.push(`mark: ${hit.obj.sid} has no part "${hit.part}" (parts: ${hit.obj.parts.slice(0, 16).join(", ")})`);
          break;
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
