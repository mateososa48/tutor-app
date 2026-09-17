import { notFound } from "next/navigation";
import DesmosProbe from "./DesmosProbe";

// Dev-only: renders a list of Desmos API questions to SVG and reports which
// features actually work in the v1.12 screenshot path the board uses. The
// answers are recorded in AGENTS.md ("Desmos facts (verified)").

export const dynamic = "force-dynamic";

export default function DesmosProbePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesmosProbe />;
}
