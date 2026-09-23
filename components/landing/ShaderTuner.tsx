"use client";

import { SWIRL } from "./swirl";
import { Group, Range, Segmented, Swatch, Toggle, TunerPanel, clamp } from "./tuner-parts";

// A liquid-glass settings panel for the hero's shader. Double-click the hero's
// background to open it (Hero.tsx decides where that works). Every control
// changes the shader live; values persist in this browser only, Reset returns
// to the shipped look, and Copy puts the values on the clipboard.

type RGB = [number, number, number];

export type HeroShader = {
  pattern: "bands" | "swirl";
  waveColor: RGB;
  deepColor: RGB;
  useDeep: boolean;
  backgroundColor: RGB;
  colorNum: number;
  pixelSize: number;
  waveSpeed: number;
  waveFrequency: number;
  waveAmplitude: number;
  lightness: number;
  animate: boolean;
  /** 0 to 0.9: a layer of the page's off-white over the shader. */
  wash: number;
  /** CSS px: the fade into the page at the bottom of the hero. */
  fade: number;
};

// The hero's shipped look: the sign-in swirl's colours, shades and pixels, with
// a finer, more warped field. Mateo picked the field in this tuner on Sept 15;
// on Sept 16 he found the full-strength blue "too much", so it now runs slower
// under a 50% wash of the page colour, a touch lighter, and fades out earlier
// so the app frame sits on the page rather than on the noise. The sign-in
// panel keeps SWIRL at full strength.
export const HERO_SHADER_DEFAULT: HeroShader = {
  pattern: SWIRL.pattern,
  waveColor: [...SWIRL.waveColor],
  deepColor: [...SWIRL.deepColor],
  useDeep: true,
  backgroundColor: [...SWIRL.backgroundColor],
  colorNum: SWIRL.colorNum,
  pixelSize: SWIRL.pixelSize,
  waveSpeed: 0.04,
  waveFrequency: 2.55,
  waveAmplitude: 0.66,
  lightness: 0.14,
  animate: true,
  wash: 0.5,
  fade: 560,
};

const STORE = "chalk.heroShader.v1";

export function loadHeroShader(): HeroShader | null {
  try {
    const raw = window.localStorage.getItem(STORE);
    return raw ? { ...HERO_SHADER_DEFAULT, ...(JSON.parse(raw) as Partial<HeroShader>) } : null;
  } catch {
    return null;
  }
}

export function saveHeroShader(value: HeroShader | null) {
  try {
    if (value) window.localStorage.setItem(STORE, JSON.stringify(value));
    else window.localStorage.removeItem(STORE);
  } catch {
    // Storage blocked (private window): the settings just won't persist.
  }
}

const clampUnit = (v: number) => clamp(v, 0, 1);
const toHex = (c: RGB) => "#" + c.map((v) => Math.round(clampUnit(v) * 255).toString(16).padStart(2, "0")).join("");
const fromHex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;

export function ShaderTuner({
  at,
  value,
  onChange,
  onReset,
  onClose,
}: {
  at: { x: number; y: number };
  value: HeroShader;
  onChange: (next: HeroShader) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const set = <K extends keyof HeroShader>(key: K, next: HeroShader[K]) => onChange({ ...value, [key]: next });

  return (
    <TunerPanel
      title="Hero shader"
      at={at}
      onReset={onReset}
      onCopy={() => JSON.stringify(value, (_key, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v), 2)}
      onClose={onClose}
    >
        <Group title="Pattern">
          <Segmented
            value={value.pattern}
            options={[
              ["swirl", "Swirl"],
              ["bands", "Bands"],
            ]}
            onChange={(v) => set("pattern", v)}
          />
        </Group>

        <Group title="Motion">
          <Toggle label="Animate" checked={value.animate} onChange={(v) => set("animate", v)} />
          <Range label="Speed" value={value.waveSpeed} min={0} max={0.2} step={0.005} format={(v) => v.toFixed(3)} onChange={(v) => set("waveSpeed", v)} />
        </Group>

        <Group title="Shape">
          <Range label="Scale" value={value.waveFrequency} min={0.3} max={5} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set("waveFrequency", v)} />
          <Range label="Warp" value={value.waveAmplitude} min={0} max={1.5} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set("waveAmplitude", v)} />
          <Range label="Lightness" value={value.lightness} min={-0.3} max={0.3} step={0.01} format={(v) => (v > 0 ? "+" : "") + v.toFixed(2)} onChange={(v) => set("lightness", v)} />
          <Range label="Shades" value={value.colorNum} min={2} max={12} step={1} format={(v) => String(v)} onChange={(v) => set("colorNum", v)} />
          <Range label="Pixel size" value={value.pixelSize} min={1} max={12} step={1} format={(v) => `${v}px`} onChange={(v) => set("pixelSize", v)} />
        </Group>

        <Group title="Color">
          <Swatch label="Light" value={toHex(value.waveColor)} onChange={(v) => set("waveColor", fromHex(v))} />
          <Toggle label="Deep tone" checked={value.useDeep} onChange={(v) => set("useDeep", v)} />
          <Swatch label="Deep" value={toHex(value.deepColor)} disabled={!value.useDeep} onChange={(v) => set("deepColor", fromHex(v))} />
          <Swatch label="Background" value={toHex(value.backgroundColor)} onChange={(v) => set("backgroundColor", fromHex(v))} />
        </Group>

        <Group title="Layers">
          <Range label="White wash" value={value.wash} min={0} max={0.9} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("wash", v)} />
          <Range label="Bottom fade" value={value.fade} min={0} max={480} step={8} format={(v) => `${v}px`} onChange={(v) => set("fade", v)} />
        </Group>

    </TunerPanel>
  );
}
