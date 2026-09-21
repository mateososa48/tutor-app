import test from "node:test";
import assert from "node:assert/strict";
import { cloudLobes, cloudPath } from "./cloud-path";

const numbers = (d: string) => d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];

test("a cloud is one closed path", () => {
  const d = cloudPath(160, 60);
  assert.match(d, /^M /);
  assert.match(d, / Z$/);
  assert.ok(d.split(" C ").length > 40, "a curve, not a handful of segments");
  assert.ok(!/NaN|Infinity/.test(d), d.slice(0, 120));
});

test("every puff stays inside the box", () => {
  for (const [w, h] of [[160, 60], [56, 40], [320, 120], [40, 26]] as const) {
    for (const l of cloudLobes(w, h)) {
      assert.ok(l.x - l.r >= -0.51 && l.x + l.r <= w + 0.51, `x out of ${w}x${h}: ${l.x}±${l.r}`);
      assert.ok(l.y - l.r >= -0.51 && l.y + l.r <= h + 0.51, `y out of ${w}x${h}: ${l.y}±${l.r}`);
    }
  }
});

test("neighbouring puffs always overlap, so the outline is one piece", () => {
  for (const [w, h] of [[160, 60], [56, 40], [320, 120], [44, 30]] as const) {
    const lobes = cloudLobes(w, h);
    for (let i = 0; i < lobes.length; i++) {
      const a = lobes[i];
      const b = lobes[(i + 1) % lobes.length];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      assert.ok(d < a.r + b.r, `gap at ${i} in ${w}x${h}: ${d} >= ${a.r + b.r}`);
      assert.ok(d > Math.abs(a.r - b.r), `swallowed at ${i} in ${w}x${h}`);
    }
  }
});

test("a wider box grows more puffs, not bigger ones", () => {
  const narrow = cloudLobes(120, 60);
  const wide = cloudLobes(360, 60);
  assert.ok(wide.length > narrow.length * 2, `${narrow.length} -> ${wide.length}`);
  // Three times the width at the same height, and the puffs are the same
  // size. Within a few percent: the biggest of a run of varied puffs is a
  // sampled maximum, and the wide cloud takes more samples.
  const big = (ls: { r: number }[]) => Math.max(...ls.map((l) => l.r));
  assert.ok(Math.abs(big(wide) - big(narrow)) / big(narrow) < 0.06, `${big(narrow)} vs ${big(wide)}`);
});

test("a taller cloud has bigger billows, not more of them", () => {
  const small = cloudLobes(90, 44);
  const large = cloudLobes(260, 130);
  const big = (ls: { r: number }[]) => Math.max(...ls.map((l) => l.r));
  assert.ok(big(large) > big(small) * 1.8, `${big(small)} -> ${big(large)}`);
});

test("the same box always draws the same cloud, a different seed does not", () => {
  assert.equal(cloudPath(160, 60), cloudPath(160, 60));
  assert.notEqual(cloudPath(160, 60, { seed: 2 }), cloudPath(160, 60, { seed: 3 }));
});

test("silly sizes do not throw or escape the box", () => {
  assert.equal(cloudPath(0, 40), "");
  assert.equal(cloudPath(120, -1), "");
  for (const [w, h] of [[8, 8], [200, 6], [6, 200]] as const) {
    const d = cloudPath(w, h);
    assert.ok(!/NaN/.test(d), `${w}x${h}: ${d.slice(0, 80)}`);
    const n = numbers(d);
    assert.ok(n.length > 0);
    assert.ok(Math.max(...n) < Math.max(w, h) + 2, `${w}x${h} spills`);
  }
});

test("the outline never doubles back on itself", () => {
  // Sampled outward from the middle, so every point must be further from the
  // middle than nothing and the path must stay a simple loop: walking it, the
  // angle only ever goes one way.
  const d = cloudPath(200, 80);
  const pts = [...d.matchAll(/(?:M|C(?: -?[\d.]+ -?[\d.]+){2}) (-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
  }));
  assert.ok(pts.length > 40);
  let turned = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = Math.atan2(pts[i - 1].y - 40, pts[i - 1].x - 100);
    const b = Math.atan2(pts[i].y - 40, pts[i].x - 100);
    let step = b - a;
    while (step > Math.PI) step -= 2 * Math.PI;
    while (step < -Math.PI) step += 2 * Math.PI;
    assert.ok(step > 0, `point ${i} turns back`);
    turned += step;
  }
  assert.ok(Math.abs(turned - 2 * Math.PI) < 0.3, `went round once: ${turned}`);
});
