/**
 * Update engine — applies MongoDB-style `UpdateQuery` operators to a document in place.
 *
 * Entry point: `applyUpdate(doc, update)`
 *
 * Supported operators:
 *   $set    — assign field values
 *   $unset  — remove fields
 *   $inc    — increment numeric fields
 *   $push   — append to array fields
 *   $pull   — remove elements from array fields
 *   $rename — rename fields
 */

import type { UpdateQuery } from "./types.ts";
import { deleteNestedValue, getNestedValue, isPlainObject, setNestedValue } from "./utils.ts";
import { matchesFilter } from "./filter.ts";

type AnyDoc = Record<string, unknown>;

/**
 * Apply all operators in `update` to `doc`, mutating it in place.
 *
 * @returns `true` if at least one operator was present (document may have changed),
 *          `false` if the update object contained no recognised operators.
 */
export function applyUpdate<T extends object>(
  doc: T,
  update: UpdateQuery<T>,
): boolean {
  let modified = false;
  const d = doc as AnyDoc;

  if (update.$set) {
    applySet(d, update.$set as AnyDoc);
    modified = true;
  }
  if (update.$unset) {
    applyUnset(d, update.$unset as AnyDoc);
    modified = true;
  }
  if (update.$inc) {
    applyInc(d, update.$inc as Record<string, number>);
    modified = true;
  }
  if (update.$push) {
    applyPush(d, update.$push as AnyDoc);
    modified = true;
  }
  if (update.$pull) {
    applyPull(d, update.$pull as AnyDoc);
    modified = true;
  }
  if (update.$rename) {
    applyRename(d, update.$rename as Record<string, string>);
    modified = true;
  }
  if (update.$addToSet) {
    applyAddToSet(d, update.$addToSet as AnyDoc);
    modified = true;
  }
  if (update.$pop) {
    applyPop(d, update.$pop as Record<string, 1 | -1>);
    modified = true;
  }
  if (update.$mul) {
    applyMul(d, update.$mul as Record<string, number>);
    modified = true;
  }

  return modified;
}

/**
 * `$set` — write each path/value pair onto the document.
 * Dot-notation paths create intermediate objects as needed.
 */
function applySet(doc: AnyDoc, fields: AnyDoc): void {
  for (const [path, value] of Object.entries(fields)) {
    setNestedValue(doc, path, value);
  }
}

/**
 * `$unset` — remove each listed field from the document.
 * The value in the spec (usually `""` or `1`) is ignored.
 */
function applyUnset(doc: AnyDoc, fields: AnyDoc): void {
  for (const path of Object.keys(fields)) {
    deleteNestedValue(doc, path);
  }
}

/**
 * `$inc` — add `delta` to the current numeric value of each field.
 * If the field does not exist it is treated as `0`.
 */
function applyInc(doc: AnyDoc, fields: Record<string, number>): void {
  for (const [path, delta] of Object.entries(fields)) {
    const current = (getNestedValue(doc, path) as number) ?? 0;
    setNestedValue(doc, path, current + delta);
  }
}

/**
 * `$push` — append `value` to the array at `path`.
 * If the field is missing or not an array, a new array is created.
 */
function applyPush(doc: AnyDoc, fields: AnyDoc): void {
  for (const [path, value] of Object.entries(fields)) {
    const existing = getNestedValue(doc, path);
    const arr = Array.isArray(existing) ? existing : [];
    arr.push(value);
    setNestedValue(doc, path, arr);
  }
}

/**
 * `$pull` — remove elements from the array at `path` that match `condition`.
 *
 * - If `condition` is a plain object, each element is tested with `matchesFilter`.
 * - Otherwise, elements are removed by strict equality (`el === condition`).
 *
 * Does nothing if the field is missing or not an array.
 */
function applyPull(doc: AnyDoc, fields: AnyDoc): void {
  for (const [path, condition] of Object.entries(fields)) {
    const existing = getNestedValue(doc, path);
    if (!Array.isArray(existing)) continue;

    const filtered = existing.filter((el) => {
      if (isPlainObject(condition)) {
        // condition is a sub-filter — keep elements that do NOT match
        return !matchesFilter(el as AnyDoc, condition);
      }
      // condition is a primitive — remove by strict equality
      return el !== condition;
    });
    setNestedValue(doc, path, filtered);
  }
}

/**
 * `$addToSet` — append `value` to the array at `path` only if it is not already present.
 * Uses strict equality (`===`) for the membership check.
 * If the field is missing or not an array, a new array is created.
 */
function applyAddToSet(doc: AnyDoc, fields: AnyDoc): void {
  for (const [path, value] of Object.entries(fields)) {
    const existing = getNestedValue(doc, path);
    const arr = Array.isArray(existing) ? existing : [];
    if (!arr.includes(value)) {
      arr.push(value);
    }
    setNestedValue(doc, path, arr);
  }
}

/**
 * `$pop` — remove an element from the array at `path`.
 * `1` removes the **last** element; `-1` removes the **first**.
 * Does nothing if the field is missing or not an array.
 */
function applyPop(doc: AnyDoc, fields: Record<string, 1 | -1>): void {
  for (const [path, direction] of Object.entries(fields)) {
    const existing = getNestedValue(doc, path);
    if (!Array.isArray(existing)) continue;
    if (direction === 1) {
      existing.pop();
    } else {
      existing.shift();
    }
    setNestedValue(doc, path, existing);
  }
}

/**
 * `$mul` — multiply the current numeric value of each field by `factor`.
 * If the field does not exist it is treated as `0`, so `0 * factor = 0`.
 */
function applyMul(doc: AnyDoc, fields: Record<string, number>): void {
  for (const [path, factor] of Object.entries(fields)) {
    const current = (getNestedValue(doc, path) as number) ?? 0;
    setNestedValue(doc, path, current * factor);
  }
}

/**
 * `$rename` — move a field from `oldPath` to `newPath`.
 * If `oldPath` does not exist the field is silently skipped.
 */
function applyRename(doc: AnyDoc, fields: Record<string, string>): void {
  for (const [oldPath, newPath] of Object.entries(fields)) {
    const value = getNestedValue(doc, oldPath);
    if (value !== undefined) {
      deleteNestedValue(doc, oldPath);
      setNestedValue(doc, newPath, value);
    }
  }
}
