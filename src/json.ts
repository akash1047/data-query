/**
 * JSON loader / serializer and `FileDataQuery` factory functions for JSON files.
 *
 * Entry points:
 *   `parseJSON`    — parse a JSON string to documents
 *   `loadJSON`     — async read from the file system
 *   `loadJSONSync` — sync read from the file system
 *   `serializeJSON`— serialize documents to a pretty-printed JSON string
 *   `queryJSON`    — async factory returning a `FileDataQuery`
 *   `queryJSONSync`— sync factory returning a `FileDataQuery`
 */

import type { ZodType } from "zod";
import { FileDataQuery } from "./query.ts";

/**
 * Parse a JSON string into an array of documents.
 * Throws a `TypeError` if the root value is not an array.
 */
export function parseJSON(text: string): Record<string, unknown>[] {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new TypeError("JSON root value must be an array");
  }
  return parsed as Record<string, unknown>[];
}

/**
 * Asynchronously load a JSON file from disk and return its documents.
 * Requires `--allow-read` permission.
 */
export async function loadJSON(
  path: string,
): Promise<Record<string, unknown>[]> {
  const text = await Deno.readTextFile(path);
  return parseJSON(text);
}

/**
 * Synchronously load a JSON file from disk and return its documents.
 * Requires `--allow-read` permission.
 */
export function loadJSONSync(path: string): Record<string, unknown>[] {
  const text = Deno.readTextFileSync(path);
  return parseJSON(text);
}

/**
 * Serialize an array of documents to a pretty-printed JSON string.
 */
export function serializeJSON(data: Record<string, unknown>[]): string {
  return JSON.stringify(data, null, 2);
}

/** Options for JSON query factory functions. */
export interface JSONQueryOptions {
  /** If provided, writes to this path instead of overwriting the source. */
  output?: string;
}

/**
 * Load a JSON file and return a `FileDataQuery` backed by a JSON persistence adapter.
 * Calling `.save()` writes the mutated data back to disk.
 */
export async function queryJSON(
  path: string,
  opts?: JSONQueryOptions,
): Promise<FileDataQuery<Record<string, unknown>>>;
export async function queryJSON<T extends object>(
  path: string,
  opts: JSONQueryOptions & { schema: ZodType<T> },
): Promise<FileDataQuery<T>>;
export async function queryJSON<T extends object>(
  path: string,
  opts?: JSONQueryOptions & { schema?: ZodType<T> },
): Promise<FileDataQuery<T> | FileDataQuery<Record<string, unknown>>> {
  const rawData = await loadJSON(path);
  const dest = opts?.output ?? path;
  const adapter = {
    save: async (d: Record<string, unknown>[]) => {
      await Deno.writeTextFile(dest, serializeJSON(d));
    },
    saveSync: (d: Record<string, unknown>[]) => {
      Deno.writeTextFileSync(dest, serializeJSON(d));
    },
  };
  if (opts?.schema) {
    const schema = opts.schema;
    const data = rawData.map((row, i) => {
      const result = schema.safeParse(row);
      if (!result.success) {
        throw new Error(
          `Validation failed at row ${i}: ${result.error.message}`,
        );
      }
      return result.data as T;
    });
    return new FileDataQuery<T>(data, adapter, schema);
  }
  return new FileDataQuery(rawData, adapter);
}

/**
 * Synchronously load a JSON file and return a `FileDataQuery` backed by a JSON
 * persistence adapter.
 */
export function queryJSONSync(
  path: string,
  opts?: JSONQueryOptions,
): FileDataQuery<Record<string, unknown>>;
export function queryJSONSync<T extends object>(
  path: string,
  opts: JSONQueryOptions & { schema: ZodType<T> },
): FileDataQuery<T>;
export function queryJSONSync<T extends object>(
  path: string,
  opts?: JSONQueryOptions & { schema?: ZodType<T> },
): FileDataQuery<T> | FileDataQuery<Record<string, unknown>> {
  const rawData = loadJSONSync(path);
  const dest = opts?.output ?? path;
  const adapter = {
    save: async (d: Record<string, unknown>[]) => {
      await Deno.writeTextFile(dest, serializeJSON(d));
    },
    saveSync: (d: Record<string, unknown>[]) => {
      Deno.writeTextFileSync(dest, serializeJSON(d));
    },
  };
  if (opts?.schema) {
    const schema = opts.schema;
    const data = rawData.map((row, i) => {
      const result = schema.safeParse(row);
      if (!result.success) {
        throw new Error(
          `Validation failed at row ${i}: ${result.error.message}`,
        );
      }
      return result.data as T;
    });
    return new FileDataQuery<T>(data, adapter, schema);
  }
  return new FileDataQuery(rawData, adapter);
}
