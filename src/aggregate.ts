/**
 * Aggregation pipeline executor.
 *
 * Entry point: `executePipeline(data, pipeline)`
 *
 * Each stage receives the output array of the previous stage.
 * Supported stages:
 *   $match   — filter documents
 *   $sort    — sort documents
 *   $limit   — keep first N documents
 *   $skip    — skip first N documents
 *   $project — include or exclude fields
 *   $group   — group documents and compute accumulators
 *   $unwind  — flatten an array field into one document per element
 */

import type {
  AddFieldsStage,
  FilterQuery,
  GroupAccumulators,
  GroupStage,
  PipelineStage,
  ProjectQuery,
  SortQuery,
} from "./types.ts";
import { getNestedValue } from "./utils.ts";
import { matchesFilter } from "./filter.ts";

type Doc = Record<string, unknown>;

/**
 * Execute a sequence of pipeline stages against `data`.
 * The input array is not mutated; each stage produces a new array.
 *
 * Throws `TypeError` if an unrecognised stage key is encountered.
 */
export function executePipeline(data: Doc[], pipeline: PipelineStage[]): Doc[] {
  let working: Doc[] = [...data];
  for (const stage of pipeline) {
    if ("$match" in stage) {
      working = executeMatch(working, stage.$match as FilterQuery<Doc>);
    } else if ("$sort" in stage) {
      working = executeSort(working, stage.$sort as SortQuery<Doc>);
    } else if ("$limit" in stage) {
      working = working.slice(0, stage.$limit);
    } else if ("$skip" in stage) {
      working = working.slice(stage.$skip);
    } else if ("$project" in stage) {
      working = executeProject(working, stage.$project as ProjectQuery<Doc>);
    } else if ("$group" in stage) {
      working = executeGroup(working, stage.$group);
    } else if ("$unwind" in stage) {
      working = executeUnwind(working, stage.$unwind);
    } else if ("$addFields" in stage) {
      working = executeAddFields(working, stage.$addFields as AddFieldsStage);
    } else {
      throw new TypeError(
        `Unknown aggregation stage: ${JSON.stringify(Object.keys(stage))}`,
      );
    }
  }
  return working;
}

/** `$match` — keep only documents that satisfy `filter`. */
function executeMatch(data: Doc[], filter: FilterQuery<Doc>): Doc[] {
  return data.filter((doc) => matchesFilter(doc, filter));
}

/** `$sort` — sort documents by the fields described in `spec`. */
function executeSort(data: Doc[], spec: SortQuery<Doc>): Doc[] {
  const result = [...data];
  result.sort((a, b) => {
    for (const [path, dir] of Object.entries(spec)) {
      const aVal = getNestedValue(a, path);
      const bVal = getNestedValue(b, path);
      if ((aVal as number) < (bVal as number)) return -1 * (dir as number);
      if ((aVal as number) > (bVal as number)) return 1 * (dir as number);
    }
    return 0;
  });
  return result;
}

/**
 * `$project` — reshape documents by including or excluding fields.
 *
 * - **Inclusion mode** (any value is `1`): output contains only the listed fields.
 * - **Exclusion mode** (any value is `0`): output is a shallow copy with listed fields removed.
 * - Mixing `1` and `0` throws `TypeError`.
 *
 * Exported so that `DataQuery#execute` can reuse it for chained `.project()` calls.
 */
export function executeProject(data: Doc[], spec: ProjectQuery<Doc>): Doc[] {
  const entries = Object.entries(spec);
  if (entries.length === 0) return data;

  const includeEntries = entries.filter(([, v]) => v === 1);
  const excludeEntries = entries.filter(([, v]) => v === 0);

  if (includeEntries.length > 0 && excludeEntries.length > 0) {
    throw new TypeError("Cannot mix inclusion and exclusion in project");
  }

  if (includeEntries.length > 0) {
    // Inclusion — start with an empty object and add only the specified fields
    return data.map((doc) => {
      const result: Doc = {};
      for (const [path] of includeEntries) {
        const val = getNestedValue(doc, path);
        if (val !== undefined) {
          setNestedInResult(result, path, val);
        }
      }
      return result;
    });
  } else {
    // Exclusion — start with a shallow copy and remove the specified fields
    return data.map((doc) => {
      const result: Doc = { ...doc };
      for (const [path] of excludeEntries) {
        deleteNestedInResult(result, path);
      }
      return result;
    });
  }
}

/**
 * Write `value` at `path` into `obj`, creating intermediate objects as needed.
 * Local variant used only within projection output objects.
 */
function setNestedInResult(obj: Doc, path: string, value: unknown): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof current[parts[i]] !== "object" || current[parts[i]] === null) {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Doc;
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Delete the value at `path` from `obj`.
 * Local variant used only within projection output objects.
 */
function deleteNestedInResult(obj: Doc, path: string): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof current[parts[i]] !== "object" || current[parts[i]] === null) {
      return;
    }
    current = current[parts[i]] as Doc;
  }
  delete current[parts[parts.length - 1]];
}

/**
 * `$group` — partition documents by a grouping key and compute per-group accumulators.
 *
 * `stage._id` is the dot-notation field path used as the grouping key.
 * Use `null` to collect all documents into a single group.
 * All other fields in `stage` must be `GroupAccumulators` objects.
 */
function executeGroup(data: Doc[], stage: GroupStage): Doc[] {
  const groupByPath = stage._id;

  // Build a Map from serialised group key → array of documents in that group
  const groups = new Map<string, Doc[]>();
  for (const doc of data) {
    const keyVal = groupByPath === null
      ? "__all__"
      : String(getNestedValue(doc, groupByPath) ?? "null");
    if (!groups.has(keyVal)) {
      groups.set(keyVal, []);
    }
    groups.get(keyVal)!.push(doc);
  }

  const results: Doc[] = [];

  for (const [groupKey, groupDocs] of groups) {
    // The output document always includes `_id` as the group key value
    const result: Doc = {
      _id: groupByPath === null ? null : groupKey,
    };

    // Compute each accumulator field
    for (const [field, accDef] of Object.entries(stage)) {
      if (field === "_id") continue;
      const acc = accDef as GroupAccumulators;
      result[field] = computeAccumulator(acc, groupDocs);
    }

    results.push(result);
  }

  return results;
}

/**
 * Compute the value of a single accumulator over a group of documents.
 * Throws `TypeError` for unrecognised accumulator objects.
 */
function computeAccumulator(acc: GroupAccumulators, docs: Doc[]): unknown {
  if (acc.$count === true) {
    return docs.length;
  }
  if (acc.$sum !== undefined) {
    if (typeof acc.$sum === "number") {
      // Constant multiplier — equivalent to counting docs × constant
      return acc.$sum * docs.length;
    }
    const path = acc.$sum as string;
    return docs.reduce(
      (sum, doc) => sum + ((getNestedValue(doc, path) as number) ?? 0),
      0,
    );
  }
  if (acc.$avg !== undefined) {
    const path = acc.$avg;
    const values = docs.map((d) => (getNestedValue(d, path) as number) ?? 0);
    return values.reduce((s, v) => s + v, 0) / (values.length || 1);
  }
  if (acc.$min !== undefined) {
    const path = acc.$min;
    const values = docs.map((d) => getNestedValue(d, path) as number);
    return Math.min(...values);
  }
  if (acc.$max !== undefined) {
    const path = acc.$max;
    const values = docs.map((d) => getNestedValue(d, path) as number);
    return Math.max(...values);
  }
  if (acc.$push !== undefined) {
    // Collect the field value from every doc in the group into an array
    const path = acc.$push;
    return docs.map((d) => getNestedValue(d, path));
  }
  if (acc.$first !== undefined) {
    return getNestedValue(docs[0], acc.$first);
  }
  if (acc.$last !== undefined) {
    return getNestedValue(docs[docs.length - 1], acc.$last);
  }
  throw new TypeError(`Unknown accumulator: ${JSON.stringify(acc)}`);
}

/**
 * `$addFields` — add or overwrite fields on each document using expressions or literals.
 *
 * Supported expressions:
 * - **Literal** — any non-object value (string, number, boolean, …) is assigned as-is.
 * - **`$multiply`** — `{ $multiply: [operand, operand, …] }` multiplies all operands.
 *   Each operand is either a field reference (string starting with `$`) or a numeric constant.
 *
 * The original document is shallow-copied; the source array is not mutated.
 */
function executeAddFields(data: Doc[], spec: AddFieldsStage): Doc[] {
  return data.map((doc) => {
    const result: Doc = { ...doc };
    for (const [field, expr] of Object.entries(spec)) {
      result[field] = evaluateAddFieldExpr(doc, expr);
    }
    return result;
  });
}

/**
 * Evaluate a single `$addFields` expression against `doc`.
 * Returns the literal value or the result of the expression operator.
 */
function evaluateAddFieldExpr(doc: Doc, expr: unknown): unknown {
  // Operator expression object
  if (
    expr !== null &&
    typeof expr === "object" &&
    !Array.isArray(expr) &&
    Object.keys(expr as object).some((k) => k.startsWith("$"))
  ) {
    const exprObj = expr as Record<string, unknown>;

    if ("$multiply" in exprObj) {
      // Multiply all operands; field refs start with "$"
      const operands = exprObj.$multiply as (string | number)[];
      return operands.reduce<number>((product, operand) => {
        const val = typeof operand === "string" && operand.startsWith("$")
          ? (getNestedValue(doc, operand.slice(1)) as number) ?? 0
          : (operand as number);
        return product * val;
      }, 1);
    }

    // Unknown expression operator — return as-is
    return expr;
  }

  // Literal value
  return expr;
}

/**
 * `$unwind` — expand an array field so each element becomes its own document.
 * If the field is not an array the document is passed through unchanged.
 *
 * @param path - Dot-notation path to the array field (without a leading `$`).
 */
function executeUnwind(data: Doc[], path: string): Doc[] {
  const result: Doc[] = [];
  for (const doc of data) {
    const val = getNestedValue(doc, path);
    if (!Array.isArray(val)) {
      // Non-array fields pass through unchanged
      result.push(doc);
      continue;
    }
    // Create one output document per array element
    for (const item of val) {
      const unwound: Doc = { ...doc };
      setNestedInResult(unwound, path, item);
      result.push(unwound);
    }
  }
  return result;
}
