// Picture recipes (Oct 19 2026): how a good teacher draws each kind of picture
// a math tutor reaches for, and one example scene. Only the recipe for the
// picture at hand goes to the illustrator, so the shared prompt stays short and
// cached and the guidance stays specific.
//
// Examples never use a test case's topic or numbers (scripts/illustrate-eval-
// cases.ts): small models copy examples, and an example on the test's own
// numbers would measure copying, not drawing.

export type PictureKind =
  | "sharing" | "groups" | "ratio" | "updown" | "money" | "part_whole" | "area"
  | "balance" | "trip" | "chance" | "place_value" | "fraction_compare" | "measure" | "data";

export const RECIPES: Record<PictureKind, string> = {
  sharing: `Sharing into equal groups. Do what the request says about where the objects go. "Shared into the jars" means the objects are IN the jars: the same number in each container, drawn so the student can count them (counting is their job; just never write the number). If it says loose beside empty containers, or does not say, draw every object loose beside the empty containers. One container per person, each labelled. A bracket over all the objects can say how many in all. A whole pizza or cake is the object "pizza" or "round_cake" (the plain pizza icon is a slice).
Example, shared into the containers (9 pencils into 3 cups): {"root":{"type":"row","gap":30,"children":[{"type":"container","shape":"jar","label":"Ana","label_side":"bottom","id":"f1","child":{"type":"items","icon":"pencil","count":3}},{"type":"container","shape":"jar","label":"Ben","label_side":"bottom","id":"f2","child":{"type":"items","icon":"pencil","count":3}},{"type":"container","shape":"jar","label":"Cy","label_side":"bottom","id":"f3","child":{"type":"items","icon":"pencil","count":3}}]},"brackets":[{"over":["f1","f2","f3"],"side":"top","label":"9 pencils"}]}
Example, loose beside empty containers (10 cookies, 2 boxes): {"root":{"type":"column","gap":30,"children":[{"type":"items","icon":"cookie","count":10,"per_row":10,"id":"shells"},{"type":"row","gap":36,"children":[{"type":"container","shape":"box","label":"Mo","id":"b1","child":{"type":"spacer","w":70,"h":50}},{"type":"container","shape":"box","label":"Jo","id":"b2","child":{"type":"spacer","w":70,"h":50}}]}]},"brackets":[{"over":"shells","side":"top","label":"10 cookies"}]}`,
  groups: `Equal groups, rows or arrays (multiplication), and prices per item. Draw every object, grouped exactly as asked: one container or one row per group, the same number in each. Label one group with how many it holds and bracket the groups with how many groups there are. Never write the total. For layers or a 3-D box, draw each layer as its own grid side by side. A price for several things is one bracket over exactly those things; a single thing's unknown price is a "?" bracket under it alone.
Example (4 vases of 5 flowers): {"root":{"type":"row","gap":24,"children":[{"type":"container","shape":"jar","id":"v1","child":{"type":"items","icon":"flower","count":5,"per_row":5}},{"type":"container","shape":"jar","id":"v2","child":{"type":"items","icon":"flower","count":5,"per_row":5}},{"type":"container","shape":"jar","id":"v3","child":{"type":"items","icon":"flower","count":5,"per_row":5}},{"type":"container","shape":"jar","id":"v4","child":{"type":"items","icon":"flower","count":5,"per_row":5}}]},"brackets":[{"over":"v1","side":"top","label":"5 in each"},{"over":["v1","v2","v3","v4"],"side":"bottom","label":"4 vases"}]}`,
  ratio: `A ratio, recipe or mix. Draw one batch as real objects in a box (each ingredient as its own items, in its own colour), labelled Batch 1, then the same batch again for each batch asked, side by side and identical. Make exactly as many boxes as the request says ("6 equal groups" is six boxes), never fewer to save room: a long row wraps onto two lines by itself. The unknown amount is a "?" label, never the number.
Example (1 scoop of tea for 2 cups of water, 3 batches): {"root":{"type":"row","gap":24,"children":[{"type":"container","shape":"box","label":"Batch 1","label_side":"bottom","id":"b1","child":{"type":"row","gap":10,"children":[{"type":"items","icon":"leaf","count":1},{"type":"items","icon":"glass","fill":1,"count":2}]}},{"type":"container","shape":"box","label":"Batch 2","label_side":"bottom","id":"b2","child":{"type":"row","gap":10,"children":[{"type":"items","icon":"leaf","count":1},{"type":"items","icon":"glass","fill":1,"count":2}]}},{"type":"container","shape":"box","label":"Batch 3","label_side":"bottom","id":"b3","child":{"type":"row","gap":10,"children":[{"type":"items","icon":"leaf","count":1},{"type":"items","icon":"glass","fill":1,"count":2}]}}]},"brackets":[{"over":["b1","b2","b3"],"side":"top","label":"water in all: ?"}]}`,
  updown: `Up and down: floors, temperature, sea level, owing money. One vertical axis with 0 marked (its label says what zero is: ground, sea level, 0 degrees), a mark at the start with an icon or a short label, and a move arrow from the start with its size ("down 6", "up 5"). The range covers the start and the end with room to spare. Never label where the move ends: the student finds it.
Example (a lift at floor 2 goes down 6): {"root":{"type":"axis","orientation":"vertical","min":-6,"max":4,"id":"floors","marks":[{"at":0,"label":"ground"},{"at":2,"icon":"elevator","label":"start"}],"moves":[{"from":2,"to":-4,"label":"down 6"}]}}`,
  money: `Money. Real coins (penny, nickel, dime, quarter: each already shows its value) and bills, grouped by kind, each group bracketed with how many coins only ("2 quarters", never "2 quarters = 25 cents": a value beside a group reads as the group's total). A price tag is a label. Never write a total or the change.
Example (2 quarters and 4 nickels): {"root":{"type":"row","gap":40,"children":[{"type":"items","icon":"quarter","count":2,"id":"q"},{"type":"items","icon":"nickel","count":4,"id":"n"}]},"brackets":[{"over":"q","side":"bottom","label":"2 quarters"},{"over":"n","side":"bottom","label":"4 nickels"}]}`,
  part_whole: `A part of a whole: percent, a fraction of an amount, a tape diagram. One bar is the whole, its total as "total_label", cut into the equal parts asked, each part labelled with its value when the request gives one, and the part in question shaded. Shade with "shaded" on the bar, the number of parts from the left: one and a half parts is "shaded": 1.5, three parts is "shaded": 3. When two quantities are compared (one is 3 times another), give every bar the same "unit" so the boxes line up box for box, one bar per quantity, each labelled. A bracket names the shaded part with "?" for its value: put it over "<bar id>.shaded", the shaded stretch exactly.
Second example (one and a half of 8 parts of $24): {"root":{"type":"bar","id":"m","total_label":"$24","shaded":1.5,"parts":[{"label":"$3"},{"label":"$3"},{"label":"$3"},{"label":"$3"},{"label":"$3"},{"label":"$3"},{"label":"$3"},{"label":"$3"}]},"brackets":[{"over":"m.shaded","side":"bottom","label":"? dollars"}]}
Example (30% of a 50-page book, read so far): {"root":{"type":"bar","id":"book","total_label":"50 pages","shaded":3,"parts":[{"label":"5"},{"label":"5"},{"label":"5"},{"label":"5"},{"label":"5"},{"label":"5"},{"label":"5"},{"label":"5"},{"label":"5"},{"label":"5"}]},"brackets":[{"over":"book.shaded","side":"bottom","label":"read: ?"}]}`,
  area: `Area. A grid of unit squares, rows and columns exactly as asked, its two side lengths as top_label and side_label with units, and one small label saying what one square is. Never the total.
Example (a 7 by 2 rug of 1-foot squares): {"root":{"type":"column","gap":12,"children":[{"type":"grid","rows":2,"cols":7,"top_label":"7 ft","side_label":"2 ft","id":"rug"},{"type":"label","text":"each square is 1 ft by 1 ft","size":"s","tone":"pencil"}]}}`,
  balance: `An equation as a balance. Left pan: the x_bag objects and the blocks on that side, exact counts; right pan: the blocks on the other side. Level (tilt 0). No answer, no x value.
Example (4x + 2 = 10): {"root":{"type":"balance","tilt":0,"id":"scale","left":{"type":"row","gap":10,"children":[{"type":"items","icon":"x_bag","count":4,"id":"bags"},{"type":"items","icon":"block","count":2,"id":"l"}]},"right":{"type":"items","icon":"block","count":10,"per_row":5,"id":"r"}}}`,
  trip: `Distance, speed and time. A bar split into one equal part per hour (each labelled "1 hour"), the whole distance as total_label, the vehicle as an icon at its start (a row of the icon and the bar). The unknown distance for one hour is a "?" under one part.
Example (90 km in 3 hours by train): {"root":{"type":"row","gap":14,"align":"end","children":[{"type":"icon","icon":"train","id":"train"},{"type":"bar","id":"road","total_label":"90 km","parts":[{"label":"1 hour"},{"label":"1 hour"},{"label":"1 hour"}]}]},"brackets":[{"over":"road.1","side":"bottom","label":"?"}]}`,
  chance: `Chance. Every outcome drawn: all the objects inside one container (bag, jar, drawer as a box), exact counts, each kind in its own colour ("color" on marble, sock, block); or a spinner as a plain pie with one colour per equal part. Label the kinds ("3 red"), never the probability.
Example (a box of 2 yellow and 4 purple blocks): {"root":{"type":"container","shape":"box","label":"box","id":"box","child":{"type":"row","gap":14,"children":[{"type":"items","icon":"block","color":"yellow","count":2,"id":"y"},{"type":"items","icon":"block","color":"purple","count":4,"id":"p"}]}},"brackets":[{"over":"y","side":"bottom","label":"2 yellow"},{"over":"p","side":"bottom","label":"4 purple"}]}`,
  place_value: `Place value. A "bundles" node: the tens as tied bundles of ten, the ones as loose sticks; label the bundles "tens" and the loose sticks "ones". Never the number they make.
Example (2 tens and 6 ones): {"root":{"type":"bundles","bundles":2,"loose":6,"id":"sticks"},"brackets":[{"over":["sticks.bundle1","sticks.bundle2"],"side":"top","label":"tens"},{"over":"sticks.loose","side":"top","label":"ones"}]}`,
  fraction_compare: `Comparing fractions. The wholes are exactly the same size: pies of one size (a pizza or cake is "style":"pizza") or bars of one length, one above the other, each cut into the pieces asked with the pieces in question shaded and labelled with the fraction given. Never say which is bigger.
Example (2/5 vs 1/2): {"root":{"type":"column","gap":22,"children":[{"type":"bar","id":"fifths","shaded":2,"parts":[{},{},{},{},{}]},{"type":"bar","id":"halves","shaded":1,"parts":[{},{}]}]},"brackets":[{"over":"fifths","side":"left","label":"2/5"},{"over":"halves","side":"left","label":"1/2"}]}`,
  measure: `Cups, glasses and containers. Use measuring_cup, glass or bucket with "fill" from 0 to 1 so each shows exactly how full it is; label each with its amount ("1/2 cup"). An amount over 1 is several containers (1 1/2 cups: one full and one half full). An unknown amount is an empty container labelled "?".
Example (2/3 cup of milk and 1 1/3 cups of water): {"root":{"type":"row","gap":30,"children":[{"type":"container","shape":"none","label":"2/3 cup","label_side":"bottom","child":{"type":"icon","icon":"measuring_cup","fill":0.67,"size":"l"}},{"type":"container","shape":"none","label":"1 cup","label_side":"bottom","child":{"type":"icon","icon":"measuring_cup","fill":1,"size":"l"}},{"type":"container","shape":"none","label":"1/3 cup","label_side":"bottom","child":{"type":"icon","icon":"measuring_cup","fill":0.33,"size":"l"}}]}}`,
  data: `Data. Heights or sizes: a "lineup" of figures to scale, labelled with their values, in the order given. Counts by category: a "pictograph", one row per category. Plates or groups that hold amounts: side by side, each labelled with its count when the request says so. Never the mean, median or difference.
Example (books read: Mia 5, Leo 3): {"root":{"type":"pictograph","id":"books","rows":[{"label":"Mia","icon":"book","count":5},{"label":"Leo","icon":"book","count":3}]}}`,
};

// What each kind is usually asked for in words, for guessing the kind from the
// planner's request. Every kind scores its matching cues; the best score wins,
// ties to the earlier kind. First-match lost to order: "three quarters full"
// read as money and "cups of juice" as measuring in a recipe (43 of 54).
const KIND_CUES: Array<[PictureKind, Array<[RegExp, number]>]> = [
  ["balance", [[/\bbalance\b/i, 3], [/x[_ ]bags?/i, 3], [/\bblocks?\b/i, 1]]],
  ["place_value", [[/\bbundles?\b/i, 3], [/\btens\b/i, 2], [/\bones\b/i, 1], [/place value/i, 3]]],
  ["updown", [[/\bvertical\b/i, 3], [/\bsea level\b/i, 3], [/\bthermometer\b/i, 3], [/\btemperature\b/i, 2], [/\belevator\b/i, 2], [/\barrow (up|down)\b/i, 3], [/\b(up|down) \d+\b/i, 1], [/\bfloors?\b/i, 1], [/\bbelow (zero|ground)\b/i, 2]]],
  ["chance", [[/\bspinner\b/i, 3], [/\bdrawer\b/i, 2], [/\bchance\b|\bprobability\b/i, 2], [/\b(bag|jar)\b.*\b(red|blue|green|black|white|yellow|purple)\b/i, 2], [/\bsocks?\b/i, 1]]],
  ["money", [[/\b(dimes?|nickels?|pennies|penny)\b/i, 3], [/\bquarters?\b(?! (full|of|cup))/i, 2], [/\bcoins?\b/i, 2], [/\bbills?\b/i, 1], [/\bcents?\b/i, 2], [/\bprice tag\b/i, 1]]],
  ["measure", [[/\bmeasuring cups?\b/i, 3], [/\bglass(es)?\b/i, 1], [/\b(half|quarter|three[- ]quarters?|empty)[- ]full\b|\bfull\b/i, 2], [/\bscoops?\b/i, 2]]],
  ["trip", [[/\broad\b/i, 2], [/\bstretch(es)?\b/i, 2], [/\b(km|miles?)\b/i, 1], [/\bhours?\b/i, 1], [/\bspeed\b/i, 2]]],
  ["area", [[/\btiles?\b/i, 3], [/\barea\b/i, 2], [/\b\d+ (long|wide)\b|\b(long|wide) and\b/i, 1], [/\bsquares?\b/i, 1]]],
  ["fraction_compare", [[/\bsame[- ]size\b|\bsame length\b/i, 2], [/\bslices?\b/i, 1], [/\b(thirds|fourths|halves|eighths|fifths|sixths)\b/i, 1], [/\b\d+ (shaded|slices)\b.*\b\d+ (shaded|slices)\b/i, 1]]],
  ["data", [[/\bto scale\b/i, 3], [/\bheights?\b/i, 2], [/\bpicture graph\b/i, 3], [/\bplates? (in a row )?holding\b/i, 2], [/\blined up\b/i, 1]]],
  ["part_whole", [[/\bbar\b/i, 2], [/\btape\b/i, 2], [/\bpercent\b|%/i, 2], [/\bparts? (shaded|of)\b/i, 2], [/\bequal parts\b/i, 1], [/\bboxes the same size\b|\bsame size\b.*\bboxes?\b/i, 2], [/\bbracket over both\b/i, 1]]],
  ["ratio", [[/\bbatch(es)?\b/i, 3], [/\brecipe\b/i, 2], [/\bfor every\b/i, 2], [/\bratio\b/i, 2], [/\brepeated \d+ times\b|\bsame batch\b/i, 2], [/\beach group \d+ \w+ and \d+ \w+/i, 3]]],
  ["sharing", [[/\bshared?\b/i, 2], [/\bempty (plates?|boxes|jars?|bags?)\b/i, 3], [/\bone (box |jar |plate |bag )?(per|for each)\b/i, 2], [/\bloose beside\b/i, 2]]],
  ["groups", [[/\brows? of\b/i, 2], [/\bgroups? of\b/i, 1], [/\b\d+ equal groups\b/i, 2], [/\b(in|with) \d+ \w+ in each\b|\beach (row|carton|box|bucket|layer)\b/i, 2], [/\blayers?\b/i, 2], [/\barrows? to\b/i, 2], [/\bcolumns?\b/i, 1], [/\bcartons?\b/i, 1]]],
];

/** The kind of picture a request describes, or null when nothing fits. */
export function pictureKind(what: string, notice = ""): PictureKind | null {
  let best: PictureKind | null = null;
  let top = 0;
  for (const [kind, cues] of KIND_CUES) {
    const score = cues.reduce((s, [re, w]) => s + (re.test(what) ? w : 0) + (re.test(notice) ? w * 0.25 : 0), 0);
    if (score > top) {
      top = score;
      best = kind;
    }
  }
  return top >= 1.5 ? best : null;
}

/** The recipe text to add to the illustrator's request, or "" for none. */
export function recipeFor(kind: PictureKind | null): string {
  return kind ? `How to draw this kind of picture:\n${RECIPES[kind]}` : "";
}
