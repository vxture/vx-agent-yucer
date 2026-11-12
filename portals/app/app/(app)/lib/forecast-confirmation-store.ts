import Redis from "ioredis";
import { isDeployedStage } from "../../lib/deploy-stage";
import type { ForecastConfirmation } from "./forecast-confirmation";

let client: Redis | null = null;
const key = (token: string) => `yucer:forecast:confirmation:${token}`;
const memo = Symbol.for("yucer.forecast-confirmations");
function memory() {
  if (isDeployedStage() || process.env.DATABASE_URL)
    throw new Error("confirmation_store_unavailable");
  const global = globalThis as unknown as Record<
    symbol,
    Map<string, ForecastConfirmation>
  >;
  global[memo] ??= new Map();
  for (const [token, row] of global[memo])
    if (row.expiresAt <= Date.now()) global[memo].delete(token);
  return global[memo];
}
function redis() {
  if (!process.env.REDIS_URL) return null;
  client ??= new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });
  return client;
}
export async function putForecastConfirmation(row: ForecastConfirmation) {
  const r = redis();
  if (r)
    await r.set(
      key(row.token),
      JSON.stringify(row),
      "PX",
      Math.max(1, row.expiresAt - Date.now()),
    );
  else memory().set(row.token, structuredClone(row));
}
export async function getForecastConfirmation(
  token: string,
): Promise<ForecastConfirmation | null> {
  if (!/^[a-f0-9-]{36}$/.test(token)) return null;
  const r = redis();
  if (!r) return structuredClone(memory().get(token) ?? null);
  const raw = await r.get(key(token));
  return raw ? (JSON.parse(raw) as ForecastConfirmation) : null;
}
