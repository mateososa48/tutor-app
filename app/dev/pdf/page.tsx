import { notFound } from "next/navigation";
import PdfLab from "./PdfLab";

// Dev-only: renders an uploaded PDF the way a session does (lib/worksheet-pages)
// and shows each page picture with its size and how long it took.

export const dynamic = "force-dynamic";

export default function PdfLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PdfLab />;
}
