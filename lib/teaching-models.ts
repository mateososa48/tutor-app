// How to teach a topic to a student who has no way in yet (Oct 24 2026).
//
// Mateo's session that day: a worksheet of two-step equations, "i dont know",
// "i dont understand", "teach me", and the tutor kept asking smaller questions
// ("what happens if you subtract seven from both sides?") and once said the
// answer. Nothing in the system knew how to *teach*: every rule was written
// for a student with a wrong idea (ask why, make it break), and a student with
// no idea got questions they could only guess at. The research behind the
// fix (the scratchpad brief "When to tell, when to ask"): explicit instruction
// beats unguided discovery for novices (Alfieri 2011), help that suits
// novices hurts experts and the reverse (expertise reversal, Kalyuga 2003),
// worked examples then faded steps (IES algebra guide), concrete to picture to
// symbols (concreteness fading, Fyfe 2014), and an analogy only works when its
// picture stays up beside the math and is pointed at (Richland 2007).
//
// So each topic gets a model a good teacher would use: the idea in a sentence,
// what to draw, how the model maps onto the steps, and where it stops working.
// It is data the lesson state and the planner pull for the problem on the
// board, never an example to copy word for word. Pure.

export type TeachingModel = {
  id: string;
  /** The idea in one sentence a kid can hear. */
  idea: string;
  /** What to put on the board for it, as a tool call. */
  draw: string;
  /** How the picture maps onto the steps. */
  steps: string;
  /** Where the model stops working, and what to use then. */
  breaks?: string;
};

type Entry = TeachingModel & { match: RegExp };

const BANK: Entry[] = [
  {
    id: "graph-line",
    match: /\b(?:graph|plot)|\bslope.intercept\b|^\s*y\s*=\s*-?\d*\.?\d*\s*x\b/i,
    idea: "a line's equation is a rule that makes points: put in an x, the rule gives the y, and every point it makes sits on one straight line",
    draw: "add_table with x = 0, 1, 2 and the y column as ?, fill each y as they find it (add_table again), plot each point on one graph as they find it (graph), and only then the line through them on the same graph",
    steps: "they find y for x = 0, then 1, then 2; they see the points line up; the line is every point the rule makes",
    breaks: "never draw the finished line first: a graph handed over teaches nothing",
  },
  {
    id: "slope",
    match: /\b(slope|rate of change|rise|run|steep)\b/i,
    idea: "slope is how much y goes up for every one step right, the same between any two points",
    draw: "graph the line with its points, then arrows for a one-step staircase between two points (right 1, up m)",
    steps: "one step right, count how far up; do it again somewhere else and it's the same",
    breaks: "rise over run done as a formula without the staircase: they compute it and can't say what it means",
  },
  {
    id: "function",
    match: /\b[a-z]\s*\(\s*[a-z0-9]\s*\)|\bfunctions?\b/i,
    idea: "a function is a machine: a number goes in, the rule does something to it, one number comes out",
    draw: "add_table with in and out columns, the outs as ?, one row per number they put in",
    steps: "f(3) means put 3 in; do the rule to 3; that's what comes out",
  },
  {
    id: "brackets",
    match: /\d\s*\(\s*-?\d*\s*[a-z]\s*[-+]\s*\d+\s*\)\s*=|\bdistribut/i,
    idea: "5(x − 2) means 5 equal groups of (x − 2), so the whole thing is 5 times one group",
    draw: "illustrate 5 bags that each hold x marbles with 2 taken out, and the total on the other side of a balance",
    steps: "either share both sides into 5 equal groups first (divide by 5), or open the brackets (5x − 10); then solve the two-step equation that's left",
    breaks: "they multiply only the first term (5x − 2): point at the second part of every bag",
  },
  {
    id: "factoring",
    match: /\b(factor|x\^?2|x²|quadratic)/i,
    idea: "factoring is multiplying backwards: finding the two brackets whose rectangle has this area",
    draw: "add_area_model of a smaller one first, (x + 2)(x + 3), with every piece filled in (x², 2x, 3x, 6) so they see the corner pieces multiply and the two strips add; then their rectangle with the sides as ?",
    steps: "multiply out the small one together; they say where its 6 and its 5x came from; only then their numbers, which they find",
    breaks: "never give the multiply-and-add rule before they have seen it in the picture, and never label the sides of their own rectangle: those are the answer",
  },
  {
    id: "fractions",
    match: /\d\s*\/\s*\d|\\frac|\bfractions?\b|\b(halves|thirds|quarters|fourths|fifths|sixths|eighths)\b/i,
    idea: "a fraction is equal pieces of one whole: the bottom says how many pieces the whole is cut into, the top how many you have",
    draw: "draw_fraction as bars for size; add_number_line to compare and order",
    steps: "same-sized pieces before you add or compare: cut both into the same number of pieces",
    breaks: "pies alone teach 'a fraction is the shaded bit': show it on a number line too",
  },
  {
    id: "percent",
    match: /%|\bpercent/i,
    idea: "percent means out of 100: 25% is 25 of every 100",
    draw: "draw_grid with 100 squares, or add_number_line with 0% to 100% above 0 to the total",
    steps: "find 10% or 1% first, then build the percent asked for",
    breaks: "adding percents across years: one row a year in add_table",
  },
  {
    id: "decimals",
    match: /\d\.\d|\bdecimals?\b/i,
    idea: "each place after the point is ten times smaller: 0.5 is five tenths, 0.35 is three tenths and five hundredths",
    draw: "draw_grid of 100 squares with each decimal shaded",
    steps: "compare the tenths first, then the hundredths",
    breaks: "longer is not bigger: 0.35 has more digits than 0.5 and is smaller",
  },
  {
    id: "mean",
    match: /\b(mean|average)\b/i,
    idea: "the mean is what everyone gets if you put it all together and share it out evenly",
    draw: "illustrate the amounts as stacks, then the same total shared into equal stacks",
    steps: "add them all up, then share by how many there are",
  },
  {
    id: "area",
    match: /\b(area|perimeter|triangle|rectangle)\b/i,
    idea: "area is how many unit squares cover the shape",
    draw: "draw_figure with grid=true so the squares can be counted",
    steps: "a rectangle is rows times columns; a triangle is half the rectangle around it",
  },
  {
    id: "equation",
    match: /=|\b(equation|solve|solving)\b/i,
    idea: "an equation is a balance: both sides weigh the same, so whatever you do to one side you do to the other, and it stays balanced",
    draw: "illustrate a balance with the left side's bags of x and loose blocks on one pan and the right side's blocks on the other, then the equation typeset under it",
    steps: "undo what was done to x in reverse order: first take away the loose blocks from both pans (the + or − number), then share each pan into equal groups (the × number); each move is one line, written under both sides",
    breaks: "a negative or a subtraction doesn't fit on a balance: switch to 'undo it in reverse order' like unwrapping a present",
  },
  {
    id: "like-terms",
    match: /\b\d*\s*([a-z])\s*[-+]\s*\d*\s*\1\b|\b(simplif|like terms|combine)/i,
    idea: "a letter is an unknown number, the same number every time it appears, so 4a + 3a is 7 lots of that number",
    draw: "add_table that tries a = 10: 4a + 3a and 7a side by side give the same value",
    steps: "count the lots of a together, keep the plain numbers apart",
    breaks: "'a means apples' readings: say 'a is the number of', never 'a is an apple'",
  },
  {
    id: "ratio",
    match: /\b(ratio|rate|per|recipe|proportion|for every|cups?|scale)\b/i,
    idea: "a ratio stays the same when you scale it: double one side, double the other",
    draw: "add_table with the given row and a row for 1, then the row asked for",
    steps: "find the row for 1 first, then multiply up",
    breaks: "adding the same number to both sides: try their rule on 1 or 0 and watch it fail",
  },
  {
    id: "integers",
    match: /-\s*\d|\b(negative|integer|minus|below zero)\b/i,
    idea: "negative numbers are below zero on a number line: adding moves right, subtracting moves left",
    draw: "add_number_line with the start point and a jump for each move",
    steps: "start at the first number, move for each operation, read where you land",
    breaks: "'two negatives make a positive' is for multiplying, not adding: show the moves",
  },
];

// Most specific first: a function or a fraction problem often has an "=" in it.
/** The model for a problem or topic, or null. */
export function teachingModel(problem: string | null | undefined, topic?: string | null): TeachingModel | null {
  for (const text of [problem, topic]) {
    const t = (text ?? "").trim();
    if (!t) continue;
    const hit = BANK.find((e) => e.match.test(t));
    if (hit) {
      const { match: _match, ...model } = hit;
      void _match;
      return model;
    }
  }
  return null;
}

/** The model as one line for the lesson state or the planner. */
export function modelLine(model: TeachingModel): string {
  return `${model.idea}. Draw: ${model.draw}. Steps: ${model.steps}${model.breaks ? `. Careful: ${model.breaks}` : ""}`;
}
