import { notFound } from "next/navigation";
import VoiceLab from "./VoiceLab";

// Dev-only: hear the tutor voice at each speed without opening a Gemini
// session. /dev/voice

export const dynamic = "force-dynamic";

export default function VoiceLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <VoiceLab />;
}
