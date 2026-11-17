import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import type { AccessClaims } from "./claims";

// RP session store on Redis (080-rp section 2.4). Key families are namespaced by
// client_id so multiple RPs can share one Redis:
//   vx:rp:{cid}:authstate:{state}  login handshake {verifier,nonce,returnTo}, ~600s, single-use
//   vx:rp:{cid}:sess:{rpsid}       session bundle {tokens,sid,sub,...}, TTL ~ refresh lifetime
//   vx:rp:{cid}:sididx:{sid}       SET of rpsids for a given IdP sid (back-channel logout)
//   vx:rp:{cid}:revoked:{sid}      tombstone: delayed callbacks cannot recreate the sid
//
// Fail-closed: if Redis is unreachable, session reads throw and the request is
// treated as temporarily unverifiable, with protected UI/data unavailable.

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
  revoked: (cid: string, sid: string) => `vx:rp:${cid}:revoked:${sid}`,
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
   * copy of the person, read by every section; refreshed on token renewal. Absent on sessions written before login-state existed - those
   * are checked on first use.
   */
  claims?: AccessClaims;
  /**
   * When accounts is next asked whether this login still holds, epoch
   * seconds. Set from Accounts' status-query next_check_at, never from a
   * product-defined session lifetime.
   */
  nextCheckAt?: number;
  /** Last successful central validation; never a local login lifetime. */
  checkedAt?: number;
  statusUnavailable?: boolean;
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

/** Create only. A delayed callback cannot recreate an already revoked sid. */
export async function putSession(
  cid: string, rpsid: string, data: RpSession, ttlSeconds: number,
): Promise<boolean> {
  return (await redis().eval(`
    if ARGV[3] ~= '' and redis.call('EXISTS', KEYS[3]) == 1 then return 0 end
    if not redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2], 'NX') then return 0 end
    if ARGV[3] ~= '' then
      redis.call('SADD', KEYS[2], ARGV[4])
      local ttl = redis.call('TTL', KEYS[2])
      if ttl < tonumber(ARGV[2]) then redis.call('EXPIRE', KEYS[2], ARGV[2]) end
    end
    return 1
  `, 3, k.sess(cid, rpsid), k.sididx(cid, data.sid ?? ""), k.revoked(cid, data.sid ?? ""),
  JSON.stringify(data), ttlSeconds, data.sid ?? "", rpsid)) === 1;
}

/** Compare-and-set under an owned lease. Neither logout nor a new checker can
 * be undone by an old status/refresh response, even after lease expiration. */
export async function updateSession(
  cid: string, rpsid: string, before: RpSession, data: RpSession, ttlSeconds: number, lease: string,
): Promise<boolean> {
  return (await redis().eval(`
    if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
    if redis.call('GET', KEYS[1]) ~= ARGV[2] then return 0 end
    if ARGV[5] ~= '' and redis.call('EXISTS', KEYS[4]) == 1 then return 0 end
    redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
    if ARGV[5] ~= '' then
      redis.call('SADD', KEYS[3], ARGV[6])
      local ttl = redis.call('TTL', KEYS[3])
      if ttl < tonumber(ARGV[4]) then redis.call('EXPIRE', KEYS[3], ARGV[4]) end
    end
    return 1
  `, 4, k.sess(cid, rpsid), k.check(cid, rpsid), k.sididx(cid, data.sid ?? ""), k.revoked(cid, data.sid ?? ""),
  lease, JSON.stringify(before), JSON.stringify(data), ttlSeconds, data.sid ?? "", rpsid)) === 1;
}

export async function getSession(cid: string, rpsid: string): Promise<RpSession | null> {
  const raw = await redis().get(k.sess(cid, rpsid));
  return raw ? (JSON.parse(raw) as RpSession) : null;
}

export async function deleteSession(cid: string, rpsid: string): Promise<void> {
  await redis().eval(`
    local raw = redis.call('GET', KEYS[1])
    if raw then
      local data = cjson.decode(raw)
      if data.sid then redis.call('SREM', ARGV[1] .. data.sid, ARGV[2]) end
    end
    redis.call('DEL', KEYS[1])
  `, 1, k.sess(cid, rpsid), `vx:rp:${cid}:sididx:`, rpsid);
}

/** Atomic and idempotent: failures remain retryable; no pre-claimed jti can
 * turn a failed delivery into a successful no-op on the next attempt. */
export async function revokeSid(cid: string, sid: string, ttlSeconds: number): Promise<void> {
  await redis().eval(`
    redis.call('SET', KEYS[2], '1', 'EX', ARGV[1])
    local sessions = redis.call('SMEMBERS', KEYS[1])
    for _, rp in ipairs(sessions) do redis.call('DEL', ARGV[2] .. rp) end
    redis.call('DEL', KEYS[1])
  `, 2, k.sididx(cid, sid), k.revoked(cid, sid), ttlSeconds, `vx:rp:${cid}:sess:`);
}

export async function acquireCheckLock(cid: string, rpsid: string, holdSeconds: number): Promise<string | null> {
  const lease = randomUUID();
  return (await redis().set(k.check(cid, rpsid), lease, "EX", holdSeconds, "NX")) === "OK" ? lease : null;
}

export async function releaseCheckLock(cid: string, rpsid: string, lease: string): Promise<void> {
  await redis().eval(`
    if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
    return 0
  `, 1, k.check(cid, rpsid), lease);
}

/** Graceful shutdown for isolated contract-test workers and application hosts. */
export async function closeSessionStore(): Promise<void> {
  const current = client;
  client = null;
  if (current) await current.quit();
}
