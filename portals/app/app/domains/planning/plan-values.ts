// Pure value validation, shared by the domain and planning views.
export class PlanError extends Error {
  constructor(
    public readonly code: string,
    public readonly field = "",
  ) {
    super(code);
  }
}
export function demand(
  condition: unknown,
  code: string,
  field = "",
): asserts condition {
  if (!condition) throw new PlanError(code, field);
}
export function minor(value: string): bigint {
  demand(
    typeof value === "string" && /^(0|[1-9]\d{0,12})(\.\d{1,2})?$/.test(value),
    "invalid_amount",
  );
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function amount(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
