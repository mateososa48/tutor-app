import { Suspense } from "react";
import { SummaryClient } from "./SummaryClient";

// The client half reads ?mock= with useSearchParams, which Next cannot
// prerender without a boundary, so it sits inside Suspense (the same shape as
// app/session/page.tsx).
export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <SummaryClient id={id} />
    </Suspense>
  );
}
