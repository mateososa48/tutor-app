import { Marquee } from "@/components/ui/marquee";

const TOPICS = [
  "Factoring x² + 5x + 6",
  "Newton's second law",
  "Fractions with unlike denominators",
  "Balancing chemical equations",
  "Slope of a line",
  "Systems of equations",
  "Kinetic vs. potential energy",
  "Ratios and proportions",
  "The quadratic formula",
  "Stoichiometry",
  "Writing a thesis statement",
  "Long division",
  "Photosynthesis",
  "Integer exponents",
  "Free-body diagrams",
];

export function TopicsMarquee() {
  return (
    <section aria-label="Topics Chalk can help with" className="py-6">
      <p className="mx-auto mb-5 max-w-[1180px] px-5 text-[13px] font-medium text-(--lp-ink-3) sm:px-8">
        Bring whatever is on this week&rsquo;s homework.
      </p>
      <div
        className="relative"
        style={{
          maskImage: "linear-gradient(to right, transparent, #000 10%, #000 90%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, #000 10%, #000 90%, transparent)",
        }}
      >
        <Marquee pauseOnHover className="p-0 [--duration:70s] [--gap:0.625rem]">
          {TOPICS.map((t) => (
            <span
              key={t}
              className="inline-flex h-10 items-center rounded-full border px-4 text-[14px] font-medium whitespace-nowrap text-(--lp-ink-2)"
              style={{ borderColor: "var(--lp-line)", background: "var(--lp-surface)" }}
            >
              {t}
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
