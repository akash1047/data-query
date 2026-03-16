import type { UpdateQuery } from "./types.ts";
import {
  deleteNestedValue,
  getNestedValue,
  isPlainObject,
  setNestedValue,
} from "./utils.ts";
import { matchesFilter } from "./filter.ts";

type AnyDoc = Record<string, unknown>;

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

  return modified;
}

function applySet(doc: AnyDoc, fields: AnyDoc): void {
  for (const [path, value] of Object.entries(fields)) {
    setNestedValue(doc, path, value);
  }
}

function applyUnset(doc: AnyDoc, fields: AnyDoc): void {
  for (const path of Object.keys(fields)) {
    deleteNestedValue(doc, path);
  }
}

function applyInc(doc: AnyDoc, fields: Record<string, number>): void {
  for (const [path, delta] of Object.entries(fields)) {
    const current = (getNestedValue(doc, path) as number) ?? 0;
    setNestedValue(doc, path, current + delta);
  }
}

function applyPush(doc: AnyDoc, fields: AnyDoc): void {
  for (const [path, value] of Object.entries(fields)) {
    const existing = getNestedValue(doc, path);
    const arr = Array.isArray(existing) ? existing : [];
    arr.push(value);
    setNestedValue(doc, path, arr);
  }
}

function applyPull(doc: AnyDoc, fields: AnyDoc): void {
  for (const [path, condition] of Object.entries(fields)) {
    const existing = getNestedValue(doc, path);
    if (!Array.isArray(existing)) continue;

    const filtered = existing.filter((el) => {
      if (isPlainObject(condition)) {
        return !matchesFilter(el as AnyDoc, condition);
      }
      return el !== condition;
    });
    setNestedValue(doc, path, filtered);
  }
}

function applyRename(doc: AnyDoc, fields: Record<string, string>): void {
  for (const [oldPath, newPath] of Object.entries(fields)) {
    const value = getNestedValue(doc, oldPath);
    if (value !== undefined) {
      deleteNestedValue(doc, oldPath);
      setNestedValue(doc, newPath, value);
    }
  }
}
