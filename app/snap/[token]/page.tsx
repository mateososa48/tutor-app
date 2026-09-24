import type { Metadata, Viewport } from "next";
import { snapView } from "@/lib/db/phone-links";
import { isTokenShape } from "@/lib/phone-link";
import { SnapClient } from "./SnapClient";

// The page a phone opens from the QR code on the laptop (lib/phone-link.ts).
// Public: the phone is not signed in, and the token in the URL is its only
// permission. Every state renders a page that explains itself, including a
// code that never existed, so a stale screenshot of a QR code gets words
// rather than an error.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Send a photo · Chalk",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbfbfc",
};

export default async function SnapPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const initial = isTokenShape(token) ? await snapView(token) : { state: "missing" as const, expiresAt: 0, uploads: 0 };
  return <SnapClient token={token} initial={initial} />;
}
