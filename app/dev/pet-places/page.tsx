import { notFound } from "next/navigation";
import Places from "./Places";

// Dev-only: the pet on every surface it could live on, at real size, so the
// placement can be chosen from the thing rather than from a description.
// /dev/pet-places

export const dynamic = "force-dynamic";

export default function PetPlacesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Places />;
}
