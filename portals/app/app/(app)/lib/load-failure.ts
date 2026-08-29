// What a page says when a read is refused.
//
// TD-010. A RuleResult violation carries a `message` written for the rule
// layer's own reader, in English, in a file that must be ASCII-only. Rendering
// it is how `missing permission strategy.read` ended up on the screen of a
// product where every other word is Chinese - English prose AND an internal
// permission code, shown to an end user.
//
// The code is what crosses the boundary. The sentence lives in the dictionary.

export interface HasCode {
  readonly code: string;
}

export function loadFailureText(
  violations: readonly HasCode[],
  dict: Record<string, string>,
): string {
  // Deduplicated: two refusals for the same reason are one thing to say, and a
  // page that repeats "you do not have permission" twice reads as a bug.
  const codes = [...new Set(violations.map((v) => v.code))];
  if (codes.length === 0) return dict.unknown;
  // An unmapped code falls back to the generic sentence rather than to the
  // prose. A missing translation is a defect; leaking the rule layer's own
  // English is the same defect wearing a different hat.
  return codes.map((c) => dict[c] ?? dict.unknown).join("; ");
}
