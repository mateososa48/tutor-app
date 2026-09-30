import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { users, accounts, verificationTokens, userProfiles } from "@/lib/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      onboarded: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    onboarded: boolean;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const providers: any[] = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, credentials.email as string))
        .limit(1);

      if (!user || !user.passwordHash) return null;

      const valid = await bcrypt.compare(
        credentials.password as string,
        user.passwordHash,
      );
      if (!valid) return null;

      return { id: user.id, name: user.name, email: user.email, image: user.image };
    },
  }),
];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.unshift(Google);
}

async function readOnboarded(userId: string): Promise<boolean> {
  try {
    const [profile] = await db
      .select({ onboardedAt: userProfiles.onboardedAt })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    return !!profile?.onboardedAt;
  } catch (err) {
    console.error("[auth] jwt callback userProfiles query failed:", err);
    return false;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  providers,
  trustHost: true,
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id!;
        token.onboarded = await readOnboarded(user.id!);
      }
      // A client's update() payload is whatever the browser sends, so the flag
      // is read back from the database rather than copied: until Sept 30 any
      // browser could mark itself onboarded by posting { onboarded: true }.
      // The onboarding page saves the profile before it calls update().
      if (trigger === "update" && token.id) {
        token.onboarded = await readOnboarded(token.id);
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.onboarded = token.onboarded;
      }
      return session;
    },
  },
});
