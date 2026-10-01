// The Atlas contract this repo was last checked against.
//
// GET /.well-known/vxture-contract returns the required fields per face and
// the error vocabulary, with a fingerprint that is a pure function of that
// content (Atlas v0.5.0). It moves only when a required field or an error
// code changes - and when it moves, a consumer that did not look is the next
// TD-044 (seven releases of 400 TASK_ID_REQUIRED, unnoticed). Atlas's own
// advice: pin it, diff it on every Atlas release, do not wait to be told.
//
// UPDATING THE PIN is a review, not a bump: pull the live contract, compare
// its `requests` and `errorCodes` with this client (types.ts, errors.ts,
// model-plane-error.ts), change what needs changing, then move the pin.

/** Checked 2026-09-30 against Atlas v0.7.11; unchanged through v0.7.18 (2026-10-01). */
export const ATLAS_CONTRACT_FINGERPRINT = "c1-5f484ea774f6";

export function contractFingerprint(json: unknown): string | null {
  const f = (json as { fingerprint?: unknown } | null)?.fingerprint;
  return typeof f === "string" && f ? f : null;
}

export type ContractDrift =
  | { readonly kind: "same" }
  | { readonly kind: "moved"; readonly live: string }
  | { readonly kind: "unreadable" };

export function contractDrift(json: unknown, pinned: string = ATLAS_CONTRACT_FINGERPRINT): ContractDrift {
  const live = contractFingerprint(json);
  if (!live) return { kind: "unreadable" };
  return live === pinned ? { kind: "same" } : { kind: "moved", live };
}
