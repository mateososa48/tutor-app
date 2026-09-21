"use client";

import { useEffect, useRef } from "react";
import { VOICE_BLUE } from "@/components/session/VoiceWave";

// The tutor's pet: a small dithered blob in the voice wave's blues with two
// pixel eyes, drawn in raw WebGL from a signed distance field. Mateo picked
// the rounded square (Sept 20); the circle and the squat triangle stay
// selectable for the lab. The outline is wobbled by a slow sine on the angle
// so it never sits still, squashed and leaned by the state machine below on
// springs (so every change of pose overshoots a little and settles), and
// pixelated with the same Bayer dither as the wave. The canvas is transparent,
// so it can sit over the board or any surface.

export type PetShape = "circle" | "square" | "triangle";
export type PetState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "writing"
  | "happy"
  | "hello"
  | "puzzled"
  | "surprised"
  | "sleepy"
  | "arrive";

type Props = {
  shape?: PetShape;
  state?: PetState;
  /** The voice level, 0 to 1, while speaking. */
  level?: number;
  /** Where it looks: -1 to 1 on each axis, right and up positive. */
  look?: { x: number; y: number };
  /** CSS pixels; the pixel blocks scale with it so the look stays the same. */
  size?: number;
  reduceMotion?: boolean;
  className?: string;
};

const SHAPE_ID: Record<PetShape, number> = { circle: 0, square: 1, triangle: 2 };

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_res;
uniform float u_pixel;
uniform float u_time;
uniform int u_shape;
uniform vec2 u_squash;
uniform float u_lean;
uniform float u_wobble;
uniform float u_level;
uniform vec2 u_look;
uniform float u_blink;
uniform vec2 u_squint;   // left, right: closes the eye (positive) or widens it (negative)
uniform float u_happy;
uniform vec2 u_offset;
uniform float u_eyeY;
uniform vec3 u_bg;
uniform vec3 u_top;
uniform vec3 u_deep;

const mat4 bayer = mat4(
  0.0, 8.0, 2.0, 10.0,
  12.0, 4.0, 14.0, 6.0,
  3.0, 11.0, 1.0, 9.0,
  15.0, 7.0, 13.0, 5.0) / 16.0;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
float sdCircle(vec2 p, float r) { return length(p) - r; }
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
// Equilateral triangle, apex up, after Inigo Quilez.
float sdTriangle(vec2 p, float r) {
  const float k = sqrt(3.0);
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// The body's distance field in its own space, with the wobble.
float body(vec2 q, float r, float t) {
  float a = atan(q.y, q.x);
  float w = 0.5 * sin(2.0 * a + t * 0.6) + 0.35 * sin(3.0 * a - t * 0.45 + 1.7) + 0.15 * sin(5.0 * a + t * 0.3 + 0.4);
  float d;
  if (u_shape == 0) {
    d = sdCircle(q, r);
  } else if (u_shape == 1) {
    d = sdRoundBox(q, vec2(0.74 * r), 0.3 * r);
  } else {
    // Wider than tall, with a soft top: the rounding grows a small triangle outward.
    d = sdTriangle(vec2(q.x, q.y + 0.18 * r), 0.66 * r) - 0.3 * r;
  }
  return d - u_wobble * 0.025 * r * w;
}

void main() {
  // Pixel blocks: everything below is computed once per block, so the edges
  // and the eyes are as blocky as the fill.
  vec2 px = floor(gl_FragCoord.xy / u_pixel) * u_pixel + u_pixel * 0.5;
  float hf = 0.5 * min(u_res.x, u_res.y);
  vec2 p = (px - 0.5 * u_res) / hf;
  float t = u_time;
  float r = 0.72 * (1.0 + 0.08 * u_level);

  vec2 q = rot(u_lean) * (p - u_offset);
  q /= u_squash;
  float d = body(q, r, t) * min(u_squash.x, u_squash.y);
  if (d > 0.0) { outColor = vec4(0.0); return; }

  float ow = u_pixel / hf;   // one block, in these units
  float bw = 2.0 * ow;         // the outline: two blocks (Mateo, Sept 20)
  vec3 col;
  if (d > -bw) {
    col = vec3(0.07, 0.07, 0.08);
  } else {
    // The blue inside runs on its own grid, two blocks wide (Mateo, Sept 20),
    // so the gradient reads chunky while the outline and the eyes stay crisp.
    // It churns rather than slides: a slow fbm warps the one that's drawn.
    float fp = u_pixel * 2.0;
    vec2 cp = (floor(gl_FragCoord.xy / fp) * fp + fp * 0.5 - 0.5 * u_res) / hf;
    float warp = fbm(cp * 1.9 - vec2(t * 0.14, t * 0.10));
    float n = fbm(cp * 3.0 + vec2(t * 0.26, -t * 0.19) + warp * 0.9);
    n = clamp((n - 0.5) * 1.5 + 0.5, 0.0, 1.0);   // fbm bunches in the middle: spread it over the ramp
    int bx = int(mod(gl_FragCoord.x / fp, 4.0));
    int by = int(mod(gl_FragCoord.y / fp, 4.0));
    float th = bayer[by][bx];
    float qn = floor(n * 5.0 + th) / 5.0;
    col = mix(u_deep, u_top, clamp(qn * 1.25, 0.0, 1.0));
    col = mix(col, u_bg, step(0.99, qn) * 0.32);   // a pale highlight; near-white read as a smudge
  }

  // Eyes. Pixel-art eyes stay upright and on the grid while the body moves:
  // each eye is a fixed 6 by 8 block pill in screen space, snapped to whole
  // blocks, so it rasterizes identically every frame. Only its anchor follows
  // the body's lean and squash. Moods move two lids as clipping lines in
  // whole blocks (the top lid down for squints, sleepiness and blinks, the
  // bottom lid up for a smile), looks shift it by whole blocks, and wide
  // eyes gain one block of height.
  for (int i = 0; i < 2; i++) {
    float s = i == 0 ? -1.0 : 1.0;
    float sq = i == 0 ? u_squint.x : u_squint.y;
    vec2 ecBody = vec2(s * (u_shape == 2 ? 0.27 : 0.31), u_eyeY) * r;
    vec2 anchor = rot(-u_lean) * (ecBody * u_squash) + u_offset;
    anchor += vec2(floor(u_look.x * 1.5 + 0.5), floor(u_look.y * 1.5 + 0.5)) * ow;
    anchor = floor(anchor / ow + 0.5) * ow;   // a block corner: even sizes rasterize symmetric
    vec2 e = p - anchor;
    float wide = step(0.2, -sq);
    vec2 he = vec2(3.0, 4.0 + wide) * ow;
    float rounding = mix(2.0 * ow, he.x, u_happy);
    float ed = sdRoundBox(e, he, rounding);
    float closed = max(clamp(sq, 0.0, 0.6), u_blink * 0.94);
    float topLid = he.y - floor(2.0 * he.y * closed / ow + 0.5) * ow;
    ed = max(ed, e.y - topLid);
    float smile = u_happy * 0.5;
    float bottomLid = -he.y + floor(2.0 * he.y * smile / ow + 0.5) * ow;
    ed = max(ed, bottomLid - e.y);
    if (d < -bw && ed < 0.0) {
      col = vec3(0.07, 0.07, 0.08);
      // A two-block glint in the top corner, gone while the eye is mostly lid.
      vec2 hc = e - vec2(-he.x + 2.0 * ow, he.y - 2.0 * ow);
      if (smile < 0.25 && max(abs(hc.x), abs(hc.y)) < ow * 1.0) col = vec3(1.0);
    }
  }
  outColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("[TutorPet]", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

type Live = {
  sx: number; vsx: number; sy: number; vsy: number; lean: number; wobble: number; lookX: number; lookY: number;
  squintL: number; squintR: number; happy: number; offX: number; offY: number; level: number;
};

const ease = (cur: number, target: number, k: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-k * dt));
// A slightly underdamped spring: the pose overshoots and settles.
const spring = (cur: number, vel: number, target: number, dt: number, k = 150, c = 15): [number, number] => {
  const v = vel + (k * (target - cur) - c * vel) * dt;
  return [cur + v * dt, v];
};

export function TutorPet({ shape = "square", state = "idle", level = 0, look, size = 56, reduceMotion = false, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef({ shape, state, level, look, size, reduceMotion });
  const kick = useRef<(() => void) | null>(null);
  useEffect(() => {
    props.current = { shape, state, level, look, size, reduceMotion };
    kick.current?.();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true });
    if (!gl) return;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("[TutorPet]", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const u = (name: string) => gl.getUniformLocation(program, name);
    gl.uniform3fv(u("u_bg"), VOICE_BLUE.bg);
    gl.uniform3fv(u("u_top"), VOICE_BLUE.top);
    gl.uniform3fv(u("u_deep"), VOICE_BLUE.deep);
    const U = {
      res: u("u_res"), pixel: u("u_pixel"), time: u("u_time"), shape: u("u_shape"), squash: u("u_squash"), lean: u("u_lean"),
      wobble: u("u_wobble"), level: u("u_level"), look: u("u_look"), blink: u("u_blink"), squint: u("u_squint"), happy: u("u_happy"), offset: u("u_offset"),
      eyeY: u("u_eyeY"),
    };

    const live: Live = { sx: 1, vsx: 0, sy: 1, vsy: 0, lean: 0, wobble: 0.45, lookX: 0, lookY: 0, squintL: 0, squintR: 0, happy: 0, offX: 0, offY: 0, level: 0 };
    // The hop, for "happy": a little jump with a squash on landing.
    let vy = 0;
    let hop = 0;
    let lastHop = -Infinity;
    // Blinks every few seconds, sometimes twice; a glance somewhere else now
    // and then while idle; a stretch once in a long while.
    let nextBlink = 2500 + Math.random() * 3000;
    let blinkStart = -1;
    let blinkMs = 220;
    let doubleBlink = false;
    let glance = { x: 0, y: 0, until: 0, next: 4000 + Math.random() * 4000 };
    let nextStretch = 15000 + Math.random() * 12000;
    let stretchUntil = 0;
    let prevState: PetState | null = null;
    let enteredAt = 0;
    let clock = 0;
    let last = performance.now();
    let raf = 0;
    let visible = true;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const css = props.current.size;
      const w = Math.max(1, Math.round(css * dpr));
      if (canvas.width !== w || canvas.height !== w) {
        canvas.width = w;
        canvas.height = w;
      }
      gl.viewport(0, 0, w, w);
      gl.uniform2f(U.res, w, w);
      // About 48 blocks across whatever the size, so the look stays the same.
      gl.uniform1f(U.pixel, Math.max(2, Math.round((css * dpr) / 48)));
    };

    const draw = () => {
      const c = props.current;
      gl.uniform1i(U.shape, SHAPE_ID[c.shape]);
      gl.uniform1f(U.time, clock);
      gl.uniform2f(U.squash, live.sx, live.sy);
      gl.uniform1f(U.lean, live.lean);
      gl.uniform1f(U.wobble, live.wobble);
      gl.uniform1f(U.level, live.level);
      gl.uniform2f(U.look, live.lookX, live.lookY);
      const b = blinkStart < 0 ? 0 : Math.sin(Math.min(1, (clock * 1000 - blinkStart) / blinkMs) * Math.PI);
      gl.uniform1f(U.blink, b);
      gl.uniform2f(U.squint, live.squintL, live.squintR);
      gl.uniform1f(U.happy, live.happy);
      gl.uniform2f(U.offset, live.offX, live.offY);
      // The triangle's wide part is low, so its eyes sit lower.
      gl.uniform1f(U.eyeY, c.shape === "triangle" ? -0.1 : 0.04);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const step = (now: number) => {
      const c = props.current;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!c.reduceMotion) clock += dt;
      const t = clock;
      const ms = t * 1000;
      const lookX = c.look?.x ?? 0;
      const lookY = c.look?.y ?? 0;

      if (c.state !== prevState) {
        prevState = c.state;
        enteredAt = ms;
        // Entrances that start from a pose: the pop-in and the startle.
        if (c.state === "arrive") { live.sx = 0.2; live.sy = 0.2; live.vsx = 0; live.vsy = 0; }
        if (c.state === "surprised" || c.state === "hello") { live.vsy = 3.5; live.vsx = -2.5; blinkStart = -1; nextBlink = now + 1800; }
        if (c.state === "happy") lastHop = -Infinity;
      }
      const since = (ms - enteredAt) / 1000;

      // Targets per state.
      let sx = 1, sy = 1, lean = 0, wobble = 0.45, lx = lookX * 0.6, ly = lookY * 0.6, sqL = 0, sqR = 0, happy = 0, bob = 0, offX = 0;
      let blinkSpeed = 220;
      switch (c.state) {
        case "idle":
        case "arrive":
          sx = 1 + 0.03 * Math.sin(t * 1.0);
          sy = 1 - 0.03 * Math.sin(t * 1.0);
          bob = 0.025 * (0.5 + 0.5 * Math.sin(t * 1.0));
          if (ms > glance.next) {
            glance = { x: (Math.random() - 0.5) * 1.6, y: (Math.random() - 0.3) * 1.2, until: ms + 700 + Math.random() * 600, next: ms + 4000 + Math.random() * 5000 };
          }
          if (ms < glance.until) { lx = glance.x; ly = glance.y; }
          if (ms > nextStretch) { stretchUntil = ms + 450; nextStretch = ms + 15000 + Math.random() * 15000; }
          if (ms < stretchUntil) { sy = 1.14; sx = 0.9; sqL = sqR = 0.35; }
          break;
        case "listening":
          sx = 0.96; sy = 1.05; lean = -0.14 * lookX; wobble = 0.3; lx = lookX; ly = lookY; sqL = sqR = -0.2;
          break;
        case "thinking":
          lean = 0.14 * Math.sin(t * 1.4); wobble = 0.7;
          // The eyes scan slowly from one side to the other.
          lx = -0.2 + 0.5 * Math.sin(t * 0.9); ly = 0.75; sqL = sqR = 0.1; sy = 1 + 0.02 * Math.sin(t * 2.8);
          break;
        case "speaking":
          sx = 1 + 0.06 * live.level; sy = 1 + 0.04 * live.level; wobble = 0.5 + 0.9 * live.level; lx = lookX; ly = lookY;
          sqL = sqR = 0.2 * live.level;
          bob = 0.015 * live.level;   // a syllable bounce
          break;
        case "writing":
          sx = 1.04; sy = 0.96 + 0.012 * Math.sin(t * 22); lean = 0.16; lx = 0.7; ly = -0.55; sqL = sqR = 0.4; wobble = 0.35;
          offX = 0.01 * Math.sin(t * 22);   // scribbling
          break;
        case "happy":
          happy = 1; wobble = 0.6; lx = 0; ly = 0.2;
          if (!c.reduceMotion && ms - lastHop > 1400) { vy = 1.9; lastHop = ms; }
          if (hop > 0) lean = 0.12 * Math.sin(t * 14);   // a wiggle in the air
          break;
        case "hello":
          // A wave: rocks side to side for a moment, then breathes.
          lean = since < 1.3 ? 0.22 * Math.sin(t * 7) : 0;
          sy = since < 1.3 ? 1.04 : 1 - 0.03 * Math.sin(t);
          sx = since < 1.3 ? 0.97 : 1 + 0.03 * Math.sin(t);
          sqL = sqR = -0.1; lx = lookX * 0.4; ly = lookY * 0.4 + 0.1;
          break;
        case "puzzled":
          lean = 0.22 + 0.03 * Math.sin(t * 1.2); sqL = 0.5; sqR = -0.2; lx = 0.35; ly = 0.35; wobble = 0.4;
          break;
        case "surprised":
          sqL = sqR = -0.4; lx = 0; ly = 0.05; lean = -0.04; wobble = 0.25;
          break;
        case "sleepy":
          sqL = sqR = 0.55; lean = 0.08; ly = -0.35; lx = 0.1; wobble = 0.25;
          sx = 1 + 0.04 * Math.sin(t * 0.5); sy = 1 - 0.04 * Math.sin(t * 0.5); bob = 0.008 * (0.5 + 0.5 * Math.sin(t * 0.5));
          blinkSpeed = 520;
          break;
      }
      blinkMs = blinkSpeed;

      // The hop: simple gravity, a bounce with squash on the floor.
      if (vy !== 0 || hop > 0) {
        vy -= 9.5 * dt;
        hop = Math.max(0, hop + vy * dt);
        if (hop === 0 && vy < 0) {
          live.vsx = 3.2; live.vsy = -3.2;   // the landing squash, as an impulse
          vy = 0;
        } else if (hop > 0) {
          sx = 0.94; sy = 1.08;
        }
      }
      live.offY = hop + ease(live.offY - hop, bob, 6, dt);
      live.offX = ease(live.offX, offX, 30, dt);

      live.level = ease(live.level, c.state === "speaking" ? c.level : 0, c.level > live.level ? 18 : 7, dt);
      [live.sx, live.vsx] = spring(live.sx, live.vsx, sx, dt);
      [live.sy, live.vsy] = spring(live.sy, live.vsy, sy, dt);
      live.lean = ease(live.lean, c.shape === "triangle" ? lean * 0.55 : lean, 7, dt);
      live.wobble = ease(live.wobble, wobble, 5, dt);
      live.lookX = ease(live.lookX, lx, 10, dt);
      live.lookY = ease(live.lookY, ly, 10, dt);
      live.squintL = ease(live.squintL, sqL, 9, dt);
      live.squintR = ease(live.squintR, sqR, 9, dt);
      live.happy = ease(live.happy, happy, 14, dt);

      // Blinks run on the wall clock so they still happen under reduced motion.
      if (blinkStart < 0 && now >= nextBlink) blinkStart = ms;
      if (blinkStart >= 0 && ms - blinkStart > blinkMs) {
        blinkStart = -1;
        if (doubleBlink) { doubleBlink = false; nextBlink = now + 160; }
        else { doubleBlink = Math.random() < 0.25; nextBlink = now + 2500 + Math.random() * 3500; }
      }
    };

    // The simulation runs every frame; the body is drawn 24 times a second,
    // so it still reads as drawn frames rather than a crawling outline.
    let lastDraw = -Infinity;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      step(now);
      if (now - lastDraw >= 1000 / 24) {
        lastDraw = now;
        draw();
      }
    };
    kick.current = () => {
      resize();
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const ro = new ResizeObserver(() => { resize(); draw(); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    io.observe(canvas);
    nextBlink += performance.now();
    resize();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      kick.current = null;
      ro.disconnect();
      io.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} style={{ display: "block", width: size, height: size }} />;
}
