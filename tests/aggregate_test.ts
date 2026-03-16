import { assertEquals } from "@std/assert";
import { query } from "../mod.ts";
import { makeData } from "./fixtures.ts";

// ── $match ─────────────────────────────────────────────────────────────────────

Deno.test("aggregate $match", () => {
  const data = makeData();
  const result = query(data).aggregate([{ $match: { city: "Mumbai" } }]);
  assertEquals(result.length, 2);
});

// ── $group accumulators ────────────────────────────────────────────────────────

Deno.test("aggregate $group $count", () => {
  const data = makeData();
  const result = query(data).aggregate([
    { $group: { _id: "city", count: { $count: true } } },
  ]);
  const mumbai = result.find((r) => r._id === "Mumbai");
  assertEquals(mumbai?.count, 2);
});

Deno.test("aggregate $group $sum", () => {
  const data = makeData();
  const result = query(data).aggregate([
    { $group: { _id: "city", totalAge: { $sum: "age" } } },
  ]);
  const mumbai = result.find((r) => r._id === "Mumbai");
  assertEquals(mumbai?.totalAge, 55); // Alice 30 + Charlie 25
});

Deno.test("aggregate $group $avg", () => {
  const data = makeData();
  const result = query(data).aggregate([
    { $group: { _id: null, avgAge: { $avg: "age" } } },
  ]);
  assertEquals(result[0].avgAge, (30 + 17 + 25 + 22 + 35) / 5);
});

Deno.test("aggregate $group $min/$max", () => {
  const data = makeData();
  const result = query(data).aggregate([
    { $group: { _id: null, minAge: { $min: "age" }, maxAge: { $max: "age" } } },
  ]);
  assertEquals(result[0].minAge, 17);
  assertEquals(result[0].maxAge, 35);
});

Deno.test("aggregate $group $push collects values", () => {
  const data = makeData();
  const result = query(data).aggregate([
    { $match: { city: "Delhi" } },
    { $group: { _id: "city", names: { $push: "name" } } },
  ]);
  assertEquals((result[0].names as string[]).sort(), ["Bob", "Eve"].sort());
});

Deno.test("aggregate $group $first/$last", () => {
  const data = makeData();
  const result = query(data).aggregate([
    {
      $group: {
        _id: null,
        firstName: { $first: "name" },
        lastName: { $last: "name" },
      },
    },
  ]);
  assertEquals(result[0].firstName, "Alice");
  assertEquals(result[0].lastName, "Eve");
});

// ── Multi-stage pipeline ───────────────────────────────────────────────────────

Deno.test("aggregate multi-stage: $match $group $sort", () => {
  const data = makeData();
  const result = query(data).aggregate([
    { $match: { active: true } },
    { $group: { _id: "city", count: { $count: true } } },
    { $sort: { count: -1 } },
  ]);
  assertEquals(result[0]._id, "Mumbai"); // 2 active in Mumbai vs 1 in Delhi
});

Deno.test("aggregate $unwind expands array field", () => {
  const data = makeData();
  const result = query(data).aggregate([
    { $match: { name: "Alice" } },
    { $unwind: "tags" },
  ]);
  assertEquals(result.length, 2);
  assertEquals(
    (result as Array<{ tags: string }>).map((r) => r.tags).sort(),
    ["admin", "user"].sort(),
  );
});

Deno.test("aggregate $limit and $skip", () => {
  const data = makeData();
  const result = query(data).aggregate([
    { $sort: { age: 1 } },
    { $skip: 1 },
    { $limit: 2 },
  ]);
  assertEquals(result.length, 2);
  assertEquals((result as Array<{ name: string }>).map((r) => r.name), [
    "Diana",
    "Charlie",
  ]);
});

// ── $addFields ─────────────────────────────────────────────────────────────────

Deno.test("$addFields — adds computed fields to each document", () => {
  const data = [
    { name: "Alice", price: 100, qty: 3 },
    { name: "Bob", price: 50, qty: 5 },
  ];
  const result = query(data).aggregate([
    { $addFields: { total: { $multiply: ["$price", "$qty"] } } },
  ]);
  assertEquals(result[0].total, 300);
  assertEquals(result[1].total, 250);
  // original fields preserved
  assertEquals(result[0].name, "Alice");
});

Deno.test("$addFields — adds a literal constant field", () => {
  const data = [{ name: "Alice" }, { name: "Bob" }];
  const result = query(data).aggregate([
    { $addFields: { source: "csv" } },
  ]);
  assertEquals(result[0].source, "csv");
  assertEquals(result[1].source, "csv");
});
