import Redis from "ioredis";
import type { AccessClaims } from "./claims";

// RP session store on Redis (080-rp section 2.4). Key families are namespaced by
// client_id so multiple RPs can share one Redis:
//   vx:rp:{cid}:authstate:{state}  login handshake {verifier,nonce,returnTo}, ~600s, single-use
//   vx:rp:{cid}:sess:{rpsid}       session bundle {tokens,sid,sub,...}, TTL ~ refresh lifetime
//   vx:rp:{cid}:sididx:{sid}       SET of rpsids for a given IdP sid (back-channel logout)
//   vx:rp:{cid}:bclogout:{jti}     logout_token replay guard
//
// Fail-closed: if Redis is unreachable, session reads throw and the request is
// treated as unauthenticated (ADR-001 refresh fail-closed).

let client: Redis | null = null;

function redis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
  }
  return client;
}

const k = {
  authstate: (cid: string, state: string) => `vx:rp:${cid}:authstate:${state}`,
  sess: (cid: string, rpsid: string) => `vx:rp:${cid}:sess:${rpsid}`,
  sididx: (cid: string, sid: string) => `vx:rp:${cid}:sididx:${sid}`,
  bclogout: (cid: string, jti: string) => `vx:rp:${cid}:bclogout:${jti}`,
  check: (cid: string, rpsid: string) => `vx:rp:${cid}:check:${rpsid}`,
};

export interface AuthState {
  verifier: string;
  nonce: string;
  returnTo: string;
  /** A `prompt=none` attempt (auth/lib/sso.ts): the callback treats the IdP's
   *  login_required as "show the front door", not as a failure. */
  silent?: boolean;
}

export interface RpSession {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  accessExpiresAt: number; // epoch seconds
  sid?: string; // the accounts login this session mirrors - what login-state asks about
  sub: string;
  /**
   * WHO THIS IS, as accounts last said (login-state.ts). The product's one
   * copy of the person, read by every section; refreshed on every check with
   * accounts. Absent on sessions written before login-state existed - those
   * are checked on first use.
   */
  claims?: AccessClaims;
  /**
   * When accounts is next asked whether this login still holds, epoch
   * seconds. Set from what ACCOUNTS says - the token's own expiry today, the
   * status query's next-check time once that exists (vxture-platform#538) -
   * never from a product constant.
   */
  nextCheckAt?: number;
}

export async function putAuthState(
  cid: string,
  state: string,
  data: AuthState,
  ttlSeconds = 600,
): Promise<void> {
  await redis().set(k.authstate(cid, state), JSON.stringify(data), "EX", ttlSeconds);
}

/** Single-use: get and delete atomically (defeats state replay). */
export async function takeAuthState(cid: string, state: string): Promise<AuthState | null> {
  const raw = await redis().getdel(k.authstate(cid, state));
  return raw ? (JSON.parse(raw) as AuthState) : null;
}

export async function putSession(
  cid: string,
  rpsid: string,
  data: RpSession,
  ttlSeconds: number,
): Promise<void> {
  const r = redis();
  const tx = r.multi();
  tx.set(k.sess(cid, rpsid), JSON.stringify(data), "EX", ttlSeconds);
  if (data.sid) {
    tx.sadd(k.sididx(cid, data.sid), rpsid);
    tx.expire(k.sididx(cid, data.sid), ttlSeconds);
  }
  await tx.exec();
}

export async function getSession(cid: string, rpsid: string): Promise<RpSession | null> {
  const raw = await redis().get(k.sess(cid, rpsid));
  return raw ? (JSON.parse(raw) as RpSession) : null;
}

export async function deleteSession(cid: string, rpsid: string): Promise<void> {
  const r = redis();
  const raw = await r.get(k.sess(cid, rpsid));
  if (raw) {
    const sess = JSON.parse(raw) as RpSession;
    if (sess.sid) await r.srem(k.sididx(cid, sess.sid), rpsid);
  }
  await r.del(k.sess(cid, rpsid));
}

/**
 * The one-checker lock (login-state.ts): SET NX with a short expiry, so a
 * crashed holder frees it on its own. Across processes and replicas, not just
 * in-process - the platform revokes a whole token chain on a replay, so two
 * checkers anywhere is one too many.
 */
export async function acquireCheckLock(cid: string, rpsid: string, holdSeconds: number): Promise<boolean> {
  return (await redis().set(k.check(cid, rpsid), "1", "EX", holdSeconds, "NX")) === "OK";
}

export async function releaseCheckLock(cid: string, rpsid: string): Promise<void> {
  await redis().del(k.check(cid, rpsid));
}

export async function sessionsForSid(cid: string, sid: string): Promise<string[]> {
  return redis().smembers(k.sididx(cid, sid));
}

/** Back-channel logout replay guard: returns true only the first time for a jti. */
export async function claimBclogoutJti(cid: string, jti: string, ttlSeconds = 300): Promise<boolean> {
  const res = await redis().set(k.bclogout(cid, jti), "1", "EX", ttlSeconds, "NX");
  return res === "OK";
}
