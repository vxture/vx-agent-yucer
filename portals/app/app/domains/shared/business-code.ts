import { isUniqueViolation } from "./allocate";
import { fail, ok, violation, type RuleResult } from "./result";

export type BusinessCodeKind = "MKT" | "SOL" | "PRD";
export type BusinessWrite = "create" | { readonly editId: string };

const businessDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
});

/** Preview and allocation use the same business date and per-prefix sequence. */
export function nextBusinessCode(kind: BusinessCodeKind, existing: readonly string[], now = new Date()): string {
  const parts = new Map(businessDay.formatToParts(now).map(part => [part.type, part.value]));
  const day = `${parts.get("year")}${parts.get("month")}${parts.get("day")}`;
  const stem = `${kind}-${day}-`;
  let max = 0;
  for (const code of existing) {
    if (!code.startsWith(stem)) continue;
    const suffix = code.slice(stem.length);
    if (/^\d{1,12}$/.test(suffix)) max = Math.max(max, Number(suffix));
  }
  return `${stem}${String(max + 1).padStart(3, "0")}`;
}

// Stores survive module reloads in the development registry. The service and
// a retained store may therefore hold different copies of an Error class.
export class BusinessCodeCollision extends Error {
  readonly code = "business_number_conflict";
}
export class BusinessRecordMissing extends Error {
  readonly code = "business_record_missing";
}

function isBusinessError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/** Catch the unique constraint at the header insert, not in relation writes. */
export async function createBusinessRow<T>(insert: () => Promise<T>): Promise<T> {
  try { return await insert(); }
  catch (error) {
    if (isUniqueViolation(error)) throw new BusinessCodeCollision();
    throw error;
  }
}

export async function editBusinessRow<T>(update: () => Promise<T>): Promise<T> {
  try { return await update(); }
  catch (error) {
    if (isUniqueViolation(error)) throw new BusinessCodeCollision();
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") throw new BusinessRecordMissing();
    throw error;
  }
}

export function businessRecordMissing(): RuleResult<never> {
  return fail(violation("not_found", "record does not exist in this workspace"));
}

/** A preview is not a reservation. A concurrent insert can only redo CREATE. */
export async function saveBusinessRecord<T>(kind: BusinessCodeKind, existing: readonly string[], mode: BusinessWrite | undefined,
  write: (code?: string) => Promise<T>, manualCode?: string): Promise<RuleResult<T>> {
  const seen = [...existing];
  const now = new Date();
  const automatic = mode === "create" && manualCode === undefined;
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = automatic ? nextBusinessCode(kind, seen, now) : manualCode;
    try { return ok(await write(code)); }
    catch (error) {
      if (isBusinessError(error, "business_record_missing")) return businessRecordMissing();
      if (!isBusinessError(error, "business_number_conflict")) throw error;
      if (!automatic || code === undefined) return fail(violation("number_taken", "product number is already in use", "productCode"));
      seen.push(code);
    }
  }
  return fail(violation("number_busy", "record numbering is busy; retry", undefined, true));
}
