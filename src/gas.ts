/**
 * Google Apps Script SpreadsheetApp adapter for data-query.
 *
 * Wraps a GAS `Sheet` object so the full fluent query/mutation API can be used
 * against Google Sheets data without any file I/O.
 *
 * Entry points:
 *   `queryGASSheet` — factory returning a `FileDataQuery` backed by a GAS Sheet
 *
 * @example
 * ```ts
 * // Inside a Google Apps Script project
 * const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Data");
 * const q = queryGASSheet(sheet);
 * q.find({ status: "pending" }).updateMany({ $set: { status: "done" } });
 * q.saveSync(); // writes back to the sheet
 * ```
 */

import type { ZodType } from "zod";
import { FileDataQuery } from "./query.ts";

// ── Minimal duck-typed GAS Sheet interface ────────────────────────────────────

/** Minimal interface for a GAS Range returned by `getDataRange()`. */
interface GASRange {
  getValues(): unknown[][];
}

/** Minimal interface for a GAS Range returned by `getRange()`. */
interface GASWriteRange {
  setValues(values: unknown[][]): void;
}

/**
 * Minimal duck-typed interface for a Google Apps Script `Sheet` object.
 * The real `SpreadsheetApp.Sheet` satisfies this interface; tests can pass a
 * plain object mock.
 */
export interface GASSheet {
  /** Returns a Range spanning all data on the sheet. */
  getDataRange(): GASRange;
  /** Clears all content (but not formatting) from the sheet. */
  clearContents(): void;
  /**
   * Returns a Range at the given position.
   * @param row    - 1-based row index.
   * @param col    - 1-based column index.
   * @param numRows - Number of rows in the range.
   * @param numCols - Number of columns in the range.
   */
  getRange(
    row: number,
    col: number,
    numRows: number,
    numCols: number,
  ): GASWriteRange;
}

// ── Conversion helpers ────────────────────────────────────────────────────────

/**
 * Convert a GAS Sheet's 2D value array into an array of plain objects.
 * Row 0 is treated as the header row; subsequent rows become documents.
 * Empty cells (empty string or undefined) are coerced to `null`.
 */
function sheetToObjects(sheet: GASSheet): Record<string, unknown>[] {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const [headerRow, ...dataRows] = values;
  const headers = (headerRow as unknown[]).map(String);
  return dataRows.map((row) => {
    const doc: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i++) {
      const cell = (row as unknown[])[i];
      doc[headers[i]] = (cell === "" || cell === undefined) ? null : cell;
    }
    return doc;
  });
}

/**
 * Write an array of plain objects back to a GAS Sheet.
 * Clears all existing content then writes a header row followed by data rows.
 * Headers are the union of all object keys, preserving first-object key order.
 */
function objectsToSheet(
  sheet: GASSheet,
  data: Record<string, unknown>[],
): void {
  sheet.clearContents();
  if (data.length === 0) return;

  // Collect headers preserving first-object order
  const headerSet = new Set<string>();
  for (const doc of data) {
    for (const key of Object.keys(doc)) headerSet.add(key);
  }
  const headers = [...headerSet];

  const rows: unknown[][] = [headers];
  for (const doc of data) {
    rows.push(headers.map((h) => doc[h] ?? null));
  }
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
}

// ── Factory function ──────────────────────────────────────────────────────────

/**
 * Create a `FileDataQuery` from a Google Apps Script `Sheet` object.
 *
 * @param sheet - A GAS Sheet (or any object satisfying `GASSheet`).
 * @returns A `FileDataQuery<Record<string, unknown>>` ready to be chained.
 *
 * @example
 * ```ts
 * const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sales");
 * const q = queryGASSheet(sheet);
 * q.find({ region: "North" }).updateMany({ $inc: { revenue: 500 } });
 * q.saveSync();
 * ```
 */
export function queryGASSheet(
  sheet: GASSheet,
): FileDataQuery<Record<string, unknown>>;

/**
 * Create a typed `FileDataQuery<T>` from a GAS Sheet with Zod schema validation.
 * Each row is validated against `opts.schema` on load; rows failing validation
 * throw `Error("Validation failed at row <i>: ...")`.
 * Mutations and saves are also validated.
 *
 * @param sheet - A GAS Sheet (or any object satisfying `GASSheet`).
 * @param opts  - Options including a Zod schema.
 * @returns A `FileDataQuery<T>` where `T` is inferred from the schema.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * const RowSchema = z.object({ name: z.string(), amount: z.number() });
 * const q = queryGASSheet(sheet, { schema: RowSchema });
 * // q is FileDataQuery<{ name: string; amount: number }>
 * ```
 */
export function queryGASSheet<T extends object>(
  sheet: GASSheet,
  opts: { schema: ZodType<T> },
): FileDataQuery<T>;

export function queryGASSheet<T extends object>(
  sheet: GASSheet,
  opts?: { schema?: ZodType<T> },
): FileDataQuery<T> | FileDataQuery<Record<string, unknown>> {
  const rawData = sheetToObjects(sheet);
  const adapter = {
    save: async (d: Record<string, unknown>[]) => {
      objectsToSheet(sheet, d);
      await Promise.resolve();
    },
    saveSync: (d: Record<string, unknown>[]) => {
      objectsToSheet(sheet, d);
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
