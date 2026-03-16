import type { FieldCondition, FilterQuery } from "./types.ts";
import { coerceRegex, getNestedValue, isPlainObject } from "./utils.ts";

type AnyDoc = Record<string, unknown>;

export function matchesFilter<T extends object>(
  doc: T,
  filter: FilterQuery<T>,
): boolean {
  for (const key of Object.keys(filter)) {
    const condition = (filter as AnyDoc)[key];

    if (key === "$and") {
      const clauses = condition as FilterQuery<AnyDoc>[];
      if (!clauses.every((c) => matchesFilter(doc as AnyDoc, c))) {
        return false;
      }
      continue;
    }

    if (key === "$or") {
      const clauses = condition as FilterQuery<AnyDoc>[];
      if (!clauses.some((c) => matchesFilter(doc as AnyDoc, c))) {
        return false;
      }
      continue;
    }

    if (key === "$nor") {
      const clauses = condition as FilterQuery<AnyDoc>[];
      if (clauses.some((c) => matchesFilter(doc as AnyDoc, c))) {
        return false;
      }
      continue;
    }

    if (key === "$not") {
      const subFilter = condition as FilterQuery<AnyDoc>;
      if (matchesFilter(doc as AnyDoc, subFilter)) {
        return false;
      }
      continue;
    }

    const fieldValue = getNestedValue(doc as AnyDoc, key);
    if (!evaluateFieldCondition(fieldValue, condition as FieldCondition<unknown>)) {
      return false;
    }
  }
  return true;
}

function evaluateFieldCondition(
  fieldValue: unknown,
  condition: FieldCondition<unknown>,
): boolean {
  if (condition === null || condition === undefined) {
    return fieldValue === condition;
  }

  if (condition instanceof RegExp) {
    return condition.test(String(fieldValue ?? ""));
  }

  if (isPlainObject(condition)) {
    const keys = Object.keys(condition);
    const isOperatorObject = keys.some((k) => k.startsWith("$"));
    if (isOperatorObject) {
      return evaluateOperators(fieldValue, condition);
    }
    // Plain object equality — deep compare
    return JSON.stringify(fieldValue) === JSON.stringify(condition);
  }

  // Primitive equality
  return fieldValue === condition;
}

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
        if (operand === true && fieldValue === undefined) return false;
        if (operand === false && fieldValue !== undefined) return false;
        break;
      case "$regex": {
        const re = coerceRegex(operand as RegExp | string);
        if (!re.test(String(fieldValue ?? ""))) return false;
        break;
      }
      case "$size":
        if (!Array.isArray(fieldValue) || fieldValue.length !== (operand as number)) {
          return false;
        }
        break;
      case "$all": {
        if (!Array.isArray(fieldValue)) return false;
        const required = operand as unknown[];
        if (!required.every((v) => fieldValue.includes(v))) return false;
        break;
      }
      case "$elemMatch": {
        if (!Array.isArray(fieldValue)) return false;
        const subFilter = operand as FilterQuery<AnyDoc>;
        if (
          !fieldValue.some((el) =>
            matchesFilter(el as AnyDoc, subFilter)
          )
        ) {
          return false;
        }
        break;
      }
      default:
        throw new TypeError(`Unknown filter operator: ${op}`);
    }
  }
  return true;
}
