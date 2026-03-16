# @akash1047/data-query

A MongoDB/Mongoose-style fluent query API for in-memory JavaScript arrays, with
optional persistence to CSV, XLSX, JSON, and Google Sheets.

```ts
import { queryCSV } from "@akash1047/data-query";

const q = await queryCSV("./users.csv");

q.find({ city: "Delhi", age: { $gte: 18 } })
  .sort({ age: -1 })
  .limit(10)
  .toArray();

q.find({ active: false }).updateMany({ $set: { active: true } });

await q.save(); // writes back to disk
```

---

## Table of Contents

- [Installation](#installation)
- [Core concepts](#core-concepts)
- [In-memory queries](#in-memory-queries)
  - [Chain methods](#chain-methods)
  - [Read terminals](#read-terminals)
  - [Write terminals](#write-terminals)
  - [Aggregation pipeline](#aggregation-pipeline)
- [File adapters](#file-adapters)
  - [CSV](#csv)
  - [XLSX](#xlsx)
  - [JSON](#json)
  - [Google Apps Script](#google-apps-script)
- [Zod schema validation](#zod-schema-validation)
- [Filter operators](#filter-operators)
- [Update operators](#update-operators)
- [TypeScript](#typescript)
- [API reference](#api-reference)

---

## Installation

**Deno (JSR)**

```ts
import { query, queryCSV } from "jsr:@akash1047/data-query";
```

**Deno (import map / `deno.json`)**

```json
{
  "imports": {
    "@akash1047/data-query": "jsr:@akash1047/data-query"
  }
}
```

---

## Core concepts

The library has two classes:

| Class              | When to use                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DataQuery<T>`     | Querying and mutating an **existing in-memory array**. No file I/O.                                                                                       |
| `FileDataQuery<T>` | Same as above, but also knows how to **persist** the array back to a file or sheet via `.save()` / `.saveSync()`. Returned by all file factory functions. |

Every operation is **lazy** — chain methods accumulate state, terminal methods
execute. Each chain starts fresh; calling `.find()` twice on the same instance
ANDs the filters together.

---

## In-memory queries

Use `query()` to wrap any existing array:

```ts
import { query } from "@akash1047/data-query";

const users = [
  { name: "Alice", age: 30, city: "Delhi", active: true },
  { name: "Bob", age: 17, city: "Mumbai", active: false },
  { name: "Eve", age: 25, city: "Delhi", active: true },
];

query(users)
  .find({ city: "Delhi", age: { $gte: 18 } })
  .sort({ age: -1 })
  .toArray();
// → [{ name: "Eve", ... }, { name: "Alice", ... }]
```

### Chain methods

| Method            | Description                                            |
| ----------------- | ------------------------------------------------------ |
| `.find(filter?)`  | Add a filter condition. Multiple calls are AND-ed.     |
| `.filter(filter)` | Alias for `.find()`.                                   |
| `.sort(spec)`     | Sort by fields. `1` = ascending, `-1` = descending.    |
| `.limit(n)`       | Return at most `n` documents.                          |
| `.skip(n)`        | Skip the first `n` matching documents.                 |
| `.project(spec)`  | Include (`1`) or exclude (`0`) fields from the output. |

```ts
query(users)
  .find({ active: true })
  .sort({ age: 1 })
  .skip(1)
  .limit(5)
  .project({ name: 1, age: 1 }) // include only name and age
  .toArray();
```

### Read terminals

| Method            | Returns     | Description                                    |
| ----------------- | ----------- | ---------------------------------------------- |
| `.toArray()`      | `T[]`       | All matching documents.                        |
| `.first()`        | `T \| null` | First match, or `null`.                        |
| `.count()`        | `number`    | Count of matches (ignores sort/limit/skip).    |
| `.distinct(path)` | `unknown[]` | Unique values for a field path across matches. |

```ts
query(users).find({ active: true }).count(); // 2
query(users).distinct("city"); // ["Delhi", "Mumbai"]
query(users).find({ city: "Delhi" }).distinct("age"); // [30, 25]
```

Dot-notation is supported everywhere a field path is accepted:

```ts
query(orders).find({ "address.city": "Delhi" }).toArray();
query(orders).sort({ "address.zip": 1 }).toArray();
```

### Write terminals

Write operations **mutate the source array in place** and return a result
object.

| Method                | Returns        | Description                         |
| --------------------- | -------------- | ----------------------------------- |
| `.updateOne(update)`  | `UpdateResult` | Update the first matching document. |
| `.updateMany(update)` | `UpdateResult` | Update all matching documents.      |
| `.deleteOne()`        | `DeleteResult` | Remove the first matching document. |
| `.deleteMany()`       | `DeleteResult` | Remove all matching documents.      |

```ts
// UpdateResult: { matchedCount: number, modifiedCount: number }
query(users).find({ name: "Alice" }).updateOne({ $set: { city: "Mumbai" } });

// DeleteResult: { deletedCount: number }
query(users).find({ active: false }).deleteMany();
```

### Aggregation pipeline

The `.aggregate()` terminal runs a MongoDB-style pipeline over the source array.
Chain methods (`.find()`, `.sort()`, etc.) are **ignored** — use `$match` as the
first stage instead.

```ts
query(orders).aggregate([
  { $match: { status: "shipped" } },
  {
    $group: {
      _id: "region",
      total: { $sum: "amount" },
      count: { $count: true },
    },
  },
  { $sort: { total: -1 } },
  { $limit: 5 },
]);
```

**Supported stages:**

| Stage        | Description                                           |
| ------------ | ----------------------------------------------------- |
| `$match`     | Filter documents (same syntax as `.find()`).          |
| `$sort`      | Sort documents.                                       |
| `$limit`     | Keep first N documents.                               |
| `$skip`      | Skip first N documents.                               |
| `$project`   | Include / exclude fields.                             |
| `$group`     | Group and compute accumulators.                       |
| `$unwind`    | Flatten an array field into one document per element. |
| `$addFields` | Add or overwrite fields with literals or expressions. |

**`$group` accumulators:** `$count`, `$sum`, `$avg`, `$min`, `$max`, `$push`,
`$first`, `$last`

```ts
query(sales).aggregate([
  {
    $group: {
      _id: "category",
      revenue: { $sum: "price" },
      avgPrice: { $avg: "price" },
      items: { $push: "name" },
    },
  },
]);
```

**`$addFields` expressions:**

```ts
query(products).aggregate([
  { $addFields: { discounted: { $multiply: ["$price", 0.9] } } },
]);
```

---

## File adapters

All file factory functions return a `FileDataQuery` with `.save()` and
`.saveSync()` in addition to the full query API.

### CSV

```ts
import {
  parseCSV,
  queryCSV,
  queryCSVSync,
  serializeCSV,
} from "@akash1047/data-query";

// Async factory — load, mutate, save
const q = await queryCSV("./data.csv");
q.find({ active: false }).deleteMany();
await q.save(); // overwrites ./data.csv

// Write to a different path
const q2 = await queryCSV("./data.csv", { output: "./data-clean.csv" });
await q2.save(); // writes ./data-clean.csv; source untouched

// Sync variant
const q3 = queryCSVSync("./data.csv");
q3.find({ score: { $lt: 50 } }).updateMany({ $set: { score: 50 } });
q3.saveSync();
```

CSV values are auto-coerced on load: numbers, booleans, empty string → `null`,
otherwise string.

Low-level helpers if you need to parse/serialize without a `FileDataQuery`:

```ts
const docs = parseCSV("name,age\nAlice,30\nBob,25");
const csv = serializeCSV(docs);
```

### XLSX

```ts
import { queryXLSX, queryXLSXSync } from "@akash1047/data-query";

const q = await queryXLSX("./report.xlsx");
const q2 = await queryXLSX("./report.xlsx", {
  sheetName: "Sales", // defaults to first sheet
  output: "./report-out.xlsx",
});

await q2.save();

// Sync
const q3 = queryXLSXSync("./report.xlsx", { sheetName: "Q1" });
q3.saveSync();
```

Cell types (number, boolean, string) are preserved as-is. Empty cells become
`null`.

### JSON

```ts
import { queryJSON, queryJSONSync } from "@akash1047/data-query";

// JSON file must contain a root array
const q = await queryJSON("./users.json");
q.find({ role: "guest" }).updateMany({ $set: { role: "user" } });
await q.save(); // pretty-printed JSON

const q2 = queryJSONSync("./users.json", { output: "./users-backup.json" });
q2.saveSync();
```

### Google Apps Script

Use `queryGASSheet` inside a Google Apps Script project (deployed via
[clasp](https://github.com/google/clasp)). The `GASSheet` interface is
duck-typed — the real `SpreadsheetApp.Sheet` satisfies it automatically.

```ts
import { queryGASSheet } from "@akash1047/data-query";

function updateBudgets() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Budget")!;
  const q = queryGASSheet(sheet);

  q.find({ budget: { $lt: 1000 } }).updateMany({ $set: { budget: 1000 } });
  q.saveSync(); // writes headers + data rows back to the sheet
}
```

Row 1 of the sheet is always treated as the header row. On save, the sheet is
fully cleared and rewritten (content only, not formatting).

---

## Zod schema validation

All factory functions accept an optional `schema` option. When provided:

- **On load** — every row is validated; throws on the first failure with the row
  index.
- **On update** — `updateOne` / `updateMany` re-validate all docs after a
  successful mutation.
- **On save** — data is validated before writing to disk/sheet.

The return type is narrowed from `FileDataQuery<Record<string, unknown>>` to
`FileDataQuery<T>`.

```ts
import { z } from "zod";
import { queryCSV } from "@akash1047/data-query";

const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  city: z.string(),
});

const q = await queryCSV("./users.csv", { schema: UserSchema });
// q is FileDataQuery<{ name: string; age: number; city: string }>

q.find({ city: "Delhi" }).updateOne({ $set: { city: "New Delhi" } });
// ↑ validates all docs after mutation

await q.save();
// ↑ validates again before writing
```

Error format: `Validation failed at row <i>: <zod message>`

Zod is **not** a runtime dependency of the library — only `import type` is used
internally. Add Zod to your own project as needed.

---

## Filter operators

### Comparison

| Operator                     | Meaning               |
| ---------------------------- | --------------------- |
| `{ field: value }`           | Implicit `$eq`        |
| `{ field: { $eq: value } }`  | Equal                 |
| `{ field: { $ne: value } }`  | Not equal             |
| `{ field: { $gt: value } }`  | Greater than          |
| `{ field: { $gte: value } }` | Greater than or equal |
| `{ field: { $lt: value } }`  | Less than             |
| `{ field: { $lte: value } }` | Less than or equal    |
| `{ field: { $in: [...] } }`  | Value is in array     |
| `{ field: { $nin: [...] } }` | Value is not in array |

### Logical

```ts
{
  $and: [{ age: { $gte: 18 } }, { active: true }];
}
{
  $or: [{ city: "Delhi" }, { city: "Mumbai" }];
}
{
  $nor: [{ role: "guest" }, { banned: true }];
}
{
  $not: {
    city: "Delhi";
  }
}
```

### Element / type

```ts
{
  address: {
    $exists: true;
  }
} // field must be present
{
  age: {
    $type: "number";
  }
} // JS typeof check ("array" and "null" also supported)
{
  n: {
    $mod: [2, 0];
  }
} // n % 2 === 0 (even numbers)
```

### String

```ts
{
  name: {
    $regex: /^ali/i;
  }
} // RegExp instance
{
  name: {
    $regex: "^ali";
  }
} // string pattern
```

### Array

```ts
{
  tags: {
    $size: 3;
  }
} // array has exactly 3 elements
{
  tags: {
    $all: ["admin", "user"];
  }
}
{
  scores: {
    $elemMatch: {
      $gt: 90;
    }
  }
}
```

---

## Update operators

| Operator    | Description                                                 |
| ----------- | ----------------------------------------------------------- |
| `$set`      | Set field values (dot-notation supported)                   |
| `$unset`    | Remove fields                                               |
| `$inc`      | Increment numeric fields (negative to decrement)            |
| `$mul`      | Multiply a numeric field                                    |
| `$push`     | Append a value to an array field (creates array if missing) |
| `$pull`     | Remove matching elements from an array field                |
| `$addToSet` | Append only if value is not already present                 |
| `$pop`      | Remove first (`-1`) or last (`1`) array element             |
| `$rename`   | Rename a field                                              |

```ts
query(users).find({ name: "Alice" }).updateOne({
  $set: { city: "Mumbai", "address.zip": "400001" },
  $inc: { age: 1 },
  $push: { tags: "vip" },
  $unset: { tempField: "" },
});
```

---

## TypeScript

The library is fully typed. `DataQuery<T>` and `FileDataQuery<T>` are generic
over the document shape. When using in-memory arrays, `T` is inferred from the
array element type. When using file factories without a schema, `T` is
`Record<string, unknown>`. With a Zod schema, `T` is inferred from the schema.

```ts
interface User {
  name:   string;
  age:    number;
  active: boolean;
}

const users: User[] = [...];

// T inferred as User — full autocomplete on filter/update fields
query(users).find({ age: { $gte: 18 } }).toArray(); // User[]

// T inferred from Zod schema
const UserSchema = z.object({ name: z.string(), age: z.number() });
const q = await queryCSV("./users.csv", { schema: UserSchema });
q.toArray(); // { name: string; age: number }[]
```

Key exported types: `FilterQuery<T>`, `UpdateQuery<T>`, `SortQuery<T>`,
`ProjectQuery<T>`, `PipelineStage`, `UpdateResult`, `DeleteResult`,
`PersistenceAdapter`, `GASSheet`.

---

## API reference

### `query(data)`

Creates a `DataQuery<T>` wrapping an existing array. The array is used directly
— reads copy from it, writes mutate it in place.

### `queryCSV(path, opts?)` / `queryCSVSync(path, opts?)`

Load a CSV file and return a `FileDataQuery`. Options: `output?: string`,
`schema?: ZodType<T>`.

### `queryXLSX(path, opts?)` / `queryXLSXSync(path, opts?)`

Load an XLSX file and return a `FileDataQuery`. Options: `output?: string`,
`sheetName?: string`, `schema?: ZodType<T>`.

### `queryJSON(path, opts?)` / `queryJSONSync(path, opts?)`

Load a JSON array file and return a `FileDataQuery`. Options: `output?: string`,
`schema?: ZodType<T>`.

### `queryGASSheet(sheet, opts?)`

Wrap a Google Apps Script `Sheet` and return a `FileDataQuery`. Options:
`schema?: ZodType<T>`.

### `parseCSV(text)` / `serializeCSV(data)`

Low-level CSV parse and serialize helpers.

### `parseXLSX(buffer, sheetName?)` / `serializeXLSX(data, sheetName?)`

Low-level XLSX parse and serialize helpers.

### `parseJSON(text)` / `serializeJSON(data)`

Low-level JSON parse and serialize helpers.
