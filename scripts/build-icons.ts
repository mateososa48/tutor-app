// Curates the board's icon set from Fluent Emoji Flat (MIT, Microsoft) and
// writes lib/board-icons.generated.ts. Re-run after changing the list:
//   npx tsx scripts/build-icons.ts
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const data = require("@iconify-json/fluent-emoji-flat/icons.json") as {
  width?: number;
  height?: number;
  icons: Record<string, { body: string; width?: number; height?: number; left?: number; top?: number }>;
};

// Friendly name the tutor uses → Fluent Emoji Flat icon name.
const CURATED: Record<string, string> = {
  // food
  apple: "red-apple", green_apple: "green-apple", banana: "banana", orange: "tangerine", strawberry: "strawberry", grapes: "grapes",
  watermelon: "watermelon", cherries: "cherries", lemon: "lemon", pear: "pear", peach: "peach", carrot: "carrot", broccoli: "broccoli",
  potato: "potato", corn: "ear-of-corn", pizza: "pizza", burger: "hamburger", hot_dog: "hot-dog", fries: "french-fries", taco: "taco",
  sandwich: "sandwich", bread: "bread", egg: "egg", cheese: "cheese-wedge", cookie: "cookie", cake: "birthday-cake", cupcake: "cupcake",
  donut: "doughnut", candy: "candy", lollipop: "lollipop", chocolate: "chocolate-bar", ice_cream: "ice-cream", popcorn: "popcorn",
  milk: "glass-of-milk", cup: "hot-beverage", juice: "cup-with-straw",
  // money
  coin: "coin", dollar: "dollar-banknote", money_bag: "money-bag", credit_card: "credit-card",
  // animals
  dog: "dog", cat: "cat", rabbit: "rabbit", bird: "bird", fish: "fish", cow: "cow", chicken: "chicken", pig: "pig", horse: "horse",
  bee: "honeybee", butterfly: "butterfly", ant: "ant", frog: "frog", turtle: "turtle",
  // play
  soccer_ball: "soccer-ball", basketball: "basketball", baseball: "baseball", tennis_ball: "tennis", balloon: "balloon", gift: "wrapped-gift",
  trophy: "trophy", ticket: "ticket",
  // school and objects
  book: "open-book", books: "books", pencil: "pencil", backpack: "backpack", ruler: "straight-ruler", scissors: "scissors",
  calendar: "calendar", clock: "alarm-clock", watch: "watch", light_bulb: "light-bulb", key: "key", bell: "bell", star: "star",
  heart: "red-heart", candle: "candle", umbrella: "umbrella", magnet: "magnet", battery: "battery", phone: "telephone", laptop: "laptop",
  tv: "television", camera: "camera", chair: "chair", door: "door", window: "window",
  // places and transport
  house: "house", school: "school", bus: "bus", car: "automobile", bicycle: "bicycle", truck: "delivery-truck", airplane: "airplane",
  train: "locomotive", rocket: "rocket", boat: "sailboat",
  // nature
  tree: "deciduous-tree", flower: "tulip", sun: "sun", cloud: "cloud", rain: "cloud-with-rain", snowflake: "snowflake", moon: "crescent-moon",
  lightning: "high-voltage", fire: "fire", droplet: "droplet", leaf: "fallen-leaf",
  // people
  person: "bust-in-silhouette", boy: "boy", girl: "girl", teacher: "teacher", student: "student",
  // containers
  box: "package", basket: "basket", cart: "shopping-cart", jar: "jar", bag: "shopping-bags",
  // Added Sept 15 2026: a wider set so the tutor is not stuck with 118 things.
  one: "keycap-1", two: "keycap-2", three: "keycap-3", four: "keycap-4", five: "keycap-5", six: "keycap-6",
  seven: "keycap-7", eight: "keycap-8", nine: "keycap-9", ten: "keycap-10", zero: "keycap-0", red_square: "red-square",
  blue_square: "blue-square", green_square: "green-square", yellow_square: "yellow-square", orange_square: "orange-square", purple_square: "purple-square", white_square: "white-large-square",
  black_square: "black-large-square", red_circle: "red-circle", blue_circle: "blue-circle", green_circle: "green-circle", yellow_circle: "yellow-circle", orange_circle: "orange-circle",
  purple_circle: "purple-circle", white_circle: "white-circle", black_circle: "black-circle", blue_diamond: "large-blue-diamond", orange_diamond: "large-orange-diamond", abacus: "abacus",
  balance_scale: "balance-scale", triangular_ruler: "triangular-ruler", thermometer: "thermometer", hourglass: "hourglass-done", hourglass_running: "hourglass-not-done", stopwatch: "stopwatch",
  timer: "timer-clock", chart_up: "chart-increasing", chart_down: "chart-decreasing", bar_chart: "bar-chart", pie: "pie", input_numbers: "input-numbers",
  compass: "compass", gear: "gear", chain: "chains", link: "link", magnifying_glass: "magnifying-glass-tilted-left", microscope: "microscope",
  telescope: "telescope", test_tube: "test-tube", dna: "dna", puzzle_piece: "puzzle-piece", dice: "game-die", clock_1: "one-oclock",
  clock_2: "two-oclock", clock_3: "three-oclock", clock_4: "four-oclock", clock_5: "five-oclock", clock_6: "six-oclock", clock_7: "seven-oclock",
  clock_8: "eight-oclock", clock_9: "nine-oclock", clock_10: "ten-oclock", clock_11: "eleven-oclock", clock_12: "twelve-oclock", clock_130: "one-thirty",
  clock_1230: "twelve-thirty", arrow_right: "right-arrow", arrow_left: "left-arrow", arrow_up: "up-arrow", arrow_down: "down-arrow", pineapple: "pineapple",
  mango: "mango", kiwi: "kiwi-fruit", coconut: "coconut", avocado: "avocado", cucumber: "cucumber", tomato: "tomato",
  eggplant: "eggplant", pepper: "bell-pepper", hot_pepper: "hot-pepper", mushroom: "mushroom", onion: "onion", garlic: "garlic",
  peanuts: "peanuts", olive: "olive", blueberries: "blueberries", pretzel: "pretzel", bagel: "bagel", pancakes: "pancakes",
  waffle: "waffle", croissant: "croissant", sushi: "sushi", rice: "cooked-rice", noodles: "steaming-bowl", salad: "green-salad",
  honey: "honey-pot", cake_slice: "shortcake", custard: "custard", soft_ice_cream: "soft-ice-cream", bubble_tea: "bubble-tea", tea: "teacup-without-handle",
  canned_food: "canned-food", butter: "butter", salt: "salt", sheep: "ewe", goat: "goat", monkey: "monkey",
  elephant: "elephant", lion: "lion", tiger: "tiger", bear: "bear", panda: "panda", koala: "koala",
  penguin: "penguin", owl: "owl", duck: "duck", eagle: "eagle", snake: "snake", whale: "whale",
  dolphin: "dolphin", octopus: "octopus", crab: "crab", shark: "shark", spider: "spider", snail: "snail",
  ladybug: "lady-beetle", mouse: "mouse", hamster: "hamster", squirrel: "chipmunk", hedgehog: "hedgehog", fox: "fox",
  wolf: "wolf", deer: "deer", zebra: "zebra", giraffe: "giraffe", camel: "camel", kangaroo: "kangaroo",
  unicorn: "unicorn", dragon: "dragon", dinosaur: "t-rex", worm: "worm", taxi: "taxi", police_car: "police-car",
  fire_engine: "fire-engine", ambulance: "ambulance", tractor: "tractor", scooter: "kick-scooter", motorcycle: "motorcycle", skateboard: "skateboard",
  helicopter: "helicopter", ship: "ship", canoe: "canoe", lorry: "articulated-lorry", traffic_light: "vertical-traffic-light", fuel_pump: "fuel-pump",
  office: "office-building", hospital: "hospital", bank: "bank", hotel: "hotel", shop: "convenience-store", factory: "factory",
  stadium: "stadium", castle: "castle", tent: "tent", mountain: "mountain", volcano: "volcano", beach: "beach-with-umbrella",
  ferris_wheel: "ferris-wheel", roller_coaster: "roller-coaster", bridge: "bridge-at-night", man: "man", woman: "woman", baby: "baby",
  older_person: "older-person", police: "police-officer", firefighter: "firefighter", farmer: "farmer", cook: "cook", scientist: "scientist",
  astronaut: "astronaut", artist: "artist", mechanic: "mechanic", office_worker: "office-worker", pilot: "pilot", doctor: "health-worker",
  american_football: "american-football", volleyball: "volleyball", rugby: "rugby-football", hockey: "ice-hockey", badminton: "badminton", bowling: "bowling",
  ping_pong: "ping-pong", skis: "skis", ice_skate: "ice-skate", sled: "sled", kite: "kite", yo_yo: "yo-yo",
  teddy_bear: "teddy-bear", crayon: "crayon", paintbrush: "paintbrush", palette: "artist-palette", guitar: "guitar", drum: "drum",
  trumpet: "trumpet", violin: "violin", piano: "musical-keyboard", music_note: "musical-note", graduation_cap: "graduation-cap", closed_book: "closed-book",
  notebook: "notebook", newspaper: "newspaper", envelope: "envelope", pen: "pen", clipboard: "clipboard", pushpin: "pushpin",
  paperclip: "paperclip", folder: "file-folder", wastebasket: "wastebasket", lock: "locked", unlock: "unlocked", hammer: "hammer",
  wrench: "wrench", screwdriver: "screwdriver", nut_and_bolt: "nut-and-bolt", ladder: "ladder", toolbox: "toolbox", brick: "brick",
  bucket: "bucket", broom: "broom", soap: "soap", sponge: "sponge", toothbrush: "toothbrush", bed: "bed",
  couch: "couch-and-lamp", keyboard: "keyboard", printer: "printer", mouse_computer: "computer-mouse", floppy: "floppy-disk",
  plug: "electric-plug", flashlight: "flashlight", mobile: "mobile-phone", desktop: "desktop-computer", satellite: "satellite", shirt: "t-shirt",
  shoe: "running-shoe", sock: "socks", hat: "billed-cap", glasses: "glasses", crown: "crown", ring: "ring",
  gem: "gem-stone", seedling: "seedling", cactus: "cactus", palm_tree: "palm-tree", rose: "rose",
  sunflower: "sunflower", four_leaf_clover: "four-leaf-clover", rainbow: "rainbow", star_glowing: "glowing-star", comet: "comet", earth: "globe-showing-americas",
};

const out: Record<string, { body: string; w: number; h: number }> = {};
const missing: string[] = [];
for (const [friendly, name] of Object.entries(CURATED)) {
  const icon = data.icons[name];
  if (!icon) {
    missing.push(`${friendly} (${name})`);
    continue;
  }
  out[friendly] = { body: icon.body, w: icon.width ?? data.width ?? 32, h: icon.height ?? data.height ?? 32 };
}
if (missing.length) {
  console.error("Missing icons:", missing.join(", "));
  process.exit(1);
}
const names = Object.keys(out);
const file = `// GENERATED by scripts/build-icons.ts. Do not edit by hand.
//
// Icons: Fluent Emoji (Microsoft), flat style, via @iconify-json/fluent-emoji-flat.
// MIT License. Copyright (c) Microsoft Corporation.
// https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE

import type { BoardIconName } from "./board-icon-names.generated";

export type BoardIcon = { body: string; w: number; h: number };

export const BOARD_ICONS: Record<BoardIconName, BoardIcon> = ${JSON.stringify(out)};
`;
fs.writeFileSync("lib/board-icons.generated.ts", file);
// Names only, for the tool declaration and the dispatcher (no SVG bodies on the server).
fs.writeFileSync(
  "lib/board-icon-names.generated.ts",
  `// GENERATED by scripts/build-icons.ts. Do not edit by hand.\nexport const BOARD_ICON_NAMES = ${JSON.stringify(names)} as const;\nexport type BoardIconName = (typeof BOARD_ICON_NAMES)[number];\n`,
);
console.log(`wrote lib/board-icons.generated.ts with ${names.length} icons, ${Math.round(file.length / 1024)} KB`);
