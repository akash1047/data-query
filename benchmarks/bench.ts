/**
 * Benchmarks for data-query core operations.
 *
 * Run with:
 *   deno task bench
 *   deno bench benchmarks/
 */

import { parseCSV, query } from "../mod.ts";

// ── Fixture ────────────────────────────────────────────────────────────────────

interface Doc {
  id: number;
  name: string;
  age: number;
  city: string;
  active: boolean;
  score: number;
  tags: string[];
  address: { zip: string; country: string };
}

const CITIES = ["Delhi", "Mumbai", "Bangalore", "Chennai", "Hyderabad"];
const TAGS = ["admin", "user", "moderator", "editor", "viewer"];

function makeDataset(n: number): Doc[] {
  const docs: Doc[] = [];
  for (let i = 0; i < n; i++) {
    docs.push({
      id: i,
      name: `User${i}`,
      age: 18 + (i % 50),
      city: CITIES[i % CITIES.length],
      active: i % 3 !== 0,
      score: Math.round((i % 100) * 1.5),
      tags: TAGS.slice(0, (i % TAGS.length) + 1),
      address: { zip: `${100000 + i}`, country: i % 2 === 0 ? "IN" : "US" },
    });
  }
  return docs;
}

const SMALL = makeDataset(100);
const MEDIUM = makeDataset(1_000);
const LARGE = makeDataset(10_000);

// Re-create data inside each bench to avoid cross-bench mutation
function _small() {
  return makeDataset(100);
}
function medium() {
  return makeDataset(1_000);
}
function _large() {
  return makeDataset(10_000);
}

// ── Filter ─────────────────────────────────────────────────────────────────────

Deno.bench("find $eq — 100 docs", () => {
  query(SMALL).find({ city: "Delhi" }).toArray();
});

Deno.bench("find $eq — 1k docs", () => {
  query(MEDIUM).find({ city: "Delhi" }).toArray();
});

Deno.bench("find $eq — 10k docs", () => {
  query(LARGE).find({ city: "Delhi" }).toArray();
});

Deno.bench("find $gt — 10k docs", () => {
  query(LARGE).find({ age: { $gt: 40 } }).toArray();
});

Deno.bench("find $in — 10k docs", () => {
  query(LARGE).find({ city: { $in: ["Delhi", "Mumbai"] } }).toArray();
});

Deno.bench("find $regex — 10k docs", () => {
  query(LARGE).find({ name: { $regex: /^User5/ } }).toArray();
});

Deno.bench("find dot-notation — 10k docs", () => {
  query(LARGE).find({ "address.country": "IN" }).toArray();
});

Deno.bench("find $and — 10k docs", () => {
  query(LARGE).find({ $and: [{ active: true }, { age: { $gte: 30 } }] })
    .toArray();
});

Deno.bench("find $elemMatch — 10k docs", () => {
  query(LARGE).find({ tags: { $elemMatch: { $eq: "admin" } } }).toArray();
});

// ── Sort ───────────────────────────────────────────────────────────────────────

Deno.bench("sort ascending — 1k docs", () => {
  query(MEDIUM).sort({ age: 1 }).toArray();
});

Deno.bench("sort ascending — 10k docs", () => {
  query(LARGE).sort({ age: 1 }).toArray();
});

Deno.bench("sort multi-field — 10k docs", () => {
  query(LARGE).sort({ city: 1, age: -1 }).toArray();
});

// ── Skip / Limit ───────────────────────────────────────────────────────────────

Deno.bench("skip + limit (pagination) — 10k docs", () => {
  query(LARGE).skip(500).limit(20).toArray();
});

// ── Projection ─────────────────────────────────────────────────────────────────

Deno.bench("project inclusion — 10k docs", () => {
  query(LARGE).project({ name: 1, age: 1, city: 1 }).toArray();
});

Deno.bench("project exclusion — 10k docs", () => {
  query(LARGE).project({ tags: 0, address: 0 }).toArray();
});

// ── Chained pipeline ───────────────────────────────────────────────────────────

Deno.bench("find + sort + skip + limit + project — 10k docs", () => {
  query(LARGE)
    .find({ active: true })
    .sort({ score: -1 })
    .skip(10)
    .limit(20)
    .project({ name: 1, score: 1 })
    .toArray();
});

// ── count / first / distinct ───────────────────────────────────────────────────

Deno.bench("count — 10k docs", () => {
  query(LARGE).find({ active: true }).count();
});

Deno.bench("first — 10k docs", () => {
  query(LARGE).find({ city: "Chennai" }).first();
});

Deno.bench("distinct — 10k docs", () => {
  query(LARGE).distinct("city");
});

// ── Write operations ───────────────────────────────────────────────────────────

Deno.bench("updateOne $set — 1k docs", () => {
  const data = medium();
  query(data).find({ id: 500 }).updateOne({ $set: { active: false } });
});

Deno.bench("updateMany $inc — 1k docs", () => {
  const data = medium();
  query(data).find({ active: true }).updateMany({ $inc: { age: 1 } });
});

Deno.bench("deleteOne — 1k docs", () => {
  const data = medium();
  query(data).find({ id: 500 }).deleteOne();
});

Deno.bench("deleteMany — 1k docs", () => {
  const data = medium();
  query(data).find({ active: false }).deleteMany();
});

// ── Aggregation ────────────────────────────────────────────────────────────────

Deno.bench("aggregate $match + $group $count — 1k docs", () => {
  query(MEDIUM).aggregate([
    { $match: { active: true } },
    { $group: { _id: "city", count: { $count: true } } },
  ]);
});

Deno.bench("aggregate $match + $group $count — 10k docs", () => {
  query(LARGE).aggregate([
    { $match: { active: true } },
    { $group: { _id: "city", count: { $count: true } } },
  ]);
});

Deno.bench("aggregate $group $avg + $sum — 10k docs", () => {
  query(LARGE).aggregate([
    {
      $group: {
        _id: "city",
        avgAge: { $avg: "age" },
        totalScore: { $sum: "score" },
      },
    },
  ]);
});

Deno.bench("aggregate $unwind — 1k docs", () => {
  query(MEDIUM).aggregate([
    { $unwind: "tags" },
  ]);
});

Deno.bench("aggregate $addFields $multiply — 10k docs", () => {
  query(LARGE).aggregate([
    { $addFields: { weighted: { $multiply: ["$score", "$age"] } } },
  ]);
});

Deno.bench("aggregate multi-stage pipeline — 10k docs", () => {
  query(LARGE).aggregate([
    { $match: { active: true } },
    { $sort: { score: -1 } },
    { $skip: 100 },
    { $limit: 500 },
    {
      $group: {
        _id: "city",
        topScore: { $max: "score" },
        count: { $count: true },
      },
    },
    { $sort: { topScore: -1 } },
  ]);
});

// ── CSV ────────────────────────────────────────────────────────────────────────

function makeCSV(rows: number): string {
  const lines = ["id,name,age,city,active,score"];
  for (let i = 0; i < rows; i++) {
    lines.push(
      `${i},User${i},${18 + (i % 50)},${CITIES[i % CITIES.length]},${i % 3 !== 0},${i % 100}`,
    );
  }
  return lines.join("\n");
}

const CSV_1K = makeCSV(1_000);
const CSV_10K = makeCSV(10_000);

Deno.bench("parseCSV — 1k rows", () => {
  parseCSV(CSV_1K);
});

Deno.bench("parseCSV — 10k rows", () => {
  parseCSV(CSV_10K);
});
