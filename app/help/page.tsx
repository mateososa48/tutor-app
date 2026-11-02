import type { Metadata } from "next";
import { HelpView } from "./HelpView";

export const metadata: Metadata = { title: "Help · Chalk" };

export default function HelpPage() {
  return <HelpView />;
}
