import { cookies } from "next/headers";
import { errorResponse } from "../../platform/envelope";
import { NextResponse } from "next/server";
import { buildStatus, statusMode } from "../../lib/status";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthUser } from "../../auth/lib/session";

// GET /api/status - the integration-status surface. Gated by STATUS_PAGE:
// off -> 404, authed -> requires a valid session, public -> open. Reports only
// non-secret config (presence booleans + identifiers) plus a short-timeout
// DB/Redis reachability probe. Never returns a secret value (see status.test.ts).
export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 1000;

// The loser of the race still has to be cleaned up. Without the clear, a probe
// that answers quickly leaves its timer armed for the full budget, so a polled
// status page accumulates one pending timer per probe per request.
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<T>((r) => {
      timer = setTimeout(() => r(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function probeDb(url?: string): Promise<boolean | null> {
  if (!url) return null;
  return withTimeout(
    (async () => {
      const { Client } = await import("pg");
      const c = new Client({ connectionString: url, connectionTimeoutMillis: PROBE_TIMEOUT_MS });
      try {
        await c.connect();
        await c.query("SELECT 1");
        return true;
      } catch {
        return false;
      } finally {
        try {
          await c.end();
        } catch {
          /* ignore */
        }
      }
    })(),
    PROBE_TIMEOUT_MS + 200,
    false,
  );
}

async function probeRedis(url?: string): Promise<boolean | null> {
  if (!url) return null;
  return withTimeout(
    (async () => {
      const { default: Redis } = await import("ioredis");
      const r = new Redis(url, { connectTimeout: PROBE_TIMEOUT_MS, maxRetriesPerRequest: 1, lazyConnect: true });
      try {
        await r.connect();
        await r.ping();
        return true;
      } catch {
        return false;
      } finally {
        r.disconnect();
      }
    })(),
    PROBE_TIMEOUT_MS + 200,
    false,
  );
}

/**
 * Reachability at the CONNECTION layer, which is the question a connectivity
 * check actually asks. Any HTTP response - 404 and 405 included - proves the
 * service answered on that address; only a connect failure or the timeout says
 * unreachable. The three planes are tailnet-internal, so the browser cannot
 * probe them itself the way the client-side channel probes do.
 */
async function probeHttp(base?: string | null): Promise<boolean | null> {
  if (!base) return null;
  return withTimeout(
    (async () => {
      try {
        await fetch(base, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
        return true;
      } catch {
        return false;
      }
    })(),
    PROBE_TIMEOUT_MS + 200,
    false,
  );
}

export async function GET(): Promise<Response> {
  const mode = statusMode(process.env);
  // Deliberately indistinguishable from a route that does not exist: a status
  // page that announced itself as "switched off" would confirm the product is
  // deployed here, which is the one thing an off switch is meant to hide.
  if (mode === "off") return errorResponse(404, "STATUS_NOT_FOUND", "not found");

  if (mode === "authed") {
    const cfg = getOidcConfig();
    const jar = await cookies();
    const rpsid = jar.get(cfg.cookieName)?.value;
    const user = rpsid ? await getAuthUser(cfg, rpsid).catch(() => null) : null;
    if (!user) return errorResponse(401, "STATUS_NOT_AUTHENTICATED", "sign in to read the status page");
  }

  const status = buildStatus(process.env, new Date().toISOString());
  const [dbReachable, redisReachable, runos, atlas, arda] = await Promise.all([
    probeDb(process.env.DATABASE_URL),
    probeRedis(process.env.REDIS_URL),
    probeHttp(process.env.RUNOS_BASE_URL),
    probeHttp(process.env.ATLAS_BASE_URL),
    probeHttp(process.env.ARDA_BASE_URL),
  ]);
  status.data.database.reachable = dbReachable;
  status.data.redis.reachable = redisReachable;
  status.planes.runos.reachable = runos;
  status.planes.atlas.reachable = atlas;
  status.planes.arda.reachable = arda;

  return NextResponse.json(status);
}
