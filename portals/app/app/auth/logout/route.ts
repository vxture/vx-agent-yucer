import { cookies } from "next/headers";
import { getOidcConfig } from "../lib/config";
import { logoutResponse } from "../lib/logout";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const cfg = getOidcConfig();
  const jar = await cookies();
  const url = new URL(req.url);
  return logoutResponse(cfg, jar.get(cfg.cookieName)?.value,
    url.searchParams.get("switch") === "1" ? url.searchParams.get("returnTo") ?? "/" : undefined);
}
