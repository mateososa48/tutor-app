import type { Metadata } from "next";
import { PracticeView } from "./PracticeView";

export const metadata: Metadata = { title: "Practice · Chalk" };

export default function PracticePage() {
  return <PracticeView />;
}
