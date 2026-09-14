import { cn } from "@/lib/utils";
import { body, brand, display, hand } from "./fonts";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { TopicsMarquee } from "./TopicsMarquee";
import { HowItWorks } from "./HowItWorks";
import { Bento } from "./Bento";
import { Founder } from "./Founder";
import { Parents } from "./Parents";
import { Faq } from "./Faq";
import { Footer } from "./Footer";

export default function LandingPage() {
  return (
    <div className={cn("lp min-h-[100dvh]", display.variable, body.variable, hand.variable, brand.variable)}>
      <Header />
      <main>
        <Hero />
        <TopicsMarquee />
        <HowItWorks />
        <Bento />
        <Founder />
        <Parents />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
