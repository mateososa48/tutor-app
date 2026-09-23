import { cn } from "@/lib/utils";
import { body, brand, display, hand } from "./fonts";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { Intro } from "./Intro";
import { HowItWorks } from "./how";
import { FeatureStack } from "./FeatureStack";
import { Keycaps } from "./Keycaps";
import { ForParents } from "./ForParents";
import { Reviews } from "./Reviews";
import { Pricing } from "./Pricing";
import { Faq } from "./Faq";
import { Ending } from "./Ending";
import { LandingMotion } from "./Section";
import { LineTuner } from "./LineTuner";

// The hero, then the page's frame: everything below runs between two hairline
// rails (`.lp-rails`), each section opening on a dashed rule. The order is
// the argument: what it is, how one question goes, the three things at once,
// the rest of what it does, what it covers, why it exists, what parents get,
// what people say, what it costs, questions, and the same button the page
// opened with.
export default function LandingPage() {
  return (
    <LandingMotion>
      <div className={cn("lp min-h-[100dvh]", display.variable, body.variable, hand.variable, brand.variable)}>
        <Header />
        <main>
          <Hero />
          <div className="lp-rails">
            <Intro />
            <HowItWorks />
            <FeatureStack />
            <Keycaps />
            <ForParents />
            <Reviews />
            <Pricing />
            <Faq />
          </div>
        </main>
        {/* The page's footer landmark: it carries its own rails, which pick up
            exactly where main's stop. */}
        <Ending />
        {/* Development instrument, not a product surface: Shift+L or ?lines. */}
        <LineTuner />
      </div>
    </LandingMotion>
  );
}
