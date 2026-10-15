// A short burst of confetti from the green check on a right answer
// (Oct 14 2026, Mateo: "add one of these effects when they get a question
// correct, but make it like much shorter"). The physics is the Motion
// confetti component he pasted (velocity with decay, gravity, a sideways
// wobble, a 3D tilt and a pop at the start), cut from 2.5 s and 60 pieces to
// under a second and a couple of dozen, in the board's own sky and green
// rather than a party's seven colours. Pure: the board's layer plays the
// keyframes.

export const CONFETTI_COLORS = ["#3d9cff", "#1d7ee6", "#9cc9ff", "#15803d", "#4cc38a"] as const;
// Fewer strips than the original: at this size a thin strip turned edge-on
// reads as a scratch on the board, not a piece of confetti.
const SHAPES = ["circle", "circle", "rect", "rect", "strip"] as const;
export type ConfettiShape = (typeof SHAPES)[number];

const KEYFRAMES = 24;
const POP = 0.1;

export type ConfettiParticle = {
  transform: string[];
  opacity: number[];
  /** Seconds. */
  duration: number;
  /** Width and height in CSS pixels. */
  w: number;
  h: number;
  radius: string;
  color: string;
};

export type ConfettiOptions = {
  count?: number;
  /** Pixels per tick at the start (before decay). */
  velocity?: number;
  /** Degrees around straight up. */
  spread?: number;
  decay?: number;
  gravity?: number;
  /** Seconds. */
  duration?: number;
  /** Piece size multiplier. */
  size?: number;
};

export const CONFETTI_DEFAULTS: Required<ConfettiOptions> = {
  count: 26,
  velocity: 16,
  spread: 80,
  decay: 0.88,
  gravity: 0.9,
  duration: 0.9,
  size: 1,
};

/** One piece's flight as transform and opacity keyframes (the pasted component's model). */
export function flightKeyframes(o: {
  angle: number;
  velocity: number;
  decay: number;
  gravity: number;
  wobbleSpeed: number;
  wobbleOffset: number;
  size: number;
  ticks: number;
  tilt: number;
  rotation: number;
}): { transform: string[]; opacity: number[] } {
  const transform: string[] = [];
  const opacity: number[] = [];
  let v = o.velocity;
  let x = 0;
  let y = 0;
  let wobble = o.wobbleOffset;
  let tick = 0;
  for (let i = 0; i <= KEYFRAMES; i++) {
    const t = i / KEYFRAMES;
    if (i > 0) {
      const target = Math.round((i * o.ticks) / KEYFRAMES);
      while (tick < target) {
        x += Math.cos(o.angle) * v;
        y += Math.sin(o.angle) * v + o.gravity * 3;
        v *= o.decay;
        wobble += o.wobbleSpeed;
        tick++;
      }
    }
    const tx = i === 0 ? 0 : x + Math.cos(wobble) * 10 * o.size;
    const scale = t < POP * 0.6 ? (t / (POP * 0.6)) * 1.15 : t < POP ? 1.15 - ((t - POP * 0.6) / (POP * 0.4)) * 0.15 : 1;
    // Held, then gone over the last half: a short burst should not linger.
    const op = t <= 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.55);
    transform.push(`translate(${tx.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(3)}) rotateY(${(o.tilt * 360 * t).toFixed(1)}deg) rotate(${o.rotation.toFixed(0)}deg)`);
    opacity.push(Number(op.toFixed(3)));
  }
  return { transform, opacity };
}

/** A burst's pieces. `rand` is injectable so tests are repeatable. */
export function makeConfetti(opts: ConfettiOptions = {}, rand: () => number = Math.random): ConfettiParticle[] {
  const o = { ...CONFETTI_DEFAULTS, ...opts };
  const ticks = Math.round(o.duration * 60);
  const spread = (o.spread * Math.PI) / 180;
  return Array.from({ length: o.count }, () => {
    const angle = -Math.PI / 2 + (0.5 * spread - rand() * spread);
    const shape = SHAPES[Math.floor(rand() * SHAPES.length)];
    const base = 6 * o.size + rand() * 5 * o.size;
    const kf = flightKeyframes({
      angle,
      velocity: o.velocity * 0.5 + rand() * o.velocity,
      decay: o.decay,
      gravity: o.gravity,
      wobbleSpeed: Math.min(0.11, rand() * 0.1 + 0.05),
      wobbleOffset: rand() * 10,
      size: o.size,
      ticks,
      tilt: 1.5 + rand() * 3,
      rotation: rand() * 360,
    });
    return {
      ...kf,
      duration: o.duration,
      w: shape === "strip" ? base * 0.42 : shape === "rect" ? base * 0.7 : base,
      h: shape === "strip" ? base * 1.6 : base,
      radius: shape === "circle" ? "50%" : shape === "strip" ? `${(base * 0.12).toFixed(1)}px` : "2px",
      color: CONFETTI_COLORS[Math.floor(rand() * CONFETTI_COLORS.length)],
    };
  });
}
