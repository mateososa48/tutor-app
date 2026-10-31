import { test } from "node:test";
import assert from "node:assert/strict";
import { describeGroups, parseGroups, renderGroups, type GroupsSpec } from "./board-groups";

test("things in containers are read from words and said exactly as drawn", () => {
  const s = parseGroups("bag: 3 red, 2 blue | after one red is drawn: 2 red, 2 blue | set aside: 1 red") as GroupsSpec;
  assert.deepEqual(s.groups.map((g) => g.shape), ["bag", "bag", "loose"]);
  assert.deepEqual(describeGroups(s), ['panel 1 of 3 (left), part G1, "bag": 3 red, 2 blue', 'panel 2 of 3 (middle), part G2, "after one red is drawn": 2 red, 2 blue', 'panel 3 of 3 (right), part G3, "set aside": 1 red']);
  const p = parseGroups("plate 1: 4 cookies | plate 2: 4 cookies, cross 1 cookie") as GroupsSpec;
  assert.match(describeGroups(p)[1], /4 cookies \(1 crossed out\); 3 not crossed out/);
  const r = renderGroups(p);
  for (const id of ["G1", "G2", "G2.crossed", "G1.cookie"]) assert.ok(r.parts[id], id);
  assert.ok("error" in parseGroups("bag: lots of red"));
  assert.ok("error" in parseGroups("bag: 50 red"));
});
