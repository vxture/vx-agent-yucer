import type { OidcConfig } from "./config";
import { verifyToken } from "./oidc";
import { revokeSid } from "./session-store";

const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";

export async function backchannelResponse(
  req: Request, cfg: OidcConfig, deps = { verifyToken, revokeSid },
): Promise<Response> {
  const form = await req.formData().catch(() => null);
  const logoutToken = form?.get("logout_token");
  // DELIBERATELY NOT the vxture error envelope (product_251 X-1).
  //
  // This endpoint answers the IdP under OIDC Back-Channel Logout 1.0, not a
  // vxture consumer under the L1 spec. The caller is a standards-conformant
  // OIDC provider that has never heard of `code`/`retryable`, and the status
  // code is the entire contract it acts on. Reshaping the body here would swap
  // a standard the far side implements for one it does not.
  //
  // Recorded as an exclusion in the conformance attestation rather than left
  // as an apparent oversight.
  if (typeof logoutToken !== "string") return Response.json({ error: "bad request" }, { status: 400 });

  let claims;
  try {
    claims = await deps.verifyToken(logoutToken, cfg);
  } catch {
    return Response.json({ error: "invalid logout_token" }, { status: 400 });
  }

  // A logout_token MUST NOT carry a nonce, and MUST carry the backchannel event.
  if (claims.nonce !== undefined) return Response.json({ error: "nonce forbidden" }, { status: 400 });
  const events = claims.events as Record<string, unknown> | undefined;
  if (!events || !events[BACKCHANNEL_EVENT] || typeof events[BACKCHANNEL_EVENT] !== "object" || Array.isArray(events[BACKCHANNEL_EVENT])) {
    return Response.json({ error: "missing backchannel event" }, { status: 400 });
  }
  const sid = typeof claims.sid === "string" ? claims.sid : undefined;
  if (!sid) return Response.json({ error: "missing sid" }, { status: 400 });

  if (typeof claims.jti !== "string" || !claims.jti || typeof claims.iat !== "number") {
    return Response.json({ error: "missing jti/iat" }, { status: 400 });
  }
  if (claims.iat > Date.now() / 1000 + 60) return Response.json({ error: "invalid iat" }, { status: 400 });
  try {
    await deps.revokeSid(cfg.clientId, sid, cfg.sessionTtlSeconds);
  } catch {
    // Accounts retries non-success responses. Do not acknowledge lost work.
    return Response.json({ error: "session_store_unavailable" }, { status: 503, headers: { "Retry-After": "5" } });
  }
  return new Response("", { status: 200, headers: { "Cache-Control": "no-store" } });
}
