# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-17

### Added

- `DataQuery<T>` — fluent, chainable query builder for in-memory arrays
  - Chain methods: `find`, `filter`, `sort`, `limit`, `skip`, `project`
  - Read terminals: `toArray`, `first`, `count`, `distinct`
  - Write terminals: `updateOne`, `updateMany`, `deleteOne`, `deleteMany`
  - Aggregation pipeline: `aggregate` with `$match`, `$sort`, `$limit`, `$skip`,
    `$project`, `$group`, `$unwind`, `$addFields`
- `FileDataQuery<T>` — extends `DataQuery` with `.save()` / `.saveSync()` via a
  pluggable `PersistenceAdapter`
- **CSV adapter** — `queryCSV`, `queryCSVSync`, `parseCSV`, `serializeCSV`,
  `loadCSV`, `loadCSVSync`; auto-coerces numbers, booleans, empty → `null`
- **XLSX adapter** — `queryXLSX`, `queryXLSXSync`, `parseXLSX`, `serializeXLSX`,
  `loadXLSX`, `loadXLSXSync`; preserves native cell types via SheetJS
- **JSON adapter** — `queryJSON`, `queryJSONSync`, `parseJSON`, `serializeJSON`,
  `loadJSON`, `loadJSONSync`; root must be a JSON array
- **Google Apps Script adapter** — `queryGASSheet`; wraps a duck-typed `GASSheet`
  interface (no `@types/google-apps-script` dependency required)
- **Zod validation** — optional `schema` option on all factory functions;
  validates on load, after `updateOne`/`updateMany`, and before save;
  return type narrowed to `FileDataQuery<T>`
- Full MongoDB-style filter operators: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`,
  `$lte`, `$in`, `$nin`, `$exists`, `$regex`, `$type`, `$mod`, `$size`, `$all`,
  `$elemMatch`, `$and`, `$or`, `$nor`, `$not`
- Full update operators: `$set`, `$unset`, `$inc`, `$mul`, `$push`, `$pull`,
  `$addToSet`, `$pop`, `$rename`; dot-notation supported on `$set`
- Dot-notation field paths supported in `find`, `sort`, `project`, `distinct`,
  and `$set`
- 117 tests; GitHub Actions CI and JSR publish workflows
