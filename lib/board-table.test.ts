import { test } from "node:test";
import assert from "node:assert/strict";
import { cellText, describeTable, mergeTable, parseTable, renderTable, sameColumns, type TableSpec } from "./board-table";

const spec = (columns: string, rows: string, title?: string) => parseTable(columns, rows, title) as TableSpec;

test("a table is read from columns and rows, and a row of dashes is not a row", () => {
  const t = spec("x | y | (x, y)", "x | y\n----+----\n0 | -1 | (0, -1)", "Table of values");
  assert.deepEqual(t.columns, ["x", "y", "(x, y)"]);
  assert.equal(t.rows.length, 2);
  assert.deepEqual(t.rows[1], ["0", "-1", "(0, -1)"]);
  assert.ok("error" in (parseTable("", "1 | 2") as object));
  assert.equal(cellText("-1"), "−1");
  assert.equal(cellText("(0, -1)"), "(0, −1)");
  assert.equal(cellText("x^2"), "x²");
});

// Oct 25 2026: the tutor sent the whole table again with each new row, and the
// old one was erased and drawn again. Now the second call edits the first.
test("a table sent again keeps its rows and only the new cells are written in", () => {
  const first = spec("x | y", "0 | -1; 1 | ?; 2 | ?");
  const { spec: next, fresh, changed } = mergeTable(first, spec("x | y", "0 | -1; 1 | 1; 2 | ?"));
  assert.deepEqual(next.rows, [["0", "-1"], ["1", "1"], ["2", "?"]]);
  assert.deepEqual([...fresh], ["r2c2"]);
  assert.equal(changed, 1);
  // A row it had not seen is added at the end; a partial call keeps the rest.
  const more = mergeTable(next, spec("x | y", "3 | 5"));
  assert.equal(more.spec.rows.length, 4);
  assert.deepEqual([...more.fresh], ["r4c1", "r4c2"]);
  assert.ok(sameColumns(first, spec("X|Y", "")));
  assert.ok(!sameColumns(first, spec("x | y | z", "")));
});

test("the table is drawn with named cells, a ? left for the student, and fresh cells marked", () => {
  const t = spec("x | y", "0 | -1; 1 | ?", "Table of values");
  const out = renderTable(t, new Set(["r2c2"]));
  assert.ok(out.parts.r1c2 && out.parts.h1 && out.parts.r2 && out.parts.c2);
  assert.equal(out.aliases.y, "c2");
  assert.equal(out.aliases["x=1"], "r2");
  assert.match(out.svg, /<g data-fresh="1">[^]*?>\?<\/text><\/g>/);
  assert.doesNotMatch(out.svg, /----|\+--/);
  assert.equal(describeTable(t), "x | y: 0 | −1; 1 | ?");
});
