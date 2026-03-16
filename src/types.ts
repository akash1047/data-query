/**
 * Core TypeScript types for data-query.
 *
 * All filter, sort, projection, update, and aggregation types are defined here
 * and re-exported from `mod.ts` for consumers of the library.
 */

// ── Utility types ─────────────────────────────────────────────────────────────

/** Scalar values that can appear as field values in documents. */
export type Primitive = string | number | boolean | null | undefined | Date;

// ── Filter Operator Interfaces ────────────────────────────────────────────────

/**
 * MongoDB-style comparison operators for a field of type `T`.
 *
 * @example
 * ```ts
 * query(data).find({ age: { $gt: 18, $lte: 65 } })
 * ```
 */
export interface ComparisonOperators<T> {
  /** Exact equality — `field === value` */
  $eq?: T;
  /** Inequality — `field !== value` */
  $ne?: T;
  /** Greater than — `field > value` */
  $gt?: T;
  /** Greater than or equal — `field >= value` */
  $gte?: T;
  /** Less than — `field < value` */
  $lt?: T;
  /** Less than or equal — `field <= value` */
  $lte?: T;
  /** Field value is in the given array */
  $in?: T[];
  /** Field value is NOT in the given array */
  $nin?: T[];
}

/**
 * Operator that checks whether a field exists on the document.
 *
 * @example
 * ```ts
 * query(data).find({ address: { $exists: true } })
 * ```
 */
export interface ElementOperators {
  /** `true` → field must be present; `false` → field must be absent */
  $exists?: boolean;
}

/**
 * Operator that matches a string field against a regular expression.
 *
 * @example
 * ```ts
 * query(data).find({ name: { $regex: /^ali/i } })
 * query(data).find({ name: { $regex: "^ali" } })
 * ```
 */
export interface StringOperators {
  /** A `RegExp` instance or a regex pattern string */
  $regex?: RegExp | string;
}

/**
 * Operators that check the JavaScript type of a field value,
 * or apply numeric modulo arithmetic.
 *
 * @example
 * ```ts
 * query(data).find({ age:  { $type: "number" } })
 * query(data).find({ tags: { $type: "array"  } })
 * query(data).find({ n:    { $mod: [2, 0]    } })  // even numbers
 * ```
 */
export interface TypeOperators {
  /**
   * Matches documents where the field's runtime type equals the given string.
   * Uses `typeof` for most types, but returns `"array"` for arrays and `"null"` for null
   * (both of which `typeof` reports as `"object"`).
   *
   * Supported values: `"string"`, `"number"`, `"boolean"`, `"object"`, `"array"`,
   * `"null"`, `"undefined"`, `"bigint"`, `"symbol"`, `"function"`
   */
  $type?: string;
  /**
   * Matches documents where `field % divisor === remainder`.
   * Provide a two-element tuple `[divisor, remainder]`.
   */
  $mod?: [number, number];
}

/**
 * Operators that apply to array-typed fields.
 *
 * @example
 * ```ts
 * query(data).find({ tags: { $size: 3 } })
 * query(data).find({ tags: { $all: ["deno", "ts"] } })
 * query(data).find({ scores: { $elemMatch: { $gt: 90 } } })
 * ```
 */
export interface ArrayOperators {
  /** At least one array element matches the sub-filter */
  $elemMatch?: FilterQuery<Record<string, unknown>>;
  /** Array has exactly this many elements */
  $size?: number;
  /** Array contains all of the listed values */
  $all?: Primitive[];
}

/**
 * The condition that can be placed on a single field.
 * Either a raw primitive/object for implicit `$eq`, or a combination of operators.
 */
export type FieldCondition<T> =
  | T
  | (
    & ComparisonOperators<T>
    & ElementOperators
    & StringOperators
    & ArrayOperators
    & TypeOperators
  );

/**
 * A MongoDB-style filter object that can be passed to `.find()` / `.filter()`.
 *
 * - Keys matching fields of `T` accept a `FieldCondition` for that field's type.
 * - Dot-notation string keys (e.g. `"address.city"`) are also supported.
 * - Logical operators (`$and`, `$or`, `$nor`, `$not`) compose sub-filters.
 *
 * @example
 * ```ts
 * const f: FilterQuery<User> = {
 *   age: { $gte: 18 },
 *   "address.city": "Delhi",
 *   $or: [{ active: true }, { role: "admin" }],
 * };
 * ```
 */
export type FilterQuery<T extends object> =
  & {
    [K in keyof T]?: FieldCondition<T[K]>;
  }
  & {
    /** Dot-notation path or logical operator key */
    [path: string]: unknown;
    /** All sub-filters must match */
    $and?: FilterQuery<Record<string, unknown>>[];
    /** At least one sub-filter must match */
    $or?: FilterQuery<Record<string, unknown>>[];
    /** None of the sub-filters must match */
    $nor?: FilterQuery<Record<string, unknown>>[];
    /** Inverts the given sub-filter */
    $not?: FilterQuery<Record<string, unknown>>;
  };

// ── Sort ──────────────────────────────────────────────────────────────────────

/** `1` for ascending, `-1` for descending. */
export type SortDirection = 1 | -1;

/**
 * A sort specification: a map of field paths to sort direction.
 * Fields are sorted in the order they appear in the object.
 *
 * @example
 * ```ts
 * query(data).sort({ age: -1, name: 1 })
 * ```
 */
export type SortQuery<T extends object> =
  & {
    [K in keyof T]?: SortDirection;
  }
  & {
    [path: string]: SortDirection;
  };

// ── Projection ────────────────────────────────────────────────────────────────

/**
 * A projection specification: a map of field paths to `1` (include) or `0` (exclude).
 *
 * - **Inclusion mode** — only fields set to `1` are returned.
 * - **Exclusion mode** — all fields except those set to `0` are returned.
 * - Mixing `1` and `0` in the same spec throws a `TypeError`.
 *
 * @example
 * ```ts
 * query(data).project({ name: 1, age: 1 })  // inclusion
 * query(data).project({ password: 0 })       // exclusion
 * ```
 */
export type ProjectQuery<T extends object> =
  & {
    [K in keyof T]?: 0 | 1;
  }
  & {
    [path: string]: 0 | 1;
  };

// ── Update Operators ──────────────────────────────────────────────────────────

/**
 * A MongoDB-style update document describing which fields to modify and how.
 * Multiple operators can be combined in a single call.
 *
 * @example
 * ```ts
 * query(data).find({ name: "Alice" }).updateOne({
 *   $set:  { city: "Mumbai" },
 *   $inc:  { age: 1 },
 *   $push: { tags: "vip" },
 * });
 * ```
 */
export interface UpdateQuery<T extends object> {
  /** Set field values (supports dot-notation) */
  $set?: Partial<T> & Record<string, unknown>;
  /** Remove fields from documents */
  $unset?: Partial<Record<keyof T, "" | 1>> & Record<string, "" | 1>;
  /** Increment numeric fields by the given delta (negative to decrement) */
  $inc?: Partial<Record<keyof T, number>> & Record<string, number>;
  /** Append a value to an array field (creates the array if missing) */
  $push?: Partial<Record<keyof T, unknown>> & Record<string, unknown>;
  /** Remove matching elements from an array field */
  $pull?: Partial<Record<keyof T, unknown>> & Record<string, unknown>;
  /** Rename a field — key is the old path, value is the new path */
  $rename?: Partial<Record<keyof T, string>> & Record<string, string>;
  /** Append a value to an array field only if it is not already present */
  $addToSet?: Partial<Record<keyof T, unknown>> & Record<string, unknown>;
  /**
   * Remove the first or last element of an array field.
   * `1` removes the last element; `-1` removes the first.
   */
  $pop?: Partial<Record<keyof T, 1 | -1>> & Record<string, 1 | -1>;
  /** Multiply a numeric field by the given factor */
  $mul?: Partial<Record<keyof T, number>> & Record<string, number>;
}

// ── Persistence ───────────────────────────────────────────────────────────────

/**
 * A persistence adapter that knows how to write an array of documents to a
 * backing store (file, database, etc.).
 *
 * Pass an adapter to `FileDataQuery` (via the factory functions `queryCSV`,
 * `queryXLSX`, `queryJSON`, etc.) and call `.save()` / `.saveSync()` after
 * mutations to persist the current state.
 */
export interface PersistenceAdapter {
  /** Asynchronously persist the current document array. */
  save(data: Record<string, unknown>[]): Promise<void>;
  /** Synchronously persist the current document array. */
  saveSync(data: Record<string, unknown>[]): void;
}

// ── Results ───────────────────────────────────────────────────────────────────

/** Returned by `updateOne()` and `updateMany()`. */
export interface UpdateResult {
  /** Number of documents that matched the filter */
  matchedCount: number;
  /** Number of documents that were actually changed */
  modifiedCount: number;
}

/** Returned by `deleteOne()` and `deleteMany()`. */
export interface DeleteResult {
  /** Number of documents removed from the source array */
  deletedCount: number;
}

// ── Aggregation Pipeline ──────────────────────────────────────────────────────

/**
 * Accumulator definitions for the `$group` stage.
 * Each field in the group stage (other than `_id`) must use one of these.
 *
 * @example
 * ```ts
 * { totalAge: { $sum: "age" }, count: { $count: true } }
 * ```
 */
export interface GroupAccumulators {
  /** Sum field values across the group. Pass a field path or a constant number. */
  $sum?: string | number;
  /** Average of field values across the group */
  $avg?: string;
  /** Minimum field value in the group */
  $min?: string;
  /** Maximum field value in the group */
  $max?: string;
  /** Count of documents in the group */
  $count?: true;
  /** Collect field values from all docs in the group into an array */
  $push?: string;
  /** Field value from the first document in the group */
  $first?: string;
  /** Field value from the last document in the group */
  $last?: string;
}

/**
 * The shape of a `$group` stage definition.
 * `_id` is the grouping key (a dot-notation field path, or `null` to group all).
 * Every other key is an accumulator field.
 *
 * @example
 * ```ts
 * { _id: "city", count: { $count: true }, avgAge: { $avg: "age" } }
 * ```
 */
export type GroupStage = {
  /** Grouping key — a field path (e.g. `"city"`) or `null` for a single group */
  _id: string | null;
  [accumulatorField: string]: GroupAccumulators | string | null;
};

/**
 * A single stage in an aggregation pipeline.
 * Stages are executed sequentially; each receives the output of the previous.
 *
/**
 * A field expression used inside `$addFields`.
 * - A literal value (string, number, boolean, …) is assigned as-is.
 * - `{ $multiply: ["$field1", "$field2"] }` multiplies the two field values.
 *   Field references start with `$` (e.g. `"$price"`).
 * - `{ $multiply: ["$field", 3] }` multiplies a field by a constant.
 */
export type AddFieldExpr =
  | Primitive
  | Record<string, unknown>
  | { $multiply: (string | number)[] };

/**
 * A map of new field names to their expressions.
 * Used as the operand of the `$addFields` pipeline stage.
 */
export type AddFieldsStage = Record<string, AddFieldExpr>;

/**
 * A single stage in an aggregation pipeline.
 * Stages are executed sequentially; each receives the output of the previous.
 *
 * Supported stages:
 * - `$match`     — filter documents (same syntax as `find()`)
 * - `$sort`      — sort documents
 * - `$limit`     — keep first N documents
 * - `$skip`      — skip first N documents
 * - `$group`     — group documents and compute accumulators
 * - `$project`   — include/exclude fields
 * - `$unwind`    — flatten an array field into individual documents
 * - `$addFields` — add or overwrite fields with expressions or literal values
 */
export type PipelineStage =
  | { $match: FilterQuery<Record<string, unknown>> }
  | { $sort: SortQuery<Record<string, unknown>> }
  | { $limit: number }
  | { $skip: number }
  | { $group: GroupStage }
  | { $project: ProjectQuery<Record<string, unknown>> }
  | { $unwind: string }
  | { $addFields: AddFieldsStage };
