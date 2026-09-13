"use client";

import { useEffect, useRef } from "react";

// A dithered wave background in raw WebGL: layered value noise makes a slow
// wave field, an ordered 4x4 Bayer matrix quantizes it into a few tones, and
// the tones are mixed between the page background and the accent. No three.js.

type Props = {
  waveColor?: [number, number, number];
  backgroundColor?: [number, number, number];
  colorNum?: number;
  pixelSize?: number;
  waveSpeed?: number;
  waveFrequency?: number;
  waveAmplitude?: number;
  animate?: boolean;
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
const mat4 bayer = mat4(
  0.0, 8.0, 2.0, 10.0,
  12.0, 4.0, 14.0, 6.0,
  3.0, 11.0, 1.0, 9.0,
  15.0, 7.0, 13.0, 5.0) / 16.0;

void main() {
  vec2 px = floor(gl_FragCoord.xy / u_pixel) * u_pixel;
  vec2 uv = px / u_res;
  uv.x *= u_res.x / u_res.y;
  float t = u_time;
  vec2 p = uv * u_freq;
  float w = fbm(p + vec2(t * 0.35, -t * 0.2) + 1.2 * fbm(p * 0.6 - t * 0.15));
  float ridge = 0.5 + 0.5 * sin((uv.y * 3.4 + w * u_amp * 3.0 - t * 0.5) * 3.14159);
  float f = smoothstep(0.15, 0.95, ridge * w * 1.6);
  int bx = int(mod(gl_FragCoord.x / u_pixel, 4.0));
  int by = int(mod(gl_FragCoord.y / u_pixel, 4.0));
  float threshold = bayer[by][bx];
  float steps = max(u_colorNum - 1.0, 1.0);
  float q = floor(f * steps + threshold) / steps;
  vec3 col = mix(u_bg, u_wave, clamp(q, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}`;

export function DitherWave({
  waveColor = [0.42, 0.66, 1],
  backgroundColor = [0.984, 0.984, 0.988],
  colorNum = 4,
  pixelSize = 3,
  waveSpeed = 0.05,
  waveFrequency = 2.2,
  waveAmplitude = 0.55,
  animate = true,
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
      gl.uniform1f(uTime, ((now - start) / 1000) * waveSpeed * 10);
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
  }, [waveColor, backgroundColor, colorNum, pixelSize, waveSpeed, waveFrequency, waveAmplitude, animate]);

  return <canvas ref={ref} aria-hidden className={`block h-full w-full ${className}`} />;
}
