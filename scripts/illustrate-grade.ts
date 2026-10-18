// Grades every picture the app drew in a bench run (Oct 17 2026). Mateo's
// question about the illustration tool was not only "does it draw well" but
// when it decides to draw, for what, why, whether that is a proper reason, and
// whether it feels natural to the student. For each draw_illustration in a run
// this writes one packet: the lesson up to that moment, the planner's order,
// the request, the tutor's actual words, and the board after the turn. Raters
// (Claude subagents) read a packet and its picture and write a verdict file;
// `tally` sums them.
//
//   npx tsx scripts/illustrate-grade.ts build <run label>   → bench/runs/<label>/pictures/*.md
//   npx tsx scripts/illustrate-grade.ts tally <run label>   → reads pictures/*.rater<N>.json

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const [mode, label] = process.argv.slice(2);
if (!mode || !label) throw new Error("usage: illustrate-grade.ts build|tally <run label>");
const RUN = path.join(ROOT, "bench", "runs", label);
const OUT = path.join(RUN, "pictures");

type Tool = { name: string; args: Record<string, unknown>; ok: boolean; result?: string; by?: string; atMs?: number };
type Turn = { student: string; tutor: string; tools: Tool[]; firstAudioMs?: number | null };

export const RUBRIC = `Grade this one picture, drawn on a live math tutor's shared whiteboard while the voice tutor was talking. A planner decided to draw it and wrote the request; a second model drew it; the tutor said the words shown. Be a strict expert tutor: 5 is rare.

Answer with JSON only:
{
  "reason": 1-5,        // Was drawing a picture the right move at this moment, for this student's actual idea? 5 = clearly the best move; 3 = fine but asking or another tool would have been as good; 1 = wrong moment (they already had it, it changes the subject, it answers for them).
  "fit": 1-5,           // Does the picture show the thing that matters for THIS student's mistake or question?
  "execution": 1-5,     // Correct counts and labels, clean, readable on a phone, nothing confusing or overlapping.
  "giveaway": true|false, // Does the picture show the answer the student is about to be asked for?
  "coordination": 1-5,  // Do the tutor's words fit the picture: it is announced or referred to, the question is about it, nothing contradicts it?
  "natural": 1-5,       // How would this feel to the student: 5 = like a good tutor sketching; 1 = awkward, random or interrupting.
  "note": "one sentence: the main thing right or wrong"
}`;

function build() {
  fs.mkdirSync(OUT, { recursive: true });
  const index: Array<{ id: string; caseId: string; turn: number }> = [];
  for (const file of fs.readdirSync(RUN).filter((f) => f.endsWith(".json") && !["summary.json"].includes(f) && !f.includes("judge"))) {
    const d = JSON.parse(fs.readFileSync(path.join(RUN, file), "utf8")) as { caseId?: string; name?: string; grade?: string; turns?: Turn[] };
    if (!d.turns) continue;
    const md = fs.existsSync(path.join(RUN, file.replace(/\.json$/, ".md"))) ? fs.readFileSync(path.join(RUN, file.replace(/\.json$/, ".md")), "utf8") : "";
    const tag = file.replace(/\.json$/, "");
    d.turns.forEach((t, i) => {
      for (const tool of t.tools.filter((x) => x.name === "draw_illustration" && x.by)) {
        const id = `${tag}-t${i + 1}`;
        const history = d.turns!.slice(Math.max(0, i - 4), i).map((x, k) => `Turn ${i - Math.min(i, 4) + k + 1}\nStudent: ${x.student}\nTutor: ${x.tutor}`).join("\n\n");
        // The planner's order for this turn, as the tutor got it.
        const orders = [...md.matchAll(/Next move, not from the student: ([^\]]*)/g)].map((m) => m[1]);
        const order = orders.find((o) => o.includes(String(tool.args.what ?? "").slice(0, 40))) ?? "(not found)";
        const shot = `${tag}-t${i + 1}.png`;
        const packet = [
          `# Picture ${id}`,
          `Student: ${d.name ?? ""}, ${d.grade ?? ""}.`,
          "",
          "## The lesson before this moment",
          history || "(this is the start)",
          "",
          "## This moment",
          `Student: ${t.student}`,
          `Planner's order to the tutor: ${order}`,
          `What the picture was asked to show: ${tool.args.what}`,
          `What the student should notice: ${tool.args.notice || "(not given)"}`,
          `What the tutor actually said: ${t.tutor}`,
          `The picture came back ${tool.ok ? `and was drawn (${tool.result?.slice(0, 160)})` : `and FAILED (${tool.result})`}, ${tool.args.ms ?? "?"} ms after the order; the tutor's first sound came at ${t.firstAudioMs ?? "?"} ms.`,
          "",
          "## What comes next",
          d.turns![i + 1] ? `Student: ${d.turns![i + 1].student}\nTutor: ${d.turns![i + 1].tutor}` : "(the session ended)",
          "",
          `## The board after this turn`,
          `Look at the image file: ${path.join(RUN, shot)}`,
          "",
          "## Rubric",
          RUBRIC,
        ].join("\n");
        fs.writeFileSync(path.join(OUT, `${id}.md`), packet);
        index.push({ id, caseId: tag, turn: i + 1 });
      }
    });
  }
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 2));
  console.log(`${index.length} pictures → ${OUT}`);
}

function tally() {
  const files = fs.readdirSync(OUT).filter((f) => /\.rater\d+\.json$/.test(f));
  const keys = ["reason", "fit", "execution", "coordination", "natural"] as const;
  const sums: Record<string, number[]> = Object.fromEntries(keys.map((k) => [k, []]));
  let giveaways = 0;
  const notes: string[] = [];
  for (const f of files) {
    const v = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")) as Record<string, unknown>;
    for (const k of keys) if (typeof v[k] === "number") sums[k].push(v[k] as number);
    if (v.giveaway === true) giveaways++;
    notes.push(`${f.replace(/\.json$/, "")}: ${v.note}`);
  }
  const mean = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : "-");
  console.log(`${files.length} verdicts`);
  for (const k of keys) console.log(`${k.padEnd(13)} ${mean(sums[k])}`);
  console.log(`giveaway      ${giveaways}/${files.length}`);
  console.log(notes.join("\n"));
}

if (mode === "build") build();
else tally();
