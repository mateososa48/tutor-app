"use client";

import { Suspense, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DitherWave } from "@/components/landing/DitherWave";
import { VOICE_BLUE } from "@/components/session/VoiceWave";
import { ChalkMark } from "@/components/app/ChalkMark";
import { useReduce } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";

// Sign in and sign up on one screen. The layout follows shadcnui-blocks'
// login-04 (a narrow centred form beside a tall rounded panel); the pieces are
// the app's own: shadcn Field / Input, the glossy default Button, the Chalk
// scribble mark, and the landing hero's dithered shader in its swirl pattern
// filling the panel, with the mark and the Sora wordmark at its foot.

type Mode = "signin" | "signup";
type FieldName = "name" | "email" | "password";
type Errors = Partial<Record<FieldName, string>>;

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The panel uses the tutor's voice wave palette (VoiceWave.tsx): its light blue
// over its near-white, with the darkest tone pulled 40% from the voice's deep
// blue toward its light blue, so the panel reads light. Module-level, so the
// shader is not rebuilt on every render.
const PANEL_DEEP: [number, number, number] = [0, 1, 2].map(
  (i) => VOICE_BLUE.deep[i] + (VOICE_BLUE.top[i] - VOICE_BLUE.deep[i]) * 0.4,
) as [number, number, number];

const INPUT = "h-11 sm:h-10 rounded-[10px] border-(--lp-line-strong) bg-white px-3 text-[14px] md:text-[14px]";

function urlError(code: string | null): string {
  switch (code) {
    case null:
      return "";
    case "CredentialsSignin":
      return "That email and password don't match.";
    case "OAuthAccountNotLinked":
      return "That email already has a password. Sign in with it below.";
    case "AccessDenied":
      return "Google didn't allow that sign-in. Try again.";
    default:
      return "Something went wrong signing in. Try again.";
  }
}

// Same-site paths only, so a crafted link can't send someone off the site.
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

const WIDE = "(min-width: 1024px)";
const subscribeWide = (onChange: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-white" />}>
      <SignIn />
    </Suspense>
  );
}

function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("callbackUrl"));
  const reduce = useReduce();
  // The shader only runs where its panel is shown.
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);

  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState(() => urlError(params.get("error")));
  const [pending, setPending] = useState<"email" | "google" | null>(null);

  const signup = mode === "signup";
  const busy = pending !== null;

  const clearError = (field: FieldName) => setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));

  function switchMode() {
    const to: Mode = signup ? "signin" : "signup";
    setMode(to);
    setErrors({});
    setFormError("");
    const query = new URLSearchParams(params.toString());
    if (to === "signup") query.set("mode", "signup");
    else query.delete("mode");
    query.delete("error");
    const search = query.toString();
    router.replace(search ? `/signin?${search}` : "/signin", { scroll: false });
  }

  function validate(): Errors {
    const found: Errors = {};
    if (signup && !name.trim()) found.name = "Tell us what to call you.";
    if (!email.trim()) found.email = "Enter your email.";
    else if (!EMAIL.test(email.trim())) found.email = "That doesn't look like an email address.";
    if (!password) found.password = "Enter your password.";
    else if (signup && password.length < 8) found.password = "Use at least 8 characters.";
    return found;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError("");
    const first = (["name", "email", "password"] as const).find((field) => found[field]);
    if (first) {
      document.getElementById(`auth-${first}`)?.focus();
      return;
    }

    setPending("email");
    const cleanEmail = email.trim();
    try {
      if (signup) {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), email: cleanEmail, password }),
        });
        if (!res.ok) {
          const data: { error?: string } = await res.json().catch(() => ({}));
          if (res.status === 409) setErrors({ email: "There's already an account with this email. Sign in instead." });
          else setFormError(data.error ?? "Couldn't create your account. Try again.");
          setPending(null);
          return;
        }
      }

      const result = await signIn("credentials", { email: cleanEmail, password, redirect: false });
      if (result?.error) {
        setFormError(signup ? "Your account is ready, but signing in failed. Try signing in." : "That email and password don't match.");
        setPending(null);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setFormError("Couldn't reach Chalk. Check your connection and try again.");
      setPending(null);
    }
  }

  async function onGoogle() {
    setFormError("");
    setPending("google");
    await signIn("google", { callbackUrl: next });
  }

  const describedBy = (field: FieldName) => (errors[field] ? `auth-${field}-error` : undefined);
  const spinner = <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />;

  return (
    <div className="flex min-h-[100dvh] bg-white p-3 text-(--lp-ink) sm:p-4">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-[320px] flex-col items-center">
          <Link
            href="/"
            aria-label="Chalk home"
            className="rounded-[10px] outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
          >
            <ChalkMark size={48} />
          </Link>
          <h1 className="lp-display mt-4 text-center text-[22px] leading-[1.2] text-balance">
            {signup ? "Create your Chalk account" : "Sign in to Chalk"}
          </h1>
          <p className="mt-1 text-center text-[14px] leading-[1.5] text-(--lp-ink-2)">
            {signup ? "Then start your first session." : "Pick up where you left off."}
          </p>

          {GOOGLE_ENABLED && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={onGoogle}
                disabled={busy}
                className="mt-7 h-11 w-full gap-2.5 rounded-[10px] sm:h-10 border-(--lp-line-strong) bg-white text-[14px] font-semibold text-(--lp-ink)"
              >
                {pending === "google" ? spinner : <GoogleIcon />}
                Continue with Google
              </Button>
              <FieldSeparator className="my-5 w-full">or</FieldSeparator>
            </>
          )}

          <form noValidate onSubmit={onSubmit} className={cn("w-full", !GOOGLE_ENABLED && "mt-7")}>
            <FieldGroup className="gap-3.5">
              {signup && (
                <Field data-invalid={Boolean(errors.name)}>
                  <FieldLabel htmlFor="auth-name">Name</FieldLabel>
                  <Input
                    id="auth-name"
                    name="name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      clearError("name");
                    }}
                    disabled={busy}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={describedBy("name")}
                    className={INPUT}
                  />
                  <FieldError id="auth-name-error">{errors.name}</FieldError>
                </Field>
              )}

              <Field data-invalid={Boolean(errors.email)}>
                <FieldLabel htmlFor="auth-email">Email</FieldLabel>
                <Input
                  id="auth-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError("email");
                  }}
                  disabled={busy}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={describedBy("email")}
                  className={INPUT}
                />
                <FieldError id="auth-email-error">{errors.email}</FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.password)}>
                <FieldLabel htmlFor="auth-password">Password</FieldLabel>
                <div className="relative">
                  <Input
                    id="auth-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={signup ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearError("password");
                    }}
                    disabled={busy}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={describedBy("password") ?? (signup ? "auth-password-hint" : undefined)}
                    className={cn(INPUT, "pr-11")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    disabled={busy}
                    className="absolute top-1 right-1 size-9 rounded-[8px] sm:size-8 text-(--lp-ink-2) hover:text-(--lp-ink)"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
                {errors.password ? (
                  <FieldError id="auth-password-error">{errors.password}</FieldError>
                ) : (
                  signup && <FieldDescription id="auth-password-hint">At least 8 characters.</FieldDescription>
                )}
              </Field>

              {formError && (
                <p role="alert" className="m-0 rounded-[10px] bg-[#fff1f0] px-3 py-2 text-[13.5px] leading-[1.45] text-(--danger)">
                  {formError}
                </p>
              )}

              {/* The glossy black default Button (.btn-gloss), squared to the inputs' radius. */}
              <Button type="submit" disabled={busy} className="btn-gloss-lift mt-1 h-11 w-full gap-2 rounded-[10px] text-[14px] font-semibold sm:h-10">
                {pending === "email" && spinner}
                {pending === "email" ? (signup ? "Creating account…" : "Signing in…") : signup ? "Create account" : "Sign in"}
              </Button>
            </FieldGroup>
          </form>

          <p className="mt-5 text-center text-[13.5px] text-(--lp-ink-2)">
            {signup ? "Already have an account?" : "New to Chalk?"}{" "}
            <button
              type="button"
              onClick={switchMode}
              className="rounded-[4px] font-semibold text-(--lp-ink) underline underline-offset-4 outline-none transition-colors hover:text-(--lp-sky-deep) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
            >
              {signup ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>
      </main>

      {/* The hero's shader, in the block's image slot. Decorative. */}
      <aside aria-hidden className="relative hidden w-[min(46%,720px)] shrink-0 overflow-hidden rounded-[20px] bg-[#4696f7] lg:block">
        {wide && (
          <DitherWave
            pattern="swirl"
            waveColor={VOICE_BLUE.top}
            deepColor={PANEL_DEEP}
            backgroundColor={VOICE_BLUE.bg}
            colorNum={7}
            pixelSize={3}
            waveAmplitude={0.45}
            waveFrequency={1.7}
            waveSpeed={0.035}
            animate={!reduce}
            className="absolute inset-0"
          />
        )}
        <p className="absolute bottom-6 left-6 m-0 flex items-center gap-2 text-(--lp-ink)">
          <ChalkMark size={28} color="var(--lp-ink)" />
          <span className="lp-brand text-[28px] leading-none">chalk</span>
        </p>
      </aside>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
    </svg>
  );
}
