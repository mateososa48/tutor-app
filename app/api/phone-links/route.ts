import { networkInterfaces } from "node:os";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createLink } from "@/lib/db/phone-links";
import { phoneOrigin, pickLanAddress } from "@/lib/phone-link";

// POST /api/phone-links — a new code for sending photos from a phone to this
// laptop. Returns the link's id (the laptop polls with it), the URL for the QR
// code, and when it stops working.
//
// In development the URL uses this computer's address on the local network
// instead of "localhost", which a phone cannot open. next.config.ts allows
// private network origins for exactly this.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, token, expiresAt } = await createLink(session.user.id);
  const lan = process.env.NODE_ENV === "development" ? pickLanAddress(networkInterfaces()) : null;
  const url = `${phoneOrigin(req.nextUrl.origin, lan)}/snap/${token}`;
  return NextResponse.json({ id, url, expiresAt }, { headers: { "Cache-Control": "no-store" } });
}
