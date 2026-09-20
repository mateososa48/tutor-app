"use client";

import { useEffect, useRef } from "react";
import { VOICE_BLUE } from "@/components/session/VoiceWave";

// The tutor's pet: a small dithered blob in the voice wave's blues with two
// pixel eyes, drawn in raw WebGL from a signed distance field. The outline is
// one of three shapes (circle, rounded square, squat triangle), wobbled by a
// slow sine on the angle so it never sits still, squashed and leaned by the
// state machine below, and pixelated with the same Bayer dither as the wave.
// The canvas is transparent, so it can sit over the board or any surface.

export type PetShape = "circle" | "square" | "triangle";
export type PetState = "idle" | "listening" | "thinking" | "speaking" | "writing" | "happy";

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
uniform float u_squint;
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
  float w = 0.5 * sin(2.0 * a + t * 1.1) + 0.35 * sin(3.0 * a - t * 0.8 + 1.7) + 0.15 * sin(5.0 * a + t * 0.5 + 0.4);
  float d;
  if (u_shape == 0) {
    d = sdCircle(q, r);
  } else if (u_shape == 1) {
    d = sdRoundBox(q, vec2(0.74 * r), 0.3 * r);
  } else {
    // Wider than tall, with a soft top: the rounding grows a small triangle outward.
    d = sdTriangle(vec2(q.x, q.y + 0.18 * r), 0.66 * r) - 0.3 * r;
  }
  return d - u_wobble * 0.045 * r * w;
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

  float ow = u_pixel / hf;   // a one-block outline
  vec3 col;
  if (d > -ow) {
    col = vec3(0.07, 0.07, 0.08);
  } else {
    float n = fbm(p * 3.2 + vec2(t * 0.06, -t * 0.04));
    int bx = int(mod(gl_FragCoord.x / u_pixel, 4.0));
    int by = int(mod(gl_FragCoord.y / u_pixel, 4.0));
    float th = bayer[by][bx];
    float qn = floor(n * 5.0 + th) / 5.0;
    col = mix(u_deep, u_top, clamp(qn * 1.25, 0.0, 1.0));
    col = mix(col, u_bg, step(0.99, qn) * 0.7);
  }

  // Eyes, in body space so they lean and squash with it.
  for (int i = 0; i < 2; i++) {
    float s = i == 0 ? -1.0 : 1.0;
    vec2 ec = vec2(s * 0.27, u_eyeY) * r + u_look * vec2(0.06, 0.05) * r;
    vec2 e = q - ec;
    if (u_happy > 0.5) {
      // A closed, smiling eye: the top of a ring.
      float ring = abs(length(e) - 0.11 * r) - 0.035 * r;
      if (ring < 0.0 && e.y > -0.01 * r) col = vec3(0.07, 0.07, 0.08);
    } else {
      vec2 he = vec2(0.105, 0.15) * r;
      he.y *= (1.0 - 0.7 * u_squint) * max(0.12, 1.0 - u_blink);
      float ed = sdRoundBox(e, he, min(he.x, he.y) * 0.6);
      if (ed < 0.0) {
        col = vec3(0.07, 0.07, 0.08);
        // The glint is exactly one block, whatever the size.
        vec2 hc = e - vec2(-0.04, 0.07) * r;
        if (u_blink < 0.5 && max(abs(hc.x), abs(hc.y)) < ow * 0.55) col = vec3(1.0);
      }
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
  sx: number; sy: number; lean: number; wobble: number; lookX: number; lookY: number;
  squint: number; happy: number; offX: number; offY: number; level: number;
};

const ease = (cur: number, target: number, k: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-k * dt));

export function TutorPet({ shape = "triangle", state = "idle", level = 0, look, size = 56, reduceMotion = false, className }: Props) {
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

    const live: Live = { sx: 1, sy: 1, lean: 0, wobble: 0.45, lookX: 0, lookY: 0, squint: 0, happy: 0, offX: 0, offY: 0, level: 0 };
    // The hop, for "happy": a little jump with a squash on landing.
    let vy = 0;
    let lastHop = -Infinity;
    // Blinks every few seconds; a glance somewhere else now and then while idle.
    let nextBlink = 2500 + Math.random() * 3000;
    let blinkStart = -1;
    let glance = { x: 0, y: 0, until: 0, next: 4000 + Math.random() * 4000 };
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
      // About 30 blocks across whatever the size, so the look stays the same.
      gl.uniform1f(U.pixel, Math.max(2, Math.round(css / 30)) * dpr);
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
      const b = blinkStart < 0 ? 0 : Math.sin(Math.min(1, (clock * 1000 - blinkStart) / 140) * Math.PI);
      gl.uniform1f(U.blink, b);
      gl.uniform1f(U.squint, live.squint);
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

      // Targets per state.
      let sx = 1, sy = 1, lean = 0, wobble = 0.45, lx = lookX * 0.6, ly = lookY * 0.6, squint = 0, happy = 0;
      switch (c.state) {
        case "idle":
          sx = 1 + 0.025 * Math.sin(t * 1.1);
          sy = 1 - 0.025 * Math.sin(t * 1.1);
          lean = 0.04 * Math.sin(t * 0.5);
          if (ms > glance.next) {
            glance = { x: (Math.random() - 0.5) * 1.6, y: (Math.random() - 0.3) * 1.2, until: ms + 700 + Math.random() * 600, next: ms + 4000 + Math.random() * 5000 };
          }
          if (ms < glance.until) { lx = glance.x; ly = glance.y; }
          break;
        case "listening":
          sx = 0.96; sy = 1.05; lean = -0.14 * lookX; wobble = 0.3; lx = lookX; ly = lookY; squint = -0.15;
          break;
        case "thinking":
          lean = 0.14 * Math.sin(t * 1.4); wobble = 0.7; lx = -0.55; ly = 0.75; squint = 0.1; sy = 1 + 0.02 * Math.sin(t * 2.8);
          break;
        case "speaking":
          sx = 1 + 0.06 * live.level; sy = 1 + 0.04 * live.level; wobble = 0.5 + 0.9 * live.level; lx = lookX; ly = lookY;
          break;
        case "writing":
          sx = 1.04; sy = 0.96; lean = 0.16; lx = 0.7; ly = -0.55; squint = 0.45; wobble = 0.35;
          break;
        case "happy":
          happy = 1; wobble = 0.6; lx = 0; ly = 0.2;
          if (!c.reduceMotion && ms - lastHop > 1400) { vy = 1.9; lastHop = ms; }
          break;
      }

      // The hop: simple gravity, a bounce with squash on the floor.
      if (vy !== 0 || live.offY > 0) {
        vy -= 9.5 * dt;
        live.offY = Math.max(0, live.offY + vy * dt);
        if (live.offY === 0 && vy < 0) {
          sx = 1.18; sy = 0.82; // the landing squash
          vy = 0;
        } else if (live.offY > 0) {
          sx = 0.94; sy = 1.08;
        }
      }

      live.level = ease(live.level, c.state === "speaking" ? c.level : 0, c.level > live.level ? 18 : 7, dt);
      live.sx = ease(live.sx, sx, 9, dt);
      live.sy = ease(live.sy, sy, 9, dt);
      live.lean = ease(live.lean, c.shape === "triangle" ? lean * 0.55 : lean, 6, dt);
      live.wobble = ease(live.wobble, wobble, 5, dt);
      live.lookX = ease(live.lookX, lx, 10, dt);
      live.lookY = ease(live.lookY, ly, 10, dt);
      live.squint = ease(live.squint, squint, 8, dt);
      live.happy = ease(live.happy, happy, 14, dt);

      // Blinks run on the wall clock so they still happen under reduced motion.
      if (blinkStart < 0 && now >= nextBlink) {
        blinkStart = ms;
      }
      if (blinkStart >= 0 && ms - blinkStart > 140) {
        blinkStart = -1;
        nextBlink = now + 2500 + Math.random() * 3500;
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      step(now);
      draw();
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
