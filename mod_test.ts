import { assertEquals, assertThrows } from "@std/assert";
import { query } from "./mod.ts";

// ── Sample data ───────────────────────────────────────────────────────────────

interface User {
  name: string;
  age: number;
  city: string;
  active: boolean;
  tags: string[];
  scores: { math: number; science: number };
  address?: { city: string; zip: string };
}

function makeData(): User[] {
  return [
    {
      name: "Alice",
      age: 30,
      city: "Mumbai",
      active: true,
      tags: ["admin", "user"],
      scores: { math: 90, science: 85 },
      address: { city: "Mumbai", zip: "400001" },
    },
    {
      name: "Bob",
      age: 17,
      city: "Delhi",
      active: false,
      tags: ["user"],
      scores: { math: 70, science: 60 },
      address: { city: "Delhi", zip: "110001" },
    },
    {
      name: "Charlie",
      age: 25,
      city: "Mumbai",
      active: true,
      tags: ["admin"],
      scores: { math: 80, science: 95 },
      address: { city: "Mumbai", zip: "400002" },
    },
    {
      name: "Diana",
      age: 22,
      city: "Bangalore",
      active: false,
      tags: ["user", "moderator"],
      scores: { math: 95, science: 88 },
    },
    {
      name: "Eve",
      age: 35,
      city: "Delhi",
      active: true,
      tags: [],
      scores: { math: 60, science: 70 },
    },
  ];
}

// ── Filter operators ──────────────────────────────────────────────────────────

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
  assertEquals(query(data).find({ age: { $gt: 25 } }).toArray().map((r) => r.name), ["Alice", "Eve"]);
  assertEquals(query(data).find({ age: { $gte: 25 } }).toArray().map((r) => r.name), ["Alice", "Charlie", "Eve"]);
});

Deno.test("$lt / $lte — less than", () => {
  const data = makeData();
  assertEquals(query(data).find({ age: { $lt: 22 } }).toArray().map((r) => r.name), ["Bob"]);
  assertEquals(query(data).find({ age: { $lte: 22 } }).toArray().map((r) => r.name), ["Bob", "Diana"]);
});

Deno.test("$in — value in array", () => {
  const data = makeData();
  const result = query(data).find({ city: { $in: ["Delhi", "Bangalore"] } }).toArray();
  assertEquals(result.map((r) => r.name), ["Bob", "Diana", "Eve"]);
});

Deno.test("$nin — value not in array", () => {
  const data = makeData();
  const result = query(data).find({ city: { $nin: ["Delhi", "Bangalore"] } }).toArray();
  assertEquals(result.map((r) => r.name), ["Alice", "Charlie"]);
});

Deno.test("$exists — field existence", () => {
  const data = makeData();
  assertEquals(query(data).find({ address: { $exists: true } }).toArray().length, 3);
  assertEquals(query(data).find({ address: { $exists: false } }).toArray().map((r) => r.name), ["Diana", "Eve"]);
});

Deno.test("$regex — string matching", () => {
  const data = makeData();
  const result = query(data).find({ name: { $regex: /^[AC]/ } }).toArray();
  assertEquals(result.map((r) => r.name), ["Alice", "Charlie"]);
});

Deno.test("$regex — string pattern", () => {
  const data = makeData();
  const result = query(data).find({ name: { $regex: "^[BD]" } }).toArray();
  assertEquals(result.map((r) => r.name), ["Bob", "Diana"]);
});

Deno.test("$size — array length", () => {
  const data = makeData();
  assertEquals(query(data).find({ tags: { $size: 2 } }).toArray().map((r) => r.name), [
    "Alice",
    "Diana",
  ]);
  assertEquals(query(data).find({ tags: { $size: 0 } }).toArray().map((r) => r.name), ["Eve"]);
});

Deno.test("$all — array contains all values", () => {
  const data = makeData();
  const result = query(data).find({ tags: { $all: ["admin", "user"] } }).toArray();
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

// ── Logical operators ─────────────────────────────────────────────────────────

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

// ── Shorthand equality ────────────────────────────────────────────────────────

Deno.test("implicit $eq — shorthand field: value", () => {
  const data = makeData();
  const result = query(data).find({ city: "Mumbai" }).toArray();
  assertEquals(result.map((r) => r.name), ["Alice", "Charlie"]);
});

// ── Dot-notation ──────────────────────────────────────────────────────────────

Deno.test("dot-notation filter on nested field", () => {
  const data = makeData();
  const result = query(data).find({ "scores.math": { $gte: 90 } }).toArray();
  assertEquals(result.map((r) => r.name), ["Alice", "Diana"]);
});

Deno.test("dot-notation sort on nested field", () => {
  const data = makeData();
  const result = query(data).find({ active: true }).sort({ "scores.math": -1 }).toArray();
  assertEquals(result.map((r) => r.name), ["Alice", "Charlie", "Eve"]);
});

Deno.test("dot-notation project on nested field", () => {
  const data = makeData();
  const result = query(data).find({ name: "Alice" }).project({ name: 1, "scores.math": 1 }).toArray();
  assertEquals(result[0] as unknown, { name: "Alice", scores: { math: 90 } });
});

// ── Chaining ──────────────────────────────────────────────────────────────────

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
  const result = query(data).find({ active: true }).find({ city: "Mumbai" }).toArray();
  assertEquals(result.map((r) => r.name), ["Alice", "Charlie"]);
});

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

// ── Projection ────────────────────────────────────────────────────────────────

Deno.test("project inclusion", () => {
  const data = makeData();
  const result = query(data).find({ name: "Alice" }).project({ name: 1, age: 1 }).toArray();
  assertEquals(result[0] as unknown, { name: "Alice", age: 30 });
});

Deno.test("project exclusion", () => {
  const data = makeData();
  const result = query(data).find({ name: "Alice" }).project({ scores: 0, tags: 0, address: 0 }).toArray();
  assertEquals(Object.keys(result[0]).sort(), ["active", "city", "name", "age"].sort());
});

Deno.test("project mixed throws TypeError", () => {
  const data = makeData();
  assertThrows(
    () => query(data).project({ name: 1, age: 0 }).toArray(),
    TypeError,
    "Cannot mix inclusion and exclusion",
  );
});

// ── Update operators ──────────────────────────────────────────────────────────

Deno.test("$set — sets field values", () => {
  const data = makeData();
  const result = query(data).find({ name: "Bob" }).updateOne({ $set: { active: true, city: "Chennai" } });
  assertEquals(result, { matchedCount: 1, modifiedCount: 1 });
  assertEquals(data.find((d) => d.name === "Bob")?.active, true);
  assertEquals(data.find((d) => d.name === "Bob")?.city, "Chennai");
});

Deno.test("$unset — removes field", () => {
  const data = makeData();
  query(data).find({ name: "Alice" }).updateOne({ $unset: { address: 1 } });
  assertEquals(data.find((d) => d.name === "Alice")?.address, undefined);
});

Deno.test("$inc — increments field", () => {
  const data = makeData();
  query(data).find({ name: "Alice" }).updateOne({ $inc: { age: 5 } });
  assertEquals(data.find((d) => d.name === "Alice")?.age, 35);
});

Deno.test("$push — appends to array", () => {
  const data = makeData();
  query(data).find({ name: "Charlie" }).updateOne({ $push: { tags: "superuser" } });
  assertEquals(data.find((d) => d.name === "Charlie")?.tags, ["admin", "superuser"]);
});

Deno.test("$pull — removes from array", () => {
  const data = makeData();
  query(data).find({ name: "Alice" }).updateOne({ $pull: { tags: "admin" } });
  assertEquals(data.find((d) => d.name === "Alice")?.tags, ["user"]);
});

Deno.test("$rename — renames a field", () => {
  const data = makeData();
  query(data).find({ name: "Eve" }).updateOne({ $rename: { city: "location" } });
  const eve = data.find((d) => d.name === "Eve") as unknown as Record<string, unknown>;
  assertEquals(eve.location, "Delhi");
  assertEquals(eve.city, undefined);
});

Deno.test("updateMany — updates all matching docs", () => {
  const data = makeData();
  const result = query(data).find({ active: false }).updateMany({ $set: { active: true } });
  assertEquals(result, { matchedCount: 2, modifiedCount: 2 });
  assertEquals(data.every((d) => d.active), true);
});

Deno.test("updateOne — no match returns 0 counts", () => {
  const data = makeData();
  const result = query(data).find({ name: "Nobody" }).updateOne({ $set: { age: 0 } });
  assertEquals(result, { matchedCount: 0, modifiedCount: 0 });
});

// ── Delete ────────────────────────────────────────────────────────────────────

Deno.test("deleteOne — removes first matching doc", () => {
  const data = makeData();
  const result = query(data).find({ city: "Delhi" }).deleteOne();
  assertEquals(result, { deletedCount: 1 });
  assertEquals(data.length, 4);
  // Bob was first Delhi entry
  assertEquals(data.find((d) => d.name === "Bob"), undefined);
  assertEquals(data.find((d) => d.name === "Eve") !== undefined, true);
});

Deno.test("deleteMany — removes all matching docs", () => {
  const data = makeData();
  const result = query(data).find({ city: "Mumbai" }).deleteMany();
  assertEquals(result, { deletedCount: 2 });
  assertEquals(data.length, 3);
  assertEquals(data.every((d) => d.city !== "Mumbai"), true);
});

Deno.test("deleteMany — no filter removes all docs", () => {
  const data = makeData();
  const result = query(data).deleteMany();
  assertEquals(result, { deletedCount: 5 });
  assertEquals(data.length, 0);
});

// ── Aggregation ───────────────────────────────────────────────────────────────

Deno.test("aggregate $match", () => {
  const data = makeData();
  const result = query(data).aggregate([{ $match: { city: "Mumbai" } }]);
  assertEquals(result.length, 2);
});

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
    { $group: { _id: null, firstName: { $first: "name" }, lastName: { $last: "name" } } },
  ]);
  assertEquals(result[0].firstName, "Alice");
  assertEquals(result[0].lastName, "Eve");
});

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
  assertEquals((result as Array<{ tags: string }>).map((r) => r.tags).sort(), ["admin", "user"].sort());
});

Deno.test("aggregate $limit and $skip", () => {
  const data = makeData();
  const result = query(data).aggregate([
    { $sort: { age: 1 } },
    { $skip: 1 },
    { $limit: 2 },
  ]);
  assertEquals(result.length, 2);
  assertEquals((result as Array<{ name: string }>).map((r) => r.name), ["Diana", "Charlie"]);
});

// ── Edge cases ────────────────────────────────────────────────────────────────

Deno.test("empty array — find returns empty", () => {
  assertEquals(query<Record<string, unknown>>([]).find({ age: { $gt: 18 } }).toArray(), []);
});

Deno.test("no-match filter — returns empty array", () => {
  const data = makeData();
  assertEquals(query(data).find({ city: "Kolkata" }).toArray(), []);
});

Deno.test("no-match count returns 0", () => {
  const data = makeData();
  assertEquals(query(data).find({ city: "Kolkata" }).count(), 0);
});

Deno.test("dot-notation $set on nested field", () => {
  const data = makeData();
  query(data).find({ name: "Alice" }).updateOne({ $set: { "scores.math": 100 } });
  assertEquals(data.find((d) => d.name === "Alice")?.scores.math, 100);
});

Deno.test("unknown operator throws TypeError", () => {
  const data = makeData();
  assertThrows(
    () => query(data).find({ age: { $unknown: 5 } as unknown as { $gt: number } }).toArray(),
    TypeError,
    "Unknown filter operator",
  );
});
