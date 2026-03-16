import type {
  DeleteResult,
  FilterQuery,
  PipelineStage,
  ProjectQuery,
  SortQuery,
  UpdateQuery,
  UpdateResult,
} from "./types.ts";
import { matchesFilter } from "./filter.ts";
import { applyUpdate } from "./update.ts";
import { executePipeline, executeProject } from "./aggregate.ts";
import { getNestedValue } from "./utils.ts";

type AnyDoc = Record<string, unknown>;

export class DataQuery<T extends object> {
  readonly #source: T[];
  #filter: FilterQuery<T> | null = null;
  #sortSpec: SortQuery<T> | null = null;
  #limitVal: number | null = null;
  #skipVal: number | null = null;
  #projectSpec: ProjectQuery<T> | null = null;

  constructor(data: T[]) {
    this.#source = data;
  }

  // ── Lazy chain methods ────────────────────────────────────────────────────

  find(filter?: FilterQuery<T>): this {
    if (!filter) return this;
    if (!this.#filter) {
      this.#filter = filter;
    } else {
      this.#filter = {
        $and: [
          this.#filter as FilterQuery<AnyDoc>,
          filter as FilterQuery<AnyDoc>,
        ],
      } as unknown as FilterQuery<T>;
    }
    return this;
  }

  filter(filter: FilterQuery<T>): this {
    return this.find(filter);
  }

  sort(spec: SortQuery<T>): this {
    this.#sortSpec = spec;
    return this;
  }

  limit(n: number): this {
    this.#limitVal = n;
    return this;
  }

  skip(n: number): this {
    this.#skipVal = n;
    return this;
  }

  project(spec: ProjectQuery<T>): this {
    this.#projectSpec = spec;
    return this;
  }

  // ── Terminal read methods ────────────────────────────────────────────────

  toArray(): T[] {
    return this.#execute();
  }

  first(): T | null {
    const prev = this.#limitVal;
    this.#limitVal = 1;
    const result = this.#execute();
    this.#limitVal = prev;
    return result[0] ?? null;
  }

  count(): number {
    return this.#applyFilter([...this.#source]).length;
  }

  // ── Terminal write methods ────────────────────────────────────────────────

  updateOne(update: UpdateQuery<T>): UpdateResult {
    let matchedCount = 0;
    let modifiedCount = 0;
    for (const doc of this.#source) {
      if (this.#filter && !matchesFilter(doc, this.#filter)) continue;
      matchedCount++;
      if (applyUpdate(doc, update)) modifiedCount++;
      break;
    }
    return { matchedCount, modifiedCount };
  }

  updateMany(update: UpdateQuery<T>): UpdateResult {
    let matchedCount = 0;
    let modifiedCount = 0;
    for (const doc of this.#source) {
      if (this.#filter && !matchesFilter(doc, this.#filter)) continue;
      matchedCount++;
      if (applyUpdate(doc, update)) modifiedCount++;
    }
    return { matchedCount, modifiedCount };
  }

  deleteOne(): DeleteResult {
    for (let i = 0; i < this.#source.length; i++) {
      if (this.#filter && !matchesFilter(this.#source[i], this.#filter)) continue;
      this.#source.splice(i, 1);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  deleteMany(): DeleteResult {
    const indices: number[] = [];
    for (let i = 0; i < this.#source.length; i++) {
      if (!this.#filter || matchesFilter(this.#source[i], this.#filter)) {
        indices.push(i);
      }
    }
    // Process in descending order to keep earlier indices stable
    for (let j = indices.length - 1; j >= 0; j--) {
      this.#source.splice(indices[j], 1);
    }
    return { deletedCount: indices.length };
  }

  // ── Terminal aggregation ──────────────────────────────────────────────────

  aggregate(pipeline: PipelineStage[]): AnyDoc[] {
    return executePipeline(this.#source as unknown as AnyDoc[], pipeline);
  }

  // ── Private execution helpers ────────────────────────────────────────────

  #applyFilter(data: T[]): T[] {
    if (!this.#filter) return data;
    return data.filter((doc) => matchesFilter(doc, this.#filter!));
  }

  #applySort(data: T[]): T[] {
    if (!this.#sortSpec) return data;
    const spec = this.#sortSpec;
    data.sort((a, b) => {
      for (const [path, dir] of Object.entries(spec)) {
        const aVal = getNestedValue(a as AnyDoc, path);
        const bVal = getNestedValue(b as AnyDoc, path);
        if ((aVal as number) < (bVal as number)) return -1 * (dir as number);
        if ((aVal as number) > (bVal as number)) return 1 * (dir as number);
      }
      return 0;
    });
    return data;
  }

  #execute(): T[] {
    let working: T[] = [...this.#source];
    working = this.#applyFilter(working);
    working = this.#applySort(working);
    if (this.#skipVal !== null) working = working.slice(this.#skipVal);
    if (this.#limitVal !== null) working = working.slice(0, this.#limitVal);
    if (this.#projectSpec) {
      working = executeProject(
        working as unknown as AnyDoc[],
        this.#projectSpec as ProjectQuery<AnyDoc>,
      ) as unknown as T[];
    }
    return working;
  }
}

export function query<T extends object>(data: T[]): DataQuery<T> {
  return new DataQuery(data);
}
