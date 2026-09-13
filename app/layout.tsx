import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { body, display, hand } from "@/components/landing/fonts";

export const metadata: Metadata = {
  title: "Chalk: a tutor at the board",
  description: "Talk through homework with a tutor that draws every step on a whiteboard and never just gives the answer.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full ${display.variable} ${body.variable} ${hand.variable}`}>
      <body className="h-full">
        <SessionProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
