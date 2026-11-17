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
