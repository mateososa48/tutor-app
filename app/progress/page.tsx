import type { Metadata } from "next";
import { ProgressView } from "./ProgressView";

export const metadata: Metadata = { title: "Progress · Chalk" };

export default function ProgressPage() {
  return <ProgressView />;
}
