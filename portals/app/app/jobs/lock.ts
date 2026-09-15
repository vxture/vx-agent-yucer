import Redis from "ioredis";

// One run per period across replicas (ADR-033). SET NX PX on Redis with a TTL
// just under the job's period: the replica that wins the key runs, every other
// replica sees "held" and skips until the key expires. The key is NOT released
// after the run - releasing it would let a second replica run the same job
// seconds later inside the same period, which is the duplicate the lock exists
// to prevent. Without REDIS_URL there is nothing to lock against; the job runs
// (single-replica assumption) and says so once in the log.

let client: Redis | null = null;
let warned = false;

function redis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!client) client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
  return client;
}

export type LockOutcome = "acquired" | "held" | "unlocked";

export async function acquireJobLock(name: string, ttlMs: number): Promise<LockOutcome> {
  const r = redis();
  if (!r) {
    if (!warned) {
      console.warn("[jobs] REDIS_URL is not set - running without a cross-replica lock");
      warned = true;
    }
    return "unlocked";
  }
  const ok = await r.set(`yucer:jobs:lock:${name}`, `${process.pid}-${Date.now()}`, "PX", ttlMs, "NX");
  return ok === "OK" ? "acquired" : "held";
}
