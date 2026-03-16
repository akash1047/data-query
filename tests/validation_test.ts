import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { z } from "zod";
import { queryCSV, queryJSON } from "../mod.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  city: z.string(),
});

type User = z.infer<typeof UserSchema>;

const VALID_CSV = `name,age,city
Alice,30,Delhi
Bob,25,Mumbai`;

const VALID_JSON = JSON.stringify(
  [
    { name: "Alice", age: 30, city: "Delhi" },
    { name: "Bob", age: 25, city: "Mumbai" },
  ],
  null,
  2,
);

async function writeTempCSV(content: string): Promise<string> {
  const path = await Deno.makeTempFile({ suffix: ".csv" });
  await Deno.writeTextFile(path, content);
  return path;
}

async function writeTempJSON(content: string): Promise<string> {
  const path = await Deno.makeTempFile({ suffix: ".json" });
  await Deno.writeTextFile(path, content);
  return path;
}

// ── 1. queryCSV with valid schema — returns typed FileDataQuery<T> ─────────────

Deno.test("queryCSV with schema: valid data loads and docs are typed", async () => {
  const path = await writeTempCSV(VALID_CSV);
  try {
    const q = await queryCSV(path, { schema: UserSchema });
    const docs: User[] = q.toArray();
    assertEquals(docs.length, 2);
    assertEquals(docs[0].name, "Alice");
    assertEquals(docs[0].age, 30);
    assertEquals(docs[0].city, "Delhi");
  } finally {
    await Deno.remove(path);
  }
});

// ── 2. queryCSV with schema — invalid row on load throws with row index ────────

Deno.test("queryCSV with schema: invalid row on load throws with row index", async () => {
  // age column has a string that won't coerce to a number the schema expects
  const badCSV = `name,age,city\nAlice,not-a-number,Delhi`;
  const path = await writeTempCSV(badCSV);
  try {
    await assertRejects(
      () => queryCSV(path, { schema: UserSchema }),
      Error,
      "Validation failed at row 0",
    );
  } finally {
    await Deno.remove(path);
  }
});

// ── 3. queryJSON with valid schema — docs validated on load ────────────────────

Deno.test("queryJSON with schema: valid data loads successfully", async () => {
  const path = await writeTempJSON(VALID_JSON);
  try {
    const q = await queryJSON(path, { schema: UserSchema });
    const docs: User[] = q.toArray();
    assertEquals(docs.length, 2);
    assertEquals(docs[1].city, "Mumbai");
  } finally {
    await Deno.remove(path);
  }
});

// ── 4. queryJSON with schema — invalid row on load throws ─────────────────────

Deno.test("queryJSON with schema: invalid row on load throws", async () => {
  const badJSON = JSON.stringify([
    { name: "Alice", age: "thirty", city: "Delhi" },
  ]);
  const path = await writeTempJSON(badJSON);
  try {
    await assertRejects(
      () => queryJSON(path, { schema: UserSchema }),
      Error,
      "Validation failed at row 0",
    );
  } finally {
    await Deno.remove(path);
  }
});

// ── 5. updateOne with schema — valid update succeeds ─────────────────────────

Deno.test("updateOne with schema: valid update succeeds", async () => {
  const path = await writeTempJSON(VALID_JSON);
  try {
    const q = await queryJSON(path, { schema: UserSchema });
    const result = q.find({ name: "Alice" }).updateOne({
      $set: { city: "New Delhi" },
    });
    assertEquals(result.modifiedCount, 1);
    const alice = q.find({ name: "Alice" }).first()!;
    assertEquals(alice.city, "New Delhi");
  } finally {
    await Deno.remove(path);
  }
});

// ── 6. updateOne with schema — update producing invalid data throws ────────────

Deno.test("updateOne with schema: invalid mutation throws", async () => {
  const path = await writeTempJSON(VALID_JSON);
  try {
    const q = await queryJSON(path, { schema: UserSchema });
    assertThrows(
      () =>
        q.find({ name: "Alice" }).updateOne({
          $set: { age: "not-a-number" as unknown as number },
        }),
      Error,
      "Validation failed at row",
    );
  } finally {
    await Deno.remove(path);
  }
});

// ── 7. updateMany with schema — invalid mutation throws ───────────────────────

Deno.test("updateMany with schema: invalid mutation throws", async () => {
  const path = await writeTempJSON(VALID_JSON);
  try {
    const q = await queryJSON(path, { schema: UserSchema });
    assertThrows(
      () => q.updateMany({ $set: { city: 42 as unknown as string } }),
      Error,
      "Validation failed at row",
    );
  } finally {
    await Deno.remove(path);
  }
});

// ── 8. save() with schema — valid data saves successfully ─────────────────────

Deno.test("save() with schema: valid data writes to disk", async () => {
  const srcPath = await writeTempJSON(VALID_JSON);
  const outPath = await Deno.makeTempFile({ suffix: ".json" });
  try {
    const q = await queryJSON(srcPath, { schema: UserSchema, output: outPath });
    q.find({ name: "Alice" }).updateOne({ $set: { city: "Kolkata" } });
    await q.save();
    const saved = JSON.parse(await Deno.readTextFile(outPath)) as User[];
    assertEquals(saved.find((d) => d.name === "Alice")?.city, "Kolkata");
  } finally {
    await Deno.remove(srcPath);
    await Deno.remove(outPath);
  }
});

// ── 9. save() with schema — corrupted data (external mutation) throws ─────────

Deno.test("save() with schema: externally corrupted data throws on save", async () => {
  const path = await writeTempJSON(VALID_JSON);
  try {
    const q = await queryJSON(path, { schema: UserSchema });
    // Bypass the query API and directly corrupt the internal data array
    const docs = q.toArray();
    (docs[0] as Record<string, unknown>)["age"] = "corrupted";
    // The save should detect this via validation since docs[0] is a reference
    // However, toArray() returns a copy, not references to internal data.
    // Instead, use updateOne to set the bad value and bypass schema by casting
    // Actually the safest way is to use updateOne which does validate.
    // Let's just verify save validates before writing — use a fresh approach:
    // We'll do the corruption via the same reference the query holds.
    const internalDocs = q.find().toArray();
    // toArray returns copies, so we need another approach: update then manually revert
    // Actually let's do an updateOne with invalid data which throws, so data is corrupted
    // but catch the throw, then try to save
    try {
      q.find({ name: "Bob" }).updateOne({
        $set: { city: 999 as unknown as string },
      });
    } catch {
      // data is now invalid for Bob
    }
    await assertRejects(
      () => q.save(),
      Error,
      "Validation failed at row",
    );
    // suppress unused variable warning
    assertEquals(internalDocs.length > 0, true);
  } finally {
    await Deno.remove(path);
  }
});

// ── 10. Without schema — factory behaves exactly as before ────────────────────

Deno.test("queryCSV without schema: behaves as before, returns Record<string,unknown>", async () => {
  const path = await writeTempCSV(VALID_CSV);
  try {
    const q = await queryCSV(path);
    const docs = q.toArray();
    assertEquals(docs.length, 2);
    assertEquals(docs[0]["name"], "Alice");
    assertEquals(docs[0]["age"], 30);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test("queryJSON without schema: behaves as before, no validation errors for mismatched types", async () => {
  const json = JSON.stringify([{ name: "Alice", age: "thirty" }]);
  const path = await writeTempJSON(json);
  try {
    const q = await queryJSON(path);
    const docs = q.toArray();
    assertEquals(docs[0]["age"], "thirty"); // no schema, no error
  } finally {
    await Deno.remove(path);
  }
});
