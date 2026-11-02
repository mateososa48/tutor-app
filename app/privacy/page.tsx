import type { Metadata } from "next";
import { PrivacyView } from "./PrivacyView";

export const metadata: Metadata = { title: "Privacy & data · Chalk" };

export default function PrivacyPage() {
  return <PrivacyView />;
}
