import type { Metadata } from "next";
import { SettingsView } from "./SettingsView";

export const metadata: Metadata = { title: "Settings · Chalk" };

export default function SettingsPage() {
  return <SettingsView />;
}
