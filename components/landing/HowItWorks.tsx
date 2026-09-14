"use client";


import CardSwap, { Card } from "@/components/CardSwap";
import { DotPattern } from "@/components/ui/dot-pattern";
import { DockBadge } from "@/components/session/VoiceDock";
import { VoiceWave } from "@/components/session/VoiceWave";
import { BoardShot, Transcript, line } from "./Fragments";
import { SHOTS } from "./shots.generated";
import { useReduce } from "./useScript";

const STEPS = [
  {
    title: "You talk",
    body: "Say it the way you would to a person. Interrupt, think out loud, ask again.",
  },
  {
    title: "It writes as it explains",
    body: "One step at a time, on a shared whiteboard, in time with what it says.",
  },
  {
    title: "It checks before moving on",
    body: "A question after every idea. Your attempt goes on the board, right or wrong.",
  },
];

function TalkCard() {
  return (
    <div className="flex h-full flex-col justify-between p-5">
      <DockBadge activity="listening" className="self-start" />
      <Transcript entries={[line("student", "Wait, why does the three move to the other side?")]} className="shadow-none" />
    </div>
  );
}

function WriteCard() {
  return (
    <div className="relative flex h-full flex-col p-5">
      <DockBadge activity="writing" className="absolute top-5 right-5 z-10" />
      <BoardShot
        shot={SHOTS.steps}
        width={300}
        alt="The board: Solve 3(x − 2) = 12, then 3x − 6 = 12 marked distribute the 3, then 3x = 18 marked add 6 to both sides, underlined."
        className="mt-auto"
      />
    </div>
  );
}

// The dock's voice wave, as the tutor asks the check question.
function CheckCard() {
  return (
    <div className="relative flex h-full flex-col">
      <div className="flex flex-col gap-4 p-5">
        <DockBadge activity="speaking" className="self-start" />
        <Transcript entries={[line("tutor", "Good. Does plugging six back in give twelve?")]} className="shadow-none" />
      </div>
      <div className="mt-auto h-[96px]" aria-hidden>
        <VoiceWave analyser={null} speaking />
      </div>
    </div>
  );
}

const CARD_CLASS = "lp-card overflow-hidden !border-(--lp-line) !bg-(--lp-surface)";

export function HowItWorks() {
  const reduce = useReduce();
  const cards = [<TalkCard key="talk" />, <WriteCard key="write" />, <CheckCard key="check" />];

  return (
    <section id="how-it-works" className="scroll-mt-24 py-16 sm:py-24">
      <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-8">
        <div>
          <h2 className="lp-display max-w-[16ch] text-[clamp(2rem,3.6vw,3rem)] leading-[1.06]">
            One conversation. Three things happening at once.
          </h2>
          <ol className="mt-9 flex flex-col">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="grid grid-cols-[2.25rem_1fr] gap-x-4 border-t py-5"
                style={{ borderColor: "var(--lp-line)" }}
              >
                <span className="lp-display text-[15px] text-(--lp-ink-3)">0{i + 1}</span>
                <div>
                  <p className="lp-display text-[17px]">{s.title}</p>
                  <p className="mt-1 max-w-[42ch] text-[15px] leading-[1.5] text-(--lp-ink-2)">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="relative sm:h-[520px]">
          <DotPattern width={22} height={22} cr={1} className="text-(--lp-gray-2) [mask-image:radial-gradient(60%_60%_at_60%_50%,#000,transparent)]" />
          <div className={`flex flex-col gap-4 sm:absolute sm:inset-x-12 sm:bottom-6 ${reduce ? "" : "sm:hidden"}`}>
            {cards.map((c, i) => (
              <div key={i} className={CARD_CLASS} style={{ minHeight: 200 }}>
                {c}
              </div>
            ))}
          </div>
          {!reduce && (
            <div className="absolute inset-0 hidden -translate-y-[14%] sm:block">
            <CardSwap
              width={440}
              height={290}
              cardDistance={60}
              verticalDistance={70}
              delay={3800}
              pauseOnHover
              skewAmount={4}
              easing="elastic"
            >
              {cards.map((c, i) => (
                <Card key={i} customClass={CARD_CLASS}>
                  {c}
                </Card>
              ))}
            </CardSwap>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
