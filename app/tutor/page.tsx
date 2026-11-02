import type { Metadata } from "next";
import { TutorView } from "./TutorView";

export const metadata: Metadata = { title: "Your tutor · Chalk" };

export default function TutorPage() {
  return <TutorView />;
}
