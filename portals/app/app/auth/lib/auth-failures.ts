// Why a login state ended, or could not be confirmed - counted, and shown on
// /api/status as `auth`.
//
// Every failure path used to end in a bare `return null`, so "signed out after
// about ten minutes" (2026-09-29) could not be told apart from any other cause.
// A defect whose reason is swallowed can only be guessed at.
//
// KEPT ON globalThis, not in module scope: Next bundles route handlers, pages
// and the layout separately, and a module-level counter would be several
// counters, each seeing part of the story.
//
// NOTHING IN HERE IS A SECRET OR A PERSON: a reason code, a time, and at most
// 160 characters of error text. No token, no rpsid, no subject.

export type LoginStateEvent =
  /** The cookie points at nothing - logged out here, or storage lost it. */
  | "no_record"
  /** ACCOUNTS said this login no longer holds. The only reason a product-side
   *  login state ends, besides the member's own logout. */
  | "ended_by_accounts"
  /** Accounts could not be asked (network, 5xx). The state is KEPT - an
   *  unanswered question is not a "no". */
  | "check_unavailable"
  /** A token needed to call the platform could not be had. Affects that call
   *  only; the login state is untouched. */
  | "token_unavailable";

export interface LoginStateNote {
  readonly event: LoginStateEvent;
  readonly at: string;
  readonly detail: string;
}

export interface AuthDropSnapshot {
  readonly counts: Readonly<Record<LoginStateEvent, number>>;
  readonly last: LoginStateNote | null;
}

interface State {
  counts: Record<LoginStateEvent, number>;
  last: LoginStateNote | null;
}

const KEY = "__yucerLoginStateNotes";

function state(): State {
  const g = globalThis as unknown as Record<string, State | undefined>;
  return (g[KEY] ??= {
    counts: { no_record: 0, ended_by_accounts: 0, check_unavailable: 0, token_unavailable: 0 },
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

export function noteLoginState(event: LoginStateEvent, detail = ""): void {
  const s = state();
  s.counts[event] += 1;
  s.last = { event, at: new Date().toISOString(), detail: detail.slice(0, 160) };
  if (event !== "no_record") {
    console.warn(`[auth] ${event}${detail ? ` - ${detail.slice(0, 160)}` : ""}`);
  }
}

export function authDropSnapshot(): AuthDropSnapshot {
  const s = state();
  return { counts: { ...s.counts }, last: s.last };
}
