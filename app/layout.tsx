import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tutor",
  description: "AI tutor — real-time voice and whiteboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
