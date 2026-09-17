import katex from "katex";
import { Marquee } from "@/components/ui/marquee";
import { cn } from "@/lib/utils";
import { Container, Label, Lede, Reveal, Section, Title } from "./Section";

// What Chalk covers, as a field of keycaps seen from a little above: three
// rows of tinted tiles, each with a piece of typeset math and the topic it
// stands for, drifting past in alternate directions. The tints are the
// tutor's pens again. The math is KaTeX, rendered here on the server.

type Cap = { tex: string; label: string };

const ROWS: Cap[][] = [
  [
    { tex: "\\tfrac{1}{2}", label: "Fractions" },
    { tex: "0.75", label: "Decimals" },
    { tex: "35\\%", label: "Percent" },
    { tex: "2:3", label: "Ratios" },
    { tex: "-7", label: "Negatives" },
    { tex: "x^{2}", label: "Exponents" },
    { tex: "\\sqrt{49}", label: "Roots" },
    { tex: "\\tfrac{3}{4}\\div\\tfrac{1}{2}", label: "Dividing fractions" },
  ],
  [
    { tex: "2x+3=11", label: "Equations" },
    { tex: "y=mx+b", label: "Lines" },
    { tex: "(a+b)^{2}", label: "Expanding" },
    { tex: "x^{2}-5x+6", label: "Factoring" },
    { tex: "|x-4|", label: "Absolute value" },
    { tex: "3x \\geq 12", label: "Inequalities" },
    { tex: "12 \\div 4", label: "Long division" },
    { tex: "\\tfrac{2}{5}=\\tfrac{x}{20}", label: "Proportions" },
  ],
  [
    { tex: "\\triangle", label: "Triangles" },
    { tex: "\\angle", label: "Angles" },
    { tex: "\\pi r^{2}", label: "Circles" },
    { tex: "A=lw", label: "Area" },
    { tex: "f(x)", label: "Functions" },
    { tex: "(3,\\,4)", label: "Coordinates" },
    { tex: "\\bar{x}", label: "Averages" },
    { tex: "\\text{P}(A)", label: "Probability" },
  ],
];

// The board's six pens, paled to a keycap face and a slightly deeper edge.
const FACES = [
  ["#dbe7ff", "#b9cdfb"],
  ["#eee0f8", "#d8bff0"],
  ["#d9f1e5", "#a8dcc4"],
  ["#fde6d4", "#f6c7a3"],
  ["#fbdede", "#f2b7b7"],
  ["#dceefc", "#b4d8f7"],
] as const;

function Keycap({ cap, index }: { cap: Cap; index: number }) {
  const [face, edge] = FACES[index % FACES.length];
  const html = katex.renderToString(cap.tex, { throwOnError: false, strict: "ignore" });
  return (
    <div
      className="flex h-[92px] w-[132px] shrink-0 flex-col items-center justify-center gap-1 rounded-[14px] border"
      style={{ background: `linear-gradient(180deg, #ffffff 0%, ${face} 100%)`, borderColor: edge, boxShadow: `0 2px 0 ${edge}, 0 10px 18px -12px rgba(18,18,21,0.25)` }}
    >
      <span className="text-[19px] leading-none text-(--lp-ink)" dangerouslySetInnerHTML={{ __html: html }} />
      <span className="text-[11px] font-medium tracking-[0.01em] text-(--lp-ink-2)">{cap.label}</span>
    </div>
  );
}

export function Keycaps() {
  return (
    <Section>
      <Container>
        <Reveal className="flex flex-col items-center text-center">
          <Label>Math only</Label>
          <Title className="max-w-[16ch]">From fractions to functions.</Title>
          <Lede className="max-w-[52ch]">
            Arithmetic, fractions, decimals, percent, ratios, negatives, algebra, geometry, graphs and basic statistics. Grades 5
            to 12, and nothing that isn&rsquo;t math.
          </Lede>
        </Reveal>
      </Container>

      {/* The field. Perspective on the outside; inside, the rows lean away
          from the reader toward the bottom, where they also fade, so the far
          row is the faint one. The sides fade too. */}
      <Reveal delay={0.1} amount={0.15} className="mt-12">
        <div
          aria-hidden
          className="mx-auto max-w-[1180px] overflow-hidden"
          style={{
            perspective: "1200px",
            maskImage: "linear-gradient(to right, transparent, #000 12%, #000 88%, transparent), linear-gradient(to bottom, #000 50%, transparent 96%)",
            WebkitMaskImage: "linear-gradient(to right, transparent, #000 12%, #000 88%, transparent), linear-gradient(to bottom, #000 50%, transparent 96%)",
            maskComposite: "intersect",
            WebkitMaskComposite: "source-in",
          }}
        >
          <div className="flex flex-col gap-4 py-6" style={{ transform: "rotateX(-26deg) scale(1.04)", transformOrigin: "50% 30%" }}>
            {ROWS.map((row, r) => (
              <Marquee
                key={r}
                reverse={r % 2 === 1}
                repeat={3}
                className={cn("p-0 [--duration:90s] [--gap:1rem]", r === 1 && "[--duration:110s]")}
                style={{ transform: `translateX(${r * 44 - 44}px) skewX(-10deg)` }}
              >
                {row.map((cap, i) => (
                  <Keycap key={cap.label} cap={cap} index={i + r * 2} />
                ))}
              </Marquee>
            ))}
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
