import type { Metadata } from "next";
import { SessionsView } from "./SessionsView";

export const metadata: Metadata = { title: "Sessions · Chalk" };

export default function SessionsPage() {
  return <SessionsView />;
}
