import { assertEquals, assertThrows } from "@std/assert";
import { z } from "zod";
import { queryGASSheet } from "../mod.ts";
import type { GASSheet } from "../mod.ts";

// ── Mock GASSheet ─────────────────────────────────────────────────────────────

function makeMockSheet(rows: unknown[][]): GASSheet {
  let stored: unknown[][] = rows.map((r) => [...r]);
  return {
    getDataRange() {
      return {
        getValues() {
          return stored;
        },
      };
    },
    clearContents() {
      stored = [];
    },
    getRange(_row: number, _col: number, _numRows: number, _numCols: number) {
      return {
        setValues(v: unknown[][]) {
          stored = v;
        },
      };
    },
  };
}

// ── 1. Basic load ─────────────────────────────────────────────────────────────

Deno.test("queryGASSheet: headers become keys, values typed correctly", () => {
  const sheet = makeMockSheet([
    ["name", "age", "city"],
    ["Alice", 30, "Delhi"],
    ["Bob", 25, "Mumbai"],
  ]);
  const q = queryGASSheet(sheet);
  const docs = q.toArray();
  assertEquals(docs.length, 2);
  assertEquals(docs[0], { name: "Alice", age: 30, city: "Delhi" });
  assertEquals(docs[1], { name: "Bob", age: 25, city: "Mumbai" });
});

// ── 2. Empty sheet ────────────────────────────────────────────────────────────

Deno.test("queryGASSheet: empty sheet (0 rows) returns empty array", () => {
  const sheet = makeMockSheet([]);
  const q = queryGASSheet(sheet);
  assertEquals(q.toArray(), []);
});

// ── 3. Header-only sheet ──────────────────────────────────────────────────────

Deno.test("queryGASSheet: header-only sheet (1 row) returns empty array", () => {
  const sheet = makeMockSheet([["name", "age"]]);
  const q = queryGASSheet(sheet);
  assertEquals(q.toArray(), []);
});

// ── 4. updateOne + saveSync ───────────────────────────────────────────────────

Deno.test("queryGASSheet: updateOne + saveSync persists to sheet", () => {
  const sheet = makeMockSheet([
    ["name", "city"],
    ["Alice", "Delhi"],
    ["Bob", "Mumbai"],
  ]);
  const q = queryGASSheet(sheet);
  q.find({ name: "Alice" }).updateOne({ $set: { city: "Kolkata" } });
  q.saveSync();

  // Re-read the sheet to verify
  const q2 = queryGASSheet(sheet);
  const docs = q2.toArray();
  assertEquals(docs.length, 2);
  assertEquals(docs.find((d) => d.name === "Alice")?.city, "Kolkata");
});

// ── 5. updateMany + save ──────────────────────────────────────────────────────

Deno.test("queryGASSheet: updateMany + save persists all matched docs", async () => {
  const sheet = makeMockSheet([
    ["name", "score"],
    ["Alice", 80],
    ["Bob", 90],
    ["Charlie", 70],
  ]);
  const q = queryGASSheet(sheet);
  q.find({ score: { $lt: 85 } }).updateMany({ $set: { score: 85 } });
  await q.save();

  const q2 = queryGASSheet(sheet);
  const docs = q2.toArray();
  assertEquals(docs.find((d) => d.name === "Alice")?.score, 85);
  assertEquals(docs.find((d) => d.name === "Charlie")?.score, 85);
  assertEquals(docs.find((d) => d.name === "Bob")?.score, 90); // unchanged
});

// ── 6. deleteOne + saveSync ───────────────────────────────────────────────────

Deno.test("queryGASSheet: deleteOne + saveSync removes row from sheet", () => {
  const sheet = makeMockSheet([
    ["name", "age"],
    ["Alice", 30],
    ["Bob", 25],
    ["Charlie", 35],
  ]);
  const q = queryGASSheet(sheet);
  q.find({ name: "Bob" }).deleteOne();
  q.saveSync();

  const q2 = queryGASSheet(sheet);
  const docs = q2.toArray();
  assertEquals(docs.length, 2);
  assertEquals(docs.map((d) => d.name), ["Alice", "Charlie"]);
});

// ── 7. With Zod schema — valid rows load ──────────────────────────────────────

Deno.test("queryGASSheet with schema: valid rows load and are typed", () => {
  const RowSchema = z.object({ name: z.string(), age: z.number() });
  const sheet = makeMockSheet([
    ["name", "age"],
    ["Alice", 30],
    ["Bob", 25],
  ]);
  const q = queryGASSheet(sheet, { schema: RowSchema });
  const docs = q.toArray();
  assertEquals(docs.length, 2);
  assertEquals(docs[0].name, "Alice");
  assertEquals(docs[0].age, 30);
});

// ── 8. With Zod schema — invalid row throws with index ────────────────────────

Deno.test("queryGASSheet with schema: invalid row throws with row index", () => {
  const RowSchema = z.object({ name: z.string(), age: z.number() });
  const sheet = makeMockSheet([
    ["name", "age"],
    ["Alice", "not-a-number"], // invalid
  ]);
  assertThrows(
    () => queryGASSheet(sheet, { schema: RowSchema }),
    Error,
    "Validation failed at row 0",
  );
});

// ── 9. With Zod schema — updateOne with invalid value throws ──────────────────

Deno.test("queryGASSheet with schema: updateOne with invalid value throws", () => {
  const RowSchema = z.object({ name: z.string(), score: z.number() });
  const sheet = makeMockSheet([
    ["name", "score"],
    ["Alice", 90],
  ]);
  const q = queryGASSheet(sheet, { schema: RowSchema });
  assertThrows(
    () =>
      q.find({ name: "Alice" }).updateOne({
        $set: { score: "bad" as unknown as number },
      }),
    Error,
    "Validation failed at row",
  );
});
