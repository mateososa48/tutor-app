"use client";

import { useEffect, useRef } from "react";
import { VOICE_BLUE } from "@/components/session/VoiceWave";

// The tutor's voice wave, stretched into a horizon for the landing footer.
// Same ordered dither, pixel size and blues as the dock's wave, but wide and
// calm: standing ripples sized in CSS pixels (so they never stretch with the
// screen), a slow drift, a level that breathes like quiet speech, a lighter
// ridge behind for depth, and a soft swell that leans toward the pointer.
// The top of the band dithers out into the page background, so it has no edge,
// and the band stays deep blue behind anything marked data-wave-keep.
// Pauses off screen; one still frame under reduced motion.

const PIXEL = 3;
const BG: [number, number, number] = [0.984, 0.984, 0.988]; // #fbfbfc, the page (--lp-bg)
const INK_BLUE: [number, number, number] = [0.114, 0.447, 0.863]; // #1d72dc, the FAQ reply blue

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_res;
uniform float u_time;
uniform float u_pixel;
uniform float u_scale;
uniform vec2 u_pointer;
uniform float u_keep;
uniform vec4 u_shape;   // soft edge in CSS px, swing multiplier, top reserve in CSS px, ripples per 1000px
uniform vec3 u_bg;
uniform vec3 u_top;
uniform vec3 u_deep;
uniform vec3 u_ink;

const mat4 bayer = mat4(
  0.0, 8.0, 2.0, 10.0,
  12.0, 4.0, 14.0, 6.0,
  3.0, 11.0, 1.0, 9.0,
  15.0, 7.0, 13.0, 5.0) / 16.0;

void main() {
  vec2 px = floor(gl_FragCoord.xy / u_pixel) * u_pixel;
  vec2 uv = px / u_res;
  float hCss = u_res.y / u_scale;
  float xw = px.x / u_scale / 1000.0 * u_shape.w;
  float t = u_time;

  // Quiet speech: the level rises and settles over several seconds.
  float level = 0.5 + 0.22 * sin(t * 0.5) * sin(t * 0.23 + 1.0) + 0.1 * sin(t * 1.1 + 0.4);
  // The dock wave's standing ripples, sized for a wide band, plus a slow drift.
  float ripple = 0.085 * sin(xw * 8.0 + 0.8) * sin(t * 0.8)
               + 0.055 * cos(xw * 14.0 + 2.0) * sin(t * 1.2 + 0.7)
               + 0.070 * sin(xw * 4.0 + 1.3) * sin(t * 0.55)
               + 0.018 * sin(xw * 23.0 + 0.3) * sin(t * 1.7 + 1.1);
  float drift = 0.05 * sin(xw * 2.1 - t * 0.10) + 0.035 * sin(xw * 5.3 + t * 0.07 + 2.0);
  float dx = (uv.x - u_pointer.x) * u_res.x / u_res.y;
  float swell = u_pointer.y * 0.12 * exp(-dx * dx * 2.5);

  // Heights in CSS pixels from the bottom. The wave rests in the room above what
  // data-wave-keep marks (the wordmark) and swings inside it, so its troughs stay
  // clear of the wordmark and its crests (plus the soft edge) stay inside the canvas.
  float yPx = uv.y * hCss;
  float keepPx = u_keep;
  float roomPx = max(hCss - keepPx - u_shape.z, 60.0);
  float swing = u_shape.y;
  float frontPx = keepPx + roomPx * (0.45 + swing * (0.10 * (level - 0.5) + ripple * (0.55 + 0.6 * level) + drift) + swell);
  // A lighter ridge behind, higher and out of step.
  float backPx = keepPx + roomPx * (0.66 + swing * (0.07 * sin(xw * 3.1 + 0.4 + t * 0.06)
             + 0.05 * sin(xw * 7.0 + 1.9) * sin(t * 0.65 + 2.2)
             + 0.02 * sin(xw * 17.0 + 0.9) * sin(t * 1.3))
             + 0.6 * swell);

  float dF = yPx - frontPx;   // CSS pixels above the front surface
  float dB = yPx - backPx;
  // About as soft as the dock wave: the edge dithers out over ~55px.
  float fF = smoothstep(u_shape.x, -u_shape.x * 0.65, dF);
  float fB = smoothstep(u_shape.x * 1.18, -u_shape.x * 0.65, dB) * 0.5;

  int bx = int(mod(gl_FragCoord.x / u_pixel, 4.0));
  int by = int(mod(gl_FragCoord.y / u_pixel, 4.0));
  float th = bayer[by][bx];
  float steps = 5.0;
  float qB = floor(fB * steps + th) / steps;
  float qF = floor(fF * steps + th) / steps;

  float floorDepth = keepPx > 0.0 ? smoothstep(keepPx + 24.0, keepPx * 0.4, yPx) : 0.0;
  float depth = smoothstep(0.0, 1.0, max(clamp(-dF / (hCss * 0.5), 0.0, 1.0), floorDepth));
  vec3 wave = mix(u_top, u_deep, depth);
  // Behind the wordmark the blue deepens a little further, so white reads on it.
  wave = mix(wave, u_ink, floorDepth * 0.55);
  vec3 col = mix(u_bg, u_top, clamp(qB, 0.0, 1.0));
  col = mix(col, wave, clamp(qF, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("[FooterWave]", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function FooterWave({
  className,
  background = BG,
  top = VOICE_BLUE.top,
  deep = VOICE_BLUE.deep,
  ink = INK_BLUE,
  edge = 34,
  swing = 1,
  reserve = 60,
  waveScale = 1,
  speed = 1,
}: {
  className?: string;
  /** The colour the band dithers out into; match whatever sits behind it. */
  background?: [number, number, number];
  top?: [number, number, number];
  deep?: [number, number, number];
  ink?: [number, number, number];
  /** How far the crest dithers out, in CSS pixels. Smaller reads as a sharper wave. */
  edge?: number;
  /** Multiplies the ripples and drift. Above 1 gives a short band real crests. */
  swing?: number;
  /** CSS pixels kept clear above the highest crest, so the soft edge is never cut. */
  reserve?: number;
  /** Ripples per 1000px. Above 1 fits a full wave into a narrow band. */
  waveScale?: number;
  /** Time multiplier: below 1 moves slower. */
  speed?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = useRef({ background, top, deep, ink, edge, swing, reserve, waveScale, speed });
  // Runs before the setup effect on mount, and after every render.
  useEffect(() => {
    colors.current = { background, top, deep, ink, edge, swing, reserve, waveScale, speed };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false });
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
      console.warn("[FooterWave]", gl.getProgramInfoLog(program));
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
    gl.uniform3fv(u("u_bg"), colors.current.background);
    gl.uniform3fv(u("u_top"), colors.current.top);
    gl.uniform3fv(u("u_deep"), colors.current.deep);
    gl.uniform3fv(u("u_ink"), colors.current.ink);
    const uShape = u("u_shape");
    const uRes = u("u_res");
    const uTime = u("u_time");
    const uPixel = u("u_pixel");
    const uScale = u("u_scale");
    const uPointer = u("u_pointer");
    const uKeep = u("u_keep");
    const keepEl = canvas.parentElement?.querySelector<HTMLElement>("[data-wave-keep]") ?? null;

    // The still frame for reduced motion: a moment with a gentle rise.
    const STILL_T = 9;
    const start = performance.now();
    let pointerX = 0.5;
    let pull = 0;
    let targetX = 0.5;
    let targetPull = 0;

    const draw = (time: number) => {
      const c = colors.current;
      gl.uniform4f(uShape, c.edge, c.swing, c.reserve, c.waveScale);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uPointer, pointerX, pull);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uPixel, PIXEL * dpr);
      gl.uniform1f(uScale, dpr);
      // How far up from the bottom the wordmark reaches, plus a margin of blue above it.
      if (keepEl) {
        const c = canvas.getBoundingClientRect();
        const k = keepEl.getBoundingClientRect();
        gl.uniform1f(uKeep, Math.max(0, c.bottom - k.top + 40));
      } else {
        gl.uniform1f(uKeep, 0);
      }
      // Resizing clears the canvas; a still page has to paint again.
      if (reduce) draw(STILL_T);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    if (keepEl) ro.observe(keepEl);
    resize();

    // The swell follows the pointer while it is over the footer (the band and
    // the 240px above it), and sinks back when it leaves.
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = canvas.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 240 && e.clientY <= r.bottom;
      targetPull = inside ? 1 : 0;
      if (inside) targetX = (e.clientX - r.left) / Math.max(1, r.width);
    };
    if (!reduce) window.addEventListener("pointermove", onPointer, { passive: true });

    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(canvas);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      pointerX += (targetX - pointerX) * 0.04;
      pull += (targetPull - pull) * 0.03;
      draw(((now - start) / 1000) * colors.current.speed);
    };

    if (reduce) draw(STILL_T);
    else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      ro.disconnect();
      io.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} style={{ display: "block", width: "100%", height: "100%" }} />;
}
