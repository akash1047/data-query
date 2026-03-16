import { assertEquals } from "@std/assert";
import { query } from "../mod.ts";
import { makeData } from "./fixtures.ts";

// ── Core update operators ──────────────────────────────────────────────────────

Deno.test("$set — sets field values", () => {
  const data = makeData();
  const result = query(data).find({ name: "Bob" }).updateOne({
    $set: { active: true, city: "Chennai" },
  });
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
  query(data).find({ name: "Charlie" }).updateOne({
    $push: { tags: "superuser" },
  });
  assertEquals(data.find((d) => d.name === "Charlie")?.tags, [
    "admin",
    "superuser",
  ]);
});

Deno.test("$pull — removes from array", () => {
  const data = makeData();
  query(data).find({ name: "Alice" }).updateOne({ $pull: { tags: "admin" } });
  assertEquals(data.find((d) => d.name === "Alice")?.tags, ["user"]);
});

Deno.test("$rename — renames a field", () => {
  const data = makeData();
  query(data).find({ name: "Eve" }).updateOne({
    $rename: { city: "location" },
  });
  const eve = data.find((d) => d.name === "Eve") as unknown as Record<
    string,
    unknown
  >;
  assertEquals(eve.location, "Delhi");
  assertEquals(eve.city, undefined);
});

Deno.test("updateMany — updates all matching docs", () => {
  const data = makeData();
  const result = query(data).find({ active: false }).updateMany({
    $set: { active: true },
  });
  assertEquals(result, { matchedCount: 2, modifiedCount: 2 });
  assertEquals(data.every((d) => d.active), true);
});

Deno.test("updateOne — no match returns 0 counts", () => {
  const data = makeData();
  const result = query(data).find({ name: "Nobody" }).updateOne({
    $set: { age: 0 },
  });
  assertEquals(result, { matchedCount: 0, modifiedCount: 0 });
});

// ── $addToSet ──────────────────────────────────────────────────────────────────

Deno.test("$addToSet — adds value only if not already present", () => {
  const data = [{ tags: ["a", "b"] }];
  query(data).updateOne({ $addToSet: { tags: "c" } });
  assertEquals(data[0].tags, ["a", "b", "c"]);

  // should NOT add again
  query(data).updateOne({ $addToSet: { tags: "c" } });
  assertEquals(data[0].tags, ["a", "b", "c"]);
});

Deno.test("$addToSet — creates array if field is missing", () => {
  const data = [{ name: "Alice" }] as { name: string; tags?: string[] }[];
  query(data).updateOne({ $addToSet: { tags: "new" } });
  assertEquals(data[0].tags, ["new"]);
});

// ── $pop ───────────────────────────────────────────────────────────────────────

Deno.test("$pop 1 — removes last element from array", () => {
  const data = [{ arr: [1, 2, 3] }];
  query(data).updateOne({ $pop: { arr: 1 } });
  assertEquals(data[0].arr, [1, 2]);
});

Deno.test("$pop -1 — removes first element from array", () => {
  const data = [{ arr: [1, 2, 3] }];
  query(data).updateOne({ $pop: { arr: -1 } });
  assertEquals(data[0].arr, [2, 3]);
});

Deno.test("$pop — does nothing if field is not an array", () => {
  const data = [{ x: 5 }] as { x: number; arr?: number[] }[];
  query(data).updateOne({ $pop: { arr: 1 } });
  assertEquals(data[0].arr, undefined);
});

// ── $mul ───────────────────────────────────────────────────────────────────────

Deno.test("$mul — multiplies a numeric field", () => {
  const data = [{ price: 10 }, { price: 5 }];
  query(data).find({ price: { $gt: 6 } }).updateOne({ $mul: { price: 2 } });
  assertEquals(data[0].price, 20);
  assertEquals(data[1].price, 5); // untouched
});

Deno.test("$mul — initialises missing field to 0 then multiplies", () => {
  const data = [{ name: "x" }] as { name: string; count?: number }[];
  query(data).updateOne({ $mul: { count: 5 } });
  assertEquals(data[0].count, 0); // 0 * 5 = 0
});
