/**
 * Workspace service tickets and product-scoped provisioning reader tickets.
 * @package @yucer/app
 * @layer Application
 * @category service
 * @author AI-Generated
 * @date 2026-10-22
 */
import { createHash } from "node:crypto";
import { assertInternalTarget } from "../lib/internal-target";
import { getS2SConfig, type S2SConfig, type FetchLike } from "./s2s";

// ============================================================================
// Cache: credentials, target, and workspace all form the security boundary.
// ============================================================================
interface Ticket { value: string; expiresAt: number }
const tickets = new Map<string, Ticket>();
const pending = new Map<string, Promise<Ticket>>();
const MAX_TICKETS = 1000;

/** Clear cached credentials, including outstanding single-flight entries. */
export function resetChannelTokens(): void { tickets.clear(); pending.clear(); }

/**
 * Obtain a service ticket; null workspace selects only provisioning:read.
 * @param workspaceId Validated workspace, or null for the product reader.
 * @param opts Configuration and transport dependencies.
 * @returns A short-lived access token retained only on the server.
 * @throws If configuration, transport, or the token response is invalid.
 */
export async function mintChannelToken(
  workspaceId: string | null,
  opts: { config?: S2SConfig; fetchImpl?: FetchLike; now?: () => number } = {},
): Promise<string> {
  const cfg = opts.config ?? getS2SConfig();
  if (!cfg.enabled || !cfg.clientSecret || workspaceId === "") throw new Error("Platform channel credentials or workspace missing");
  const now = opts.now ?? Date.now;
  const secretKey = createHash("sha256").update(cfg.clientSecret).digest("hex");
  const key = JSON.stringify([cfg.tokenUrl, cfg.clientId, cfg.productCode, secretKey, workspaceId]);
  const hit = tickets.get(key);
  if (hit && hit.expiresAt - 30_000 > now()) return hit.value;
  let flight = pending.get(key);
  if (!flight) {
    flight = (async (): Promise<Ticket> => {
      const body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        audience: "vxture",
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
        ...(workspaceId === null ? { scope: "provisioning:read" } : { workspace_id: workspaceId }),
      });
      const started = now();
      const res = await (opts.fetchImpl ?? fetch)(assertInternalTarget(cfg.tokenUrl).toString(), {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"),
        },
        body: body.toString(),
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
      });
      // Never propagate an IdP body, which can contain sensitive request data.
      if (!res.ok) throw new Error(`Platform token exchange failed (${res.status})`);
      const raw: unknown = await res.json();
      if (!raw || typeof raw !== "object") throw new Error("Invalid platform token response");
      const value = raw as Record<string, unknown>;
      if (typeof value.access_token !== "string" || !value.access_token.trim() ||
          typeof value.token_type !== "string" || value.token_type.toLowerCase() !== "bearer" ||
          typeof value.expires_in !== "number" || !Number.isFinite(value.expires_in) || value.expires_in <= 0) {
        throw new Error("Invalid platform token response");
      }
      const ticket = { value: value.access_token, expiresAt: started + Math.min(value.expires_in, 300) * 1000 };
      for (const [k, v] of tickets) if (v.expiresAt <= now()) tickets.delete(k);
      if (tickets.size >= MAX_TICKETS) tickets.delete(tickets.keys().next().value!);
      tickets.set(key, ticket);
      return ticket;
    })();
    pending.set(key, flight);
  }
  try { return (await flight).value; }
  finally { if (pending.get(key) === flight) pending.delete(key); }
}
