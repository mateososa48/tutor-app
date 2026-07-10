"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "signin" | "signup";

function authErrorMessage(error: string | null): string {
  if (error === "CredentialsSignin") return "Incorrect email or password.";
  if (error) return "Something went wrong. Please try again.";
  return "";
}

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInFallback />}>
      <SignInContent />
    </Suspense>
  );
}

function SignInFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#FFFFFF",
        color: "#5a5a5a",
        fontSize: 14,
      }}
    >
      Loading sign in…
    </div>
  );
}

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => authErrorMessage(searchParams.get("error")));
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "signup") {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed.");
        setLoading(false);
        return;
      }
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError(mode === "signup" ? "Account created — sign in failed. Try again." : "Incorrect email or password.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleGoogle() {
    setLoading(true);
    await signIn("google", { callbackUrl: "/" });
  }

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
      {/* Card */}
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 2px 6px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.08)",
          padding: "40px 36px 36px",
          animation: "card-in 0.3s cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        {/* Logo mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 32 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: "#0a0a0a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1.5L13 12.5H1L7 1.5Z" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#0a0a0a", letterSpacing: "-0.01em" }}>
            Tutor
          </span>
        </div>

        {/* Heading */}
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "#0a0a0a",
            letterSpacing: "-0.02em",
            marginBottom: 4,
          }}
        >
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p style={{ fontSize: 14, color: "#5a5a5a", marginBottom: 28 }}>
          {mode === "signin"
            ? "Sign in to continue learning."
            : "Get started with your personal AI tutor."}
        </p>

        {/* Google OAuth */}
        {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true" && (
          <button
            onClick={handleGoogle}
            disabled={loading}
            style={{
              width: "100%",
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              border: "1px solid #d0d0d0",
              borderRadius: 10,
              background: "#fff",
              fontSize: 14,
              fontWeight: 500,
              color: "#0a0a0a",
              cursor: loading ? "not-allowed" : "pointer",
              marginBottom: 16,
              transition: "background 0.12s",
            }}
            onMouseOver={(e) => !loading && (e.currentTarget.style.background = "#f5f5f5")}
            onMouseOut={(e) => (e.currentTarget.style.background = "#fff")}
          >
            <GoogleIcon />
            Continue with Google
          </button>
        )}

        {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div style={{ flex: 1, height: 1, background: "#e8e8e8" }} />
            <span style={{ fontSize: 12, color: "#909090" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "#e8e8e8" }} />
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <Field label="Your name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex"
                required
                disabled={loading}
                style={inputStyle}
                onFocus={(e) => Object.assign(e.currentTarget.style, inputFocusStyle)}
                onBlur={(e) => Object.assign(e.currentTarget.style, inputStyle)}
              />
            </Field>
          )}

          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={loading}
              style={inputStyle}
              onFocus={(e) => Object.assign(e.currentTarget.style, inputFocusStyle)}
              onBlur={(e) => Object.assign(e.currentTarget.style, inputStyle)}
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              required
              minLength={mode === "signup" ? 8 : undefined}
              disabled={loading}
              style={inputStyle}
              onFocus={(e) => Object.assign(e.currentTarget.style, inputFocusStyle)}
              onBlur={(e) => Object.assign(e.currentTarget.style, inputStyle)}
            />
          </Field>

          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: "10px 14px",
                background: "#fff5f5",
                border: "1px solid #fecaca",
                borderRadius: 8,
                fontSize: 13,
                color: "#dc2626",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              height: 44,
              background: loading ? "#5a5a5a" : "#0a0a0a",
              color: "#fff",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.15s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
            onMouseOver={(e) => !loading && (e.currentTarget.style.background = "#2a2a2a")}
            onMouseOut={(e) => (e.currentTarget.style.background = loading ? "#5a5a5a" : "#0a0a0a")}
          >
            {loading && <Spinner />}
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {/* Mode toggle */}
        <p
          style={{
            textAlign: "center",
            fontSize: 13,
            color: "#5a5a5a",
            marginTop: 20,
            marginBottom: 0,
          }}
        >
          {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError("");
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              fontSize: 13,
              fontWeight: 600,
              color: "#0a0a0a",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>

      <style>{`
        @keyframes card-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 600,
          color: "#0a0a0a",
          marginBottom: 6,
          letterSpacing: "0.01em",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 14px",
  border: "1px solid #d0d0d0",
  borderRadius: 8,
  fontSize: 14,
  color: "#0a0a0a",
  background: "#fff",
  outline: "none",
  transition: "border-color 0.12s, box-shadow 0.12s",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const inputFocusStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: "#0a0a0a",
  boxShadow: "0 0 0 3px rgba(10,10,10,0.08)",
};

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      style={{ animation: "spin 0.7s linear infinite" }}
    >
      <circle cx="7" cy="7" r="5.5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
    </svg>
  );
}
