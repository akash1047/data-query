/**
 * Internal utility functions shared across filter, update, and aggregation modules.
 * None of these are part of the public API.
 */

/**
 * Read a value at a dot-notation path from a plain object.
 * Returns `undefined` if any segment along the path is missing, null, or not an object.
 *
 * @example
 * ```ts
 * getNestedValue({ address: { city: "Delhi" } }, "address.city") // "Delhi"
 * getNestedValue({ a: null }, "a.b")                             // undefined
 * ```
 */
export function getNestedValue(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Write a value at a dot-notation path on a plain object, creating intermediate
 * objects as needed. If a non-object is encountered mid-path it is overwritten
 * with a new empty object.
 *
 * @example
 * ```ts
 * const obj = {};
 * setNestedValue(obj, "address.city", "Delhi");
 * // obj → { address: { city: "Delhi" } }
 * ```
 */
export function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      typeof current[part] !== "object" ||
      current[part] === null ||
      Array.isArray(current[part])
    ) {
      // Overwrite with an empty object so we can continue descending
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Delete the leaf key at a dot-notation path from a plain object.
 * Does nothing if any intermediate segment is absent or not an object.
 *
 * @example
 * ```ts
 * const obj = { address: { city: "Delhi" } };
 * deleteNestedValue(obj, "address.city");
 * // obj → { address: {} }
 * ```
 */
export function deleteNestedValue(
  obj: Record<string, unknown>,
  path: string,
): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      typeof current[part] !== "object" ||
      current[part] === null ||
      Array.isArray(current[part])
    ) {
      return; // Path does not exist — nothing to delete
    }
    current = current[part] as Record<string, unknown>;
  }
  delete current[parts[parts.length - 1]];
}

/**
 * Deep-clone a value using the platform's `structuredClone`.
 * Available in Deno 1.14+ without any polyfill.
 */
export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Return `true` if `value` is a plain `{}` object (not an array, not null,
 * not a class instance). Used to distinguish operator objects from primitives.
 */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Coerce a `$regex` operand (string or `RegExp`) into a `RegExp` instance.
 * If already a `RegExp`, it is returned as-is.
 */
export function coerceRegex(value: RegExp | string): RegExp {
  return typeof value === "string" ? new RegExp(value) : value;
}
