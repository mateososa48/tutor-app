import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { Wordmark } from "./Wordmark";

export function Footer() {
  return (
    <footer className="px-5 pt-8 pb-10 sm:px-8">
      <div className="mx-auto max-w-[1180px]">
        <Separator className="bg-(--lp-line)" />
        <div className="flex flex-col items-start justify-between gap-6 pt-8 sm:flex-row sm:items-center">
          <Wordmark size={15} />
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13.5px]">
            <a href="#how-it-works" className="text-(--lp-ink-2) transition-colors hover:text-(--lp-ink)">How it works</a>
            <a href="#parents" className="text-(--lp-ink-2) transition-colors hover:text-(--lp-ink)">For parents</a>
            <a href="#faq" className="text-(--lp-ink-2) transition-colors hover:text-(--lp-ink)">FAQ</a>
            <Link href="/signin" className="text-(--lp-ink-2) transition-colors hover:text-(--lp-ink)">Sign in</Link>
          </nav>
          <p className="text-[13px] text-(--lp-ink-3)">© {new Date().getFullYear()} Chalk. Built by a student, for his sister.</p>
        </div>
      </div>
    </footer>
  );
}
