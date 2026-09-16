import { Suspense } from "react";
import { notFound } from "next/navigation";
import HomeMockups from "./HomeMockups";

// Dev-only: eight directions for the signed-in home page, inside the real app
// shell, on mock data. /dev/home?v=1..8 (add &shot=1 to hide the switcher).

export const dynamic = "force-dynamic";

export default function HomeMockupsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <HomeMockups />
    </Suspense>
  );
}
