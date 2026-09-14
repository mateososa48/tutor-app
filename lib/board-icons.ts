import { BOARD_ICON_NAMES, type BoardIconName } from "./board-icon-names.generated";

// The model says "apples", "ice cream", "kids", "money"; the set has
// "apple", "ice_cream", "boy", "coin". Resolve loosely; null when nothing fits.

const ALIASES: Record<string, BoardIconName> = {
  money: "coin", coins: "coin", cash: "dollar", bill: "dollar", bills: "dollar", dollars: "dollar", note: "dollar",
  kid: "boy", kids: "boy", child: "boy", children: "boy", friend: "person", friends: "person", people: "person", man: "person", woman: "girl",
  ball: "soccer_ball", football: "soccer_ball", soccer: "soccer_ball",
  sweet: "candy", sweets: "candy", candies: "candy", chocolate_bar: "chocolate", donuts: "donut", doughnut: "donut", doughnuts: "donut",
  pizzas: "pizza", slice: "pizza", slices: "pizza", cookies: "cookie", biscuit: "cookie", biscuits: "cookie", cakes: "cake", cupcakes: "cupcake",
  muffin: "cupcake", muffins: "cupcake", sandwiches: "sandwich", burgers: "burger", hamburger: "burger", hamburgers: "burger",
  fruit: "apple", apples: "apple", bananas: "banana", oranges: "orange", strawberries: "strawberry", cherry: "cherries", lemons: "lemon",
  pears: "pear", peaches: "peach", carrots: "carrot", potatoes: "potato", eggs: "egg", loaf: "bread", loaves: "bread",
  dogs: "dog", puppy: "dog", puppies: "dog", cats: "cat", kitten: "cat", kittens: "cat", rabbits: "rabbit", bunny: "rabbit", bunnies: "rabbit",
  birds: "bird", fishes: "fish", cows: "cow", chickens: "chicken", hen: "chicken", hens: "chicken", pigs: "pig", horses: "horse",
  bees: "bee", butterflies: "butterfly", ants: "ant", frogs: "frog", turtles: "turtle",
  balloons: "balloon", gifts: "gift", present: "gift", presents: "gift", tickets: "ticket", trophies: "trophy",
  books: "books", pencils: "pencil", pens: "pencil", pen: "pencil", backpacks: "backpack", rulers: "ruler", clocks: "clock", hours: "clock", minutes: "clock",
  stars: "star", hearts: "heart", candles: "candle", keys: "key", bells: "bell", bulbs: "light_bulb", lightbulb: "light_bulb", phones: "phone", telephone: "phone",
  houses: "house", homes: "house", home: "house", buses: "bus", cars: "car", bikes: "bicycle", bike: "bicycle", bicycles: "bicycle",
  trucks: "truck", planes: "airplane", plane: "airplane", trains: "train", rockets: "rocket", boats: "boat", ship: "boat",
  trees: "tree", flowers: "flower", clouds: "cloud", raindrop: "droplet", drop: "droplet", drops: "droplet", water: "droplet", leaves: "leaf",
  boxes: "box", baskets: "basket", bags: "bag", jars: "jar", chairs: "chair", doors: "door", windows: "window",
  teachers: "teacher", students: "student", boys: "boy", girls: "girl", persons: "person",
};

export function resolveIconName(input: string): BoardIconName | null {
  const names = BOARD_ICON_NAMES as readonly string[];
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  const key = raw.replace(/[\s-]+/g, "_").replace(/^(a|an|the|some)_/, "");
  if (names.includes(key)) return key as BoardIconName;
  if (ALIASES[key]) return ALIASES[key];
  // plural → singular
  const singular = key.endsWith("ies") ? `${key.slice(0, -3)}y` : key.endsWith("es") && names.includes(key.slice(0, -2)) ? key.slice(0, -2) : key.endsWith("s") ? key.slice(0, -1) : key;
  if (names.includes(singular)) return singular as BoardIconName;
  if (ALIASES[singular]) return ALIASES[singular];
  // last word of a phrase ("red apple", "chocolate chip cookie")
  const last = key.split("_").pop() ?? key;
  if (last !== key) return resolveIconName(last);
  // a name that contains the word
  const partial = names.find((n) => n.includes(key) || key.includes(n));
  return (partial as BoardIconName | undefined) ?? null;
}

export function iconLabel(name: string): string {
  return name.replaceAll("_", " ");
}
