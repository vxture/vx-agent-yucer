import { cookies } from "next/headers";
import { getOidcConfig } from "../lib/config";
import { sessionResponse } from "../lib/session-response";

// Read-only central validation; never return tokens or extend idle time.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const cfg = getOidcConfig();
  const jar = await cookies();
  return sessionResponse(cfg, jar.get(cfg.cookieName)?.value, new URL(req.url).searchParams.get("force") === "1");
}

// Foreground return/retry only. A same-origin POST is intentional user
// activity, unlike the GET background probe; never expose credentials.
export async function POST(req: Request): Promise<Response> {
  const cfg = getOidcConfig();
  const origin = req.headers.get("origin");
  const expected = new URL(cfg.appOrigin || req.url).origin;
  if (origin !== expected) return new Response(null, { status: 403 });
  const jar = await cookies();
  return sessionResponse(cfg, jar.get(cfg.cookieName)?.value, true, undefined, true);
}
