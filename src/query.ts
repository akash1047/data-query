/**
 * Core `DataQuery<T>` class and `query()` factory function.
 *
 * `DataQuery` wraps an existing array and exposes a fluent, chainable API
 * modelled after MongoDB/Mongoose queries.  Methods are split into two groups:
 *
 * **Lazy chain methods** — accumulate state but do not execute immediately:
 *   `find`, `filter`, `sort`, `limit`, `skip`, `project`
 *
 * **Terminal methods** — trigger execution and return a result:
 *   - Reads    : `toArray`, `first`, `count`
 *   - Writes   : `updateOne`, `updateMany`, `deleteOne`, `deleteMany`
 *   - Aggregate: `aggregate`
 *
 * @example
 * ```ts
 * import { query } from "@akash1047/data-query";
 *
 * const users = [
 *   { name: "Alice", age: 30, city: "Delhi" },
 *   { name: "Bob",   age: 25, city: "Mumbai" },
 * ];
 *
 * const result = query(users)
 *   .find({ city: "Delhi" })
 *   .sort({ age: -1 })
 *   .limit(10)
 *   .toArray();
 * ```
 */

import type { ZodType } from "zod";
import type {
  DeleteResult,
  FilterQuery,
  PersistenceAdapter,
  PipelineStage,
  ProjectQuery,
  SortQuery,
  UpdateQuery,
  UpdateResult,
} from "./types.ts";
import { matchesFilter } from "./filter.ts";
import { applyUpdate } from "./update.ts";
import { executePipeline, executeProject } from "./aggregate.ts";
import { getNestedValue } from "./utils.ts";

type AnyDoc = Record<string, unknown>;

/**
 * A lazy query builder that wraps an in-memory array of documents.
 *
 * @typeParam T - The shape of each document. Must extend `object`.
 *                TypeScript interfaces (without an index signature) are supported.
 */
export class DataQuery<T extends object> {
  /** The original array — reads copy from it, writes mutate it. */
  readonly #source: T[];

  /** Active filter; multiple `.find()` calls are merged with `$and`. */
  #filter: FilterQuery<T> | null = null;

  /** Active sort specification. */
  #sortSpec: SortQuery<T> | null = null;

  /** Maximum number of documents to return. */
  #limitVal: number | null = null;

  /** Number of documents to skip before returning results. */
  #skipVal: number | null = null;

  /** Active projection specification. */
  #projectSpec: ProjectQuery<T> | null = null;

  constructor(data: T[]) {
    this.#source = data;
  }

  // ── Lazy chain methods ────────────────────────────────────────────────────

  /**
   * Add a filter condition. Multiple calls are AND-ed together.
   *
   * Supports all MongoDB-style operators: `$eq`, `$gt`, `$in`, `$regex`,
   * `$exists`, `$elemMatch`, `$and`, `$or`, `$nor`, `$not`, and more.
   * Dot-notation keys (e.g. `"address.city"`) are supported.
   *
   * @example
   * ```ts
   * query(data).find({ age: { $gte: 18 }, "address.city": "Delhi" })
   * ```
   */
  find(filter?: FilterQuery<T>): this {
    if (!filter) return this;
    if (!this.#filter) {
      this.#filter = filter;
    } else {
      // Merge with the previous filter via $and so both conditions must hold
      this.#filter = {
        $and: [
          this.#filter as FilterQuery<AnyDoc>,
          filter as FilterQuery<AnyDoc>,
        ],
      } as unknown as FilterQuery<T>;
    }
    return this;
  }

  /**
   * Alias for `find()`. Provided for ergonomic use in pipeline-style code.
   *
   * @example
   * ```ts
   * query(data).filter({ active: true }).toArray()
   * ```
   */
  filter(filter: FilterQuery<T>): this {
    return this.find(filter);
  }

  /**
   * Sort results by one or more fields.
   * `1` = ascending, `-1` = descending.
   * Fields are sorted in the order they appear in the spec object.
   *
   * @example
   * ```ts
   * query(data).sort({ age: -1, name: 1 })
   * ```
   */
  sort(spec: SortQuery<T>): this {
    this.#sortSpec = spec;
    return this;
  }

  /**
   * Return at most `n` documents.
   *
   * @example
   * ```ts
   * query(data).find({ active: true }).limit(5).toArray()
   * ```
   */
  limit(n: number): this {
    this.#limitVal = n;
    return this;
  }

  /**
   * Skip the first `n` matching documents before returning results.
   * Useful for pagination in combination with `.limit()`.
   *
   * @example
   * ```ts
   * // Page 2 with 10 items per page
   * query(data).skip(10).limit(10).toArray()
   * ```
   */
  skip(n: number): this {
    this.#skipVal = n;
    return this;
  }

  /**
   * Reshape output documents by including or excluding fields.
   *
   * - **Inclusion** (`1`): output contains only the listed fields.
   * - **Exclusion** (`0`): output contains all fields except the listed ones.
   * - Mixing `1` and `0` throws a `TypeError` at execution time.
   *
   * @example
   * ```ts
   * query(data).project({ name: 1, age: 1 })   // inclusion
   * query(data).project({ password: 0 })        // exclusion
   * ```
   */
  project(spec: ProjectQuery<T>): this {
    this.#projectSpec = spec;
    return this;
  }

  // ── Terminal read methods ────────────────────────────────────────────────

  /**
   * Execute the query and return all matching documents as an array.
   * The source array is never mutated.
   */
  toArray(): T[] {
    return this.#execute();
  }

  /**
   * Execute the query and return the first matching document, or `null`
   * if no document satisfies the filter.
   */
  first(): T | null {
    const prev = this.#limitVal;
    this.#limitVal = 1;
    const result = this.#execute();
    this.#limitVal = prev;
    return result[0] ?? null;
  }

  /**
   * Count the number of documents that match the current filter.
   * Sort, skip, limit, and project are ignored.
   */
  count(): number {
    return this.#applyFilter([...this.#source]).length;
  }

  /**
   * Return an array of unique values for the given field path across all matching documents.
   * Documents where the field is `undefined` are silently skipped.
   * The filter accumulated via `.find()` / `.filter()` is applied; sort/limit/skip are ignored.
   *
   * Dot-notation paths (e.g. `"address.city"`) are supported.
   *
   * @param path - The field path to collect distinct values from.
   *
   * @example
   * ```ts
   * query(users).find({ active: true }).distinct("city")
   * // → ["Delhi", "Mumbai"]
   * ```
   */
  distinct(path: string): unknown[] {
    const docs = this.#applyFilter([...this.#source]);
    const seen = new Set<unknown>();
    for (const doc of docs) {
      const val = getNestedValue(doc as AnyDoc, path);
      if (val !== undefined) seen.add(val);
    }
    return [...seen];
  }

  // ── Terminal write methods ────────────────────────────────────────────────

  /**
   * Update the **first** document that matches the current filter, in source order.
   * Mutations are applied in place on the source array.
   *
   * @returns An object with `matchedCount` and `modifiedCount`.
   *
   * @example
   * ```ts
   * query(data).find({ name: "Alice" }).updateOne({ $set: { city: "Mumbai" } })
   * ```
   */
  updateOne(update: UpdateQuery<T>): UpdateResult {
    let matchedCount = 0;
    let modifiedCount = 0;
    for (const doc of this.#source) {
      if (this.#filter && !matchesFilter(doc, this.#filter)) continue;
      matchedCount++;
      if (applyUpdate(doc, update)) modifiedCount++;
      break; // Only the first match
    }
    return { matchedCount, modifiedCount };
  }

  /**
   * Update **all** documents that match the current filter.
   * Mutations are applied in place on the source array.
   *
   * @returns An object with `matchedCount` and `modifiedCount`.
   *
   * @example
   * ```ts
   * query(data).find({ active: false }).updateMany({ $set: { active: true } })
   * ```
   */
  updateMany(update: UpdateQuery<T>): UpdateResult {
    let matchedCount = 0;
    let modifiedCount = 0;
    for (const doc of this.#source) {
      if (this.#filter && !matchesFilter(doc, this.#filter)) continue;
      matchedCount++;
      if (applyUpdate(doc, update)) modifiedCount++;
    }
    return { matchedCount, modifiedCount };
  }

  /**
   * Remove the **first** document that matches the current filter from the source array.
   *
   * @returns `{ deletedCount: 1 }` if a document was removed, `{ deletedCount: 0 }` otherwise.
   *
   * @example
   * ```ts
   * query(data).find({ name: "Alice" }).deleteOne()
   * ```
   */
  deleteOne(): DeleteResult {
    for (let i = 0; i < this.#source.length; i++) {
      if (this.#filter && !matchesFilter(this.#source[i], this.#filter)) {
        continue;
      }
      this.#source.splice(i, 1);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  /**
   * Remove **all** documents that match the current filter from the source array.
   * Indices are collected first and then spliced in descending order to avoid
   * offset shifting during removal.
   *
   * If no filter is set, all documents are removed.
   *
   * @returns `{ deletedCount: n }` with the number of removed documents.
   *
   * @example
   * ```ts
   * query(data).find({ active: false }).deleteMany()
   * ```
   */
  deleteMany(): DeleteResult {
    const indices: number[] = [];
    for (let i = 0; i < this.#source.length; i++) {
      if (!this.#filter || matchesFilter(this.#source[i], this.#filter)) {
        indices.push(i);
      }
    }
    // Splice in descending index order so earlier indices stay valid
    for (let j = indices.length - 1; j >= 0; j--) {
      this.#source.splice(indices[j], 1);
    }
    return { deletedCount: indices.length };
  }

  // ── Terminal aggregation ──────────────────────────────────────────────────

  /**
   * Run a MongoDB-style aggregation pipeline over the source array.
   *
   * The pipeline is **self-contained** — any filter, sort, or limit accumulated
   * via chain methods is ignored. Use a `$match` stage as the first pipeline
   * stage to filter documents, matching MongoDB semantics.
   *
   * @returns An array of plain objects produced by the final pipeline stage.
   *
   * @example
   * ```ts
   * query(data).aggregate([
   *   { $match:  { active: true } },
   *   { $group:  { _id: "city", count: { $count: true } } },
   *   { $sort:   { count: -1 } },
   * ]);
   * ```
   */
  aggregate(pipeline: PipelineStage[]): AnyDoc[] {
    return executePipeline(this.#source as unknown as AnyDoc[], pipeline);
  }

  // ── Private execution helpers ────────────────────────────────────────────

  /** Filter the working set using the accumulated `#filter`. */
  #applyFilter(data: T[]): T[] {
    if (!this.#filter) return data;
    return data.filter((doc) => matchesFilter(doc, this.#filter!));
  }

  /** Sort the working set using the accumulated `#sortSpec`. Mutates `data` in place. */
  #applySort(data: T[]): T[] {
    if (!this.#sortSpec) return data;
    const spec = this.#sortSpec;
    data.sort((a, b) => {
      for (const [path, dir] of Object.entries(spec)) {
        const aVal = getNestedValue(a as AnyDoc, path);
        const bVal = getNestedValue(b as AnyDoc, path);
        if ((aVal as number) < (bVal as number)) return -1 * (dir as number);
        if ((aVal as number) > (bVal as number)) return 1 * (dir as number);
      }
      return 0;
    });
    return data;
  }

  /**
   * Execute the full read pipeline:
   * copy → filter → sort → skip → limit → project
   */
  #execute(): T[] {
    let working: T[] = [...this.#source]; // never mutate the source
    working = this.#applyFilter(working);
    working = this.#applySort(working);
    if (this.#skipVal !== null) working = working.slice(this.#skipVal);
    if (this.#limitVal !== null) working = working.slice(0, this.#limitVal);
    if (this.#projectSpec) {
      working = executeProject(
        working as unknown as AnyDoc[],
        this.#projectSpec as ProjectQuery<AnyDoc>,
      ) as unknown as T[];
    }
    return working;
  }
}

/**
 * A `DataQuery` subclass that pairs the in-memory array with a
 * `PersistenceAdapter`, enabling `.save()` / `.saveSync()` after mutations.
 *
 * Use the format-specific factory functions (`queryCSV`, `queryXLSX`,
 * `queryJSON`) rather than constructing this class directly.
 *
 * @typeParam T - The shape of each document. Must extend `object`.
 */
export class FileDataQuery<T extends object> extends DataQuery<T> {
  readonly #data: T[];
  readonly #adapter: PersistenceAdapter;
  readonly #schema: ZodType<T> | undefined;

  constructor(data: T[], adapter: PersistenceAdapter, schema?: ZodType<T>) {
    super(data);
    this.#data = data;
    this.#adapter = adapter;
    this.#schema = schema;
  }

  #validate(): void {
    if (!this.#schema) return;
    for (let i = 0; i < this.#data.length; i++) {
      const result = this.#schema.safeParse(this.#data[i]);
      if (!result.success) {
        throw new Error(
          `Validation failed at row ${i}: ${result.error.message}`,
        );
      }
    }
  }

  override updateOne(update: UpdateQuery<T>): UpdateResult {
    const result = super.updateOne(update);
    if (this.#schema && result.modifiedCount > 0) this.#validate();
    return result;
  }

  override updateMany(update: UpdateQuery<T>): UpdateResult {
    const result = super.updateMany(update);
    if (this.#schema && result.modifiedCount > 0) this.#validate();
    return result;
  }

  /**
   * Persist the current (possibly mutated) document array using the adapter.
   */
  async save(): Promise<void> {
    this.#validate();
    await this.#adapter.save(
      this.#data as unknown as Record<string, unknown>[],
    );
  }

  /**
   * Synchronously persist the current document array using the adapter.
   */
  saveSync(): void {
    this.#validate();
    this.#adapter.saveSync(this.#data as unknown as Record<string, unknown>[]);
  }
}

/**
 * Create a new `DataQuery` wrapping the given array.
 *
 * The array is used directly (not cloned) — read operations copy from it,
 * while write operations (`updateOne`, `deleteMany`, etc.) mutate it in place.
 *
 * @param data - The source array of documents.
 * @returns A `DataQuery<T>` ready to be chained.
 *
 * @example
 * ```ts
 * import { query } from "@akash1047/data-query";
 *
 * const results = query(users)
 *   .find({ age: { $gte: 18 } })
 *   .sort({ name: 1 })
 *   .toArray();
 * ```
 */
export function query<T extends object>(data: T[]): DataQuery<T> {
  return new DataQuery(data);
}
