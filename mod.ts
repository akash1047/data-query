/**
 * @module
 * `@akash1047/data-query` — MongoDB/Mongoose-style querying for in-memory JavaScript arrays.
 *
 * @example
 * ```ts
 * import { query, parseCSV } from "@akash1047/data-query";
 *
 * const data = [
 *   { name: "Alice", age: 30, city: "Delhi" },
 *   { name: "Bob",   age: 25, city: "Mumbai" },
 * ];
 *
 * // Fluent read query
 * const adults = query(data)
 *   .find({ age: { $gte: 18 } })
 *   .sort({ name: 1 })
 *   .toArray();
 *
 * // Load from CSV and query
 * const csvDocs = parseCSV("name,age\nAlice,30\nBob,25");
 * const result  = query(csvDocs).find({ age: { $gt: 20 } }).first();
 * ```
 */
export { DataQuery, FileDataQuery, query } from "./src/query.ts";
export { loadCSV, loadCSVSync, parseCSV, queryCSV, queryCSVSync, serializeCSV } from "./src/csv.ts";
export {
  loadXLSX,
  loadXLSXSync,
  parseXLSX,
  queryXLSX,
  queryXLSXSync,
  serializeXLSX,
} from "./src/xlsx.ts";
export {
  loadJSON,
  loadJSONSync,
  parseJSON,
  queryJSON,
  queryJSONSync,
  serializeJSON,
} from "./src/json.ts";
export { queryGASSheet } from "./src/gas.ts";
export type { GASSheet } from "./src/gas.ts";
export type {
  DeleteResult,
  FieldCondition,
  FilterQuery,
  GroupAccumulators,
  GroupStage,
  PersistenceAdapter,
  PipelineStage,
  Primitive,
  ProjectQuery,
  SortDirection,
  SortQuery,
  UpdateQuery,
  UpdateResult,
} from "./src/types.ts";
