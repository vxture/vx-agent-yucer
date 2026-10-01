// The oldest Atlas this product is known to work against.
//
// The contract fingerprint (contract.ts) moves when a required field or an
// error code does. It does NOT move when behaviour does, and Atlas has changed
// behaviour without touching the contract: until v0.7.18 a NON-STREAMING call
// waited at most 30 s for the upstream's response headers, and a non-streaming
// answer's headers only arrive when generation ENDS. Every call that reasoned
// for longer than that came back 503 PROVIDER_UNAVAILABLE - retryable, so this
// client retried it twice. The `judgement` profile (profiles.ts) allows 150 s;
// against anything older than this floor it cannot work.
//
// So the floor is a version, with the reason beside it, and the diagnostics
// page reports it. Raise it only with a reason of the same kind.

export const MIN_ATLAS_VERSION = "0.7.18";

export const MIN_ATLAS_VERSION_REASON =
  "before it, a non-streaming call waited 30 s for the response headers and so failed 503 whenever the model reasoned longer (the judgement profile allows 150 s)";

/** 0.7.18, v0.7.18 -> [0, 7, 18]; anything else -> null (never guessed at). */
export function parseVersion(raw: unknown): readonly [number, number, number] | null {
  if (typeof raw !== "string") return null;
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(raw.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export type VersionCheck =
  | { readonly kind: "ok"; readonly version: string }
  | { readonly kind: "too_old"; readonly version: string }
  | { readonly kind: "unknown" };

/** Whether a reported version meets the floor. An unreadable one is "unknown",
 *  not a failure: the check exists to catch a KNOWN old version. */
export function checkAtlasVersion(reported: unknown, min: string = MIN_ATLAS_VERSION): VersionCheck {
  const have = parseVersion(reported);
  const want = parseVersion(min);
  if (!have || !want) return { kind: "unknown" };
  const version = (reported as string).trim().replace(/^v/, "");
  for (let i = 0; i < 3; i++) {
    if (have[i]! !== want[i]!) return have[i]! > want[i]! ? { kind: "ok", version } : { kind: "too_old", version };
  }
  return { kind: "ok", version };
}
