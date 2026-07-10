import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "next-auth/react";

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
      <body className="h-full">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
