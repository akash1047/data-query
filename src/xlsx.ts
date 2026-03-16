/**
 * XLSX loader — parses an Excel workbook into an array of plain objects.
 *
 * Uses SheetJS (`npm:xlsx`) under the hood.  The first row of the target
 * sheet is treated as the header row; each subsequent row becomes a document
 * whose keys are the header values.
 *
 * Cell values are preserved as their native types (number, boolean, string).
 * Empty cells become `null`.
 *
 * Entry points:
 *   `parseXLSX`    — parse from an in-memory `Uint8Array`
 *   `loadXLSX`     — async read from the file system
 *   `loadXLSXSync` — sync read from the file system
 *   `serializeXLSX`— serialize documents to a `Uint8Array`
 *   `queryXLSX`    — async factory returning a `FileDataQuery`
 *   `queryXLSXSync`— sync factory returning a `FileDataQuery`
 */

import * as XLSX from "xlsx";
import type { ZodType } from "zod";
import { FileDataQuery } from "./query.ts";

/**
 * Parse an in-memory XLSX buffer into an array of documents.
 *
 * @param data      - The raw `.xlsx` file bytes.
 * @param sheetName - Name of the sheet to read. Defaults to the first sheet.
 * @returns An array of plain objects; one per data row.
 *
 * @example
 * ```ts
 * const buf = await Deno.readFile("data.xlsx");
 * const docs = parseXLSX(buf);
 * query(docs).find({ city: "Delhi" }).toArray();
 * ```
 */
export function parseXLSX(
  data: Uint8Array,
  sheetName?: string,
): Record<string, unknown>[] {
  const workbook = XLSX.read(data, { type: "buffer" });
  const name = sheetName ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  });
}

/**
 * Asynchronously load an XLSX file from disk and return its documents.
 * Requires `--allow-read` permission.
 *
 * @param path      - Path to the `.xlsx` file.
 * @param sheetName - Name of the sheet to read. Defaults to the first sheet.
 *
 * @example
 * ```ts
 * const docs = await loadXLSX("./report.xlsx");
 * ```
 */
export async function loadXLSX(
  path: string,
  sheetName?: string,
): Promise<Record<string, unknown>[]> {
  const data = await Deno.readFile(path);
  return parseXLSX(data, sheetName);
}

/**
 * Synchronously load an XLSX file from disk and return its documents.
 * Requires `--allow-read` permission.
 *
 * @param path      - Path to the `.xlsx` file.
 * @param sheetName - Name of the sheet to read. Defaults to the first sheet.
 *
 * @example
 * ```ts
 * const docs = loadXLSXSync("./report.xlsx");
 * ```
 */
export function loadXLSXSync(
  path: string,
  sheetName?: string,
): Record<string, unknown>[] {
  const data = Deno.readFileSync(path);
  return parseXLSX(data, sheetName);
}

/**
 * Serialize an array of documents to an XLSX `Uint8Array`.
 *
 * @param data      - The documents to serialize.
 * @param sheetName - Name of the sheet in the output workbook. Defaults to `"Sheet1"`.
 */
export function serializeXLSX(
  data: Record<string, unknown>[],
  sheetName = "Sheet1",
): Uint8Array {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
}

/** Options for XLSX query factory functions. */
export interface XLSXQueryOptions {
  /** If provided, writes to this path instead of overwriting the source. */
  output?: string;
  /** Sheet name to read from the source workbook. Defaults to the first sheet. */
  sheetName?: string;
}

/**
 * Load an XLSX file and return a `FileDataQuery` backed by an XLSX persistence adapter.
 * Calling `.save()` writes the mutated data back to disk.
 */
export async function queryXLSX(
  path: string,
  opts?: XLSXQueryOptions,
): Promise<FileDataQuery<Record<string, unknown>>>;
export async function queryXLSX<T extends object>(
  path: string,
  opts: XLSXQueryOptions & { schema: ZodType<T> },
): Promise<FileDataQuery<T>>;
export async function queryXLSX<T extends object>(
  path: string,
  opts?: XLSXQueryOptions & { schema?: ZodType<T> },
): Promise<FileDataQuery<T> | FileDataQuery<Record<string, unknown>>> {
  const rawData = await loadXLSX(path, opts?.sheetName);
  const dest = opts?.output ?? path;
  const sn = opts?.sheetName;
  const adapter = {
    save: async (d: Record<string, unknown>[]) => {
      await Deno.writeFile(dest, serializeXLSX(d, sn));
    },
    saveSync: (d: Record<string, unknown>[]) => {
      Deno.writeFileSync(dest, serializeXLSX(d, sn));
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
 * Synchronously load an XLSX file and return a `FileDataQuery` backed by an
 * XLSX persistence adapter.
 */
export function queryXLSXSync(
  path: string,
  opts?: XLSXQueryOptions,
): FileDataQuery<Record<string, unknown>>;
export function queryXLSXSync<T extends object>(
  path: string,
  opts: XLSXQueryOptions & { schema: ZodType<T> },
): FileDataQuery<T>;
export function queryXLSXSync<T extends object>(
  path: string,
  opts?: XLSXQueryOptions & { schema?: ZodType<T> },
): FileDataQuery<T> | FileDataQuery<Record<string, unknown>> {
  const rawData = loadXLSXSync(path, opts?.sheetName);
  const dest = opts?.output ?? path;
  const sn = opts?.sheetName;
  const adapter = {
    save: async (d: Record<string, unknown>[]) => {
      await Deno.writeFile(dest, serializeXLSX(d, sn));
    },
    saveSync: (d: Record<string, unknown>[]) => {
      Deno.writeFileSync(dest, serializeXLSX(d, sn));
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
