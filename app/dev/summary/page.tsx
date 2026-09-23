import { Suspense } from "react";
import { notFound } from "next/navigation";
import SummaryMockups from "./SummaryMockups";

// Dev-only: five layouts for the post-session summary, inside the real app
// shell, on the real mock summary. /dev/summary?v=1..5 (&shot=1 hides the
// switcher). Same format as /dev/home.

export const dynamic = "force-dynamic";

export default function SummaryMockupsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <SummaryMockups />
    </Suspense>
  );
}
