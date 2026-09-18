import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadLearningOverview } from "@/lib/learning-overview";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await loadLearningOverview(session.user.id));
}

