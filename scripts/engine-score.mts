// Scores engine runs (scripts/engine-run.mts) on each case's hard rules, and
// writes blind packets for Claude Code subagent judges (Oct 31 2026, Plan B).
// The rules read the lesson state the server saved, so they check what was
// really drawn, not what the tutor said it drew.
//
//   DATABASE_URL=<the dev server's> npx tsx scripts/engine-score.mts <run dir> [<run dir>…]
//
// Prints a table per run; writes <run dir>/<case>-rN/packet.md for judging.

import fs from "node:fs";
import path from "node:path";

for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z_0-9]+)=(.*)$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const { loadLesson } = await import("../lib/db/lesson-state");
const { sayWords } = await import("../lib/engine-voice");
type LessonState = import("../lib/lesson/types").LessonState;
type GeometrySpec = import("../lib/board-geometry").GeometrySpec;
type PlaneSpec = import("../lib/board-plane").PlaneSpec;

type Rec = { case: string; sessionId: string; intake: string; lines: string[]; turns: Array<{ turnId: string; line: string; ms: number; said: string[]; ops: string[]; receipts: Array<{ status: string }>; log?: Record<string, unknown> }>; summaries: string[]; waits: number[] };
type Check = { name: string; ok: boolean; detail?: string };

const words = (s: string) => ` ${sayWords(s).join(" ")} `;
const saidIn = (r: Rec, turnIndex: number) => (r.turns[turnIndex]?.said ?? []).join(" ");

function geometries(s: LessonState): GeometrySpec[] {
  return s.board.filter((b) => b.kind === "geometry" && b.status !== "failed").map((b) => b.spec as GeometrySpec);
}
function planes(s: LessonState): PlaneSpec[] {
  return s.board.filter((b) => b.kind === "plane" && b.status !== "failed").map((b) => b.spec as PlaneSpec);
}

function checksFor(r: Rec, s: LessonState | null): Check[] {
  const out: Check[] = [];
  const allSaid = r.turns.flatMap((t) => t.said).join(" ");
  out.push({ name: "no fallback turns", ok: r.turns.every((t) => !t.log?.fallback), detail: r.turns.filter((t) => t.log?.fallback).map((t) => t.turnId).join(",") });
  out.push({ name: "every board op applied", ok: r.turns.every((t) => t.receipts.every((x) => x.status === "applied" || x.status === "unchanged")), detail: r.turns.flatMap((t) => t.receipts.filter((x) => x.status !== "applied" && x.status !== "unchanged").map((x) => `${t.turnId}:${x.status}`)).join(",") });
  if (r.case === "T01") {
    const t = words(saidIn(r, 1));
    out.push({ name: "keeps 4 hours as right", ok: / 4 hours? (?:is )?(?:right|correct)|(?:right|correct)\b.* 4 hours/.test(t) || / (?:yes|right|correct) .*\b4\b/.test(t), detail: saidIn(r, 1).slice(0, 160) });
    out.push({ name: "says 5×4+3 is 23", ok: / 5 times 4 plus 3 (?:is|equals|makes|comes to|gives) (?:exactly )?23 /.test(t) || / 23 not 24 /.test(t) });
    out.push({ name: "says 24 is more than 23", ok: / 24 (?:is |would be )?(?:more|bigger|greater|over|higher) (?:than )?23 /.test(t) || / 24 is not (?:under|less than) 23 /.test(t) || /24 (?:would be|is) (?:over|above)/.test(t), detail: "the comparison claim" });
    out.push({ name: "never affirms 5×4+3 = 24", ok: !/ 5 times 4 plus 3 (?:is|equals) 24 /.test(words(allSaid)) });
  }
  if (r.case === "T02" && s) {
    const geo = geometries(s);
    const rect = geo.find((g) => g.polygons.some((p) => p.id === "rectangle" || p.points.length === 4) || g.points.length === 4);
    const xs = rect ? rect.points.map((p) => p.x) : [];
    const ys = rect ? rect.points.map((p) => p.y) : [];
    const w = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
    const h = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
    out.push({ name: "a figure 12 wide and 5 tall is on the board", ok: Math.abs(w - 12) < 1e-6 && Math.abs(h - 5) < 1e-6, detail: `${w} × ${h}` });
    out.push({ name: "no 10 used as a size", ok: !geo.some((g) => g.points.some((p) => Math.abs(p.y - 10) < 1e-9 || Math.abs(p.x - 10) < 1e-9)) && !/ 10 (?:cm|centimeters?) /.test(words(allSaid)) });
    const diag = geo.some((g) => g.segments.some((seg) => {
      const a = g.points.find((p) => p.id === seg.from);
      const b = g.points.find((p) => p.id === seg.to);
      if (!a || !b) return false;
      const pair = [a, b].sort((p, q) => p.x - q.x);
      return Math.abs(pair[0].x - Math.min(...xs)) < 1e-6 && Math.abs(pair[0].y - Math.min(...ys)) < 1e-6 && Math.abs(pair[1].x - Math.max(...xs)) < 1e-6 && Math.abs(pair[1].y - Math.max(...ys)) < 1e-6;
    }));
    out.push({ name: "diagonal from (0,0) to (12,5)", ok: diag });
    out.push({ name: "picture drawn by the turn the triangle was asked for", ok: (r.turns[1]?.ops ?? []).some((o) => /^(?:draw|edit) /.test(o) && !/work:/.test(o)), detail: (r.turns[1]?.ops ?? []).join(", ") });
  }
  if (r.case === "T05" && s) {
    const pl = planes(s);
    const curve = pl.find((p) => p.lines.some((l) => "latex" in l && /x\^?\{?2\}?\s*-\s*5x\s*\+\s*6/.test(l.text.replace(/[−–]/g, "-").replace(/\s+/g, " ").replace(/x²/g, "x^2"))));
    out.push({ name: "graph of y = x² − 5x + 6", ok: Boolean(curve), detail: pl.flatMap((p) => p.lines.map((l) => l.text)).join("; ") });
    const pts = curve?.points ?? [];
    out.push({ name: "crossings (2,0) and (3,0) marked", ok: [2, 3].every((x) => pts.some((p) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y) < 1e-6)), detail: pts.map((p) => `(${p.x},${p.y})`).join(" ") });
    out.push({ name: "view shows the vertex (2.5, −0.25)", ok: Boolean(curve && curve.x[0] < 2.5 && curve.x[1] > 2.5 && curve.y[0] < -0.25 && curve.y[1] > 0), detail: curve ? `x ${curve.x} y ${curve.y}` : "" });
    out.push({ name: "graph drawn when asked (line 2)", ok: (r.turns[2]?.ops ?? []).some((o) => /plane|graph/.test(o)) || (r.turns[1]?.ops ?? []).some((o) => /plane|graph/.test(o)), detail: (r.turns[2]?.ops ?? []).join(", ") });
    const reask = r.turns.slice(1).some((t) => /\b(?:what|which) (?:values?|numbers?) (?:of x )?(?:make|makes|give|gives)\b.*(?:zero|0)/i.test(t.said.join(" ")));
    out.push({ name: "never re-asks which values make it zero", ok: !reask });
    out.push({ name: "no (x+2)(x+3) detour", ok: !/\(x\s*\+\s*2\)\s*\(x\s*\+\s*3\)/.test(allSaid) && !/ x plus 2 times x plus 3 /.test(words(allSaid)) });
  }
  return out;
}

function packet(r: Rec, s: LessonState | null, dir: string, checks: Check[]): string {
  const lines: string[] = [];
  lines.push(`# Session ${r.case} (${path.basename(dir)})`, "");
  lines.push(`Student's opening: "${r.intake}"`, "");
  r.turns.forEach((t, i) => {
    const student = i === 0 ? r.intake : r.lines[i - 1];
    lines.push(`## Turn ${i + 1}`, `Student: ${student}`, `Tutor (said aloud): ${t.said.join(" ") || "(nothing)"}`, `Board changes: ${t.ops.join("; ") || "none"}`);
    lines.push(`Board after: ${path.join(dir, `t${i + 1}-board.jpg`)} (full screen: ${path.join(dir, `t${i + 1}.png`)})`, "");
  });
  if (s) {
    lines.push("## What the board holds at the end (from the lesson state)");
    for (const b of s.board) lines.push(`- ${b.sid} (${b.kind}, ${b.status}): ${b.facts.join("; ").slice(0, 300)}`);
    lines.push("");
  }
  lines.push("## Code checks", ...checks.map((c) => `- ${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? ` (${c.detail})` : ""}`));
  return lines.join("\n");
}

const rows: string[] = [];
for (const root of process.argv.slice(2)) {
  const dirs = fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, "record.json"))).sort();
  let pass = 0;
  let total = 0;
  for (const d of dirs) {
    const dir = path.join(root, d);
    const r = JSON.parse(fs.readFileSync(path.join(dir, "record.json"), "utf8")) as Rec;
    const s = r.sessionId ? await loadLesson(r.sessionId).catch(() => null) : null;
    const checks = checksFor(r, s);
    fs.writeFileSync(path.join(dir, "packet.md"), packet(r, s, dir, checks));
    const ok = checks.filter((c) => c.ok).length;
    pass += ok;
    total += checks.length;
    const plan = r.turns.map((t) => (t.log?.ms as number) ?? 0);
    rows.push(`${root.split("/").pop()} ${d}: ${ok}/${checks.length}  plan ms ${plan.join("/")}  calls ${r.turns.map((t) => t.log?.calls ?? "?").join("/")}`);
    for (const c of checks.filter((x) => !x.ok)) rows.push(`    FAIL ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  rows.push(`${root}: ${pass}/${total} checks`);
}
console.log(rows.join("\n"));
process.exit(0);
