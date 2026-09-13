"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import LeftNav from "@/components/LeftNav";
import { useClientReady } from "@/lib/client-ready";
import {
  DEFAULT_TUTOR_VOICE,
  TUTOR_VOICES,
  getTutorVoiceName,
  saveTutorVoiceName,
} from "@/lib/voice-settings";
import type { TutorVoiceName } from "@/lib/voice-settings";
import { VoicePreviewController, playTutorVoiceSample } from "@/lib/voice-preview";

const GRADES = [
  "Middle school (6–8)",
  "High school (9–12)",
  "College / University",
  "Self-learner",
];

type Prefs = {
  hintVsAnswer: number;
  pace: number;
  examplesVsTheory: number;
  tone: number;
};

type ProfileForm = {
  displayName: string;
  gradeLevel: string;
  prefs: Prefs;
  extraContext: string;
};

const DEFAULT_PREFS: Prefs = { hintVsAnswer: 0, pace: 0, examplesVsTheory: 0, tone: 0 };

export default function SettingsPage() {
  const mounted = useClientReady();

  // ── Voice state ──────────────────────────────────────────────────────────
  const [selectedVoice, setSelectedVoice] = useState<TutorVoiceName>(DEFAULT_TUTOR_VOICE);
  const [previewingVoice, setPreviewingVoice] = useState<TutorVoiceName | null>(null);
  const [previewError, setPreviewError] = useState("");
  const previewRef = useRef<VoicePreviewController | null>(null);

  // ── Profile state ────────────────────────────────────────────────────────
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    displayName: "",
    gradeLevel: "",
    prefs: DEFAULT_PREFS,
    extraContext: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);

  // ── Saved pulse (shared) ─────────────────────────────────────────────────
  const [savedLabel, setSavedLabel] = useState("");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashSaved(label: string) {
    setSavedLabel(label);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedLabel(""), 1800);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      previewRef.current?.stop();
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // ── Load voice + profile on mount ────────────────────────────────────────
  useEffect(() => {
    if (!mounted) return;
    const settingsTimer = window.setTimeout(() => {
      setSelectedVoice(getTutorVoiceName());
    }, 0);

    fetch("/api/onboarding")
      .then((r) => (r.ok ? r.json() : null))
      .then((profile) => {
        if (profile) {
          setProfileForm({
            displayName: profile.displayName ?? "",
            gradeLevel: profile.gradeLevel ?? "",
            prefs: profile.learningPrefs && Object.keys(profile.learningPrefs).length > 0
              ? profile.learningPrefs
              : DEFAULT_PREFS,
            extraContext: profile.extraContext ?? "",
          });
          // Sync voice from DB (DB is source of truth)
          if (profile.voiceName) {
            setSelectedVoice(profile.voiceName as TutorVoiceName);
            saveTutorVoiceName(profile.voiceName as TutorVoiceName);
          }
        }
        setProfileLoaded(true);
      })
      .catch(() => setProfileLoaded(true));

    return () => window.clearTimeout(settingsTimer);
  }, [mounted]);

  // ── Save helpers ─────────────────────────────────────────────────────────
  async function saveProfile(form: ProfileForm, voice: TutorVoiceName) {
    await fetch("/api/onboarding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: form.displayName,
        gradeLevel: form.gradeLevel,
        learningPrefs: form.prefs,
        extraContext: form.extraContext,
        voiceName: voice,
      }),
    });
  }

  const selectVoice = useCallback(async (voiceName: TutorVoiceName) => {
    setSelectedVoice(voiceName);
    saveTutorVoiceName(voiceName);
    flashSaved("Voice saved");
    try {
      await saveProfile(profileForm, voiceName);
    } catch { /* best-effort */ }
  }, [profileForm]);

  async function handleSaveProfile() {
    setProfileSaving(true);
    try {
      await saveProfile(profileForm, selectedVoice);
      flashSaved("Profile saved");
    } catch { /* ignore */ }
    setProfileSaving(false);
  }

  // ── Voice preview ────────────────────────────────────────────────────────
  const playPreview = useCallback((voiceName: TutorVoiceName, sampleText: string) => {
    setPreviewError("");
    if (previewingVoice === voiceName) {
      previewRef.current?.stop();
      previewRef.current = null;
      setPreviewingVoice(null);
      return;
    }
    previewRef.current?.stop();
    setPreviewingVoice(voiceName);
    previewRef.current = playTutorVoiceSample(voiceName, sampleText, {
      onDone: () => { previewRef.current = null; setPreviewingVoice(null); },
      onError: (message) => { previewRef.current = null; setPreviewingVoice(null); setPreviewError(message); },
    });
  }, [previewingVoice]);

  return (
    <div className="h-screen w-screen flex overflow-hidden" style={{ background: "#e2e2e2", padding: 10, gap: 10 }}>
      <LeftNav />

      <main
        className="flex-1 min-w-0 flex flex-col overflow-hidden"
        style={{
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 18px rgba(0,0,0,0.06)",
        }}
      >
        {/* Header */}
        <header
          className="h-14 px-7 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid #d0d0d0" }}
        >
          <span className="text-[14px] font-semibold" style={{ color: "#0a0a0a" }}>Settings</span>
          <span
            className="text-[12px] font-semibold"
            style={{ color: savedLabel ? "#0a0a0a" : "transparent", transition: "color 0.18s" }}
          >
            {savedLabel || "·"}
          </span>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto page-in" style={{ padding: "clamp(24px, 5vw, 52px)" }}>
          <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 52 }}>

            {/* ── Voice section ── */}
            <section>
              <SectionLabel>Tutor voice</SectionLabel>

              {previewError && (
                <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: "#fff1f2", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
                  {previewError}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 12 }}>
                {TUTOR_VOICES.map((voice) => {
                  const selected = selectedVoice === voice.name;
                  const previewing = previewingVoice === voice.name;
                  return (
                    <article
                      key={voice.name}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected}
                      onClick={() => selectVoice(voice.name)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectVoice(voice.name); } }}
                      style={{
                        minHeight: 120,
                        borderRadius: 10,
                        border: selected ? "1.5px solid #0a0a0a" : "1px solid #d0d0d0",
                        background: selected ? "#fbfaf8" : "#fff",
                        padding: 18,
                        cursor: "pointer",
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 16,
                        boxShadow: selected ? "0 2px 12px rgba(0,0,0,0.08)" : "none",
                        transition: "background 0.15s, border-color 0.15s, box-shadow 0.15s",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ width: 26, height: 4, borderRadius: 999, background: voice.color, marginBottom: 14 }} />
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
                          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650, color: "#0a0a0a" }}>{voice.label}</h2>
                          <span style={{ fontSize: 12, color: "#909090", fontWeight: 600 }}>{voice.tone}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: "#5a5a5a" }}>{voice.sampleText}</p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
                        <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: "50%", border: selected ? "5px solid #0a0a0a" : "1.5px solid #c0c0c0", background: "#fff", transition: "border 0.15s", flexShrink: 0 }} />
                        <PreviewButton active={previewing} onClick={(e) => { e.stopPropagation(); playPreview(voice.name, voice.sampleText); }} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* ── Profile section ── */}
            <section>
              <SectionLabel>Your profile</SectionLabel>

              {!profileLoaded ? (
                <p style={{ fontSize: 13, color: "#b0b0b0" }}>Loading…</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

                  {/* Name */}
                  <Field label="Display name" hint="Your tutor uses this to address you.">
                    <input
                      type="text"
                      value={profileForm.displayName}
                      onChange={(e) => setProfileForm((f) => ({ ...f, displayName: e.target.value }))}
                      placeholder="Your first name"
                      style={inputStyle}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#0a0a0a"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(10,10,10,0.07)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "#d0d0d0"; e.currentTarget.style.boxShadow = "none"; }}
                    />
                  </Field>

                  {/* Grade level */}
                  <Field label="Level" hint="Shapes how your tutor pitches explanations.">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {GRADES.map((g) => (
                        <button
                          key={g}
                          onClick={() => setProfileForm((f) => ({ ...f, gradeLevel: f.gradeLevel === g ? "" : g }))}
                          style={{
                            height: 34,
                            padding: "0 14px",
                            borderRadius: 8,
                            border: profileForm.gradeLevel === g ? "1.5px solid #0a0a0a" : "1px solid #d0d0d0",
                            background: profileForm.gradeLevel === g ? "#0a0a0a" : "#fff",
                            color: profileForm.gradeLevel === g ? "#fff" : "#0a0a0a",
                            fontSize: 13,
                            fontWeight: profileForm.gradeLevel === g ? 600 : 400,
                            cursor: "pointer",
                            transition: "all 0.12s",
                            fontFamily: "inherit",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {/* Learning prefs */}
                  <Field label="Learning preferences" hint="Adjust anytime — your tutor adapts immediately.">
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                      <PrefSlider
                        label="Hints vs. direct answers"
                        left="More hints"
                        right="Direct answers"
                        value={profileForm.prefs.hintVsAnswer}
                        onChange={(v) => setProfileForm((f) => ({ ...f, prefs: { ...f.prefs, hintVsAnswer: v } }))}
                      />
                      <PrefSlider
                        label="Pace"
                        left="Slow & thorough"
                        right="Fast & concise"
                        value={profileForm.prefs.pace}
                        onChange={(v) => setProfileForm((f) => ({ ...f, prefs: { ...f.prefs, pace: v } }))}
                      />
                      <PrefSlider
                        label="Style"
                        left="Examples first"
                        right="Theory first"
                        value={profileForm.prefs.examplesVsTheory}
                        onChange={(v) => setProfileForm((f) => ({ ...f, prefs: { ...f.prefs, examplesVsTheory: v } }))}
                      />
                      <PrefSlider
                        label="Tone"
                        left="Formal"
                        right="Casual"
                        value={profileForm.prefs.tone}
                        onChange={(v) => setProfileForm((f) => ({ ...f, prefs: { ...f.prefs, tone: v } }))}
                      />
                    </div>
                  </Field>

                  {/* Extra context */}
                  <Field label="Context for your tutor" hint="What you're working on, what you find hard, how you like to learn.">
                    <textarea
                      value={profileForm.extraContext}
                      onChange={(e) => setProfileForm((f) => ({ ...f, extraContext: e.target.value }))}
                      rows={4}
                      placeholder="e.g. I'm preparing for AP Calculus next month and struggle with related rates…"
                      style={{ ...inputStyle, height: "auto", padding: "10px 14px", resize: "none", lineHeight: 1.6 }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#0a0a0a"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(10,10,10,0.07)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "#d0d0d0"; e.currentTarget.style.boxShadow = "none"; }}
                    />
                  </Field>

                  <div>
                    <button
                      onClick={handleSaveProfile}
                      disabled={profileSaving}
                      style={{
                        height: 40,
                        paddingLeft: 20,
                        paddingRight: 20,
                        background: profileSaving ? "#909090" : "#0a0a0a",
                        color: "#fff",
                        border: "none",
                        borderRadius: 9,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: profileSaving ? "not-allowed" : "pointer",
                        transition: "background 0.15s",
                        fontFamily: "inherit",
                      }}
                      onMouseOver={(e) => { if (!profileSaving) e.currentTarget.style.background = "#2a2a2a"; }}
                      onMouseOut={(e) => { if (!profileSaving) e.currentTarget.style.background = "#0a0a0a"; }}
                    >
                      {profileSaving ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* ── Account section ── */}
            <section>
              <SectionLabel>Account</SectionLabel>
              <button
                onClick={() => signOut({ callbackUrl: "/signin" })}
                style={{
                  height: 38,
                  paddingLeft: 18,
                  paddingRight: 18,
                  background: "transparent",
                  color: "#b91c1c",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.12s",
                  fontFamily: "inherit",
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "#fff1f2")}
                onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
              >
                Sign out
              </button>
            </section>

          </div>
        </div>
      </main>
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "0 0 18px", fontSize: 11, fontWeight: 700, color: "#909090", textTransform: "uppercase", letterSpacing: "0.09em" }}>
      {children}
    </p>
  );
}

// ── Form field wrapper ────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#0a0a0a" }}>{label}</span>
        {hint && <span style={{ fontSize: 12, color: "#909090", marginLeft: 8 }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Pref slider (3-segment) ───────────────────────────────────────────────────
function PrefSlider({ label, left, right, value, onChange }: {
  label: string; left: string; right: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#383838", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "#909090", minWidth: 72, textAlign: "right" }}>{left}</span>
        <div style={{ display: "flex", gap: 5, flex: 1 }}>
          {([-1, 0, 1] as const).map((s) => (
            <button
              key={s}
              onClick={() => onChange(s)}
              title={s === -1 ? left : s === 1 ? right : "Balanced"}
              style={{
                flex: 1,
                height: 32,
                border: value === s ? "1.5px solid #0a0a0a" : "1px solid #d8d8d8",
                borderRadius: 7,
                background: value === s ? "#0a0a0a" : "#f8f8f8",
                cursor: "pointer",
                transition: "all 0.1s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: value === s ? "#fff" : "#c0c0c0" }} />
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: "#909090", minWidth: 72 }}>{right}</span>
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 14px",
  border: "1px solid #d0d0d0",
  borderRadius: 8,
  fontSize: 14,
  color: "#0a0a0a",
  background: "#fff",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
  transition: "border-color 0.12s, box-shadow 0.12s",
};

// ── Voice preview button ──────────────────────────────────────────────────────
function PreviewButton({ active, onClick }: { active: boolean; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={active ? "Stop sample" : "Play sample"}
      aria-label={active ? "Stop voice sample" : "Play voice sample"}
      style={{
        height: 32,
        width: 32,
        borderRadius: 8,
        border: "1px solid #d0d0d0",
        background: active ? "#0a0a0a" : "#fff",
        color: active ? "#fff" : "#0a0a0a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {active ? <StopIcon /> : <PlayIcon />}
    </button>
  );
}

function PlayIcon() {
  return <svg width="12" height="12" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M3.5 2.5l6 4-6 4v-8z" fill="currentColor" /></svg>;
}
function StopIcon() {
  return <svg width="12" height="12" viewBox="0 0 13 13" fill="none" aria-hidden="true"><rect x="3.25" y="3.25" width="6.5" height="6.5" rx="1" fill="currentColor" /></svg>;
}
