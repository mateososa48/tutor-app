import { KeycapSlider } from "./KeycapSlider";
import { Container, Label, Lede, Reveal, Section, Title } from "./Section";

// What Chalk covers, as a wall of small board cards that slide in step with
// the scroll (KeycapSlider). Each card holds one icon from the set the board
// itself draws with, and the topics are said in words in the lede, since the
// wall is decorative and reads as nothing to a screen reader.

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
      <Reveal delay={0.1} amount={0.15} className="mt-12">
        <KeycapSlider />
      </Reveal>
    </Section>
  );
}
