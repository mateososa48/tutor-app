"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const GRADES = [
  "Middle school (6–8)",
  "High school (9–12)",
  "College / University",
  "Self-learner",
];

const VOICES = [
  { name: "Kore", label: "Kore", desc: "Warm & encouraging" },
  { name: "Puck", label: "Puck", desc: "Energetic & friendly" },
  { name: "Zephyr", label: "Zephyr", desc: "Calm & measured" },
  { name: "Aoede", label: "Aoede", desc: "Clear & precise" },
  { name: "Charon", label: "Charon", desc: "Deep & thoughtful" },
  { name: "Sulafat", label: "Sulafat", desc: "Bright & articulate" },
];

const CONTEXT_PLACEHOLDERS = [
  "I'm preparing for the AP Calculus exam next month…",
  "I struggle with story problems but love algebra…",
  "I learn best when I can see diagrams and examples…",
  "I'm trying to understand derivatives from scratch…",
  "I want to improve my essay structure for English class…",
];

type Prefs = {
  hintVsAnswer: number;   // -1 hints, 0 balanced, 1 answers
  pace: number;            // -1 slow, 0 medium, 1 fast
  examplesVsTheory: number;
  tone: number;           // -1 strict, 0 balanced, 1 casual
};

type FormState = {
  displayName: string;
  gradeLevel: string;
  prefs: Prefs;
  extraContext: string;
  voiceName: string;
};

const STEP_COUNT = 5;

export default function OnboardingPage() {
  const { update } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    displayName: "",
    gradeLevel: "",
    prefs: { hintVsAnswer: 0, pace: 0, examplesVsTheory: 0, tone: 0 },
    extraContext: "",
    voiceName: "Kore",
  });

  function canAdvance(): boolean {
    if (step === 0) return form.displayName.trim().length > 0;
    if (step === 1) return form.gradeLevel.length > 0;
    return true;
  }

  function next() {
    if (step < STEP_COUNT - 1) setStep((s) => s + 1);
  }

  function back() {
    if (step > 0) setStep((s) => s - 1);
  }

  async function finish() {
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.displayName,
          gradeLevel: form.gradeLevel,
          learningPrefs: form.prefs,
          extraContext: form.extraContext,
          voiceName: form.voiceName,
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      await update({ onboarded: true });
      router.push("/");
    } catch (err) {
      console.error("[onboarding] finish error:", err);
      setSaving(false);
    }
  }

  const progress = ((step + 1) / STEP_COUNT) * 100;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#FFFFFF",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 2px 6px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.08)",
          overflow: "hidden",
          animation: "card-in 0.3s cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        {/* Progress bar */}
        <div style={{ height: 3, background: "#f0f0f0" }}>
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "#0a0a0a",
              transition: "width 0.4s cubic-bezier(0.22,1,0.36,1)",
            }}
          />
        </div>

        <div style={{ padding: "36px 36px 32px" }}>
          {/* Step counter */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#909090",
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            {step + 1} of {STEP_COUNT}
          </div>

          {/* Steps */}
          <div
            key={step}
            style={{ animation: "step-in 0.22s cubic-bezier(0.22,1,0.36,1) both" }}
          >
            {step === 0 && (
              <StepName
                value={form.displayName}
                onChange={(v) => setForm((f) => ({ ...f, displayName: v }))}
              />
            )}
            {step === 1 && (
              <StepGrade
                value={form.gradeLevel}
                onChange={(v) => setForm((f) => ({ ...f, gradeLevel: v }))}
              />
            )}
            {step === 2 && (
              <StepPrefs
                value={form.prefs}
                onChange={(v) => setForm((f) => ({ ...f, prefs: v }))}
              />
            )}
            {step === 3 && (
              <StepContext
                value={form.extraContext}
                onChange={(v) => setForm((f) => ({ ...f, extraContext: v }))}
              />
            )}
            {step === 4 && (
              <StepVoice
                value={form.voiceName}
                onChange={(v) => setForm((f) => ({ ...f, voiceName: v }))}
              />
            )}
          </div>

          {/* Navigation */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 32,
            }}
          >
            {step > 0 ? (
              <button onClick={back} style={backBtnStyle}>
                Back
              </button>
            ) : (
              <div />
            )}

            {step < STEP_COUNT - 1 ? (
              <button
                onClick={next}
                disabled={!canAdvance()}
                style={nextBtnStyle(!canAdvance())}
                onMouseOver={(e) =>
                  canAdvance() && (e.currentTarget.style.background = "#2a2a2a")
                }
                onMouseOut={(e) => (e.currentTarget.style.background = "#0a0a0a")}
              >
                Continue
                <ArrowRight />
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={saving}
                style={nextBtnStyle(saving)}
                onMouseOver={(e) =>
                  !saving && (e.currentTarget.style.background = "#2a2a2a")
                }
                onMouseOut={(e) => (e.currentTarget.style.background = "#0a0a0a")}
              >
                {saving ? "Saving…" : "Start learning"}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes card-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes step-in {
          from { opacity: 0; transform: translateX(8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ── Step 0: Name ─────────────────────────────────────────────────────────────

function StepName({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div>
      <h1 style={headingStyle}>What should we call you?</h1>
      <p style={subStyle}>Your tutor will use this name to greet you each session.</p>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && value.trim() && (e.currentTarget.blur())}
        placeholder="Your first name"
        style={largeInputStyle}
        onFocus={(e) =>
          Object.assign(e.currentTarget.style, {
            ...largeInputStyle,
            borderColor: "#0a0a0a",
            boxShadow: "0 0 0 3px rgba(10,10,10,0.08)",
          })
        }
        onBlur={(e) => Object.assign(e.currentTarget.style, largeInputStyle)}
      />
    </div>
  );
}

// ── Step 1: Grade ─────────────────────────────────────────────────────────────

function StepGrade({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <h1 style={headingStyle}>What level are you at?</h1>
      <p style={subStyle}>This helps your tutor pitch explanations at the right depth.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
        {GRADES.map((g) => (
          <button
            key={g}
            onClick={() => onChange(g)}
            style={{
              height: 48,
              padding: "0 18px",
              border: value === g ? "1.5px solid #0a0a0a" : "1px solid #d0d0d0",
              borderRadius: 10,
              background: value === g ? "#0a0a0a" : "#fff",
              color: value === g ? "#fff" : "#0a0a0a",
              fontSize: 14,
              fontWeight: value === g ? 600 : 400,
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.12s",
              fontFamily: "inherit",
            }}
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: Learning prefs (sliders) ─────────────────────────────────────────

function StepPrefs({ value, onChange }: { value: Prefs; onChange: (v: Prefs) => void }) {
  function set(key: keyof Prefs, val: number) {
    onChange({ ...value, [key]: val });
  }

  return (
    <div>
      <h1 style={headingStyle}>How do you learn best?</h1>
      <p style={subStyle}>These shape how your tutor explains things. Adjust anytime in settings.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 24 }}>
        <Slider
          label="Hints vs. Direct answers"
          left="More hints"
          right="Give me answers"
          value={value.hintVsAnswer}
          onChange={(v) => set("hintVsAnswer", v)}
        />
        <Slider
          label="Pace"
          left="Slow & thorough"
          right="Fast & concise"
          value={value.pace}
          onChange={(v) => set("pace", v)}
        />
        <Slider
          label="Style"
          left="Lots of examples"
          right="Theory first"
          value={value.examplesVsTheory}
          onChange={(v) => set("examplesVsTheory", v)}
        />
        <Slider
          label="Tone"
          left="Formal & rigorous"
          right="Casual & friendly"
          value={value.tone}
          onChange={(v) => set("tone", v)}
        />
      </div>
    </div>
  );
}

function Slider({
  label,
  left,
  right,
  value,
  onChange,
}: {
  label: string;
  left: string;
  right: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const steps = [-1, 0, 1];
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#0a0a0a",
          marginBottom: 10,
          letterSpacing: "0.01em",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {steps.map((s) => (
          <button
            key={s}
            onClick={() => onChange(s)}
            title={s === -1 ? left : s === 1 ? right : "Balanced"}
            style={{
              flex: 1,
              height: 36,
              border: value === s ? "1.5px solid #0a0a0a" : "1px solid #d8d8d8",
              borderRadius: 8,
              background: value === s ? "#0a0a0a" : "#f8f8f8",
              cursor: "pointer",
              transition: "all 0.1s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: value === s ? "#fff" : "#c0c0c0",
              }}
            />
          </button>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
        }}
      >
        <span style={{ fontSize: 11, color: "#909090" }}>{left}</span>
        <span style={{ fontSize: 11, color: "#909090" }}>{right}</span>
      </div>
    </div>
  );
}

// ── Step 3: Extra context ─────────────────────────────────────────────────────

function StepContext({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [phIdx, setPhIdx] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [typing, setTyping] = useState(true);
  const typerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!typing) return;
    const target = CONTEXT_PLACEHOLDERS[phIdx];
    if (displayed.length < target.length) {
      typerRef.current = setTimeout(() => {
        setDisplayed(target.slice(0, displayed.length + 1));
      }, 28);
    } else {
      typerRef.current = setTimeout(() => {
        setTyping(false);
        setTimeout(() => {
          setDisplayed("");
          setPhIdx((i) => (i + 1) % CONTEXT_PLACEHOLDERS.length);
          setTyping(true);
        }, 1800);
      }, 1200);
    }
    return () => { if (typerRef.current) clearTimeout(typerRef.current); };
  }, [displayed, typing, phIdx]);

  return (
    <div>
      <h1 style={headingStyle}>Anything else to know?</h1>
      <p style={subStyle}>
        Share what you&apos;re working toward, what you find hard, or how you like to study. Optional — skip if you prefer.
      </p>
      <div style={{ position: "relative", marginTop: 20 }}>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={value ? "" : displayed}
          rows={5}
          style={{
            width: "100%",
            padding: "14px 16px",
            border: "1px solid #d0d0d0",
            borderRadius: 10,
            fontSize: 14,
            color: "#0a0a0a",
            background: "#fff",
            resize: "none",
            outline: "none",
            fontFamily: "inherit",
            lineHeight: 1.6,
            boxSizing: "border-box",
            transition: "border-color 0.12s, box-shadow 0.12s",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "#0a0a0a";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(10,10,10,0.08)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "#d0d0d0";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
      </div>
      <p style={{ fontSize: 12, color: "#909090", marginTop: 8 }}>
        Your tutor reads this before each session to personalize how they help you.
      </p>
    </div>
  );
}

// ── Step 4: Voice ─────────────────────────────────────────────────────────────

function StepVoice({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <h1 style={headingStyle}>Choose your tutor&apos;s voice</h1>
      <p style={subStyle}>Pick the voice you&apos;d enjoy listening to during sessions.</p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginTop: 20,
        }}
      >
        {VOICES.map((v) => (
          <button
            key={v.name}
            onClick={() => onChange(v.name)}
            style={{
              padding: "14px 16px",
              border: value === v.name ? "1.5px solid #0a0a0a" : "1px solid #d0d0d0",
              borderRadius: 10,
              background: value === v.name ? "#0a0a0a" : "#fff",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.12s",
              fontFamily: "inherit",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: value === v.name ? "#fff" : "#0a0a0a",
                marginBottom: 3,
              }}
            >
              {v.label}
            </div>
            <div
              style={{
                fontSize: 12,
                color: value === v.name ? "rgba(255,255,255,0.65)" : "#909090",
              }}
            >
              {v.desc}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const headingStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  color: "#0a0a0a",
  letterSpacing: "-0.02em",
  marginBottom: 6,
};

const subStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#5a5a5a",
  lineHeight: 1.5,
};

const largeInputStyle: React.CSSProperties = {
  width: "100%",
  height: 52,
  padding: "0 18px",
  border: "1px solid #d0d0d0",
  borderRadius: 10,
  fontSize: 16,
  color: "#0a0a0a",
  background: "#fff",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
  marginTop: 20,
  transition: "border-color 0.12s, box-shadow 0.12s",
};

const backBtnStyle: React.CSSProperties = {
  height: 40,
  paddingLeft: 16,
  paddingRight: 16,
  background: "transparent",
  color: "#5a5a5a",
  border: "1px solid #d0d0d0",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

function nextBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 44,
    paddingLeft: 22,
    paddingRight: 22,
    background: disabled ? "#9a9a9a" : "#0a0a0a",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontFamily: "inherit",
    transition: "background 0.15s",
  };
}

function ArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
