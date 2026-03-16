import type {
  FilterQuery,
  GroupAccumulators,
  GroupStage,
  PipelineStage,
  ProjectQuery,
  SortQuery,
} from "./types.ts";
import { getNestedValue } from "./utils.ts";
import { matchesFilter } from "./filter.ts";

type Doc = Record<string, unknown>;

export function executePipeline(data: Doc[], pipeline: PipelineStage[]): Doc[] {
  let working: Doc[] = [...data];
  for (const stage of pipeline) {
    if ("$match" in stage) {
      working = executeMatch(working, stage.$match as FilterQuery<Doc>);
    } else if ("$sort" in stage) {
      working = executeSort(working, stage.$sort as SortQuery<Doc>);
    } else if ("$limit" in stage) {
      working = working.slice(0, stage.$limit);
    } else if ("$skip" in stage) {
      working = working.slice(stage.$skip);
    } else if ("$project" in stage) {
      working = executeProject(working, stage.$project as ProjectQuery<Doc>);
    } else if ("$group" in stage) {
      working = executeGroup(working, stage.$group);
    } else if ("$unwind" in stage) {
      working = executeUnwind(working, stage.$unwind);
    } else {
      throw new TypeError(`Unknown aggregation stage: ${JSON.stringify(Object.keys(stage))}`);
    }
  }
  return working;
}

function executeMatch(data: Doc[], filter: FilterQuery<Doc>): Doc[] {
  return data.filter((doc) => matchesFilter(doc, filter));
}

function executeSort(data: Doc[], spec: SortQuery<Doc>): Doc[] {
  const result = [...data];
  result.sort((a, b) => {
    for (const [path, dir] of Object.entries(spec)) {
      const aVal = getNestedValue(a, path);
      const bVal = getNestedValue(b, path);
      if ((aVal as number) < (bVal as number)) return -1 * (dir as number);
      if ((aVal as number) > (bVal as number)) return 1 * (dir as number);
    }
    return 0;
  });
  return result;
}

export function executeProject(data: Doc[], spec: ProjectQuery<Doc>): Doc[] {
  const entries = Object.entries(spec);
  if (entries.length === 0) return data;

  const includeEntries = entries.filter(([, v]) => v === 1);
  const excludeEntries = entries.filter(([, v]) => v === 0);

  if (includeEntries.length > 0 && excludeEntries.length > 0) {
    throw new TypeError("Cannot mix inclusion and exclusion in project");
  }

  if (includeEntries.length > 0) {
    return data.map((doc) => {
      const result: Doc = {};
      for (const [path] of includeEntries) {
        const val = getNestedValue(doc, path);
        if (val !== undefined) {
          setNestedInResult(result, path, val);
        }
      }
      return result;
    });
  } else {
    return data.map((doc) => {
      const result: Doc = { ...doc };
      for (const [path] of excludeEntries) {
        deleteNestedInResult(result, path);
      }
      return result;
    });
  }
}

function setNestedInResult(obj: Doc, path: string, value: unknown): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof current[parts[i]] !== "object" || current[parts[i]] === null) {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Doc;
  }
  current[parts[parts.length - 1]] = value;
}

function deleteNestedInResult(obj: Doc, path: string): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof current[parts[i]] !== "object" || current[parts[i]] === null) return;
    current = current[parts[i]] as Doc;
  }
  delete current[parts[parts.length - 1]];
}

function executeGroup(data: Doc[], stage: GroupStage): Doc[] {
  const groupByPath = stage._id;
  const groups = new Map<string, Doc[]>();

  for (const doc of data) {
    const keyVal = groupByPath === null
      ? "__all__"
      : String(getNestedValue(doc, groupByPath) ?? "null");
    if (!groups.has(keyVal)) {
      groups.set(keyVal, []);
    }
    groups.get(keyVal)!.push(doc);
  }

  const results: Doc[] = [];

  for (const [groupKey, groupDocs] of groups) {
    const result: Doc = {
      _id: groupByPath === null ? null : groupKey,
    };

    for (const [field, accDef] of Object.entries(stage)) {
      if (field === "_id") continue;
      const acc = accDef as GroupAccumulators;
      result[field] = computeAccumulator(acc, groupDocs);
    }

    results.push(result);
  }

  return results;
}

function computeAccumulator(acc: GroupAccumulators, docs: Doc[]): unknown {
  if (acc.$count === true) {
    return docs.length;
  }
  if (acc.$sum !== undefined) {
    if (typeof acc.$sum === "number") {
      return acc.$sum * docs.length;
    }
    const path = acc.$sum as string;
    return docs.reduce((sum, doc) => sum + ((getNestedValue(doc, path) as number) ?? 0), 0);
  }
  if (acc.$avg !== undefined) {
    const path = acc.$avg;
    const values = docs.map((d) => (getNestedValue(d, path) as number) ?? 0);
    return values.reduce((s, v) => s + v, 0) / (values.length || 1);
  }
  if (acc.$min !== undefined) {
    const path = acc.$min;
    const values = docs.map((d) => getNestedValue(d, path) as number);
    return Math.min(...values);
  }
  if (acc.$max !== undefined) {
    const path = acc.$max;
    const values = docs.map((d) => getNestedValue(d, path) as number);
    return Math.max(...values);
  }
  if (acc.$push !== undefined) {
    const path = acc.$push;
    return docs.map((d) => getNestedValue(d, path));
  }
  if (acc.$first !== undefined) {
    return getNestedValue(docs[0], acc.$first);
  }
  if (acc.$last !== undefined) {
    return getNestedValue(docs[docs.length - 1], acc.$last);
  }
  throw new TypeError(`Unknown accumulator: ${JSON.stringify(acc)}`);
}

function executeUnwind(data: Doc[], path: string): Doc[] {
  const result: Doc[] = [];
  for (const doc of data) {
    const val = getNestedValue(doc, path);
    if (!Array.isArray(val)) {
      result.push(doc);
      continue;
    }
    for (const item of val) {
      const unwound: Doc = { ...doc };
      setNestedInResult(unwound, path, item);
      result.push(unwound);
    }
  }
  return result;
}
