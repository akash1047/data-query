import { assertEquals } from "@std/assert";
import { query } from "../mod.ts";
import { makeData } from "./fixtures.ts";

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
