import { assertEquals } from "@std/assert";
import * as XLSX from "xlsx";
import { parseXLSX, query } from "../mod.ts";

/** Build an in-memory .xlsx buffer from an array-of-arrays. */
function makeXLSX(rows: unknown[][], sheetName = "Sheet1"): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
}

// ── parseXLSX ──────────────────────────────────────────────────────────────────

Deno.test("parseXLSX: header row becomes keys", () => {
  const buf = makeXLSX([
    ["name", "age", "city"],
    ["Alice", 30, "Delhi"],
    ["Bob", 25, "Mumbai"],
  ]);
  const result = parseXLSX(buf);
  assertEquals(result.length, 2);
  assertEquals(result[0], { name: "Alice", age: 30, city: "Delhi" });
  assertEquals(result[1], { name: "Bob", age: 25, city: "Mumbai" });
});

Deno.test("parseXLSX: number cells stay as numbers", () => {
  const buf = makeXLSX([["n"], [1], [2.5], [-3]]);
  const result = parseXLSX(buf);
  assertEquals(result.map((r: Record<string, unknown>) => r.n), [1, 2.5, -3]);
});

Deno.test("parseXLSX: boolean cells stay as booleans", () => {
  const buf = makeXLSX([["active"], [true], [false]]);
  const result = parseXLSX(buf);
  assertEquals(result[0].active, true);
  assertEquals(result[1].active, false);
});

Deno.test("parseXLSX: empty cells become null", () => {
  const buf = makeXLSX([
    ["name", "city"],
    ["Alice", null],
    ["Bob", "Mumbai"],
  ]);
  const result = parseXLSX(buf);
  assertEquals(result[0].city, null);
  assertEquals(result[1].city, "Mumbai");
});

Deno.test("parseXLSX: named sheet is selected", () => {
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([["x"], [1]]);
  const ws2 = XLSX.utils.aoa_to_sheet([["y"], [99]]);
  XLSX.utils.book_append_sheet(wb, ws1, "First");
  XLSX.utils.book_append_sheet(wb, ws2, "Second");
  const buf = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
  }) as Uint8Array;

  assertEquals(parseXLSX(buf, "Second")[0].y, 99);
});

Deno.test("parseXLSX: defaults to first sheet", () => {
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([["val"], [42]]);
  const ws2 = XLSX.utils.aoa_to_sheet([["val"], [99]]);
  XLSX.utils.book_append_sheet(wb, ws1, "A");
  XLSX.utils.book_append_sheet(wb, ws2, "B");
  const buf = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
  }) as Uint8Array;

  assertEquals(parseXLSX(buf)[0].val, 42);
});

Deno.test("parseXLSX: unknown sheet name returns empty array", () => {
  const buf = makeXLSX([["name"], ["Alice"]]);
  assertEquals(parseXLSX(buf, "NoSuchSheet"), []);
});

Deno.test("parseXLSX: empty sheet returns empty array", () => {
  const buf = makeXLSX([]);
  assertEquals(parseXLSX(buf), []);
});

Deno.test("parseXLSX: result is queryable with query()", () => {
  const buf = makeXLSX([
    ["name", "age", "city"],
    ["Alice", 30, "Delhi"],
    ["Bob", 25, "Mumbai"],
    ["Charlie", 35, "Delhi"],
  ]);
  const docs = parseXLSX(buf);
  const result = query(docs).find({ city: "Delhi" }).sort({ age: 1 })
    .toArray() as Record<string, unknown>[];
  assertEquals(result.length, 2);
  assertEquals(result[0].name, "Alice");
  assertEquals(result[1].name, "Charlie");
});
