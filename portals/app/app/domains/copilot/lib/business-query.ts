import { estimateTokens } from "../../../agent/orchestrator/prompt";
import type { TaskObject, TaskSource } from "./task-contract";

export const BUSINESS_QUERY_TOKENS = 2400;
const LIST_FIELDS = new Set([
  "id", "name", "title", "accountNo", "segmentCode", "productCode", "solutionCode",
  "status", "state", "stage", "priority", "tier", "ownerSub", "assigneeSub",
  "accountId", "segmentId", "region", "industryId", "year", "period", "revision",
  "amount", "currency", "targetValue", "metric", "scopeType", "objective", "summary",
  "expectedCloseAt", "createdAt", "updatedAt", "startsAt", "endsAt", "dueAt",
  "strategyTypeId", "valuePropositionId", "solutionIds", "productIds", "criteria",
  "solution", "targetMarkets", "expectations", "result",
]);
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
export function validBusinessField(value: unknown): value is string {
  return typeof value === "string" && value.length <= 160 &&
    /^[a-zA-Z][a-zA-Z0-9_]*(?:\.(?:[a-zA-Z][a-zA-Z0-9_]*|0|[1-9][0-9]{0,5})){0,7}$/.test(value) &&
    value.split(".").every(key => !UNSAFE_KEYS.has(key));
}
export interface BusinessQueryOptions {
  id?: string;
  query?: string;
  offset?: number;
  limit?: number;
  fields?: string[];
  textOffset?: number;
}
interface BusinessRow { object: TaskObject; data: unknown }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}
function select(value: unknown, path: string): unknown {
  let selected = value;
  for (const key of path.split(".")) {
    if (selected === null || typeof selected !== "object" || !Object.hasOwn(selected, key)) return undefined;
    selected = (selected as Record<string, unknown>)[key];
  }
  return selected;
}
function preview(value: unknown, path: string, omitted: Set<string>, level: number, depth = 0): unknown {
  if (value instanceof Date) return value.toISOString();
  const stringLimit = [800, 240, 80, 32][level]!;
  if (typeof value === "string") {
    if (value.length <= stringLimit) return value;
    omitted.add(path); return value.slice(0, stringLimit);
  }
  if (value === null || typeof value !== "object") return value;
  const maxDepth = [5, 4, 3, 2][level]!;
  if (depth >= maxDepth) { omitted.add(path); return { previewOnly: true, type: Array.isArray(value) ? "array" : "object" }; }
  if (Array.isArray(value)) {
    const keep = [8, 4, 2, 1][level]!;
    if (value.length > keep) omitted.add(path);
    return value.slice(0, keep).map((item, index) => preview(item, `${path}.${index}`, omitted, level, depth + 1));
  }
  const entries = Object.entries(value).filter(([key]) => !UNSAFE_KEYS.has(key));
  const keep = [32, 24, 12, 8][level]!;
  if (entries.length > keep) omitted.add(path);
  return Object.fromEntries(entries.slice(0, keep).map(([key, item]) => [key, preview(item, path ? `${path}.${key}` : key, omitted, level, depth + 1)]));
}
function project(row: BusinessRow, options: BusinessQueryOptions) {
  if (options.fields?.length) return Object.fromEntries(options.fields.map(path => [path, select(row.data, path) ?? null]));
  if (options.id || !object(row.data)) return row.data;
  return Object.fromEntries(Object.entries(row.data).filter(([key]) => LIST_FIELDS.has(key)));
}
async function readPageRows(
  rows: readonly BusinessRow[], options: BusinessQueryOptions,
  source: (object: TaskObject) => Promise<TaskSource | null>,
) {
  const records: Array<{
    source: TaskSource;
    data: unknown;
    availableFields: string[];
    arrayLengths: Record<string, number>;
  }> = [];
  for (const row of rows) {
    const ref = await source(row.object);
    if (!ref) throw Error("source_unavailable");
    const data = project(row, options);
    records.push({ source: ref, data,
      availableFields: object(row.data) ? Object.keys(row.data).filter(key => !UNSAFE_KEYS.has(key)) : [],
      arrayLengths: object(row.data) ? Object.fromEntries(Object.entries({ ...row.data, ...(object(data) ? data : {}) }).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, (value as unknown[]).length])) : {},
    });
  }
  return records;
}

/** Only authorized rows enter here. Sources are acquired after paging and stay
 * bound to full records; a preview is never a replacement source version. */
export async function businessQueryPage(
  rows: readonly BusinessRow[], options: BusinessQueryOptions, access: TaskSource,
  source: (object: TaskObject) => Promise<TaskSource | null>,
) {
  const query = (options.query ?? "").toLocaleLowerCase();
  const matched = rows.filter(row => (!options.id || row.object.id === options.id) &&
    (!query || JSON.stringify(row.data).toLocaleLowerCase().includes(query)))
    .sort((a, b) => a.object.id.localeCompare(b.object.id));
  const offset = options.offset ?? 0, limit = options.limit ?? 10;
  const selected = matched.slice(offset, offset + limit);
  const textField = options.id && options.fields?.length === 1 ? options.fields[0] : undefined;
  const text = textField && selected[0] ? select(selected[0].data, textField) : undefined;
  if (options.textOffset !== undefined && typeof text !== "string") throw Error("business_query_denied");
  const records = await readPageRows(selected, options, source);
  const build = (level: number, count: number) => {
    const page = records.slice(0, count).map(row => {
      const omitted = new Set<string>();
      const start = options.textOffset ?? 0;
      const end = Math.min(start + [3200, 1600, 800, 240][level]!, typeof text === "string" ? text.length : 0);
      const textPage = textField && typeof text === "string"
        ? { field: textField, offset: start, nextOffset: end < text.length ? end : null, totalLength: text.length } : undefined;
      if (textPage && (start > 0 || textPage.nextOffset !== null)) omitted.add(textField!);
      const record = textPage && typeof text === "string" ? { [textField!]: text.slice(start, end) } : preview(row.data, "", omitted, level);
      return { source: row.source, record, availableFields: row.availableFields, arrayLengths: row.arrayLengths, truncatedPaths: [...omitted], ...(textPage ? { textPage } : {}) };
    });
    const nextOffset = offset + page.length < matched.length ? offset + page.length : null;
    return {
      records: page, sources: [access, ...page.map(row => row.source)],
      matchedCount: matched.length, returnedCount: page.length, offset, nextOffset,
      limited: nextOffset !== null,
      detail: !!options.id || !!options.fields?.length,
      recordState: "Current authorized records; draft statuses are not published facts.",
      note: "Results are field previews, not full records. truncatedPaths explicitly marks excerpts. Do not infer absent activity or compute whole-population totals from a page. Follow nextOffset with the same filters. Read by id and fields (dot paths/array indices); availableFields lists top-level fields. For one string field with id, follow textPage.nextOffset as textOffset to read the remaining text.",
    };
  };
  let count = records.length;
  for (;;) {
    for (let level = 0; level <= 3; level++) {
      const result = build(level, count);
      if (estimateTokens(JSON.stringify(result)) <= BUSINESS_QUERY_TOKENS) return result;
    }
    // At least one row always survives so pagination cannot silently stall.
    if (count <= 1) throw Error("business_query_too_large");
    count--;
  }
}
