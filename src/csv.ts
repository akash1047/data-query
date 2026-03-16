/**
 * Parses a CSV string into an array of objects.
 * The first row is treated as headers (keys for each document).
 * Values are auto-coerced: numbers, booleans, empty string → null, otherwise string.
 */

import type { ZodType } from "zod";
import { FileDataQuery } from "./query.ts";

export function parseCSV(csv: string): Record<string, unknown>[] {
  const lines = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Find first non-empty line as header
  let headerIndex = 0;
  while (headerIndex < lines.length && lines[headerIndex].trim() === "") {
    headerIndex++;
  }
  if (headerIndex >= lines.length) return [];

  const headers = splitCSVLine(lines[headerIndex]);
  const results: Record<string, unknown>[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;

    const values = splitCSVLine(line);
    const doc: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j].trim();
      const raw = j < values.length ? values[j] : "";
      doc[key] = coerceValue(raw);
    }
    results.push(doc);
  }

  return results;
}

/**
 * Loads a CSV file from the given path and returns parsed documents.
 * Requires `--allow-read` permission.
 */
export async function loadCSV(
  path: string,
): Promise<Record<string, unknown>[]> {
  const text = await Deno.readTextFile(path);
  return parseCSV(text);
}

/**
 * Synchronously loads a CSV file from the given path and returns parsed documents.
 * Requires `--allow-read` permission.
 */
export function loadCSVSync(path: string): Record<string, unknown>[] {
  const text = Deno.readTextFileSync(path);
  return parseCSV(text);
}

/**
 * Serialize an array of documents to a CSV string.
 *
 * Headers are derived from the union of all object keys (first object's key
 * order, then any extra keys from subsequent objects).
 * - `null` → empty string
 * - `boolean` / `number` → coerced to string
 * - Strings containing commas, double-quotes, or newlines are quoted and
 *   internal double-quotes are escaped as `""`.
 */
export function serializeCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";

  // Collect all headers preserving first-object order
  const headerSet = new Set<string>();
  for (const doc of data) {
    for (const key of Object.keys(doc)) {
      headerSet.add(key);
    }
  }
  const headers = [...headerSet];

  const escapeField = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines: string[] = [headers.map(escapeField).join(",")];
  for (const doc of data) {
    lines.push(headers.map((h) => escapeField(doc[h])).join(","));
  }
  return lines.join("\n");
}

/** Options for CSV query factory functions. */
export interface CSVQueryOptions {
  /** If provided, writes to this path instead of overwriting the source. */
  output?: string;
}

/**
 * Load a CSV file and return a `FileDataQuery` backed by a CSV persistence adapter.
 * Calling `.save()` writes the mutated data back to disk (to `output` if given,
 * otherwise overwrites the source file).
 */
export async function queryCSV(
  path: string,
  opts?: CSVQueryOptions,
): Promise<FileDataQuery<Record<string, unknown>>>;
export async function queryCSV<T extends object>(
  path: string,
  opts: CSVQueryOptions & { schema: ZodType<T> },
): Promise<FileDataQuery<T>>;
export async function queryCSV<T extends object>(
  path: string,
  opts?: CSVQueryOptions & { schema?: ZodType<T> },
): Promise<FileDataQuery<T> | FileDataQuery<Record<string, unknown>>> {
  const rawData = await loadCSV(path);
  const dest = opts?.output ?? path;
  const adapter = {
    save: async (d: Record<string, unknown>[]) => {
      await Deno.writeTextFile(dest, serializeCSV(d));
    },
    saveSync: (d: Record<string, unknown>[]) => {
      Deno.writeTextFileSync(dest, serializeCSV(d));
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
 * Synchronously load a CSV file and return a `FileDataQuery` backed by a CSV
 * persistence adapter.
 */
export function queryCSVSync(
  path: string,
  opts?: CSVQueryOptions,
): FileDataQuery<Record<string, unknown>>;
export function queryCSVSync<T extends object>(
  path: string,
  opts: CSVQueryOptions & { schema: ZodType<T> },
): FileDataQuery<T>;
export function queryCSVSync<T extends object>(
  path: string,
  opts?: CSVQueryOptions & { schema?: ZodType<T> },
): FileDataQuery<T> | FileDataQuery<Record<string, unknown>> {
  const rawData = loadCSVSync(path);
  const dest = opts?.output ?? path;
  const adapter = {
    save: async (d: Record<string, unknown>[]) => {
      await Deno.writeTextFile(dest, serializeCSV(d));
    },
    saveSync: (d: Record<string, unknown>[]) => {
      Deno.writeTextFileSync(dest, serializeCSV(d));
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

/** Split a single CSV line respecting quoted fields. */
function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote?
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

/** Coerce a raw CSV string value to number, boolean, null, or string. */
function coerceValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.toLowerCase() === "true") return true;
  if (trimmed.toLowerCase() === "false") return false;
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== "") return num;
  return trimmed;
}
