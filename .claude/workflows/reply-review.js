export const meta = {
  name: 'reply-review',
  description: 'Blind rating of live tutor replies (scripts/reply-review.ts build writes the batches); args: { tag, batches }',
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
const tag = args && args.tag ? args.tag : 'rr'
const count = args && args.batches ? args.batches : 9
phase('Rate')
const results = await parallel(Array.from({ length: count }, (_, i) => i + 1).map((b) => () => agent(`${RUBRIC}\n\nRead ${dir}/rr-${tag}-batch${b}.md with the Read tool. Each moment is headed "### Moment N"; rate every one, using that number. Do not read any other file in that folder, do not modify files, do not run commands.`, { label: `rate:b${b}`, phase: 'Rate', schema: SCHEMA, model: 'sonnet' })))
return results.map((r, i) => ({ batch: i + 1, moments: r ? r.moments : null }))