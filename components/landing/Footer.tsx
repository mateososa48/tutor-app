import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ChalkMark } from "@/components/app/ChalkMark";
import { Separator } from "@/components/ui/separator";
import { FooterWave } from "./FooterWave";
import { Wordmark } from "./Wordmark";

// Links and a short description on the page, then the white wordmark sitting in a
// band of the tutor's voice wave (FooterWave) that rises from the bottom of the page.

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
            <p className="mt-6 text-[13px] text-(--lp-ink-2)">
              © {new Date().getFullYear()} Chalk. Built by a student, for his sister.
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

      <div className="relative mt-4 h-[clamp(290px,30vw,430px)] sm:mt-6">
        <FooterWave className="absolute inset-0" />
        <div className="relative mx-auto flex h-full max-w-[1180px] items-end px-5 pb-8 sm:px-8 sm:pb-10">
          {/* The sign-in panel's wordmark, large: white scribble and "chalk". FooterWave keeps the
              band deep blue behind whatever carries data-wave-keep. */}
          <p
            data-wave-keep
            aria-hidden
            className="m-0 flex items-center gap-[0.22em] text-[clamp(3.5rem,8vw,6rem)] leading-none text-white"
          >
            <ChalkMark size={96} color="#ffffff" className="size-[1em] shrink-0" />
            <span className="lp-brand translate-y-[0.05em]">chalk</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
