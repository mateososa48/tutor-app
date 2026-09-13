import { NextRequest, NextResponse } from "next/server";
import { encode } from "@auth/core/jwt";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, userProfiles } from "@/lib/db/schema";

const QA_EMAIL = "codex-qa@example.test";
const QA_NAME = "Codex QA";
const QA_PASSWORD = "CodexQa123!";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!process.env.AUTH_SECRET) {
    return NextResponse.json({ error: "Missing AUTH_SECRET" }, { status: 500 });
  }

  let [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, image: users.image })
    .from(users)
    .where(eq(users.email, QA_EMAIL))
    .limit(1);

  if (!user) {
    const passwordHash = await bcrypt.hash(QA_PASSWORD, 12);
    const [created] = await db
      .insert(users)
      .values({
        name: QA_NAME,
        email: QA_EMAIL,
        passwordHash,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      });
    user = created;
  }

  if (!user?.id || !user.email) {
    return NextResponse.json({ error: "Could not prepare QA user" }, { status: 500 });
  }

  const now = new Date();
  await db
    .insert(userProfiles)
    .values({
      userId: user.id,
      displayName: QA_NAME,
      gradeLevel: "High school (9-12)",
      learningPrefs: {},
      extraContext: "QA testing account for tutor behavior checks.",
      voiceName: "marin",
      onboardedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: {
        onboardedAt: now,
        updatedAt: now,
      },
    });

  const token = await encode({
    secret: process.env.AUTH_SECRET,
    salt: "authjs.session-token",
    maxAge: MAX_AGE_SECONDS,
    token: {
      id: user.id,
      sub: user.id,
      name: user.name ?? QA_NAME,
      email: user.email,
      picture: user.image ?? null,
      onboarded: true,
    },
  });

  const redirectUrl = new URL("/session?debug=1", req.url);
  const res = NextResponse.redirect(redirectUrl);
  res.cookies.set("authjs.session-token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    maxAge: MAX_AGE_SECONDS,
  });
  return res;
}
