import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const ITEMS = [
  {
    q: "Does it just give my kid the answer?",
    a: "No. Chalk asks for their attempt first, then gives the smallest hint that lets them take the next step. It only explains directly as a last resort, and then checks again with a fresh problem.",
  },
  {
    q: "What subjects and grades does it cover?",
    a: "Math, from upper elementary through high school: arithmetic, fractions and decimals, percent and ratios, negatives, algebra, geometry, graphs, and the basics of statistics. It is a math tutor only. Bring the actual homework and it adapts to the level.",
  },
  {
    q: "Can I upload a photo of the worksheet?",
    a: "Yes. Drop a photo, a PDF, or a text file into the session. Chalk reads it, asks which problem you want, and puts that problem on the board.",
  },
  {
    q: "What can parents see?",
    a: "Every session keeps a written transcript you can open afterwards. Voice audio is not stored.",
  },
  {
    q: "What does it cost?",
    a: "Sessions are free to try right now. Pricing will be posted here before anything changes.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 py-16 sm:py-24">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div>
          <h2 className="lp-display max-w-[12ch] text-[clamp(2rem,3.6vw,3rem)] leading-[1.06]">Questions parents ask</h2>
          <p className="mt-4 max-w-[36ch] text-[1.0625rem] leading-[1.55] text-(--lp-ink-2)">
            Short answers. If yours is not here, the founder reads every message.
          </p>
        </div>
        <Accordion defaultValue={[ITEMS[0].q]} className="border-t" style={{ borderColor: "var(--lp-line)" }}>
          {ITEMS.map((item) => (
            <AccordionItem key={item.q} value={item.q} className="!border-(--lp-line)">
              <AccordionTrigger className="lp-display py-5 text-[17px] font-semibold hover:no-underline sm:text-[18px]">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="max-w-[60ch] pb-6 text-[15px] leading-[1.6] text-(--lp-ink-2)">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
