import { assertEquals, assertThrows } from "@std/assert";
import {
  loadCSV,
  loadJSON,
  loadXLSX,
  parseCSV,
  parseJSON,
  queryCSV,
  queryCSVSync,
  queryJSON,
  queryJSONSync,
  queryXLSX,
  queryXLSXSync,
  serializeCSV,
  serializeJSON,
} from "../mod.ts";

// ── Helper ────────────────────────────────────────────────────────────────────

async function writeTempCSV(data: Record<string, unknown>[]): Promise<string> {
  const path = await Deno.makeTempFile({ suffix: ".csv" });
  await Deno.writeTextFile(path, serializeCSV(data));
  return path;
}

async function writeTempJSON(data: Record<string, unknown>[]): Promise<string> {
  const path = await Deno.makeTempFile({ suffix: ".json" });
  await Deno.writeTextFile(path, serializeJSON(data));
  return path;
}

async function writeTempXLSX(data: Record<string, unknown>[]): Promise<string> {
  const { serializeXLSX } = await import("../mod.ts");
  const path = await Deno.makeTempFile({ suffix: ".xlsx" });
  await Deno.writeFile(path, serializeXLSX(data));
  return path;
}

const SAMPLE = [
  { name: "Alice", age: 30, city: "Delhi" },
  { name: "Bob", age: 25, city: "Mumbai" },
  { name: "Charlie", age: 35, city: "Delhi" },
];

// ── queryCSV ──────────────────────────────────────────────────────────────────

Deno.test("queryCSV: load, updateOne, save, reload and verify", async () => {
  const path = await writeTempCSV(SAMPLE);
  try {
    const q = await queryCSV(path);
    q.find({ name: "Bob" }).updateOne({ $set: { city: "Bangalore" } });
    await q.save();

    const reloaded = await loadCSV(path);
    const bob = reloaded.find((d) => d.name === "Bob");
    assertEquals(bob?.city, "Bangalore");
    // Others unchanged
    const alice = reloaded.find((d) => d.name === "Alice");
    assertEquals(alice?.city, "Delhi");
  } finally {
    await Deno.remove(path);
  }
});

Deno.test("queryCSV: output path — source untouched, output has changes", async () => {
  const src = await writeTempCSV(SAMPLE);
  const out = await Deno.makeTempFile({ suffix: ".csv" });
  try {
    const q = await queryCSV(src, { output: out });
    q.find({ city: "Delhi" }).deleteMany();
    await q.save();

    // Source unchanged
    const srcDocs = await loadCSV(src);
    assertEquals(srcDocs.length, 3);

    // Output has deletions
    const outDocs = await loadCSV(out);
    assertEquals(outDocs.length, 1);
    assertEquals(outDocs[0].name, "Bob");
  } finally {
    await Deno.remove(src);
    await Deno.remove(out);
  }
});

Deno.test("queryCSVSync: load, updateMany, saveSync, reload and verify", async () => {
  const path = await writeTempCSV(SAMPLE);
  try {
    const q = queryCSVSync(path);
    q.find({ city: "Delhi" }).updateMany({ $set: { city: "New Delhi" } });
    q.saveSync();

    const reloaded = await loadCSV(path);
    const delhiDocs = reloaded.filter((d) => d.city === "New Delhi");
    assertEquals(delhiDocs.length, 2);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test("queryCSVSync: output path — source untouched", async () => {
  const src = await writeTempCSV(SAMPLE);
  const out = await Deno.makeTempFile({ suffix: ".csv" });
  try {
    const q = queryCSVSync(src, { output: out });
    q.find({ name: "Alice" }).deleteOne();
    q.saveSync();

    const srcDocs = await loadCSV(src);
    assertEquals(srcDocs.length, 3);

    const outDocs = await loadCSV(out);
    assertEquals(outDocs.length, 2);
    assertEquals(outDocs.find((d) => d.name === "Alice"), undefined);
  } finally {
    await Deno.remove(src);
    await Deno.remove(out);
  }
});

// ── queryXLSX ─────────────────────────────────────────────────────────────────

Deno.test("queryXLSX: load, deleteMany, save, reload and verify", async () => {
  const path = await writeTempXLSX(SAMPLE);
  try {
    const q = await queryXLSX(path);
    q.find({ city: "Delhi" }).deleteMany();
    await q.save();

    const reloaded = await loadXLSX(path);
    assertEquals(reloaded.length, 1);
    assertEquals(reloaded[0].name, "Bob");
  } finally {
    await Deno.remove(path);
  }
});

Deno.test("queryXLSX: output path — source untouched", async () => {
  const src = await writeTempXLSX(SAMPLE);
  const out = await Deno.makeTempFile({ suffix: ".xlsx" });
  try {
    const q = await queryXLSX(src, { output: out });
    q.find({ age: { $lt: 30 } }).deleteMany();
    await q.save();

    const srcDocs = await loadXLSX(src);
    assertEquals(srcDocs.length, 3);

    const outDocs = await loadXLSX(out);
    assertEquals(outDocs.length, 2);
    assertEquals(outDocs.find((d) => d.name === "Bob"), undefined);
  } finally {
    await Deno.remove(src);
    await Deno.remove(out);
  }
});

Deno.test("queryXLSXSync: load, updateOne, saveSync, reload and verify", async () => {
  const path = await writeTempXLSX(SAMPLE);
  try {
    const q = queryXLSXSync(path);
    q.find({ name: "Charlie" }).updateOne({ $set: { age: 40 } });
    q.saveSync();

    const reloaded = await loadXLSX(path);
    const charlie = reloaded.find((d) => d.name === "Charlie");
    assertEquals(charlie?.age, 40);
  } finally {
    await Deno.remove(path);
  }
});

// ── queryJSON ─────────────────────────────────────────────────────────────────

Deno.test("queryJSON: load, updateMany, save, reload and verify", async () => {
  const path = await writeTempJSON(SAMPLE);
  try {
    const q = await queryJSON(path);
    q.updateMany({ $set: { processed: true } });
    await q.save();

    const reloaded = await loadJSON(path);
    assertEquals(reloaded.every((d) => d.processed === true), true);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test("queryJSON: output path — source untouched, output has changes", async () => {
  const src = await writeTempJSON(SAMPLE);
  const out = await Deno.makeTempFile({ suffix: ".json" });
  try {
    const q = await queryJSON(src, { output: out });
    q.find({ city: "Mumbai" }).updateOne({ $set: { city: "Pune" } });
    await q.save();

    const srcDocs = await loadJSON(src);
    assertEquals(srcDocs.find((d) => d.name === "Bob")?.city, "Mumbai");

    const outDocs = await loadJSON(out);
    assertEquals(outDocs.find((d) => d.name === "Bob")?.city, "Pune");
  } finally {
    await Deno.remove(src);
    await Deno.remove(out);
  }
});

Deno.test("queryJSONSync: load, deleteMany, saveSync, reload and verify", async () => {
  const path = await writeTempJSON(SAMPLE);
  try {
    const q = queryJSONSync(path);
    q.find({ age: { $gte: 30 } }).deleteMany();
    q.saveSync();

    const reloaded = await loadJSON(path);
    assertEquals(reloaded.length, 1);
    assertEquals(reloaded[0].name, "Bob");
  } finally {
    await Deno.remove(path);
  }
});

// ── serializeCSV round-trip ───────────────────────────────────────────────────

Deno.test("serializeCSV: round-trip parse→serialize→re-parse preserves data", () => {
  const original = [
    { name: "Alice", age: 30, note: 'says "hello"' },
    { name: "Bob, Jr.", age: 25, note: null },
  ];
  const csv = serializeCSV(original);
  const roundTripped = parseCSV(csv);
  assertEquals(roundTripped[0].name, "Alice");
  assertEquals(roundTripped[0].age, 30);
  assertEquals(roundTripped[0].note, 'says "hello"');
  assertEquals(roundTripped[1].name, "Bob, Jr.");
  assertEquals(roundTripped[1].note, null);
});

// ── serializeJSON round-trip ──────────────────────────────────────────────────

Deno.test("serializeJSON: round-trip serialize→parse preserves data", () => {
  const json = serializeJSON(SAMPLE);
  const parsed = parseJSON(json);
  assertEquals(parsed, SAMPLE);
});

Deno.test("parseJSON: throws when root is not an array", () => {
  assertThrows(
    () => parseJSON('{"key":"value"}'),
    TypeError,
    "JSON root value must be an array",
  );
});
