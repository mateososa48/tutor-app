"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { RollingNumber } from "@kitlangton/rolling-number/react";
import "@kitlangton/rolling-number/styles.css";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { cn } from "@/lib/utils";
import { Band } from "./Band";
import { Container, Label, Lede, Reveal, Section, Title } from "./Section";
import { useReduce } from "./useScript";

// Three plans as one table on the page's grid (Sept 22, after Mateo's Aoutive
// reference): not three cards floating on the page but a row of the grid
// itself, attached to the rails on `.lp-railspan`. The frame's top and bottom
// are the rails' own ink and weight, solid rather than dashed, and it draws no
// sides where the rails are, because the rails are its sides; the column
// dividers are a step lighter (`--lp-grid`), so the frame reads as the grid and
// the insides as its subdivision. Inside a column there are no lines: a ruled
// band under each of plan, price, button and list put three extra lines across
// the table and Mateo cut them (Sept 22, "way too many horizontal lines"). The
// four still sit on subgrid rows shared by all three columns, so the prices,
// the buttons and the lists start at one height across the table whatever each
// plan's copy runs to. Where lines cross there is the page's own node, from
// 1320px up, where the rails exist. The buttons are the hero's pair (Mateo,
// Sept 22): the plan to pick stands on the hero's field and has the pressed
// `.lp-btn` with its arrow, the other two the quiet one, so each screen still
// has one primary. beUI's segmented tabs switch monthly and yearly, and the
// prices roll to their new digits (Rolling Number). Every button leads to
// sign-up: nothing is billed yet.
//
// PLACEHOLDER PRICES (Sept 20 2026): the tiers, limits and prices are made
// up for the page. Chalk has no billing, no family accounts and no daily
// limit today. The numbers sit inside Mateo's own research (parent-paid math
// help at $15 to $39 a month; Synthesis Tutor at $29 to $40).

type Billing = "monthly" | "yearly";

const PLANS = [
  {
    id: "free",
    name: "Free",
    who: "Try it on tonight's homework.",
    price: { monthly: 0, yearly: 0 },
    features: ["One session a day, up to 15 minutes", "Voice and the shared board", "A photo or PDF of the worksheet", "The transcript of every session"],
    cta: "Try a session free",
  },
  {
    id: "plus",
    name: "Plus",
    who: "One student, as often as they're stuck.",
    price: { monthly: 19, yearly: 15 },
    features: ["Unlimited sessions", "Notes and skills that carry over", "Live graphs they can drag", "Five speeds, thirteen languages"],
    cta: "Start with Plus",
    featured: true,
  },
  {
    id: "family",
    name: "Family",
    who: "Up to three students, one bill.",
    price: { monthly: 29, yearly: 23 },
    features: ["Everything in Plus, for each of them", "Separate notes and skills per student", "Transcripts for every session", "Add a fourth for $6 a month"],
    cta: "Start with Family",
  },
] as const;

type Plan = (typeof PLANS)[number];

// One band of a column. From 1320px the side padding is the gap between the
// rail and the section heading's text (the deck card's own number): the
// heading and the first column's words share a left edge, the way the
// reference's heading and first column share one margin from its frame. The
// `!` is load-bearing: Tailwind orders an arbitrary `min-[1320px]` variant
// before the named `lg`, so without it `lg:px-10` would win on source order.
const BAND = "px-6 sm:px-8 lg:px-10 min-[1320px]:px-[calc(var(--lp-rail-inset)-var(--lp-rail-w)-558px)]!";

function Column({ plan, billing, first }: { plan: Plan; billing: Billing; first: boolean }) {
  const reduce = useReduce();
  const featured = "featured" in plan && plan.featured;
  const price = plan.price[billing];
  // Stacked on a phone, side by side from lg; the four bands line up across
  // the columns through the parent's rows (`subgrid`).
  const shape = cn("lg:row-span-4 lg:grid lg:grid-rows-subgrid", !first && "border-t border-(--lp-grid) lg:border-t-0 lg:border-l");

  const bands = (
    <>
      <div className={cn(BAND, "pt-7 lg:pt-8")}>
        <h3 className="lp-title m-0 text-[24px] leading-[1.1] text-(--lp-ink)">{plan.name}</h3>
        <p className="m-0 mt-2 text-[15px] leading-[1.5] text-(--lp-ink-2)">{plan.who}</p>
      </div>

      <div className={cn(BAND, "pt-6")}>
        <p className="m-0 flex items-baseline gap-1.5">
          <span className="lp-title text-[52px] leading-none text-(--lp-ink)">
            <RollingNumber
              value={price}
              locales="en-US"
              format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
              duration={reduce ? 0 : 450}
            />
          </span>
          <span className="text-[15px] text-(--lp-ink-2)">/ month</span>
        </p>
        <p className="m-0 mt-2 text-[13.5px] text-(--lp-ink-2)">
          {price === 0 ? "No card needed" : billing === "yearly" ? `Billed $${price * 12} a year` : "Billed monthly"}
        </p>
      </div>

      <div className={cn(BAND, "pt-6")}>
        <Link href="/signin?mode=signup" className={cn("lp-btn w-full justify-center", !featured && "lp-btn-quiet")}>
          {plan.cta}
          {featured && <ArrowRight size={17} strokeWidth={2.4} aria-hidden />}
        </Link>
      </div>

      <div className={cn(BAND, "pt-7 pb-8 lg:pb-9")}>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-3 text-[15px] leading-[1.45] text-(--lp-ink)">
              <span
                className={cn(
                  "mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full",
                  featured ? "bg-(--lp-sky) text-white" : "bg-(--lp-sky-soft) text-(--lp-sky-deep)",
                )}
              >
                <Check size={11} strokeWidth={3.2} aria-hidden />
              </span>
              {f}
            </li>
          ))}
        </ul>
      </div>
    </>
  );

  return featured ? (
    <Band wash={0.55} className={shape}>
      {bands}
    </Band>
  ) : (
    <div className={shape}>{bands}</div>
  );
}

/* The page's node, a small outlined square in the page's colour, where two of
   the grid's lines cross. Centred on the line's own pixel, which is why every
   position carries the half pixel. */
function Node({ style }: { style: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-[2] hidden box-border size-(--lp-node-size) border border-(--lp-node-color) bg-(--lp-node-fill) min-[1320px]:block"
      style={style}
    />
  );
}

const HALF = "var(--lp-node-size) / 2";
// The rails sit one pixel outside the table on each side, so their centres are
// half a pixel beyond its edges; the column dividers are the left borders of
// the second and third columns, a third and two thirds of the way across.
const ACROSS = [`calc(-0.5px - ${HALF})`, `calc(33.3333% + 0.5px - ${HALF})`, `calc(66.6667% + 0.5px - ${HALF})`, `calc(100% + 0.5px - ${HALF})`];
const TOP = `calc(-0.5px - ${HALF})`;
const BOTTOM = `calc(100% + 0.5px - ${HALF})`;

export function Pricing() {
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <Section id="pricing">
      <Container>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-12">
          <Reveal>
            <Label>Pricing</Label>
            <Title className="max-w-[16ch]">Less than an hour with a tutor.</Title>
          </Reveal>
          {/* The right column carries the one control the table answers to. */}
          <Reveal delay={0.06} className="lg:ml-auto lg:max-w-[36ch]">
            <Lede className="mt-0">Free while Chalk is in beta. This is what it will cost after, for a whole month of help instead of one Tuesday.</Lede>
            <Tabs value={billing} onValueChange={(v) => setBilling(v as Billing)} variant="segment">
              <TabsList className="mt-6 rounded-[12px] bg-(--lp-gray) p-1">
                <TabsTrigger
                  value="monthly"
                  className="rounded-[10px] px-4 py-[11px] text-[14.5px] font-medium text-(--lp-ink-2) hover:text-(--lp-ink) sm:py-2"
                  indicatorClassName="bg-(--lp-ink) shadow-(--lp-shadow-card)"
                >
                  Monthly
                </TabsTrigger>
                <TabsTrigger
                  value="yearly"
                  className="rounded-[10px] px-4 py-[11px] text-[14.5px] font-medium text-(--lp-ink-2) hover:text-(--lp-ink) sm:py-2"
                  indicatorClassName="bg-(--lp-ink) shadow-(--lp-shadow-card)"
                >
                  Yearly, 20% off
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </Reveal>
        </div>
      </Container>

      <Reveal delay={0.1} amount={0.12} className="mt-12 lg:mt-16">
        {/* The frame: rail ink top and bottom, hairline sides only where there
            are no rails to be its sides. No radius, no shadow. */}
        <div className="lp-railspan relative grid border-y border-x border-(--lp-rail-ink) border-x-(--lp-line) bg-(--lp-bg) lg:grid-cols-3 lg:grid-rows-[auto_auto_auto_1fr] min-[1320px]:border-x-0">
          {PLANS.map((plan, i) => (
            <Column key={plan.id} plan={plan} billing={billing} first={i === 0} />
          ))}
          {ACROSS.map((left) => (
            <Node key={`t${left}`} style={{ left, top: TOP }} />
          ))}
          {ACROSS.map((left) => (
            <Node key={`b${left}`} style={{ left, top: BOTTOM }} />
          ))}
        </div>
      </Reveal>

      <Container>
        <p className="m-0 mt-5 text-[13.5px] leading-[1.5] text-(--lp-ink-2)">Prices in US dollars.</p>
      </Container>
    </Section>
  );
}
