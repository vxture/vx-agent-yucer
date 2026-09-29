// Why a session died - counted, and shown on /api/status.
//
// Every failure path in session.ts used to end in a bare `return null`, so
// "the member was signed out after about ten minutes" (2026-09-29) could not be
// told apart from any other cause: the IdP rejecting the refresh, Redis having
// lost the session, a token that no longer verifies. A defect whose reason is
// swallowed can only be guessed at, and the first fix for it was a guess that
// did not hold.
//
// KEPT ON globalThis, not in module scope: Next bundles route handlers, pages
// and the layout separately, and a module-level counter would be three
// counters, each seeing a third of the failures.
//
// NOTHING IN HERE IS A SECRET OR A PERSON: a reason code, a time, and the first
// 160 characters of an error message (the IdP's own error text or a jose error
// code). No token, no rpsid, no subject.

export type SessionDropReason =
  /** The session key is not in Redis - expired, evicted, or logged out. */
  | "no_session"
  /** The IdP refused the refresh (invalid_grant, replay, revoked) or was unreachable. */
  | "refresh_failed"
  /** The access token would not verify and there was no refresh token to try. */
  | "token_invalid"
  /** A refresh succeeded but the new token still did not verify. */
  | "token_invalid_after_refresh";

export interface SessionDrop {
  readonly reason: SessionDropReason;
  readonly at: string;
  readonly detail: string;
}

export interface AuthDropSnapshot {
  readonly counts: Readonly<Record<SessionDropReason, number>>;
  readonly last: SessionDrop | null;
}

interface State {
  counts: Record<SessionDropReason, number>;
  last: SessionDrop | null;
}

const KEY = "__yucerAuthDrops";

function state(): State {
  const g = globalThis as unknown as Record<string, State | undefined>;
  return (g[KEY] ??= {
    counts: { no_session: 0, refresh_failed: 0, token_invalid: 0, token_invalid_after_refresh: 0 },
    last: null,
  });
}

/** A short, secret-free description of a thrown value. */
export function describeError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { code?: unknown; name?: unknown; message?: unknown };
    const code = typeof e.code === "string" ? e.code : typeof e.name === "string" ? e.name : "Error";
    const message = typeof e.message === "string" ? e.message : "";
    return `${code}${message ? `: ${message}` : ""}`.slice(0, 160);
  }
  return String(err).slice(0, 160);
}

export function recordSessionDrop(reason: SessionDropReason, detail = ""): void {
  const s = state();
  s.counts[reason] += 1;
  s.last = { reason, at: new Date().toISOString(), detail: detail.slice(0, 160) };
  console.warn(`[auth] session dropped: ${reason}${detail ? ` - ${detail.slice(0, 160)}` : ""}`);
}

export function authDropSnapshot(): AuthDropSnapshot {
  const s = state();
  return { counts: { ...s.counts }, last: s.last };
}
