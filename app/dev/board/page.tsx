import { Suspense } from "react";
import { notFound } from "next/navigation";
import BoardDemo from "./BoardDemo";

// Dev-only: renders the whiteboard and replays a scripted set of tool calls
// with no OpenAI session, so every diagram can be checked by eye for free.
// /dev/board?demo=fractions|algebra|geometry|data|all&step=500

export const dynamic = "force-dynamic";

export default function BoardDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <BoardDemo />
    </Suspense>
  );
}
