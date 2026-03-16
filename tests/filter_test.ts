import { assertEquals, assertThrows } from "@std/assert";
import { query } from "../mod.ts";
import type { FilterQuery } from "../mod.ts";
import { makeData } from "./fixtures.ts";

// ── Comparison operators ───────────────────────────────────────────────────────

Deno.test("$eq — explicit equality", () => {
  const data = makeData();
  const result = query(data).find({ city: { $eq: "Mumbai" } }).toArray();
  assertEquals(result.map((r) => r.name), ["Alice", "Charlie"]);
});

Deno.test("$ne — not equal", () => {
  const data = makeData();
  const result = query(data).find({ city: { $ne: "Mumbai" } }).toArray();
  assertEquals(result.length, 3);
  assertEquals(result.every((r) => r.city !== "Mumbai"), true);
});

Deno.test("$gt / $gte — greater than", () => {
  const data = makeData();
  assertEquals(
    query(data).find({ age: { $gt: 25 } }).toArray().map((r) => r.name),
    ["Alice", "Eve"],
  );
  assertEquals(
    query(data).find({ age: { $gte: 25 } }).toArray().map((r) => r.name),
    ["Alice", "Charlie", "Eve"],
  );
});

Deno.test("$lt / $lte — less than", () => {
  const data = makeData();
  assertEquals(
    query(data).find({ age: { $lt: 22 } }).toArray().map((r) => r.name),
    ["Bob"],
  );
  assertEquals(
    query(data).find({ age: { $lte: 22 } }).toArray().map((r) => r.name),
    ["Bob", "Diana"],
  );
});

Deno.test("$in — value in array", () => {
  const data = makeData();
  const result = query(data).find({ city: { $in: ["Delhi", "Bangalore"] } })
    .toArray();
  assertEquals(result.map((r) => r.name), ["Bob", "Diana", "Eve"]);
});

Deno.test("$nin — value not in array", () => {
  const data = makeData();
  const result = query(data).find({ city: { $nin: ["Delhi", "Bangalore"] } })
    .toArray();
  assertEquals(result.map((r) => r.name), ["Alice", "Charlie"]);
});

// ── Element operators ──────────────────────────────────────────────────────────

Deno.test("$exists — field existence", () => {
  const data = makeData();
  assertEquals(
    query(data).find({ address: { $exists: true } }).toArray().length,
    3,
  );
  assertEquals(
    query(data).find({ address: { $exists: false } }).toArray().map((r) => r.name),
    ["Diana", "Eve"],
  );
});

// ── String operators ───────────────────────────────────────────────────────────

Deno.test("$regex — RegExp instance", () => {
  const data = makeData();
  const result = query(data).find({ name: { $regex: /^[AC]/ } }).toArray();
  assertEquals(result.map((r) => r.name), ["Alice", "Charlie"]);
});

Deno.test("$regex — string pattern", () => {
  const data = makeData();
  const result = query(data).find({ name: { $regex: "^[BD]" } }).toArray();
  assertEquals(result.map((r) => r.name), ["Bob", "Diana"]);
});

// ── Array operators ────────────────────────────────────────────────────────────

Deno.test("$size — array length", () => {
  const data = makeData();
  assertEquals(
    query(data).find({ tags: { $size: 2 } }).toArray().map((r) => r.name),
    ["Alice", "Diana"],
  );
  assertEquals(
    query(data).find({ tags: { $size: 0 } }).toArray().map((r) => r.name),
    ["Eve"],
  );
});

Deno.test("$all — array contains all values", () => {
  const data = makeData();
  const result = query(data).find({ tags: { $all: ["admin", "user"] } })
    .toArray();
  assertEquals(result.map((r) => r.name), ["Alice"]);
});

Deno.test("$elemMatch — element matching sub-filter", () => {
  const inventory = [
    { name: "A", sizes: [{ size: "S", qty: 10 }, { size: "M", qty: 0 }] },
    { name: "B", sizes: [{ size: "S", qty: 5 }, { size: "L", qty: 20 }] },
    { name: "C", sizes: [{ size: "M", qty: 15 }] },
  ];
  const result = query(inventory).find({
    sizes: { $elemMatch: { size: "S", qty: { $gt: 6 } } },
  }).toArray();
  assertEquals(result.map((r) => r.name), ["A"]);
});

// ── Type / modulo operators ────────────────────────────────────────────────────

Deno.test("$type — matches documents where field is of the given JS type", () => {
  const data = [
    { val: 42 },
    { val: "hello" },
    { val: true },
    { val: null },
    { val: [1, 2] },
  ];
  const nums = query(data).find(
    { val: { $type: "number" } } as FilterQuery<typeof data[0]>,
  ).toArray();
  assertEquals(nums.length, 1);
  assertEquals(nums[0].val, 42);

  const strs = query(data).find(
    { val: { $type: "string" } } as FilterQuery<typeof data[0]>,
  ).toArray();
  assertEquals(strs.length, 1);
  assertEquals(strs[0].val, "hello");

  const arrs = query(data).find(
    { val: { $type: "array" } } as FilterQuery<typeof data[0]>,
  ).toArray();
  assertEquals(arrs.length, 1);
  assertEquals(arrs[0].val, [1, 2]);
});

Deno.test("$mod — matches documents where field % divisor === remainder", () => {
  const data = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }, { n: 6 }];
  const evens = query(data).find({ n: { $mod: [2, 0] } }).toArray();
  assertEquals(evens.map((d) => d.n), [2, 4, 6]);

  const rem1 = query(data).find({ n: { $mod: [3, 1] } }).toArray();
  assertEquals(rem1.map((d) => d.n), [1, 4]);
});

// ── Logical operators ──────────────────────────────────────────────────────────

Deno.test("$and — all conditions match", () => {
  const data = makeData();
  const result = query(data)
    .find({ $and: [{ city: "Mumbai" }, { active: true }] })
    .toArray();
  assertEquals(result.map((r) => r.name), ["Alice", "Charlie"]);
});

Deno.test("$or — any condition matches", () => {
  const data = makeData();
  const result = query(data)
    .find({ $or: [{ city: "Bangalore" }, { age: { $gt: 30 } }] })
    .toArray();
  assertEquals(result.map((r) => r.name), ["Diana", "Eve"]);
});

Deno.test("$nor — no condition matches", () => {
  const data = makeData();
  const result = query(data)
    .find({ $nor: [{ city: "Mumbai" }, { city: "Delhi" }] })
    .toArray();
  assertEquals(result.map((r) => r.name), ["Diana"]);
});

Deno.test("$not — negates sub-filter", () => {
  const data = makeData();
  const result = query(data).find({ $not: { active: true } }).toArray();
  assertEquals(result.every((r) => !r.active), true);
});

// ── Shorthand equality ─────────────────────────────────────────────────────────

Deno.test("implicit $eq — shorthand field: value", () => {
  const data = makeData();
  const result = query(data).find({ city: "Mumbai" }).toArray();
  assertEquals(result.map((r) => r.name), ["Alice", "Charlie"]);
});

// ── Unknown operator ───────────────────────────────────────────────────────────

Deno.test("unknown operator throws TypeError", () => {
  const data = makeData();
  assertThrows(
    () =>
      query(data).find({ age: { $unknown: 5 } as unknown as { $gt: number } })
        .toArray(),
    TypeError,
    "Unknown filter operator",
  );
});
