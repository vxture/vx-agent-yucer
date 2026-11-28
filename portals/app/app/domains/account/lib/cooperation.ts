// A tenant's first real cooperation, including history before using yucer.
// Corrections append a new assertion; registration and transfers never infer it.
export type CooperationAssertion = {
  id: string;
  accountId: string;
  state: "unknown" | "never" | "dated" | "before_year";
  firstDate: string | null;
  beforeYear: number | null;
  acquisitionOwnerSub: string | null;
  acquisitionTerritoryId: string | null;
  evidence: string;
  recordedAt: string;
  recordedBy: string;
  requestKey: string;
};
export type CooperationInput = Pick<
  CooperationAssertion,
  | "state"
  | "firstDate"
  | "beforeYear"
  | "acquisitionOwnerSub"
  | "acquisitionTerritoryId"
  | "evidence"
  | "requestKey"
>;

export function validCooperation(input: CooperationInput, at: string): boolean {
  if (
    !input ||
    !["unknown", "never", "dated", "before_year"].includes(input.state) ||
    typeof input.evidence !== "string" ||
    !input.evidence.trim() ||
    input.evidence.length > 500 ||
    typeof input.requestKey !== "string" ||
    !/^[\w-]{8,128}$/.test(input.requestKey)
  )
    return false;
  if (input.state === "dated") {
    const date = input.firstDate;
    if (
      !date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date ||
      date > at.slice(0, 10) ||
      date < "1900-01-01" ||
      input.beforeYear !== null
    )
      return false;
  } else if (input.state === "before_year") {
    if (
      !Number.isInteger(input.beforeYear) ||
      input.beforeYear! < 1901 ||
      input.beforeYear! > Number(at.slice(0, 4)) ||
      input.firstDate !== null
    )
      return false;
  } else if (input.firstDate !== null || input.beforeYear !== null)
    return false;
  if (
    input.state !== "dated" &&
    (input.acquisitionOwnerSub || input.acquisitionTerritoryId)
  )
    return false;
  return [input.acquisitionOwnerSub, input.acquisitionTerritoryId].every(
    (v) =>
      v === null || (typeof v === "string" && v.length > 0 && v.length <= 128),
  );
}

export type CustomerVintage = "old" | "new" | "unknown" | "prospect";
export function customerVintage(
  assertion: CooperationAssertion | null | undefined,
  year: number,
): CustomerVintage {
  if (!assertion || assertion.state === "unknown") return "unknown";
  if (assertion.state === "never") return "prospect";
  if (assertion.state === "before_year")
    return assertion.beforeYear! <= year ? "old" : "unknown";
  const firstYear = Number(assertion.firstDate!.slice(0, 4));
  return firstYear < year ? "old" : firstYear === year ? "new" : "prospect";
}

export function sameCooperation(
  a: CooperationAssertion,
  b: CooperationAssertion,
): boolean {
  return (
    [
      "accountId",
      "state",
      "firstDate",
      "beforeYear",
      "acquisitionOwnerSub",
      "acquisitionTerritoryId",
      "evidence",
      "recordedBy",
    ] as const
  ).every((key) => a[key] === b[key]);
}
