import { getPlatformClientConfig, type PlatformClientConfig } from "../../entitlement/platform-client";
import { assertInternalTarget } from "../../lib/internal-target";

// C3 回执 (integration rules, "C3 回执 · 开通确认" - 次要约定, not a MUST: the
// platform does not gate go-live on it). Before this, provisioning was
// one-way - the platform fires tenant.provisioned and marks that delivery a
// success whether or not this product actually finished setting the
// workspace up. This closes that loop for the one case yucer can speak to:
// "I saw the event and I am ready" (yucer has no per-tenant space to build -
// row-level workspace_id isolation on a shared schema - so by the time
// handleProvisioning() calls onProvisioned, there is nothing left that can
// fail on this side; "failed" from the rules doc's request shape exists for
// products that DO have a real space-build step, not for yucer).
//
// SAME AUTH AS C2 / C3-UP, DELIBERATELY NOT THE OIDC S2S EXCHANGE
// (platform/s2s.ts): the rules doc calls this "S2S 鉴权，同 C2 / C3", and this
// product's own C2/C3-up calls already authenticate with the internal tailnet
// token (PLATFORM_INTERNAL_AUTH_TOKEN), not a minted OIDC token - that
// exchange is reserved for calling OUT to Atlas/Runos. Matching the sibling
// calls' own auth is the "same as C2/C3" the doc asks for.
//
// BEST-EFFORT, NEVER FAILS THE WEBHOOK. An ack is a courtesy signal on top of
// an already-successful delivery, not a condition of it - a platform outage on
// THIS call must not turn a real provisioning success into a 500 that makes
// the platform redeliver an event yucer already handled.

export interface ProvisioningAckResult {
  status: number;
  body?: { workspace_id?: string; product?: string; acked_at?: string; replayed?: boolean } & Record<string, unknown>;
}

export type ProvisioningAckFn = (input: {
  workspaceId: string;
  status: "ready" | "failed";
  /** The delivery's own id (event.id) - the rules doc's own idempotency key for this call. */
  deliveryId?: string;
  detail?: Record<string, unknown>;
}) => Promise<ProvisioningAckResult>;

/** POST /provisioning/ack for one tenant.provisioned delivery. */
export function makeProvisioningAck(cfg: PlatformClientConfig): ProvisioningAckFn {
  return async (input) => {
    const url = assertInternalTarget(`${cfg.baseUrl.replace(/\/$/, "")}/provisioning/ack`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vxture-internal-auth": cfg.authToken,
      },
      body: JSON.stringify({
        workspace_id: input.workspaceId,
        product: cfg.product,
        status: input.status,
        ...(input.deliveryId ? { delivery_id: input.deliveryId } : {}),
        ...(input.detail ? { detail: input.detail } : {}),
      }),
      cache: "no-store",
    });
    let body: ProvisioningAckResult["body"];
    try {
      const parsed = (await res.json()) as ProvisioningAckResult["body"] | null;
      if (parsed && typeof parsed === "object") body = parsed;
    } catch {
      // A response with no JSON body is still a real response - status is what matters.
    }
    return { status: res.status, body };
  };
}

/**
 * Send the ack, or silently do nothing when the platform is not configured -
 * same offline posture as C2 and C3-up's own callers (getPlatformClientConfig
 * returning null already means every other platform call is a no-op here).
 * Errors are swallowed rather than thrown - see the file header: this call
 * must never turn into a reason to fail the webhook that triggered it.
 */
export async function sendProvisioningAck(input: {
  workspaceId: string;
  status: "ready" | "failed";
  deliveryId?: string;
  detail?: Record<string, unknown>;
}): Promise<ProvisioningAckResult | null> {
  const cfg = getPlatformClientConfig();
  if (!cfg) return null;
  try {
    return await makeProvisioningAck(cfg)(input);
  } catch {
    return null;
  }
}
