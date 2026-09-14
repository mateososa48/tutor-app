"use client";

import { useEffect, useRef } from "react";

// The tutor's voice as a dithered wave. Same ordered-dither look as the hero
// shader, but the silhouette is the tutor's audio level: a rolling history of
// loudness fills the box from the bottom like a voice memo, smoothed so it
// swells and settles instead of flickering. Idle, it breathes.

type Props = {
  analyser: AnalyserNode | null;
  speaking: boolean;
  className?: string;
};

const PIXEL = 3;

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_res;
uniform float u_time;
uniform float u_pixel;
uniform float u_level;
uniform vec3 u_bg;
uniform vec3 u_top;
uniform vec3 u_deep;

const mat4 bayer = mat4(
  0.0, 8.0, 2.0, 10.0,
  12.0, 4.0, 14.0, 6.0,
  3.0, 11.0, 1.0, 9.0,
  15.0, 7.0, 13.0, 5.0) / 16.0;

void main() {
  vec2 px = floor(gl_FragCoord.xy / u_pixel) * u_pixel;
  vec2 uv = px / u_res;
  float t = u_time;
  float L = u_level;
  // A standing profile: a soft mound in the middle with fixed ripples whose
  // amplitude pulses in time. Nothing travels sideways; it only rises and falls.
  float x = uv.x * 2.0 - 1.0;
  float mound = 1.0 - x * x * 0.55;
  float ripple = 0.035 * sin(uv.x * 12.0) * (0.5 + 0.5 * sin(t * 2.6))
               + 0.02 * cos(uv.x * 21.0) * (0.5 + 0.5 * cos(t * 3.9));
  float breath = 0.02 * sin(t * 0.8);
  float surface = 0.38 + breath + L * 0.5 * mound + L * ripple * 4.0 + ripple * 0.4;
  float d = uv.y - surface;                 // negative below the surface
  float f = smoothstep(0.42, -0.02, d);
  int bx = int(mod(gl_FragCoord.x / u_pixel, 4.0));
  int by = int(mod(gl_FragCoord.y / u_pixel, 4.0));
  float threshold = bayer[by][bx];
  float steps = 5.0;
  float q = floor(f * steps + threshold) / steps;
  float depth = smoothstep(0.7, 0.0, uv.y);
  vec3 wave = mix(u_top, u_deep, depth);
  vec3 col = mix(u_bg, wave, clamp(q, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}`;

const BG: [number, number, number] = [0.973, 0.976, 0.984];   // #f8f9fb
const TOP: [number, number, number] = [0.45, 0.68, 1.0];      // #73adff
const DEEP: [number, number, number] = [0.16, 0.53, 0.95];    // #2988f2

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("[VoiceWave]", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function VoiceWave({ analyser, speaking, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef(analyser);
  const speakingRef = useRef(speaking);
  useEffect(() => {
    analyserRef.current = analyser;
  }, [analyser]);
  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

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
      console.warn("[VoiceWave]", gl.getProgramInfoLog(program));
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
    gl.uniform3fv(u("u_bg"), BG);
    gl.uniform3fv(u("u_top"), TOP);
    gl.uniform3fv(u("u_deep"), DEEP);
    const uRes = u("u_res");
    const uTime = u("u_time");
    const uPixel = u("u_pixel");
    const uLevel = u("u_level");

    const freq = new Uint8Array(1024);
    let smoothed = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uPixel, PIXEL * dpr);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // Loudness right now: the analyser when we have one, a synthetic voice
    // when we are only told "speaking" (dev preview), silence otherwise.
    const sample = (now: number): number => {
      const a = analyserRef.current;
      if (a) {
        const bins = Math.min(freq.length, a.frequencyBinCount);
        a.getByteFrequencyData(freq);
        // Voice lives roughly in bins 2..90 at 48 kHz / fftSize 1024.
        let sum = 0;
        const lo = 2;
        const hi = Math.min(bins, 90);
        for (let i = lo; i < hi; i++) sum += freq[i];
        const avg = sum / Math.max(1, hi - lo) / 255;
        return Math.min(1, Math.pow(avg * 1.9, 1.15));
      }
      if (speakingRef.current) {
        const s = now / 1000;
        const v = 0.42 + 0.26 * Math.sin(s * 7.3) * Math.sin(s * 2.1) + 0.14 * Math.sin(s * 13.7 + 1.3);
        return Math.max(0, Math.min(1, v));
      }
      return 0;
    };

    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(canvas);
    const start = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      // Fast attack, slow release: the shape jumps up with a syllable and
      // settles gently after it.
      const target = sample(now);
      smoothed += (target - smoothed) * (target > smoothed ? 0.35 : 0.07);
      gl.uniform1f(uLevel, smoothed);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    if (reduce) {
      // One still frame with a calm level.
      gl.uniform1f(uLevel, 0.12);
      gl.uniform1f(uTime, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
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
