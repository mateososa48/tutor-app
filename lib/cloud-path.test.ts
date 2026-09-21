import test from "node:test";
import assert from "node:assert/strict";
import { cloudArcs, cloudBody, cloudLobes, cloudPath } from "./cloud-path";

const SIZES: [number, number][] = [[160, 60], [56, 40], [320, 120], [40, 26], [90, 90], [210, 96], [300, 72]];

test("a cloud is one closed path of arcs", () => {
  const d = cloudPath(210, 64);
  assert.match(d, /^M /);
  assert.match(d, / Z$/);
  const arcs = d.split(" A ").length - 1;
  assert.ok(arcs >= 6 && arcs <= 40, `${arcs} arcs`);
  assert.ok(!/NaN|Infinity/.test(d), d.slice(0, 120));
});

test("every billow stays inside the box", () => {
  for (const [w, h] of SIZES) {
    for (const l of cloudLobes(w, h)) {
      assert.ok(l.x - l.r >= -0.51 && l.x + l.r <= w + 0.51, `x out of ${w}x${h}: ${l.x}±${l.r}`);
      assert.ok(l.y - l.r >= -0.51 && l.y + l.r <= h + 0.51, `y out of ${w}x${h}: ${l.y}±${l.r}`);
    }
  }
});

// The one that matters: an arc running under another billow is a line drawn
// across the middle of the cloud.
test("no part of the outline lies inside another billow", () => {
  for (const [w, h] of SIZES) {
    const lobes = cloudLobes(w, h);
    for (const arc of cloudArcs(lobes, cloudBody(w, h))) {
      for (const f of [0.02, 0.25, 0.5, 0.75, 0.98]) {
        const a = arc.from + (arc.to - arc.from) * f;
        const x = arc.lobe.x + Math.cos(a) * arc.lobe.r;
        const y = arc.lobe.y + Math.sin(a) * arc.lobe.r;
        for (const o of lobes) {
          if (o === arc.lobe) continue;
          assert.ok(Math.hypot(x - o.x, y - o.y) > o.r - 0.02, `${w}x${h}: outline buried in a billow`);
        }
      }
    }
  }
});

test("no part of the outline lies inside the body", () => {
  for (const [w, h] of SIZES) {
    const body = cloudBody(w, h);
    for (const arc of cloudArcs(cloudLobes(w, h), body)) {
      for (const f of [0.1, 0.5, 0.9]) {
        const a = arc.from + (arc.to - arc.from) * f;
        const x = arc.lobe.x + Math.cos(a) * arc.lobe.r;
        const y = arc.lobe.y + Math.sin(a) * arc.lobe.r;
        const d = ((x - body.cx) / body.a) ** 2 + ((y - body.cy) / body.b) ** 2;
        assert.ok(d > 1 - 0.02, `${w}x${h}: outline runs through the body (a hole's rim)`);
      }
    }
  }
});

test("the outline closes: every arc starts where the last one ended", () => {
  for (const [w, h] of SIZES) {
    const arcs = cloudArcs(cloudLobes(w, h), cloudBody(w, h));
    assert.ok(arcs.length >= 4, `${w}x${h}: only ${arcs.length} arcs`);
    const at = (arc: (typeof arcs)[number], angle: number) => ({
      x: arc.lobe.x + Math.cos(angle) * arc.lobe.r,
      y: arc.lobe.y + Math.sin(angle) * arc.lobe.r,
    });
    for (let i = 0; i < arcs.length; i++) {
      const end = at(arcs[i], arcs[i].to);
      const next = at(arcs[(i + 1) % arcs.length], arcs[(i + 1) % arcs.length].from);
      assert.ok(Math.hypot(end.x - next.x, end.y - next.y) < 0.75, `${w}x${h}: gap at arc ${i}`);
    }
  }
});

test("neighbouring billows always touch, so the cloud is one piece", () => {
  for (const [w, h] of SIZES) {
    const lobes = cloudLobes(w, h);
    for (let i = 0; i < lobes.length; i++) {
      const a = lobes[i];
      const b = lobes[(i + 1) % lobes.length];
      assert.ok(Math.hypot(b.x - a.x, b.y - a.y) < a.r + b.r, `${w}x${h}: gap at billow ${i}`);
    }
  }
});

test("the billows are few and big, not a frill", () => {
  for (const [w, h] of SIZES) {
    const lobes = cloudLobes(w, h);
    assert.ok(lobes.length >= 5 && lobes.length <= 30, `${w}x${h}: ${lobes.length} billows`);
    const mean = lobes.reduce((s, l) => s + l.r, 0) / lobes.length;
    assert.ok(mean > Math.min(w, h) * 0.17, `${w}x${h}: billows only ${mean.toFixed(1)}px`);
  }
});

test("a wider box grows more billows, not bigger ones", () => {
  const narrow = cloudLobes(120, 60);
  const wide = cloudLobes(360, 60);
  assert.ok(wide.length > narrow.length, `${narrow.length} -> ${wide.length}`);
  const big = (ls: { r: number }[]) => Math.max(...ls.map((l) => l.r));
  assert.ok(Math.abs(big(wide) - big(narrow)) / big(narrow) < 0.08, `${big(narrow)} vs ${big(wide)}`);
});

test("a taller cloud has bigger billows", () => {
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
    const n = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    assert.ok(n.length > 0);
    assert.ok(Math.max(...n) < Math.max(w, h) + 2, `${w}x${h} spills`);
  }
});
