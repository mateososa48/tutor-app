import { notFound } from "next/navigation";
import StudentLab from "./StudentLab";

// Dev-only: candidate student clips for the landing hero's call tile, each in
// the real tile, talking and quiet in turn. /dev/student (files in
// public/dev/student/, listed in its candidates.json; gitignored).

export const dynamic = "force-dynamic";

export default function StudentLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StudentLab />;
}
