// Who can open /admin: only Mateo's account (Sept 15 2026). Server pages and
// routes enforce this; the sidebar only uses it to show the link.
export const ADMIN_EMAILS: readonly string[] = ["msosaalbrecht@gmail.com"];

// The local QA account (/api/dev/qa-login) counts as admin in development only,
// so the admin pages can be checked without a real account.
const DEV_QA_EMAIL = "codex-qa@example.test";

export function isAdminEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  if (ADMIN_EMAILS.includes(normalized)) return true;
  return process.env.NODE_ENV === "development" && normalized === DEV_QA_EMAIL;
}
