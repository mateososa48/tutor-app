import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// /api/faq answers the landing page's "ask anything" row, which anyone can see.
const PUBLIC_PATHS = ["/signin", "/api/auth", "/api/faq"];
const DEV_PUBLIC_PATHS = process.env.NODE_ENV === "development"
  ? ["/api/dev/qa-login", "/dev/board", "/dev/voice", "/dev/desmos-probe", "/dev/pdf", "/dev/pet", "/dev/pet-places"]
  : [];
// Files in public/ are served from the root: the landing page's board photos live under /landing,
// vendored browser modules (the voice speed engine) under /vendor.
const STATIC_PATHS = ["/_next", "/favicon.ico", "/public", "/landing", "/vendor"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow static assets and auth API
  if (
    STATIC_PATHS.some((p) => pathname.startsWith(p)) ||
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    DEV_PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  // secureCookie must be set explicitly — Next.js 16 middleware doesn't expose
  // the protocol to getToken's auto-detection, so it defaults to false and
  // looks for `authjs.session-token` instead of `__Secure-authjs.session-token`.
  const isSecure =
    process.env.NODE_ENV === "production" ||
    !!process.env.AUTH_URL?.startsWith("https://");
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: isSecure,
  });

  // Not signed in → the root shows the public landing page; everything else
  // redirects to /signin
  if (!token) {
    if (pathname === "/") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    return NextResponse.redirect(url);
  }

  // Signed in but not onboarded → redirect to /onboarding
  // Allow /api/onboarding so the onboarding form can save the profile
  if (!token.onboarded && pathname !== "/onboarding" && !pathname.startsWith("/api/onboarding")) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
  }

  // Already onboarded, don't let them re-enter onboarding. In development,
  // /onboarding?preview=1 walks it again from an onboarded account without
  // saving anything (the page skips the write), so the flow can be reviewed.
  if (token.onboarded && pathname === "/onboarding") {
    const preview = process.env.NODE_ENV === "development" && request.nextUrl.searchParams.get("preview") === "1";
    if (!preview) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
