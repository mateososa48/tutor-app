export const meta = {
  name: 'bench-judge',
  description: 'Grade each benchmark case of a run with one Claude judge per case (writes <case>.judge.json)',
  phases: [{ title: 'Judge', detail: 'one judge per case' }],
}
const dir = args.dir
const cases = args.cases
phase('Judge')
const out = await pipeline(cases, (c) => agent(`You are grading one recorded math-tutoring session for a benchmark. Open and follow ${dir}/${c}.judge-input.md exactly: read the instructions and the case in that file, open every picture it lists with the Read tool (board screenshots; look at them, they decide the board scores), then write the JSON verdict in exactly the shape the instructions specify to ${dir}/${c}.judge.json using the Write tool. The file must contain only the JSON object (no code fences, no prose). Be strict and calibrated as the instructions say (5 is rare). Reading notes: the student's attempts on the board are in a handwriting typeface whose digit 7 has a crossbar; that is the font, not a strike. A real cross-out is a blue line through a whole line of text, and a ring is a blue oval around it. Moves marked as made by the app are part of the board the student sees. Do not modify any other file, do not run git commands. Reply with just the outcome_met value and the eight scores.`, { label: `judge:${c}`, phase: 'Judge', model: 'sonnet' }))
return out.map((r, i) => ({ case: cases[i], reply: r }))