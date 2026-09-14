import { Suspense } from "react";
import { notFound } from "next/navigation";
import LandingScene from "./LandingScene";

// Dev-only: the whiteboard replaying one of the landing page's scenes, so
// `scripts/landing-shots.mjs` can photograph real boards for the page.
// /dev/landing?scene=hero|steps|hint|worksheet&step=120&count=N

export const dynamic = "force-dynamic";

export default function LandingScenePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <LandingScene />
    </Suspense>
  );
}
