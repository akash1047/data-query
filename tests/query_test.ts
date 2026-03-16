import { assertEquals, assertThrows } from "@std/assert";
import { query } from "../mod.ts";
import { makeData } from "./fixtures.ts";

// ── Dot-notation ───────────────────────────────────────────────────────────────

Deno.test("dot-notation filter on nested field", () => {
  const data = makeData();
  const result = query(data).find({ "scores.math": { $gte: 90 } }).toArray();
  assertEquals(result.map((r) => r.name), ["Alice", "Diana"]);
});

Deno.test("dot-notation sort on nested field", () => {
  const data = makeData();
  const result = query(data).find({ active: true }).sort({ "scores.math": -1 })
    .toArray();
  assertEquals(result.map((r) => r.name), ["Alice", "Charlie", "Eve"]);
});

Deno.test("dot-notation project on nested field", () => {
  const data = makeData();
  const result = query(data).find({ name: "Alice" }).project({
    name: 1,
    "scores.math": 1,
  }).toArray();
  assertEquals(result[0] as unknown, { name: "Alice", scores: { math: 90 } });
});

Deno.test("dot-notation $set on nested field", () => {
  const data = makeData();
  query(data).find({ name: "Alice" }).updateOne({
    $set: { "scores.math": 100 },
  });
  assertEquals(data.find((d) => d.name === "Alice")?.scores.math, 100);
});

// ── Chaining ───────────────────────────────────────────────────────────────────

Deno.test("find + sort + skip + limit", () => {
  const data = makeData();
  const result = query(data)
    .find({ active: true })
    .sort({ age: 1 })
    .skip(1)
    .limit(1)
    .toArray();
  // active: Alice(30), Charlie(25), Eve(35) → sorted: Charlie(25), Alice(30), Eve(35)
  // skip 1 → Alice(30), Eve(35) → limit 1 → Alice(30)
  assertEquals(result.map((r) => r.name), ["Alice"]);
});

Deno.test("multiple find() calls accumulate with $and", () => {
  const data = makeData();
  const result = query(data).find({ active: true }).find({ city: "Mumbai" })
    .toArray();
  assertEquals(result.map((r) => r.name), ["Alice", "Charlie"]);
});

// ── Terminal reads ─────────────────────────────────────────────────────────────

Deno.test("count() applies filter only", () => {
  const data = makeData();
  assertEquals(query(data).find({ city: "Mumbai" }).count(), 2);
  assertEquals(query(data).count(), 5);
});

Deno.test("first() returns first matching doc", () => {
  const data = makeData();
  const result = query(data).find({ city: "Delhi" }).sort({ age: 1 }).first();
  assertEquals(result?.name, "Bob");
});

Deno.test("first() returns null when no match", () => {
  const data = makeData();
  assertEquals(query(data).find({ city: "Kolkata" }).first(), null);
});

// ── Projection ─────────────────────────────────────────────────────────────────

Deno.test("project inclusion", () => {
  const data = makeData();
  const result = query(data).find({ name: "Alice" }).project({
    name: 1,
    age: 1,
  }).toArray();
  assertEquals(result[0] as unknown, { name: "Alice", age: 30 });
});

Deno.test("project exclusion", () => {
  const data = makeData();
  const result = query(data).find({ name: "Alice" }).project({
    scores: 0,
    tags: 0,
    address: 0,
  }).toArray();
  assertEquals(
    Object.keys(result[0]).sort(),
    ["active", "city", "name", "age"].sort(),
  );
});

Deno.test("project mixed throws TypeError", () => {
  const data = makeData();
  assertThrows(
    () => query(data).project({ name: 1, age: 0 }).toArray(),
    TypeError,
    "Cannot mix inclusion and exclusion",
  );
});

// ── distinct() ─────────────────────────────────────────────────────────────────

Deno.test("distinct — returns unique values for a field", () => {
  const data = [
    { city: "Delhi" },
    { city: "Mumbai" },
    { city: "Delhi" },
    { city: "Chennai" },
  ];
  const cities = query(data).distinct("city");
  assertEquals(cities.sort(), ["Chennai", "Delhi", "Mumbai"]);
});

Deno.test("distinct — respects active filter", () => {
  const data = [
    { city: "Delhi", active: true },
    { city: "Mumbai", active: false },
    { city: "Delhi", active: false },
    { city: "Chennai", active: true },
  ];
  const cities = query(data).find({ active: true }).distinct("city");
  assertEquals(cities.sort(), ["Chennai", "Delhi"]);
});

Deno.test("distinct — skips documents where field is undefined", () => {
  const data = [{ city: "Delhi" }, { name: "Alice" }, { city: "Mumbai" }] as {
    city?: string;
    name?: string;
  }[];
  const cities = query(data).distinct("city");
  assertEquals(cities.sort(), ["Delhi", "Mumbai"]);
});

// ── Edge cases ─────────────────────────────────────────────────────────────────

Deno.test("empty array — find returns empty", () => {
  assertEquals(
    query<Record<string, unknown>>([]).find({ age: { $gt: 18 } }).toArray(),
    [],
  );
});

Deno.test("no-match filter — returns empty array", () => {
  const data = makeData();
  assertEquals(query(data).find({ city: "Kolkata" }).toArray(), []);
});

Deno.test("no-match count returns 0", () => {
  const data = makeData();
  assertEquals(query(data).find({ city: "Kolkata" }).count(), 0);
});
