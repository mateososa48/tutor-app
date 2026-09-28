export const meta = {
  name: 'reply-review',
  description: 'Blind rating of tutor replies (scripts/reply-review.ts build writes the batches); args: { tag, batches } or { sets: [{ tag, batches }, …] }',
  phases: [{ title: 'Rate', detail: 'one rater per batch of 9-10 live replies' }],
}
const RUBRIC = `You are an expert middle- and high-school math tutor rating what a live AI voice tutor actually said and drew in reply to a student, one moment at a time. For each moment you see the last turns, the student's new line, and the tutor's actual reply with its board moves. Judge only the reply.

Score each reply 1-5 (5 rare: what an excellent human tutor would do here):
- Diagnosis: when the student's reasoning is unknown, does it ask how they got it (in their words) before correcting? When their wrong reasoning is already known, does it make that idea break where the student can see it (a simpler/extreme case, a picture), instead of explaining the right way?
- No telling: it never gives the answer, a number the student should find, or the rule; the student does the thinking.
- Right answers: no empty praise; moves them on (next step, same kind alone, harder after repeated success; the rule in their own words after a fix).
- Board: the moves make the idea visible or record the student's words when that helps; no pointless moves.
- One clear question or task a middle/high-schooler can act on; natural spoken words; no repeated sentences.
Penalize: correcting before diagnosing, telling, praise openers ("Exactly", "Perfect"), two questions, answering its own question, restating without moving on, ending with nothing for the student to do.`
const SCHEMA = { type: 'object', properties: { moments: { type: 'array', items: { type: 'object', properties: { moment: { type: 'integer' }, score: { type: 'number' }, why: { type: 'string' } }, required: ['moment', 'score', 'why'] } } }, required: ['moments'] }
const dir = '/Users/mateososaalbrecht/tutor-app/bench/runs'
// Batches to rate: args.sets = [{ tag, batches }, …], or one { tag, batches }.
const sets = args && Array.isArray(args.sets) ? args.sets : [{ tag: args && args.tag ? args.tag : 'rr', batches: args && args.batches ? args.batches : 9 }]
const jobs = sets.flatMap((s) => Array.from({ length: s.batches }, (_, i) => ({ tag: s.tag, b: i + 1 })))
phase('Rate')
// Explore does not load the project's instructions: the default subagent read
// AGENTS.md (about 65k tokens) before rating ten short moments.
const results = await parallel(jobs.map((j) => () => agent(
  `${RUBRIC}\n\nRead ${dir}/rr-${j.tag}-batch${j.b}.md with the Read tool (the whole file). Each moment is headed "### Moment N"; rate every one, using that number. Do not read any other file, do not modify files, do not run commands.`,
  { label: `rate:${j.tag}:b${j.b}`, phase: 'Rate', schema: SCHEMA, model: 'sonnet', agentType: 'Explore' },
)))
return results.map((r, i) => ({ tag: jobs[i].tag, batch: jobs[i].b, moments: r ? r.moments : null }))
