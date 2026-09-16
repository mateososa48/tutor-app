"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioPlayer } from "@/lib/audio";
import { SpeedControl, useTutorSpeed } from "@/components/session/SpeedControl";
import { tutorSpeedLabel, tutorSpeedRate } from "@/lib/voice-settings";

// Streams a speech sample into the real AudioPlayer in 40 ms PCM chunks at
// twice real time, the way Gemini Live delivers a turn, and measures how long
// the voice is actually audible. The sample is local only (public/dev is
// gitignored). Make it once:
//   say -v Samantha -r 215 -o /tmp/voice.aiff "Okay, look at the board…"
//   afconvert -f WAVE -d LEI16@24000 -c 1 /tmp/voice.aiff public/dev/voice-sample.wav

const SAMPLE_URL = "/dev/voice-sample.wav";
const CHUNK_MS = 40;
const SEND_EVERY_MS = 20;
const SOUND_LEVEL = 0.01;

type Stats = {
  sourceMs: number;
  pendingSourceMs: number;
  pendingOutputMs: number;
  playing: boolean;
  audibleMs: number | null;
  rate: number;
  mode: string;
  visibility: string;
};

function toBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function loadChunks(): Promise<{ chunks: string[]; sourceMs: number }> {
  const res = await fetch(SAMPLE_URL);
  if (!res.ok) throw new Error(`No sample at ${SAMPLE_URL} (${res.status}). See the comment in VoiceLab.tsx.`);
  const ctx = new AudioContext({ sampleRate: 24000 });
  const audio = await ctx.decodeAudioData(await res.arrayBuffer());
  void ctx.close();
  const data = audio.getChannelData(0);
  const size = Math.round((24000 * CHUNK_MS) / 1000);
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += size) {
    const slice = data.subarray(i, Math.min(data.length, i + size));
    const int16 = new Int16Array(slice.length);
    for (let j = 0; j < slice.length; j++) int16[j] = Math.max(-1, Math.min(1, slice[j])) * 0x7fff;
    chunks.push(toBase64(int16));
  }
  return { chunks, sourceMs: (data.length / 24000) * 1000 };
}

export default function VoiceLab() {
  const [speed, setSpeed] = useTutorSpeed();
  const rate = tutorSpeedRate(speed);
  const playerRef = useRef<AudioPlayer | null>(null);
  const sampleRef = useRef<{ chunks: string[]; sourceMs: number } | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const soundRef = useRef<{ first: number | null; last: number | null }>({ first: null, last: null });
  const statsRef = useRef<Stats | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    playerRef.current?.setRate(rate);
  }, [rate]);

  const ensurePlayer = useCallback(() => {
    if (!playerRef.current) playerRef.current = new AudioPlayer({ rate });
    playerRef.current.resume();
    return playerRef.current;
  }, [rate]);

  const play = useCallback(async () => {
    setError(null);
    const player = ensurePlayer();
    try {
      sampleRef.current ??= await loadChunks();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    const { chunks } = sampleRef.current;
    soundRef.current = { first: null, last: null };
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    // Send every chunk that is due on each tick. Browsers throttle timers in
    // covered or background windows; this way that delays chunks instead of
    // starving the player one late timer at a time.
    const start = performance.now();
    let sent = 0;
    const tick = () => {
      const due = Math.min(chunks.length, Math.floor((performance.now() - start) / SEND_EVERY_MS) + 1);
      while (sent < due) player.enqueue(chunks[sent++]);
      if (sent < chunks.length) timersRef.current.push(setTimeout(tick, SEND_EVERY_MS));
    };
    tick();
  }, [ensurePlayer]);

  const interrupt = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    playerRef.current?.flush();
  }, []);

  useEffect(() => {
    const buf = new Float32Array(1024);
    const meter = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const analyser = player.getAnalyser();
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const level = Math.sqrt(sum / buf.length);
      const now = performance.now();
      if (level > SOUND_LEVEL) {
        soundRef.current.first ??= now;
        soundRef.current.last = now;
      }
      const { first, last } = soundRef.current;
      const next: Stats = {
        sourceMs: sampleRef.current?.sourceMs ?? 0,
        pendingSourceMs: Math.round(player.getPendingSourceMs()),
        pendingOutputMs: Math.round(player.getPendingDurationMs()),
        playing: player.isPlaying(),
        audibleMs: first !== null && last !== null ? Math.round(last - first) : null,
        rate: player.getRate(),
        mode: player.getMode(),
        visibility: document.visibilityState,
      };
      statsRef.current = next;
      setStats(next);
    }, 25);
    return () => clearInterval(meter);
  }, []);

  useEffect(() => {
    const w = window as unknown as { __voiceLab?: unknown };
    w.__voiceLab = { play, interrupt, setSpeed, stats: () => statsRef.current, debug: () => playerRef.current?.debugState() ?? null };
    return () => {
      delete w.__voiceLab;
    };
  }, [play, interrupt, setSpeed]);

  // Fast Refresh re-runs this cleanup; drop the closed player so the next
  // play makes a new one instead of streaming into a closed context.
  useEffect(
    () => () => {
      playerRef.current?.close();
      playerRef.current = null;
    },
    [],
  );

  const pill =
    "h-9 rounded-full border-(--lp-line-strong) bg-white px-3.5 text-[13px] font-medium text-(--lp-ink) shadow-(--lp-shadow-card) hover:bg-white";

  return (
    <main className="mx-auto flex min-h-svh max-w-[560px] flex-col gap-6 px-5 py-12 text-(--lp-ink)">
      <div>
        <h1 className="lp-display text-[28px]">Voice speed</h1>
        <p className="mt-1 text-[14px] text-(--lp-ink-2)">
          A speech sample streamed into the session&apos;s audio player the way Gemini sends a turn. Change the speed while it plays.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={play} className="lp-btn lp-btn-sm">Play sample</button>
        <button type="button" onClick={interrupt} className="lp-btn lp-btn-sm lp-btn-quiet">Interrupt</button>
        <SpeedControl speed={speed} onChange={setSpeed} className={pill} />
      </div>
      {error && <p className="text-[13px] text-(--danger)">{error}</p>}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] tabular-nums">
        <dt className="text-(--lp-ink-2)">Speed</dt>
        <dd>{`${tutorSpeedLabel(speed)} (${rate}×)`}</dd>
        <dt className="text-(--lp-ink-2)">Sample length</dt>
        <dd>{stats ? `${(stats.sourceMs / 1000).toFixed(2)} s` : "–"}</dd>
        <dt className="text-(--lp-ink-2)">Expected at this speed</dt>
        <dd>{stats && stats.sourceMs ? `${(stats.sourceMs / stats.rate / 1000).toFixed(2)} s` : "–"}</dd>
        <dt className="text-(--lp-ink-2)">Heard for</dt>
        <dd>{stats?.audibleMs != null ? `${(stats.audibleMs / 1000).toFixed(2)} s` : "–"}</dd>
        <dt className="text-(--lp-ink-2)">Still to play</dt>
        <dd>{stats ? `${stats.pendingOutputMs} ms (${stats.pendingSourceMs} ms of audio)` : "–"}</dd>
        <dt className="text-(--lp-ink-2)">Engine</dt>
        <dd>{stats ? (stats.mode === "stretch" ? "speed control on" : stats.mode === "plain" ? "normal speed only (engine failed to load)" : "loading") : "–"}</dd>
        <dt className="text-(--lp-ink-2)">Playing</dt>
        <dd>{stats ? (stats.playing ? "yes" : "no") : "–"}</dd>
      </dl>
    </main>
  );
}
