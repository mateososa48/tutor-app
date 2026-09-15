"use client";

import { useEffect, useRef } from "react";

// A dithered wave background in raw WebGL: layered value noise makes a slow
// field, an ordered 4x4 Bayer matrix quantizes it into a few tones, and the
// tones are mixed between the page background and the accent. No three.js.
// Two patterns: "bands" (the landing hero: soft horizontal waves) and "swirl"
// (noise warped by itself twice, so it folds into drifting eddies).

type Props = {
  waveColor?: [number, number, number];
  backgroundColor?: [number, number, number];
  colorNum?: number;
  pixelSize?: number;
  waveSpeed?: number;
  waveFrequency?: number;
  waveAmplitude?: number;
  animate?: boolean;
  /** "bands" (default, the hero) or "swirl". */
  pattern?: "bands" | "swirl";
  /** Optional third tone for the densest parts of the field. */
  deepColor?: [number, number, number];
  /**
   * Swirl only: a soft oval, in canvas pixels from the bottom-left corner,
   * where the tone is capped (0 to 1) so the field stays blue behind a label.
   * The field keeps moving; it just never brightens past the cap there.
   */
  calmSpot?: { x: number; y: number; rx: number; ry: number; cap: number };
  className?: string;
};

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_wave;
uniform vec3 u_bg;
uniform float u_colorNum;
uniform float u_pixel;
uniform float u_freq;
uniform float u_amp;
uniform vec3 u_deep;
uniform float u_deepMix;
uniform int u_pattern;
uniform vec4 u_calm;
uniform float u_calmCap;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
// Four octaves: the swirl samples the field five times per pixel.
float fbm4(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.02 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
const mat4 bayer = mat4(
  0.0, 8.0, 2.0, 10.0,
  12.0, 4.0, 14.0, 6.0,
  3.0, 11.0, 1.0, 9.0,
  15.0, 7.0, 13.0, 5.0) / 16.0;

// A circle through the origin: 0 at a = 0 and back to 0 every 2 pi, so motion
// built from it loops seamlessly.
vec2 circ(float a, float r, float ph) { return r * vec2(sin(a + ph) - sin(ph), cos(ph) - cos(a + ph)); }

void main() {
  vec2 px = floor(gl_FragCoord.xy / u_pixel) * u_pixel;
  vec2 uv = px / u_res;
  uv.x *= u_res.x / u_res.y;
  float t = u_time;
  vec2 p = uv * u_freq;
  float f;
  if (u_pattern == 1) {
    // A slow pan: the whole field drifts across the panel (about a minute to
    // cross it), so a large soft shape never parks in one corner.
    // The swirl loops: every drift below travels a circle that comes back to its
    // start, and the clock wraps every 84 units (four minutes at the sign-in
    // speed), so the opening look repeats exactly and never drifts. Straight-line
    // drifts grew without bound and, after tens of minutes, the noise lost
    // precision on the GPU and the whole panel washed out.
    float a = t * 6.2831853 / 84.0;
    p += circ(a, 0.96, 0.0);
    // Domain warping: the field's own noise bends where it samples next, twice,
    // and each layer drifts on its own clock, so shapes curl and stretch
    // instead of travelling as bands.
    vec2 warpA = vec2(fbm4(p + circ(a, 1.6, 1.3)), fbm4(p + vec2(5.2, 1.3) + circ(a, 1.9, 3.7)));
    vec2 warpB = vec2(fbm4(p + u_amp * 4.0 * warpA + vec2(1.7, 9.2) + circ(a, 2.8, 5.1)),
                      fbm4(p + u_amp * 4.0 * warpA + vec2(8.3, 2.8) + circ(a, 2.4, 2.2)));
    float n = fbm4(p + u_amp * 4.0 * warpB);
    // Calibrated against a JS model of this field (frequency 1.7, warp 0.45):
    // Four breakpoints, one between each pair of neighbouring tones, fitted on
    // this field as rendered over one full loop (frequency 1.7, warp 0.45) to
    // the seven-shade mix of the swirl's opening minutes, so every moment of
    // the loop looks like the start: mean lightness about 139/255, about 3%
    // background, near-single-colour areas no worse than the opening. K3 sits
    // high so only the brightest peaks turn white.
    const float K0 = 0.3477;
    const float K1 = 0.4491;
    const float K2 = 0.5506;
    const float K3 = 0.7175;
    float g = n < K1 ? 0.125 + (n - K0) * 0.25 / (K1 - K0)
            : n < K2 ? 0.375 + (n - K1) * 0.25 / (K2 - K1)
            : 0.625 + (n - K2) * 0.25 / (K3 - K2);
    f = clamp(g, 0.0, 1.0);
    // The calm spot: full strength inside 40% of the oval, easing out slowly to
    // its edge, where the tone is capped so a label on top always has blue
    // behind it. A wide, soft falloff keeps it from reading as a shape.
    float calm = 1.0 - smoothstep(0.4, 1.0, length((px - u_calm.xy) / max(u_calm.zw, vec2(1.0))));
    f = min(f, mix(1.0, u_calmCap, calm));
  } else {
    float w = fbm(p + vec2(t * 0.35, -t * 0.2) + 1.2 * fbm(p * 0.6 - t * 0.15));
    float ridge = 0.5 + 0.5 * sin((uv.y * 3.4 + w * u_amp * 3.0 - t * 0.5) * 3.14159);
    f = smoothstep(0.15, 0.95, ridge * w * 1.6);
  }
  int bx = int(mod(gl_FragCoord.x / u_pixel, 4.0));
  int by = int(mod(gl_FragCoord.y / u_pixel, 4.0));
  float threshold = bayer[by][bx];
  float steps = max(u_colorNum - 1.0, 1.0);
  float q = floor(f * steps + threshold) / steps;
  vec3 col;
  if (u_pattern == 1) {
    // Swirl ramp: deep blue carries the field, the lighter blue sits in the
    // middle, and the background only shows at the very top.
    col = q < 0.5 ? mix(u_deep, u_wave, q * 2.0) : mix(u_wave, u_bg, (q - 0.5) * 2.0);
  } else {
    col = mix(u_bg, u_wave, clamp(q, 0.0, 1.0));
    col = mix(col, u_deep, u_deepMix * smoothstep(0.55, 1.0, q));
  }
  outColor = vec4(col, 1.0);
}`;

// Time units per swirl loop; must match the 84.0 in the shader's swirl branch.
const SWIRL_LOOP = 84;

export function DitherWave({
  waveColor = [0.42, 0.66, 1],
  backgroundColor = [0.984, 0.984, 0.988],
  colorNum = 4,
  pixelSize = 3,
  waveSpeed = 0.05,
  waveFrequency = 2.2,
  waveAmplitude = 0.55,
  animate = true,
  pattern = "bands",
  deepColor,
  calmSpot,
  className = "",
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn("[DitherWave] shader compile failed:", gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[DitherWave] program link failed:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    gl.uniform3fv(u("u_wave"), waveColor);
    gl.uniform3fv(u("u_bg"), backgroundColor);
    gl.uniform1f(u("u_colorNum"), colorNum);
    gl.uniform1f(u("u_pixel"), pixelSize);
    gl.uniform1f(u("u_freq"), waveFrequency);
    gl.uniform1f(u("u_amp"), waveAmplitude);
    gl.uniform3fv(u("u_deep"), deepColor ?? waveColor);
    gl.uniform1f(u("u_deepMix"), deepColor ? 1 : 0);
    gl.uniform1i(u("u_pattern"), pattern === "swirl" ? 1 : 0);
    const calm = calmSpot ?? { x: 0, y: 0, rx: 1, ry: 1, cap: 1 };
    gl.uniform4f(u("u_calm"), calm.x, calm.y, calm.rx, calm.ry);
    gl.uniform1f(u("u_calmCap"), calm.cap);
    const uRes = u("u_res");
    const uTime = u("u_time");

    let raf = 0;
    let visible = true;
    const start = performance.now();

    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth));
      const h = Math.max(1, Math.floor(canvas.clientHeight));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    };
    const draw = (now: number) => {
      const time = ((now - start) / 1000) * waveSpeed * 10;
      // The swirl's motion is periodic, so its clock wraps (see the shader).
      gl.uniform1f(uTime, pattern === "swirl" ? time % SWIRL_LOOP : time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const frame = (now: number) => {
      draw(now);
      if (animate && visible) raf = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && animate) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(canvas);

    resize();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, [waveColor, backgroundColor, colorNum, pixelSize, waveSpeed, waveFrequency, waveAmplitude, animate, pattern, deepColor, calmSpot]);

  return <canvas ref={ref} aria-hidden className={`block h-full w-full ${className}`} />;
}
