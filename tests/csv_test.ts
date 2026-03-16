import { assertEquals } from "@std/assert";
import { parseCSV, query } from "../mod.ts";

Deno.test("parseCSV: basic parsing with type coercion", () => {
  const csv = `name,age,active,score
Alice,30,true,9.5
Bob,25,false,7.0`;
  const result = parseCSV(csv);
  assertEquals(result, [
    { name: "Alice", age: 30, active: true, score: 9.5 },
    { name: "Bob", age: 25, active: false, score: 7.0 },
  ]);
});

Deno.test("parseCSV: empty fields become null", () => {
  const csv = `name,city
Alice,
Bob,Mumbai`;
  const result = parseCSV(csv);
  assertEquals(result[0].city, null);
  assertEquals(result[1].city, "Mumbai");
});

Deno.test("parseCSV: quoted fields with commas", () => {
  const csv = `name,address
Alice,"123 Main St, Delhi"
Bob,Mumbai`;
  const result = parseCSV(csv);
  assertEquals(result[0].address, "123 Main St, Delhi");
});

Deno.test("parseCSV: quoted fields with escaped quotes", () => {
  const csv = `name,note
Alice,"says ""hello"""`;
  const result = parseCSV(csv);
  assertEquals(result[0].note, `says "hello"`);
});

Deno.test("parseCSV: empty input returns empty array", () => {
  assertEquals(parseCSV(""), []);
  assertEquals(parseCSV("   \n  "), []);
});

Deno.test("parseCSV: CRLF line endings", () => {
  const csv = "name,age\r\nAlice,30\r\nBob,25";
  const result = parseCSV(csv);
  assertEquals(result.length, 2);
  assertEquals(result[0], { name: "Alice", age: 30 });
});

Deno.test("parseCSV: queryable with query()", () => {
  const csv = `name,age,city
Alice,30,Delhi
Bob,25,Mumbai
Charlie,35,Delhi`;
  const docs = parseCSV(csv);
  const result = query(docs).find({ city: "Delhi" }).sort({ age: 1 }).toArray();
  assertEquals(result.length, 2);
  assertEquals(result[0].name, "Alice");
  assertEquals(result[1].name, "Charlie");
});
