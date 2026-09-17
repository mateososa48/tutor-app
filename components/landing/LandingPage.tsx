import { cn } from "@/lib/utils";
import { body, brand, display, hand } from "./fonts";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { Intro } from "./Intro";
import { AskBoard } from "./AskBoard";
import { Trio } from "./Trio";
import { Showcase } from "./Showcase";
import { Keycaps } from "./Keycaps";
import { Statement } from "./Statement";
import { ForParents } from "./ForParents";
import { Faq } from "./Faq";
import { Closing } from "./Closing";
import { Footer } from "./Footer";
import { LandingMotion } from "./Section";

// The hero, then the page's frame: everything below runs between two hairline
// rails (`.lp-rails`), each section opening on a dashed rule. The order is
// the argument: what it is, how one question goes, the three things at once,
// the rest of what it does, what it covers, why it exists, what parents get,
// questions, and the same button the page opened with.
export default function LandingPage() {
  return (
    <LandingMotion>
      <div className={cn("lp min-h-[100dvh]", display.variable, body.variable, hand.variable, brand.variable)}>
        <Header />
        <main>
          <Hero />
          <div className="lp-rails">
            <Intro />
            <AskBoard />
            <Trio />
            <Showcase />
            <Keycaps />
            <Statement />
            <ForParents />
            <Faq />
            <Closing />
          </div>
        </main>
        <Footer />
      </div>
    </LandingMotion>
  );
}
