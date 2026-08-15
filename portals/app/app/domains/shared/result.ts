// Shared result type for domain rules.
//
// Every rule function in domains/ is a PURE function returning one of these. It
// never throws for a business-rule violation and never touches IO. Two reasons:
//
//   - A violation is data the UI has to render (which field, why, what would fix
//     it). An exception carries a string and loses the rest.
//   - The same rule runs in three places - the UI disabling a control, the API
//     rejecting a request, and the copilot deciding whether a proposal is even
//     legal. Only a pure function can run in all three.
//
// The database's column locks are the backstop underneath all of this, not the
// primary defence: if these functions are right, the locks never fire.

export interface Violation {
  /** Stable machine code, safe to switch on and to translate. */
  code: string;
  /** Field or path the violation is about, when it is about one. */
  field?: string;
  /** English explanation for logs and developers. UI text is keyed off `code`. */
  message: string;
}

export type RuleResult<T> = { ok: true; value: T } | { ok: false; violations: Violation[] };

export function ok<T>(value: T): RuleResult<T> {
  return { ok: true, value };
}

export function fail<T>(...violations: Violation[]): RuleResult<T> {
  return { ok: false, violations };
}

export function violation(code: string, message: string, field?: string): Violation {
  return field === undefined ? { code, message } : { code, field, message };
}

/** Collect several checks, reporting every failure rather than only the first. */
export function allOf<T>(value: T, checks: Array<Violation | null>): RuleResult<T> {
  const violations = checks.filter((v): v is Violation => v !== null);
  return violations.length === 0 ? ok(value) : { ok: false, violations };
}

export function isOk<T>(r: RuleResult<T>): r is { ok: true; value: T } {
  return r.ok;
}

/** Throwing accessor for call sites that have already checked, and for tests. */
export function unwrap<T>(r: RuleResult<T>): T {
  if (r.ok) return r.value;
  throw new Error(`rule violation: ${r.violations.map((v) => v.code).join(", ")}`);
}
