import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { FooterWave } from "./FooterWave";
import { Wordmark } from "./Wordmark";

// Links and the wordmark on the page, then a sign-off line sitting in a band of
// the tutor's voice wave (FooterWave) that rises from the bottom of the page.

const SITE = [
  ["How it works", "#how-it-works"],
  ["What it does", "#capabilities"],
  ["For parents", "#parents"],
  ["FAQ", "#faq"],
] as const;

const START = [
  ["Try a session free", "/signin?mode=signup"],
  ["Sign in", "/signin"],
] as const;

export function Footer() {
  return (
    <footer className="relative isolate overflow-hidden">
      <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
        <Separator className="bg-(--lp-line)" />
        <div className="flex flex-col gap-10 pt-12 sm:flex-row sm:items-start sm:justify-between sm:pt-16">
          <div>
            <Wordmark size={19} />
            <p className="mt-4 max-w-[32ch] text-[14px] leading-[1.55] text-(--lp-ink-2)">
              A voice math tutor that works each step out with you, on the board.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-14 sm:gap-x-20">
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {SITE.map(([label, href]) => (
                <li key={href}>
                  <a href={href} className="text-[14.5px] text-(--lp-ink-2) transition-colors duration-150 hover:text-(--lp-ink)">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {START.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="group inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-(--lp-ink)">
                    {label}
                    <ArrowRight
                      size={14}
                      strokeWidth={2.4}
                      aria-hidden
                      className="transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      <div className="relative mt-4 h-[clamp(260px,27vw,380px)] sm:mt-6">
        <FooterWave className="absolute inset-0" />
        <div className="relative mx-auto flex h-full max-w-[1180px] flex-col justify-end px-5 pb-6 sm:px-8 sm:pb-8">
          <p aria-hidden className="lp-display m-0 text-[clamp(2.75rem,7vw,5rem)] leading-[0.95] text-(--lp-ink)">
            Talk it through.
          </p>
          <p className="mt-5 text-[12.5px] font-medium text-(--lp-ink)">
            © {new Date().getFullYear()} Chalk. Built by a student, for his sister.
          </p>
        </div>
      </div>
    </footer>
  );
}
