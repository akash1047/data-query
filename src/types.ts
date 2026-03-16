// ── Utility types ─────────────────────────────────────────────────────────────

export type Primitive = string | number | boolean | null | undefined | Date;

// ── Filter Operator Interfaces ────────────────────────────────────────────────

export interface ComparisonOperators<T> {
  $eq?: T;
  $ne?: T;
  $gt?: T;
  $gte?: T;
  $lt?: T;
  $lte?: T;
  $in?: T[];
  $nin?: T[];
}

export interface ElementOperators {
  $exists?: boolean;
}

export interface StringOperators {
  $regex?: RegExp | string;
}

export interface ArrayOperators {
  $elemMatch?: FilterQuery<Record<string, unknown>>;
  $size?: number;
  $all?: Primitive[];
}

export type FieldCondition<T> =
  | T
  | (ComparisonOperators<T> & ElementOperators & StringOperators & ArrayOperators);

export type FilterQuery<T extends object> = {
  [K in keyof T]?: FieldCondition<T[K]>;
} & {
  [path: string]: unknown;
  $and?: FilterQuery<Record<string, unknown>>[];
  $or?: FilterQuery<Record<string, unknown>>[];
  $nor?: FilterQuery<Record<string, unknown>>[];
  $not?: FilterQuery<Record<string, unknown>>;
};

// ── Sort ──────────────────────────────────────────────────────────────────────

export type SortDirection = 1 | -1;

export type SortQuery<T extends object> = {
  [K in keyof T]?: SortDirection;
} & {
  [path: string]: SortDirection;
};

// ── Projection ────────────────────────────────────────────────────────────────

export type ProjectQuery<T extends object> = {
  [K in keyof T]?: 0 | 1;
} & {
  [path: string]: 0 | 1;
};

// ── Update Operators ──────────────────────────────────────────────────────────

export interface UpdateQuery<T extends object> {
  $set?: Partial<T> & Record<string, unknown>;
  $unset?: Partial<Record<keyof T, "" | 1>> & Record<string, "" | 1>;
  $inc?: Partial<Record<keyof T, number>> & Record<string, number>;
  $push?: Partial<Record<keyof T, unknown>> & Record<string, unknown>;
  $pull?: Partial<Record<keyof T, unknown>> & Record<string, unknown>;
  $rename?: Partial<Record<keyof T, string>> & Record<string, string>;
}

// ── Results ───────────────────────────────────────────────────────────────────

export interface UpdateResult {
  matchedCount: number;
  modifiedCount: number;
}

export interface DeleteResult {
  deletedCount: number;
}

// ── Aggregation Pipeline ──────────────────────────────────────────────────────

export interface GroupAccumulators {
  $sum?: string | number;
  $avg?: string;
  $min?: string;
  $max?: string;
  $count?: true;
  $push?: string;
  $first?: string;
  $last?: string;
}

export type GroupStage = {
  _id: string | null;
  [accumulatorField: string]: GroupAccumulators | string | null;
};

export type PipelineStage =
  | { $match: FilterQuery<Record<string, unknown>> }
  | { $sort: SortQuery<Record<string, unknown>> }
  | { $limit: number }
  | { $skip: number }
  | { $group: GroupStage }
  | { $project: ProjectQuery<Record<string, unknown>> }
  | { $unwind: string };
