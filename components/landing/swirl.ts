import type { ComponentProps } from "react";
import type { DitherWave } from "./DitherWave";
import { VOICE_BLUE } from "@/components/session/VoiceWave";

// The dithered swirl shared by the sign-in panel and the landing hero: the
// tutor's voice wave palette (its light blue over its near-white, with the
// darkest tone pulled 40% from the voice's deep blue toward the light blue),
// seven shades, and the size, warp and speed its breakpoints were fitted at.
// Module-level values, so the shader is not rebuilt on every render.
const SWIRL_DEEP: [number, number, number] = [0, 1, 2].map(
  (i) => VOICE_BLUE.deep[i] + (VOICE_BLUE.top[i] - VOICE_BLUE.deep[i]) * 0.4,
) as [number, number, number];

export const SWIRL = {
  pattern: "swirl",
  waveColor: VOICE_BLUE.top,
  deepColor: SWIRL_DEEP,
  backgroundColor: VOICE_BLUE.bg,
  colorNum: 7,
  pixelSize: 3,
  waveAmplitude: 0.45,
  waveFrequency: 1.7,
  waveSpeed: 0.035,
} as const satisfies Partial<ComponentProps<typeof DitherWave>>;
