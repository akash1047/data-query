/**
 * Filter engine — evaluates MongoDB-style `FilterQuery` objects against documents.
 *
 * Entry point: `matchesFilter(doc, filter)`
 *
 * Supported operators:
 *   Comparison : $eq  $ne  $gt  $gte  $lt  $lte  $in  $nin
 *   Element    : $exists
 *   String     : $regex
 *   Array      : $size  $all  $elemMatch
 *   Logical    : $and  $or  $nor  $not
 */

import type { FieldCondition, FilterQuery } from "./types.ts";
import { coerceRegex, getNestedValue, isPlainObject } from "./utils.ts";

type AnyDoc = Record<string, unknown>;

/**
 * Test whether `doc` satisfies every condition in `filter`.
 *
 * - Top-level keys are interpreted as field paths (dot-notation supported).
 * - Keys starting with `$` are treated as logical operators.
 * - Returns `true` only when all conditions pass.
 */
export function matchesFilter<T extends object>(
  doc: T,
  filter: FilterQuery<T>,
): boolean {
  for (const key of Object.keys(filter)) {
    const condition = (filter as AnyDoc)[key];

    // ── Logical operators ───────────────────────────────────────────────────

    if (key === "$and") {
      // All clauses must match
      const clauses = condition as FilterQuery<AnyDoc>[];
      if (!clauses.every((c) => matchesFilter(doc as AnyDoc, c))) {
        return false;
      }
      continue;
    }

    if (key === "$or") {
      // At least one clause must match
      const clauses = condition as FilterQuery<AnyDoc>[];
      if (!clauses.some((c) => matchesFilter(doc as AnyDoc, c))) {
        return false;
      }
      continue;
    }

    if (key === "$nor") {
      // No clause must match
      const clauses = condition as FilterQuery<AnyDoc>[];
      if (clauses.some((c) => matchesFilter(doc as AnyDoc, c))) {
        return false;
      }
      continue;
    }

    if (key === "$not") {
      // Invert the sub-filter
      const subFilter = condition as FilterQuery<AnyDoc>;
      if (matchesFilter(doc as AnyDoc, subFilter)) {
        return false;
      }
      continue;
    }

    // ── Field condition ─────────────────────────────────────────────────────
    // `key` is a dot-notation path; resolve the value then evaluate the condition.
    const fieldValue = getNestedValue(doc as AnyDoc, key);
    if (
      !evaluateFieldCondition(fieldValue, condition as FieldCondition<unknown>)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Evaluate a single field condition against the resolved field value.
 *
 * Handles three cases:
 *  1. `null` / `undefined` — strict equality check.
 *  2. `RegExp` instance — treated as an implicit `$regex`.
 *  3. Plain operator object (keys starting with `$`) — dispatched to `evaluateOperators`.
 *  4. Everything else — implicit `$eq` (strict equality or deep-JSON for objects).
 */
function evaluateFieldCondition(
  fieldValue: unknown,
  condition: FieldCondition<unknown>,
): boolean {
  if (condition === null || condition === undefined) {
    return fieldValue === condition;
  }

  // RegExp passed directly as the condition value → implicit $regex
  if (condition instanceof RegExp) {
    return condition.test(String(fieldValue ?? ""));
  }

  if (isPlainObject(condition)) {
    const keys = Object.keys(condition);
    const isOperatorObject = keys.some((k) => k.startsWith("$"));
    if (isOperatorObject) {
      return evaluateOperators(fieldValue, condition);
    }
    // Plain object with no operators → deep equality via JSON serialisation
    return JSON.stringify(fieldValue) === JSON.stringify(condition);
  }

  // Primitive → strict equality
  return fieldValue === condition;
}

/**
 * Evaluate all `$`-prefixed operators in `operators` against `fieldValue`.
 * Returns `false` as soon as any operator fails, `true` when all pass.
 * Throws `TypeError` for unrecognised operator names.
 */
function evaluateOperators(
  fieldValue: unknown,
  operators: AnyDoc,
): boolean {
  for (const [op, operand] of Object.entries(operators)) {
    switch (op) {
      case "$eq":
        if (fieldValue !== operand) return false;
        break;

      case "$ne":
        if (fieldValue === operand) return false;
        break;

      case "$gt":
        if (!((fieldValue as number) > (operand as number))) return false;
        break;

      case "$gte":
        if (!((fieldValue as number) >= (operand as number))) return false;
        break;

      case "$lt":
        if (!((fieldValue as number) < (operand as number))) return false;
        break;

      case "$lte":
        if (!((fieldValue as number) <= (operand as number))) return false;
        break;

      case "$in": {
        const arr = operand as unknown[];
        if (!arr.includes(fieldValue)) return false;
        break;
      }

      case "$nin": {
        const arr = operand as unknown[];
        if (arr.includes(fieldValue)) return false;
        break;
      }

      case "$exists":
        // `$exists: true` → field must be present (not undefined)
        // `$exists: false` → field must be absent (undefined)
        if (operand === true && fieldValue === undefined) return false;
        if (operand === false && fieldValue !== undefined) return false;
        break;

      case "$regex": {
        const re = coerceRegex(operand as RegExp | string);
        if (!re.test(String(fieldValue ?? ""))) return false;
        break;
      }

      case "$size":
        // Field must be an array with exactly the given length
        if (
          !Array.isArray(fieldValue) ||
          fieldValue.length !== (operand as number)
        ) {
          return false;
        }
        break;

      case "$all": {
        // Field must be an array containing every listed value
        if (!Array.isArray(fieldValue)) return false;
        const required = operand as unknown[];
        if (!required.every((v) => fieldValue.includes(v))) return false;
        break;
      }

      case "$elemMatch": {
        // At least one array element must satisfy the sub-filter
        if (!Array.isArray(fieldValue)) return false;
        const subFilter = operand as FilterQuery<AnyDoc>;
        if (
          !fieldValue.some((el) => matchesFilter(el as AnyDoc, subFilter))
        ) {
          return false;
        }
        break;
      }

      case "$type": {
        // Resolve the runtime type, treating arrays and null as their own type names
        const expected = operand as string;
        let actual: string;
        if (fieldValue === null) {
          actual = "null";
        } else if (Array.isArray(fieldValue)) {
          actual = "array";
        } else {
          actual = typeof fieldValue;
        }
        if (actual !== expected) return false;
        break;
      }

      case "$mod": {
        // [divisor, remainder] — field % divisor must equal remainder
        const [divisor, remainder] = operand as [number, number];
        if (typeof fieldValue !== "number") return false;
        if (fieldValue % divisor !== remainder) return false;
        break;
      }

      default:
        throw new TypeError(`Unknown filter operator: ${op}`);
    }
  }
  return true;
}
