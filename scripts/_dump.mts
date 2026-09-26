import fs from "node:fs";
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_]+)=(.*)$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { db } = await import("../lib/db/client");
const { tutorSessions, sessionFrames, sessionEvents } = await import("../lib/db/schema");
const { desc, eq, asc } = await import("drizzle-orm");
const { sessionScorecard, scorecardMarkdown } = await import("../lib/session-scorecard");
const OUT = "/private/tmp/claude-501/-Users-mateososaalbrecht-tutor-app/5f5da68c-d1b1-4a3c-bab3-406bc7c7454a/scratchpad/s4";
const rows = await db.select({ id: tutorSessions.id, startedAt: tutorSessions.startedAt, dur: tutorSessions.durationSec, title: tutorSessions.title }).from(tutorSessions).orderBy(desc(tutorSessions.startedAt)).limit(3);
console.log(rows.map((r) => `${r.id} ${new Date(r.startedAt).toISOString()} ${r.dur}s "${r.title}"`).join("\n"));
const s = rows[0];
const ev = await db.select({ seq: sessionEvents.seq, offsetMs: sessionEvents.offsetMs, kind: sessionEvents.kind, actor: sessionEvents.actor, payload: sessionEvents.payload }).from(sessionEvents).where(eq(sessionEvents.sessionId, s.id)).orderBy(asc(sessionEvents.seq));
const frames = await db.select({ id: sessionFrames.id, offsetMs: sessionFrames.offsetMs, data: sessionFrames.data, reason: sessionFrames.reason, width: sessionFrames.width, height: sessionFrames.height }).from(sessionFrames).where(eq(sessionFrames.sessionId, s.id)).orderBy(asc(sessionFrames.offsetMs));
fs.writeFileSync(`${OUT}/events.json`, JSON.stringify(ev.map((e) => ({ ...e, payload: e.kind === "whiteboard.snapshot" ? {} : e.payload }))));
const lines: string[] = [];
const t = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
let buf = { role: "", text: "", at: 0 };
const flush = () => { if (buf.text.trim()) lines.push(`${t(buf.at)} ${buf.role === "student" ? "S" : "T"}: ${buf.text.trim()}`); buf = { role: "", text: "", at: 0 }; };
for (const e of ev) {
  const p: any = e.payload ?? {};
  if (e.kind === "transcript.entry") { if (buf.role && buf.role !== p.role) flush(); if (!buf.role) buf = { role: p.role, text: "", at: e.offsetMs }; buf.text += p.text; continue; }
  if (e.kind === "tool.call") { flush(); lines.push(`${t(e.offsetMs)}   ↳ ${p.name}(${JSON.stringify(p.args ?? {}).slice(0, 260)}) ${p.success === false ? "FAILED: " + String(p.error).slice(0, 160) : "=> " + String(p.message ?? "").slice(0, 160).replace(/\n/g, " ")}`); continue; }
  if (e.kind === "live.debug") {
    const m = p.message;
    if (["student_text_sent", "nudge_unanswered", "audio_underrun", "turn_summary", "tutor_state", "mic_muted", "mic_unmuted", "interrupted", "quiet_hint", "quiet_checkin", "websocket_closed", "tool_response_sent", "files_sent", "worksheet_frame", "board_frame_sent"].includes(m) || p.kind === "error") {
      flush(); const pp = p.payload ?? {};
      if (m === "turn_summary") lines.push(`${t(e.offsetMs)}   · turn ${pp.n} ${pp.trigger ?? ""} firstAudio=${pp.firstAudioMs}ms toolsBefore=${pp.toolsBeforeAudio} tools=[${(pp.tools ?? []).join(",")}] words=${pp.words} prompt=${pp.usage?.prompt} silent=${pp.silent} endedBy=${pp.endedBy}`);
      else if (m === "tool_response_sent") lines.push(`${t(e.offsetMs)}   · tool_response ${pp.name} => ${String(pp.message ?? pp.error ?? "").slice(0, 200).replace(/\n/g, " ")}`);
      else lines.push(`${t(e.offsetMs)}   · ${m} ${JSON.stringify(pp).slice(0, 200)}`);
    }
    continue;
  }
  if (e.kind === "session.started") { flush(); lines.push(`${t(e.offsetMs)}   · session.started ${JSON.stringify(p).slice(0, 200)}`); }
}
flush();
for (const f of frames) { const file = `${OUT}/${String(Math.round(f.offsetMs / 1000)).padStart(4, "0")}s_${f.reason.replace(/[^a-z0-9]+/gi, "_")}.jpg`; fs.writeFileSync(file, Buffer.from(f.data, "base64")); lines.push(`${t(f.offsetMs)}   📷 ${f.reason} ${f.width}x${f.height} ${file}`); }
lines.sort();
fs.writeFileSync(`${OUT}/timeline.txt`, lines.join("\n"));
fs.writeFileSync(`${OUT}/scorecard.md`, scorecardMarkdown(sessionScorecard(ev as any, s.dur * 1000)).join("\n"));
console.log("events", ev.length, "frames", frames.length);
process.exit(0);
