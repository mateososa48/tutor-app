"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { ArrowRight02Icon, Logout03Icon, Mic01Icon, VolumeHighIcon } from "@hugeicons/core-free-icons";
import { AppShell } from "@/components/app/AppShell";
import { initials } from "@/components/app/AppTopBar";
import { FieldSelect } from "@/components/app/FieldSelect";
import { Icon } from "@/components/app/Icon";
import { PageBody, PageHeader, Panel, QUIET_BUTTON, Segmented, SettingRow, Toggle } from "@/components/app/page-kit";
import { usePrefs } from "@/components/app/usePrefs";
import { SESSION_LENGTHS, type SessionLength } from "@/lib/session-intake";
import type { WritingPace } from "@/lib/app-prefs";
import { cn } from "@/lib/utils";

// Settings (Oct 2026): the account, and how the app behaves on this device.
// Who the tutor is and what it knows lives on Your tutor; this page is the
// machinery around a session: how one starts, how fast the board writes, and
// which microphone and speakers it uses. Everything here applies at once and
// is kept in this browser (lib/app-prefs.ts); the session, the intake, the
// board and the microphone read it.

const PACE_HINTS: Record<WritingPace, string> = {
  calm: "Writes slower, so there's time to read along.",
  normal: "An unhurried hand, about as fast as you'd read it.",
  quick: "Gets the work up faster.",
};

export function SettingsView() {
  const { data: auth } = useSession();
  const [prefs, setPrefs] = usePrefs();
  const name = auth?.user?.name ?? null;
  const email = auth?.user?.email ?? null;

  return (
    <AppShell bar>
      <PageBody>
        <PageHeader title="Settings" lede="Your account, and how sessions work on this device. Changes apply right away." />

        <div className="mt-8 flex flex-col gap-5">
          <Panel title="Account">
            <div className="flex flex-col gap-4 px-5 pt-3 pb-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex min-w-0 items-center gap-3.5">
                <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-(--lp-sky) text-[15px] font-bold text-white">
                  {initials(name, email)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-medium text-(--lp-ink)">{name ?? "Your account"}</span>
                  <span className="truncate text-[13.5px] text-(--lp-ink-2)">{email ?? " "}</span>
                </span>
              </div>
              <button type="button" onClick={() => signOut({ callbackUrl: "/" })} className={QUIET_BUTTON}>
                <Icon icon={Logout03Icon} size={16} />
                Sign out
              </button>
            </div>
            <LinkRow href="/tutor#about" label="Name, grade and what you're into" hint="What your tutor knows about you lives on Your tutor." action="Your tutor" />
            <LinkRow href="/privacy" label="Your data" hint="See what's kept, download it, or delete it." action="Privacy & data" />
          </Panel>

          <Panel title="Sessions" description="How a new session starts.">
            <div className="pt-2">
              <SettingRow label="Session length" hint="Where “How long today?” starts. You can change it each time.">
                <Segmented<SessionLength>
                  size="sm"
                  label="Session length in minutes"
                  value={prefs.sessionMinutes}
                  onChange={(sessionMinutes) => setPrefs({ sessionMinutes })}
                  options={SESSION_LENGTHS.map((m) => ({ value: m, label: m === 60 ? "1 h" : `${m} min` }))}
                />
              </SettingRow>
              <SettingRow label="Start with the microphone off" hint="Handy somewhere quiet. Press M in a session to turn it on.">
                <Toggle label="Start with the microphone off" checked={prefs.startMuted} onChange={(startMuted) => setPrefs({ startMuted })} />
              </SettingRow>
              <SettingRow label="Show the transcript" hint="Open the written record of what's said beside the board.">
                <Toggle label="Show the transcript when a session starts" checked={prefs.transcriptOpen} onChange={(transcriptOpen) => setPrefs({ transcriptOpen })} />
              </SettingRow>
            </div>
          </Panel>

          <Panel title="The board">
            <div className="pt-2">
              <SettingRow label="Writing speed" hint={PACE_HINTS[prefs.writingPace]}>
                <Segmented<WritingPace>
                  size="sm"
                  label="Writing speed"
                  value={prefs.writingPace}
                  onChange={(writingPace) => setPrefs({ writingPace })}
                  options={[
                    { value: "calm", label: "Calm" },
                    { value: "normal", label: "Normal" },
                    { value: "quick", label: "Quick" },
                  ]}
                />
              </SettingRow>
            </div>
          </Panel>

          <Panel id="mic" title="Microphone and sound" description="Your tutor hears you through the microphone and talks through your speakers.">
            <MicSettings deviceId={prefs.micDeviceId} onDevice={(micDeviceId) => setPrefs({ micDeviceId })} />
            <SpeakerRow />
          </Panel>
        </div>
      </PageBody>
    </AppShell>
  );
}

function LinkRow({ href, label, hint, action }: { href: string; label: string; hint: string; action: string }) {
  return (
    <SettingRow label={label} hint={hint} className="border-t">
      <Link
        href={href}
        className="inline-flex min-h-9 items-center gap-1 rounded-[8px] px-1 text-[13.5px] font-medium text-(--lp-ink-2) outline-none transition-colors duration-150 hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
      >
        {action}
        <Icon icon={ArrowRight02Icon} size={14} />
      </Link>
    </SettingRow>
  );
}

// ── Microphone: pick one, and see it hear you ────────────────────────────────

type MicState = "idle" | "asking" | "live" | "denied" | "unsupported";

function MicSettings({ deviceId, onDevice }: { deviceId: string; onDevice: (id: string) => void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [state, setState] = useState<MicState>("idle");
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const stop = useRef<() => void>(() => {});

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(all.filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications"));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device support is only known in the browser
    if (!navigator.mediaDevices?.getUserMedia) setState("unsupported");
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
      stop.current();
    };
  }, [refreshDevices]);

  const test = useCallback(
    async (id: string) => {
      stop.current();
      setState("asking");
      setHeard(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: id ? { deviceId: { exact: id } } : true });
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Float32Array(analyser.fftSize);
        let raf = 0;
        const tick = () => {
          analyser.getFloatTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += v * v;
          const rms = Math.sqrt(sum / data.length);
          const next = Math.min(1, rms * 9);
          setLevel(next);
          if (next > 0.18) setHeard(true);
          raf = requestAnimationFrame(tick);
        };
        tick();
        stop.current = () => {
          cancelAnimationFrame(raf);
          stream.getTracks().forEach((t) => t.stop());
          void ctx.close();
          setLevel(0);
        };
        setState("live");
        void refreshDevices();
      } catch {
        setState("denied");
      }
    },
    [refreshDevices],
  );

  const labelled = devices.some((d) => d.label);
  const options = [
    { value: "", title: "System default", detail: "Whatever your computer is set to" },
    ...devices.map((d, i) => ({ value: d.deviceId, title: d.label || `Microphone ${i + 1}` })),
  ];

  return (
    <div className="pt-2">
      <SettingRow
        label="Microphone"
        hint={labelled ? "The one your tutor listens to in sessions." : "Test your mic once to see the microphones on this device by name."}
      >
        <FieldSelect
          label="Microphone"
          value={options.some((o) => o.value === deviceId) ? deviceId : ""}
          options={options}
          onChange={(id) => {
            onDevice(id);
            if (state === "live") void test(id);
          }}
        />
      </SettingRow>
      <SettingRow label="Test your microphone" hint={micHint(state, heard)} stack>
        <div className="flex flex-wrap items-center gap-4">
          {state === "live" ? (
            <button
              type="button"
              onClick={() => {
                stop.current();
                setState("idle");
              }}
              className={QUIET_BUTTON}
            >
              Stop test
            </button>
          ) : (
            <button type="button" onClick={() => void test(deviceId)} disabled={state === "asking" || state === "unsupported"} className={QUIET_BUTTON}>
              <Icon icon={Mic01Icon} size={16} />
              {state === "asking" ? "Asking…" : "Test my mic"}
            </button>
          )}
          <LevelMeter level={level} live={state === "live"} />
        </div>
      </SettingRow>
    </div>
  );
}

function micHint(state: MicState, heard: boolean): string {
  if (state === "unsupported") return "This browser can't use a microphone. You can still type to your tutor.";
  if (state === "denied") return "The browser blocked the microphone. Allow it from the icon in the address bar, then test again.";
  if (state === "live") return heard ? "We can hear you. That's what your tutor hears too." : "Say something. The bars should move as you talk.";
  return "Talk for a moment and watch the bars. Nothing is recorded.";
}

/** Twenty segments lit by loudness, sky. */
function LevelMeter({ level, live }: { level: number; live: boolean }) {
  const lit = Math.round(level * 20);
  return (
    <span aria-hidden className={cn("flex h-6 items-center gap-[3px] transition-opacity duration-200", live ? "opacity-100" : "opacity-40")}>
      {Array.from({ length: 20 }, (_, i) => (
        <span
          key={i}
          className="w-[5px] rounded-full transition-[height,background-color] duration-75"
          style={{ height: 8 + Math.min(i, 10) * 1.2, background: live && i < lit ? "var(--lp-sky)" : "var(--lp-gray-2)" }}
        />
      ))}
    </span>
  );
}

// ── Speakers: two soft notes ─────────────────────────────────────────────────

function SpeakerRow() {
  const [playing, setPlaying] = useState(false);
  async function play() {
    setPlaying(true);
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.28;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
    setTimeout(() => {
      void ctx.close();
      setPlaying(false);
    }, 1000);
  }
  return (
    <SettingRow label="Test your speakers" hint="You should hear two soft notes. If not, check your volume and output." className="border-t">
      <button type="button" onClick={() => void play()} disabled={playing} className={QUIET_BUTTON}>
        <Icon icon={VolumeHighIcon} size={16} />
        {playing ? "Playing…" : "Play a sound"}
      </button>
    </SettingRow>
  );
}
