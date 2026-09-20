import { notFound } from "next/navigation";
import PetLab from "./PetLab";

// Dev-only: the tutor's pet in every shape and state, to judge the body and
// the motion before it goes near a session. /dev/pet

export const dynamic = "force-dynamic";

export default function PetLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PetLab />;
}
