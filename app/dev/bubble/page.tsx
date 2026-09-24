import { notFound } from "next/navigation";
import BubbleLab from "./BubbleLab";

// Dev-only: the pet's bubble on the real voice dock, driven by a real Gemini
// turn at its real timing, plus thinking, the quiet line, "Your turn" and an
// interrupted line. /dev/bubble. `window.__bubble` drives it from a script.

export const dynamic = "force-dynamic";

export default function BubbleLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BubbleLab />;
}
