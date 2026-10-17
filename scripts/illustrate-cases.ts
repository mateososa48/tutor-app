// Ten moments where a tutor would draw an illustration (Oct 14 2026), for the
// illustration bake-off (scripts/illustrate-bakeoff.ts). Each carries what the
// illustrator is told in the app: the student's grade, the last lines of the
// conversation, what is on the board, the tutor's one-line request (`what`),
// what the student should notice (`why`), and what the picture must not give
// away (`withhold`: the answer the tutor is about to ask for).
//
// They span the kinds of picture a voice tutor reaches for: sharing objects,
// a ratio as a recipe, signed numbers as height, a percent as a price, area
// as tiles, an equation as a balance, a rate as a trip, chance as a bag,
// place value as bundles, and one (the pizza) where a hand drawing must not
// pass for an exact fraction.

export type IllustrationCase = {
  id: string;
  grade: string;
  conversation: Array<{ who: "tutor" | "student"; text: string }>;
  board: string;
  what: string;
  why: string;
  withhold?: string;
  /** What a correct picture has, for the raters. */
  mustShow: string[];
};

export const ILLUSTRATION_CASES: IllustrationCase[] = [
  {
    id: "marbles",
    grade: "4th grade",
    conversation: [
      { who: "tutor", text: "If you share 12 marbles equally among 3 friends, how many does each friend get?" },
      { who: "student", text: "idk. 9?" },
    ],
    board: 'b1 heading "Sharing"; b2 equation line "12 ÷ 3 = ?"; b3 student attempt "9"',
    what: "12 marbles shared equally into 3 jars, one jar per friend",
    why: "each jar ends up with the same number, and they can count one jar",
    withhold: "4 (the number in each jar is the answer; do not write it)",
    mustShow: ["exactly 12 marbles", "3 jars or groups", "equal groups of 4 (counted, not labelled)", "no '4' written as the answer"],
  },
  {
    id: "cookies",
    grade: "6th grade",
    conversation: [
      { who: "tutor", text: "2 cups of flour make 12 cookies. How many cookies from 5 cups?" },
      { who: "student", text: "15. cuz you add 3" },
      { who: "tutor", text: "Where did the add 3 come from?" },
      { who: "student", text: "2 to 5 is plus 3 so 12 plus 3" },
    ],
    board: 'b1 heading "Cookies"; b2 equation line "2 cups → 12 cookies"; b3 student attempt "15"',
    what: "what 1 cup of flour makes: 1 cup next to 6 cookies, then 2 cups next to 12 cookies, so each cup brings its own 6",
    why: "every cup adds 6 cookies, not 1, so adding 3 cups adds far more than 3 cookies",
    withhold: "30 (the cookies from 5 cups)",
    mustShow: ["1 cup → 6 cookies", "2 cups → 12 cookies as two groups of 6", "nothing about 5 cups → 30"],
  },
  {
    id: "elevator",
    grade: "7th grade",
    conversation: [
      { who: "tutor", text: "What is -7 - 4?" },
      { who: "student", text: "11? two negatives make a positive" },
    ],
    board: 'b1 heading "Integers"; b2 equation line "-7 - 4 = ?"; b3 student attempt "11"',
    what: "an elevator in a building with floors from +3 down to -12 (basement floors below ground level), the elevator at floor -7",
    why: "going down 4 more floors from -7 takes you further below ground, not up to +11",
    withhold: "-11 (where the elevator ends up)",
    mustShow: ["floors labelled with signed numbers", "ground level 0 marked", "elevator at -7", "a down arrow labelled 'down 4' without the destination answered"],
  },
  {
    id: "discount",
    grade: "7th grade",
    conversation: [
      { who: "tutor", text: "A $40 jacket is 25% off. What do you pay?" },
      { who: "student", text: "is it 25 dollars off?" },
    ],
    board: 'b1 heading "Percent off"; b2 equation line "25% of $40"',
    what: "a jacket with a $40 price tag, and the $40 shown as 4 equal $10 parts with one part marked as the 25% off",
    why: "25% is one of the four equal parts, so the discount is one part of $40, not $25",
    withhold: "$30 (the price paid) and $10 (the discount), do not write either as a result",
    mustShow: ["a $40 tag or jacket", "4 equal parts", "one part marked 25%", "no '$30' or '= $10' as the answer"],
  },
  {
    id: "tiles",
    grade: "5th grade",
    conversation: [
      { who: "tutor", text: "A rug is 4 feet by 3 feet. What is its area?" },
      { who: "student", text: "7? you add them" },
    ],
    board: 'b1 heading "Area"; b2 equation line "4 ft × 3 ft"; b3 student attempt "7"',
    what: "a floor covered with 1-foot square tiles, 4 tiles along and 3 tiles down, sides labelled 4 ft and 3 ft",
    why: "area counts the squares that cover the floor, not the edge lengths added",
    withhold: "12 (the number of tiles)",
    mustShow: ["a 4 by 3 grid of equal squares", "sides labelled 4 ft and 3 ft", "no '12' written"],
  },
  {
    id: "balance",
    grade: "8th grade",
    conversation: [
      { who: "tutor", text: "Solve 3x + 2 = 11." },
      { who: "student", text: "do i divide by 3 first?" },
    ],
    board: 'b1 heading "Equations"; b2 equation line "3x + 2 = 11"',
    what: "a balance scale: left pan holds 3 bags marked x and 2 single blocks, right pan holds 11 single blocks, level",
    why: "both sides weigh the same, so taking 2 blocks off both sides keeps it level",
    withhold: "x = 3",
    mustShow: ["a level balance", "left: 3 x-bags and 2 blocks", "right: 11 blocks", "no 'x = 3'"],
  },
  {
    id: "trip",
    grade: "6th grade",
    conversation: [
      { who: "tutor", text: "A car goes 150 miles in 3 hours at a steady speed. How fast is it going?" },
      { who: "student", text: "150?" },
    ],
    board: 'b1 heading "Rates"; b2 equation line "150 miles in 3 hours"',
    what: "a road from start to finish 150 miles long, split into 3 equal one-hour stretches, a car at the start",
    why: "each hour covers the same distance, so they can find the miles in one stretch",
    withhold: "50 miles per hour",
    mustShow: ["a road with 3 equal hour segments", "150 miles total labelled", "a car", "no '50' written"],
  },
  {
    id: "bag",
    grade: "7th grade",
    conversation: [
      { who: "tutor", text: "A bag has 3 red marbles and 5 blue marbles. You pick one without looking. What is the chance it's red?" },
      { who: "student", text: "3 out of 5?" },
    ],
    board: 'b1 heading "Probability"; b2 equation line "P(red) = ?"; b3 student attempt "3/5"',
    what: "a bag holding 3 red marbles and 5 blue marbles, all visible",
    why: "the chance compares red marbles to all the marbles in the bag, not red to blue",
    withhold: "3/8",
    mustShow: ["a bag", "exactly 3 red and 5 blue marbles", "counts readable", "no '3/8' written"],
  },
  {
    id: "bundles",
    grade: "3rd grade",
    conversation: [
      { who: "tutor", text: "What number is 3 tens and 4 ones?" },
      { who: "student", text: "7" },
    ],
    board: 'b1 heading "Place value"; b2 equation line "3 tens + 4 ones = ?"; b3 student attempt "7"',
    what: "3 bundles of 10 sticks tied together and 4 loose sticks",
    why: "each bundle is worth ten, so the bundles count by tens",
    withhold: "34",
    mustShow: ["3 bundles that clearly hold 10 each", "4 loose sticks", "no '34' written"],
  },
  {
    id: "pizza",
    grade: "4th grade",
    conversation: [
      { who: "tutor", text: "Which is more pizza, 1/3 or 1/4?" },
      { who: "student", text: "1/4, cuz 4 is bigger" },
    ],
    board: 'b1 heading "Fractions"; b2 equation line "1/3 or 1/4?"',
    what: "two same-size pizzas side by side, one cut into 3 equal slices and one into 4 equal slices, one slice of each shaded",
    why: "the more slices you cut a pizza into, the smaller each slice is",
    withhold: "which is bigger (do not label one as bigger)",
    mustShow: ["two pizzas the same size", "3 and 4 EQUAL slices (exact, not hand-wavy)", "one slice of each shaded", "no '1/3 > 1/4' written"],
  },
];
