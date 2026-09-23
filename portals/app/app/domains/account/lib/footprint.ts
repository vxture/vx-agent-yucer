// 只删空壳客户 (owner, 2026-09-23). What counts as a customer having a life in
// the product - any one of these, and the record is history, not a mistake to
// tidy away. One list, read by the service (which refuses) and the page's
// confirmation (which says why), so the two cannot disagree about "empty".

export const FOOTPRINT_KINDS = [
  "deals",
  "contracts",
  "projects",
  "interactions",
  "commitments",
  "contacts",
  "leads",
  "children",
] as const;
export type FootprintKind = (typeof FOOTPRINT_KINDS)[number];
export type Footprint = Readonly<Record<FootprintKind, number>>;

/** Nothing hangs on it: created by mistake, or never worked. */
export function isEmptyShell(f: Footprint): boolean {
  return FOOTPRINT_KINDS.every((k) => f[k] === 0);
}
