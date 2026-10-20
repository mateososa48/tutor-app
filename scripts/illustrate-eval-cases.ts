// The illustrator's test set (Oct 19 2026). Forty lesson moments: the fifteen
// from the bake-off and its held-out five (scripts/illustrate-cases.ts), and
// twenty-five new ones across grades 5-8 topics where a picture of real things
// is the expert move. Each says what the planner would ask for, what a right
// picture has, and what code can check: how many of each object, and numbers
// that must not appear (the answer the tutor asks for next).
//
// `split`: "tune" cases may shape prompts, recipes and the engine; "held"
// cases never do. Every claim of improvement is read on "held". Prompt
// examples and recipes must never use a case's topic and numbers (a small
// model copies examples: the planner's v6 did).

import { ILLUSTRATION_CASES, ILLUSTRATION_HELDOUT, type IllustrationCase } from "./illustrate-cases";

/** The kind of picture, one recipe each (lib/illustration/recipes.ts). */
export type PictureKind =
  | "sharing" // objects into equal groups
  | "groups" // equal groups / arrays / rows (multiplication)
  | "ratio" // a recipe or mix, batches
  | "updown" // floors, temperature, sea level, debt: a vertical axis with moves
  | "money" // coins and bills with values
  | "part_whole" // a bar or tape split into parts (percent, fraction of an amount)
  | "area" // tiles, a floor, a rectangle of unit squares
  | "balance" // an equation as a balance
  | "trip" // distance, rate, time along a road
  | "chance" // a bag, a spinner, a drawer
  | "place_value" // bundles of ten and ones
  | "fraction_compare" // same-size wholes cut differently
  | "measure" // cups, scoops, containers filling
  | "data"; // kids in a line, plates leveled

export type EvalCase = IllustrationCase & {
  kind: PictureKind;
  /** "tune" shapes the work; "held" was looked at while building (Oct 19); "held2" is never looked at case by case, only in aggregate. */
  split: "tune" | "held" | "held2";
  /** Objects that must be counted exactly: any icon name matching `match`, `n` in all. */
  counts?: Array<{ match: string; n: number }>;
  /** Numbers or words that must not be written anywhere in the picture. */
  forbid: string[];
};

const OLD_KINDS: Record<string, PictureKind> = {
  marbles: "sharing", cookies: "ratio", elevator: "updown", discount: "part_whole", tiles: "area",
  balance: "balance", trip: "trip", bag: "chance", bundles: "place_value", pizza: "fraction_compare",
  eighths: "fraction_compare", thermometer: "updown", paint: "ratio", chairs: "groups", coins: "money",
};
const OLD_COUNTS: Record<string, EvalCase["counts"]> = {
  marbles: [{ match: "marble", n: 12 }],
  bag: [{ match: "red", n: 3 }, { match: "blue", n: 5 }],
  coins: [{ match: "quarter", n: 3 }, { match: "dime", n: 2 }],
  chairs: [{ match: "chair", n: 48 }],
  paint: [{ match: "blue|paint|can|bucket", n: 0 }],
};
const OLD_FORBID: Record<string, string[]> = {
  marbles: ["4"], cookies: ["30"], elevator: ["-11", "−11"], discount: ["30", "$30"], tiles: ["12"], balance: ["x = 3", "x=3"],
  trip: ["50"], bag: ["3/8"], bundles: ["34"], pizza: [], eighths: ["5/8"], thermometer: ["5"], paint: ["6"], chairs: ["48"], coins: ["95"],
};

const old: EvalCase[] = [...ILLUSTRATION_CASES, ...ILLUSTRATION_HELDOUT].map((c, i) => ({
  ...c,
  kind: OLD_KINDS[c.id],
  // The bake-off ten have been looked at all week: tuning. The five held out stay held out.
  split: i < ILLUSTRATION_CASES.length ? "tune" : "held",
  counts: OLD_COUNTS[c.id]?.filter((x) => x.n > 0),
  forbid: OLD_FORBID[c.id] ?? [],
}));

const tutor = (text: string) => ({ who: "tutor" as const, text });
const student = (text: string) => ({ who: "student" as const, text });

const fresh: EvalCase[] = [
  // ── tune ────────────────────────────────────────────────────────────
  {
    id: "pizzas4", kind: "sharing", split: "tune", grade: "5th grade",
    conversation: [tutor("3 pizzas are shared equally by 4 friends. How much pizza does each friend get?"), student("you cant, 3 is less than 4")],
    board: 'b1 heading "Sharing pizza"; b2 equation line "3 ÷ 4 = ?"',
    what: "3 whole pizzas next to 4 empty plates, one plate per friend, plates labelled Friend 1 to Friend 4",
    why: "pizzas can be cut, so each friend can still get some",
    withhold: "3/4",
    mustShow: ["3 pizzas", "4 plates", "no 3/4 written"],
    counts: [{ match: "pizza", n: 3 }, { match: "plate", n: 4 }],
    forbid: ["3/4"],
  },
  {
    id: "apples-rate", kind: "groups", split: "tune", grade: "6th grade",
    conversation: [tutor("4 apples cost $6. How much does one apple cost?"), student("24 dollars? 4 times 6")],
    board: 'b1 heading "Unit price"; b2 equation line "4 apples = $6"',
    what: "4 apples in a row with one price tag reading $6 bracketed over all of them, and one apple on its own with a tag reading ?",
    why: "the $6 is for all four apples together, so one apple costs less than $6",
    withhold: "$1.50",
    mustShow: ["4 apples", "$6 over all four", "one apple marked ?"],
    counts: [{ match: "apple", n: 5 }],
    forbid: ["1.50", "$1.50", "24"],
  },
  {
    id: "tip", kind: "part_whole", split: "tune", grade: "7th grade",
    conversation: [tutor("A $20 meal and you leave a 15% tip. How much is the tip?"), student("15 dollars")],
    board: 'b1 heading "Tips"; b2 equation line "15% of $20 = ?"',
    what: "a bar for the $20 bill cut into 10 equal parts, each worth $2, with one and a half parts shaded as the tip",
    why: "15% is a small piece of the $20, not 15 whole dollars",
    withhold: "$3",
    mustShow: ["a $20 bar", "10 equal parts", "one and a half parts shaded"],
    forbid: ["3", "$3"],
  },
  {
    id: "debt", kind: "updown", split: "tune", grade: "7th grade",
    conversation: [tutor("You owe your sister $5, then borrow $3 more. What is your balance?"), student("positive 8")],
    board: 'b1 heading "Owing money"; b2 equation line "-5 - 3 = ?"',
    what: "a vertical money scale from -10 to 5 with zero marked, a mark at -5 labelled you owe, and an arrow down 3",
    why: "owing more goes further below zero, not above it",
    withhold: "-8",
    mustShow: ["vertical scale with 0", "mark at -5", "arrow down 3", "no -8 label"],
    forbid: ["-8", "−8"],
  },
  {
    id: "class-ratio", kind: "ratio", split: "tune", grade: "6th grade",
    conversation: [tutor("A class has 12 boys and 18 girls. What is the ratio of boys to girls in simplest form?"), student("12 to 18 is already simple")],
    board: 'b1 heading "Ratios"; b2 equation line "12 : 18"',
    what: "12 boys and 18 girls arranged in 6 equal groups, each group 2 boys and 3 girls in a box",
    why: "the class is made of equal groups, so one group shows the simplest ratio",
    withhold: "2 : 3",
    mustShow: ["6 boxes", "2 boys and 3 girls in each"],
    counts: [{ match: "boy", n: 12 }, { match: "girl", n: 18 }],
    forbid: ["2:3", "2 : 3", "2 to 3"],
  },
  {
    id: "cubes-box", kind: "groups", split: "tune", grade: "5th grade",
    conversation: [tutor("A box is 3 cubes long, 2 wide and 2 tall. How many cubes fill it?"), student("7")],
    board: 'b1 heading "Volume"; b2 equation line "3 × 2 × 2 = ?"',
    what: "two layers of cubes, each layer 3 by 2 cubes, shown side by side and labelled layer 1 and layer 2",
    why: "the box is layers of the same rectangle, not 3 + 2 + 2",
    withhold: "12",
    mustShow: ["2 layers", "each 3 by 2 cubes"],
    counts: [{ match: "block|cube", n: 12 }],
    forbid: ["12"],
  },
  {
    id: "mean-plates", kind: "data", split: "tune", grade: "6th grade",
    conversation: [tutor("Four plates have 3, 5, 6 and 2 cookies. If we share them out evenly, how many on each plate?"), student("6, the biggest")],
    board: 'b1 heading "Fair share"; b2 equation line "3, 5, 6, 2"',
    what: "four plates in a row holding 3, 5, 6 and 2 cookies, each plate labelled with its count",
    why: "evening out means moving cookies from big plates to small ones",
    withhold: "4",
    mustShow: ["4 plates", "3, 5, 6, 2 cookies"],
    counts: [{ match: "cookie", n: 16 }, { match: "plate", n: 4 }],
    forbid: ["4 each", "= 4"],
  },
  {
    id: "outfits", kind: "groups", split: "tune", grade: "7th grade",
    conversation: [tutor("You have 3 shirts and 2 pairs of pants. How many different outfits?"), student("5")],
    board: 'b1 heading "Outfits"; b2 equation line "3 shirts, 2 pants"',
    what: "3 shirts in a column, each shirt with 2 arrows to the 2 pairs of pants",
    why: "each shirt goes with each pair of pants, so the choices multiply",
    withhold: "6",
    mustShow: ["3 shirts", "2 pants", "each shirt joined to both pants"],
    counts: [{ match: "shirt", n: 3 }],
    forbid: ["6"],
  },
  {
    id: "diver", kind: "updown", split: "tune", grade: "6th grade",
    conversation: [tutor("A diver is 20 meters below sea level and swims up 8 meters. Where is she now?"), student("28 meters down")],
    board: 'b1 heading "Sea level"; b2 equation line "-20 + 8 = ?"',
    what: "a vertical scale from -25 to 5 meters with sea level at 0, a diver at -20, and an arrow up 8",
    why: "swimming up moves toward sea level, so she is less deep",
    withhold: "-12",
    mustShow: ["sea level at 0", "diver at -20", "arrow up 8", "no -12 label"],
    forbid: ["-12", "−12", "12 m"],
  },
  {
    id: "balance2x", kind: "balance", split: "tune", grade: "7th grade",
    conversation: [tutor("Solve 2x + 3 = 9."), student("x is 6, cuz 9 minus 3")],
    board: 'b1 heading "Equations"; b2 equation line "2x + 3 = 9"',
    what: "a balance with 2 x bags and 3 blocks on the left and 9 blocks on the right",
    why: "after taking 3 blocks off both sides, 6 blocks balance 2 bags, not 1",
    withhold: "3",
    mustShow: ["2 x bags and 3 blocks left", "9 blocks right"],
    counts: [{ match: "x_bag|bag", n: 2 }, { match: "block", n: 12 }],
    forbid: ["x = 3", "x=3"],
  },
  {
    id: "spinner", kind: "chance", split: "tune", grade: "7th grade",
    conversation: [tutor("A spinner has 4 equal parts: red, blue, green and yellow. What is the chance of red?"), student("1 out of 3 because there are 3 other colors")],
    board: 'b1 heading "Chance"; b2 equation line "P(red) = ?"',
    what: "a spinner cut into 4 equal parts coloured red, blue, green and yellow",
    why: "there are 4 equal parts in all, one of them red",
    withhold: "1/4",
    mustShow: ["4 equal parts", "one red"],
    forbid: ["1/4", "25%"],
  },
  {
    id: "stickers-frac", kind: "part_whole", split: "tune", grade: "5th grade",
    conversation: [tutor("What is 2/3 of 12 stickers?"), student("2? or 3?")],
    board: 'b1 heading "Fraction of a set"; b2 equation line "2/3 of 12 = ?"',
    what: "12 stars in 3 equal groups of 4, each group in a box",
    why: "thirds of 12 means 3 equal groups; two of them is two thirds",
    withhold: "8",
    mustShow: ["12 stars", "3 groups of 4"],
    counts: [{ match: "star", n: 12 }],
    forbid: ["8"],
  },
  {
    id: "flour-cups", kind: "measure", split: "tune", grade: "5th grade",
    conversation: [tutor("A recipe needs 1 1/2 cups of flour plus 3/4 cup more. How much flour in all?"), student("1 4/6")],
    board: 'b1 heading "Adding cups"; b2 equation line "1 1/2 + 3/4 = ?"',
    what: "a full measuring cup, a half-full measuring cup, and a measuring cup filled three quarters, side by side",
    why: "halves and quarters of a cup can be put together, and 4/6 is not how cups add",
    withhold: "2 1/4",
    mustShow: ["one full cup", "one half cup", "one three-quarter cup"],
    forbid: ["2 1/4", "2.25", "9/4"],
  },
  // ── held out ────────────────────────────────────────────────────────
  {
    id: "temp-drop", kind: "updown", split: "held", grade: "6th grade",
    conversation: [tutor("It is 4 degrees and the temperature drops 9 degrees. What is it now?"), student("5")],
    board: 'b1 heading "Temperature"; b2 equation line "4 - 9 = ?"',
    what: "a thermometer scale from -10 to 10 with 0 marked, a mark at 4 and an arrow down 9",
    why: "dropping 9 from 4 goes past zero",
    withhold: "-5",
    mustShow: ["vertical scale with 0", "mark at 4", "arrow down 9"],
    forbid: ["-5", "−5"],
  },
  {
    id: "water-tank", kind: "groups", split: "held", grade: "6th grade",
    conversation: [tutor("A tap fills 3 liters every minute. How much water after 5 minutes?"), student("8 liters")],
    board: 'b1 heading "Rates"; b2 equation line "3 L each minute, 5 minutes"',
    what: "5 buckets in a row, one for each minute, each bucket holding 3 liters, labelled minute 1 to minute 5",
    why: "every minute adds another 3 liters, so it is 5 groups of 3",
    withhold: "15",
    mustShow: ["5 buckets", "3 liters each", "minutes labelled"],
    counts: [{ match: "bucket|water|cup|jar|container", n: 5 }],
    forbid: ["15"],
  },
  {
    id: "scoops", kind: "measure", split: "held", grade: "6th grade",
    conversation: [tutor("How many 1/2-cup scoops are in 3 cups of rice?"), student("1 and a half")],
    board: 'b1 heading "Dividing fractions"; b2 equation line "3 ÷ 1/2 = ?"',
    what: "3 full cups of rice, each cup split into 2 half-cup scoops",
    why: "every cup holds 2 half scoops, so there are more scoops than cups",
    withhold: "6",
    mustShow: ["3 cups", "each split into 2 halves"],
    forbid: ["6"],
  },
  {
    id: "eggs-cakes", kind: "ratio", split: "held", grade: "7th grade",
    conversation: [tutor("2 cakes need 3 eggs. How many eggs for 6 cakes?"), student("7, you add 4 cakes so add 4 eggs")],
    board: 'b1 heading "Proportions"; b2 equation line "2 cakes : 3 eggs = 6 cakes : ?"',
    what: "one batch drawn as 2 cakes and 3 eggs in a box, then that same batch repeated 3 times",
    why: "6 cakes is 3 batches, so the eggs come in 3 batches too",
    withhold: "9",
    mustShow: ["3 boxes", "2 cakes and 3 eggs in each"],
    counts: [{ match: "cake", n: 6 }, { match: "egg", n: 9 }],
    forbid: ["9"],
  },
  {
    id: "ages-tape", kind: "part_whole", split: "held", grade: "7th grade",
    conversation: [tutor("Sam is 3 times as old as Lia. Together they are 24. How old is Lia?"), student("8? 24 divided by 3")],
    board: 'b1 heading "Ages"; b2 equation line "Sam = 3 × Lia, Sam + Lia = 24"',
    what: "a bar for Lia of 1 box and a bar for Sam of 3 boxes the same size, with a bracket over both reading 24 in all",
    why: "together they are 4 equal boxes, not 3",
    withhold: "6",
    mustShow: ["Lia 1 box", "Sam 3 boxes", "24 over both"],
    forbid: ["6", "18"],
  },
  {
    id: "socks", kind: "chance", split: "held", grade: "7th grade",
    conversation: [tutor("A drawer has 4 black socks and 2 white socks. What is the chance of picking a white one?"), student("2 out of 4")],
    board: 'b1 heading "Chance"; b2 equation line "P(white) = ?"',
    what: "an open drawer holding 4 black socks and 2 white socks",
    why: "there are 6 socks in all, not 4",
    withhold: "2/6",
    mustShow: ["a drawer", "4 black socks", "2 white socks"],
    counts: [{ match: "sock", n: 6 }],
    forbid: ["2/6", "1/3"],
  },
  {
    id: "heights", kind: "data", split: "held", grade: "6th grade",
    conversation: [tutor("Five kids are 140, 152, 135, 148 and 150 cm tall. What is the median height?"), student("135, the middle one in the list")],
    board: 'b1 heading "Median"; b2 equation line "140, 152, 135, 148, 150"',
    what: "five kids standing in the order given, each labelled with their height, heights drawn to scale",
    why: "the median is the middle once they are lined up shortest to tallest, not the middle of the list",
    withhold: "148",
    mustShow: ["5 kids", "each height labelled", "in the given order"],
    counts: [{ match: "kid|child|person|boy|girl|student", n: 5 }],
    forbid: ["median = 148", "median 148"],
  },
  {
    id: "doubling", kind: "groups", split: "held", grade: "8th grade",
    conversation: [tutor("1 bacterium doubles every hour. How many after 3 hours?"), student("6, 3 times 2")],
    board: 'b1 heading "Doubling"; b2 equation line "1, then doubles 3 times"',
    what: "4 columns labelled start, hour 1, hour 2, hour 3 showing 1, 2, 4 and then a ? for the last column",
    why: "each hour doubles what was there, so it grows faster than adding 2",
    withhold: "8",
    mustShow: ["1, 2, 4 shown", "hour 3 left as ?"],
    forbid: ["8"],
  },
  {
    id: "garden-area", kind: "area", split: "held", grade: "6th grade",
    conversation: [tutor("A garden is 5 meters by 3 meters. How many 1-meter square tiles cover it?"), student("16, the edge")],
    board: 'b1 heading "Area"; b2 equation line "5 m × 3 m = ?"',
    what: "a rectangle 5 tiles long and 3 tiles wide, each tile a 1-meter square, sides labelled 5 m and 3 m",
    why: "area counts the squares inside, not the edge around it",
    withhold: "15",
    mustShow: ["5 by 3 tiles", "5 m and 3 m labels"],
    forbid: ["15"],
  },
  {
    id: "dimes-pennies", kind: "money", split: "held", grade: "5th grade",
    conversation: [tutor("Which is more money, 0.4 of a dollar or 0.35 of a dollar?"), student("0.35 cuz 35 is bigger")],
    board: 'b1 heading "Decimals as money"; b2 equation line "0.4 vs 0.35"',
    what: "0.4 dollars as 4 dimes next to 0.35 dollars as 3 dimes and 5 pennies",
    why: "4 dimes is 40 cents, more than 35 cents",
    withhold: "0.4",
    mustShow: ["4 dimes", "3 dimes and 5 pennies"],
    counts: [{ match: "dime", n: 7 }, { match: "penny|pennies", n: 5 }],
    forbid: ["0.4 >", "> 0.35", "40 > 35"],
  },
  {
    id: "plant-grow", kind: "part_whole", split: "held", grade: "7th grade",
    conversation: [tutor("A plant is 20 cm tall and grows 25%. How tall is it now?"), student("45 cm")],
    board: 'b1 heading "Percent increase"; b2 equation line "20 cm grows 25%"',
    what: "a bar for the 20 cm plant cut into 4 equal parts of 5 cm, and one more part of the same size added on the end marked ?",
    why: "25% of 20 is one of its four quarters, a small piece, not 25 cm",
    withhold: "25",
    mustShow: ["20 cm bar in 4 equal parts", "one more equal part marked ?"],
    forbid: ["25 cm", "= 25"],
  },
  {
    id: "bus-rows", kind: "groups", split: "held", grade: "5th grade",
    conversation: [tutor("A bus has 9 rows with 4 seats in each row. How many seats?"), student("13")],
    board: 'b1 heading "Rows of seats"; b2 equation line "9 × 4 = ?"',
    what: "9 rows of 4 seats, rows labelled, one row bracketed as 4 seats",
    why: "every one of the 9 rows has 4 seats, so it is 9 fours, not 9 + 4",
    withhold: "36",
    mustShow: ["9 rows of 4"],
    counts: [{ match: "seat|chair", n: 36 }],
    forbid: ["36"],
  },
];

// Written Oct 19 2026 after the engine work, and never inspected one by one:
// the held-out set every later change is judged on.
const held2: EvalCase[] = [
  {
    id: "h2-crayons", kind: "sharing", split: "held2", grade: "4th grade",
    conversation: [tutor("20 crayons are shared equally among 5 kids. How many does each kid get?"), student("15? 20 take away 5")],
    board: 'b1 heading "Sharing crayons"; b2 equation line "20 ÷ 5 = ?"',
    what: "20 crayons loose beside 5 empty boxes, one box per kid, boxes labelled Kid 1 to Kid 5",
    why: "sharing means splitting the crayons into 5 equal groups, not taking 5 away",
    withhold: "4", mustShow: ["20 crayons", "5 boxes", "no 4 written"],
    counts: [{ match: "crayon|pencil", n: 20 }], forbid: ["4"],
  },
  {
    id: "h2-egg-cartons", kind: "groups", split: "held2", grade: "4th grade",
    conversation: [tutor("There are 3 cartons with 6 eggs in each. How many eggs?"), student("9")],
    board: 'b1 heading "Egg cartons"; b2 equation line "3 × 6 = ?"',
    what: "3 egg cartons in a row, each holding 6 eggs in two rows of 3",
    why: "each carton has 6, so it is 3 sixes, not 3 + 6",
    withhold: "18", mustShow: ["3 cartons", "6 eggs in each"],
    counts: [{ match: "egg", n: 18 }], forbid: ["18"],
  },
  {
    id: "h2-lemonade", kind: "ratio", split: "held2", grade: "6th grade",
    conversation: [tutor("Lemonade uses 1 cup of lemon juice for every 4 cups of water. How much water for 3 cups of juice?"), student("6, you add 3 to both")],
    board: 'b1 heading "Mixing lemonade"; b2 equation line "1 : 4 = 3 : ?"',
    what: "one batch as 1 cup of lemon juice and 4 cups of water in a box, repeated 3 times",
    why: "3 cups of juice is 3 batches, so the water comes in 3 batches of 4",
    withhold: "12", mustShow: ["3 boxes", "1 juice and 4 water in each"],
    forbid: ["12"],
  },
  {
    id: "h2-hill", kind: "updown", split: "held2", grade: "7th grade",
    conversation: [tutor("A hiker starts 3 meters above sea level and walks down 10 meters into a valley. What is her height now?"), student("13")],
    board: 'b1 heading "Above and below"; b2 equation line "3 - 10 = ?"',
    what: "a vertical scale from -10 to 10 meters with sea level at 0, a hiker at 3, and an arrow down 10",
    why: "going down 10 from 3 passes sea level into the negatives",
    withhold: "-7", mustShow: ["sea level at 0", "start at 3", "arrow down 10"],
    forbid: ["-7", "−7"],
  },
  {
    id: "h2-change", kind: "money", split: "held2", grade: "4th grade",
    conversation: [tutor("You pay for a 65 cent snack with 3 quarters. How much change?"), student("3 cents")],
    board: 'b1 heading "Making change"; b2 equation line "75 - 65 = ?"',
    what: "3 quarters marked 25 cents each next to a snack with a 65 cent price tag",
    why: "3 quarters is 75 cents, so the change is what is left after 65 cents",
    withhold: "10", mustShow: ["3 quarters", "a 65 cent tag"],
    counts: [{ match: "quarter", n: 3 }], forbid: ["10", "10¢", "10 cents"],
  },
  {
    id: "h2-battery", kind: "part_whole", split: "held2", grade: "6th grade",
    conversation: [tutor("A phone battery is at 40%. The phone holds 3000 units of charge when full. How many units are left?"), student("40")],
    board: 'b1 heading "Percent of a whole"; b2 equation line "40% of 3000 = ?"',
    what: "a bar for the full 3000 units cut into 10 equal parts of 300, with 4 parts shaded",
    why: "40% is 4 of the 10 tenths of the whole battery, not 40 units",
    withhold: "1200", mustShow: ["bar in 10 equal parts", "4 parts shaded", "3000 for the whole"],
    forbid: ["1200", "1,200"],
  },
  {
    id: "h2-patio", kind: "area", split: "held2", grade: "5th grade",
    conversation: [tutor("A patio is 6 tiles long and 4 tiles wide. How many tiles?"), student("20, I went around the edge")],
    board: 'b1 heading "Tiles"; b2 equation line "6 × 4 = ?"',
    what: "a rectangle of square tiles 6 long and 4 wide, sides labelled 6 tiles and 4 tiles",
    why: "area counts every tile inside, not just the ones on the edge",
    withhold: "24", mustShow: ["6 by 4 tiles"],
    forbid: ["24"],
  },
  {
    id: "h2-scale-3x", kind: "balance", split: "held2", grade: "7th grade",
    conversation: [tutor("Solve 3x + 1 = 13."), student("x = 14")],
    board: 'b1 heading "Equations"; b2 equation line "3x + 1 = 13"',
    what: "a balance with 3 x bags and 1 block on the left and 13 blocks on the right",
    why: "the 1 block is on the same side as the bags, so it comes off both sides, not added",
    withhold: "4", mustShow: ["3 x bags and 1 block left", "13 blocks right"],
    counts: [{ match: "x_bag|bag", n: 3 }, { match: "block", n: 14 }], forbid: ["x = 4", "x=4"],
  },
  {
    id: "h2-bike", kind: "trip", split: "held2", grade: "6th grade",
    conversation: [tutor("You bike 24 km in 2 hours at a steady speed. How far in 1 hour?"), student("48")],
    board: 'b1 heading "Speed"; b2 equation line "24 km in 2 hours"',
    what: "a road split into 2 equal one-hour stretches with a bike at the start and 24 km over the whole road",
    why: "one hour is half the road, so it is less than 24, not more",
    withhold: "12", mustShow: ["2 equal stretches", "24 km over both"],
    forbid: ["12", "12 km"],
  },
  {
    id: "h2-marbles-jar", kind: "chance", split: "held2", grade: "7th grade",
    conversation: [tutor("A jar has 2 green, 3 red and 5 blue marbles. What is the chance of green?"), student("2 out of 3")],
    board: 'b1 heading "Chance"; b2 equation line "P(green) = ?"',
    what: "a jar holding 2 green, 3 red and 5 blue marbles",
    why: "there are 10 marbles in all, so green is 2 of 10",
    withhold: "2/10", mustShow: ["2 green", "3 red", "5 blue"],
    counts: [{ match: "marble", n: 10 }], forbid: ["2/10", "1/5", "20%"],
  },
  {
    id: "h2-tens", kind: "place_value", split: "held2", grade: "2nd grade",
    conversation: [tutor("What number is 5 tens and 2 ones?"), student("7")],
    board: 'b1 heading "Place value"; b2 equation line "5 tens + 2 ones = ?"',
    what: "5 bundles of ten sticks and 2 loose sticks",
    why: "a ten is a bundle of 10, so 5 tens is far more than 5",
    withhold: "52", mustShow: ["5 bundles of 10", "2 loose sticks"],
    forbid: ["52"],
  },
  {
    id: "h2-cakes-compare", kind: "fraction_compare", split: "held2", grade: "4th grade",
    conversation: [tutor("Which is more cake, 2/3 or 3/4?"), student("same, both are one piece left")],
    board: 'b1 heading "Comparing fractions"; b2 equation line "2/3 vs 3/4"',
    what: "two same-size round cakes, one cut into 3 equal slices with 2 shaded, one cut into 4 with 3 shaded",
    why: "the missing pieces are different sizes, so the amounts are not the same",
    withhold: "3/4", mustShow: ["same-size cakes", "thirds with 2 shaded", "fourths with 3 shaded"],
    forbid: ["3/4 >", "> 2/3", "3/4 is bigger"],
  },
  {
    id: "h2-juice-glasses", kind: "measure", split: "held2", grade: "5th grade",
    conversation: [tutor("You pour 1/2 a glass of juice and then 1/4 glass more. How full is the glass?"), student("2/6")],
    board: 'b1 heading "Adding fractions"; b2 equation line "1/2 + 1/4 = ?"',
    what: "a glass half full next to a glass a quarter full, then an empty glass marked ? for both together",
    why: "a half and a quarter of the same glass fill more than half, so it cannot be 2/6",
    withhold: "3/4", mustShow: ["a half-full glass", "a quarter-full glass", "an empty glass with ?"],
    forbid: ["3/4"],
  },
  {
    id: "h2-pets", kind: "data", split: "held2", grade: "5th grade",
    conversation: [tutor("In a class, 6 kids have dogs, 4 have cats and 2 have fish. How many more dogs than fish?"), student("8")],
    board: 'b1 heading "Pets"; b2 equation line "dogs 6, cats 4, fish 2"',
    what: "a picture graph with a row of 6 dogs, a row of 4 cats and a row of 2 fish, rows lined up from the left",
    why: "lining them up shows how much longer the dog row is than the fish row",
    withhold: "4", mustShow: ["6 dogs", "4 cats", "2 fish", "rows lined up"],
    counts: [{ match: "dog", n: 6 }, { match: "cat", n: 4 }, { match: "fish", n: 2 }], forbid: ["4 more"],
  },
];

export const EVAL_CASES: EvalCase[] = [...old, ...fresh, ...held2];
