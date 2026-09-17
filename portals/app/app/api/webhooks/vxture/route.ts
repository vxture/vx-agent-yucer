import { BRAND } from "@yucer/shared/brand";
import { errorResponse } from "../../../platform/envelope";
import { verifySignature, webhookSecrets } from "../../../provisioning/lib/verify";
import { handleProvisioning, type ProvisioningEvent } from "../../../provisioning/lib/handler";
import { getProvisioningStore } from "../../../provisioning/lib/store";
import { getEntitlementResolver } from "../../../entitlement/resolver";
import { sendProvisioningAck } from "../../../provisioning/lib/ack";

// POST /api/webhooks/vxture (product_200 section 4, 080-rp section 4) - the
// standard path the integration rules require (X-4: same path for every
// product, only the domain differs).
//
// X-4 THREE-STEP MIGRATION, COMPLETE. This repo carried a legacy alias at
// /provisioning/webhook during the platform's registration switch: (1) this
// path shipped as a re-export of that handler and both were live, (2) the
// platform's product registration was switched to this path (2026-09-14),
// (3) the legacy route is removed - this file is now the only implementation,
// not a re-export of one living elsewhere. The old /provisioning/webhook path
// answers 404.
//
// Verify over RAW bytes first (401 on failure / stale timestamp), then hand to
// the idempotent + ordered handler. A processing error returns 500 so the
// platform retries; a valid-but-duplicate/stale event still acks 2xx.
export const dynamic = "force-dynamic";

function productCode(): string {
  return process.env.OIDC_CLIENT_ID ?? BRAND.productCode;
}

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text(); // raw body - required for HMAC, do not re-serialize
  const sig = req.headers.get("x-vxture-signature");
  if (!verifySignature(raw, sig, webhookSecrets())) {
    return errorResponse(401, "WEBHOOK_SIGNATURE_INVALID", "signature did not verify against either secret");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return errorResponse(400, "WEBHOOK_BODY_INVALID", "request body is not valid JSON", { field: "body" });
  }

  const deliveryId = req.headers.get("x-vxture-delivery") ?? String(payload.id ?? "");
  if (!deliveryId) {
    return errorResponse(400, "WEBHOOK_DELIVERY_ID_REQUIRED", "the delivery id is the idempotency key", {
      field: "deliveryId",
    });
  }

  const event: ProvisioningEvent = {
    id: deliveryId,
    type: String(payload.type ?? ""),
    occurred_at: typeof payload.occurred_at === "number" ? payload.occurred_at : undefined,
    seq: typeof payload.seq === "number" ? payload.seq : 0,
    workspace_id: String(payload.workspace_id ?? ""),
    tenant_id: typeof payload.tenant_id === "string" ? payload.tenant_id : undefined,
    application: String(payload.application ?? ""),
    plan: typeof payload.plan === "string" ? payload.plan : null,
    data: payload.data,
  };

  try {
    await handleProvisioning(event, {
      store: getProvisioningStore(),
      product: productCode(),
      onSubscriptionChanged: (ws) => getEntitlementResolver().invalidate(ws),
      // C3 回执 (次要约定): yucer has no per-tenant space to build - a shared
      // schema with row-level workspace_id isolation is ready the instant this
      // callback runs, so "ready" is the only status this product ever has a
      // true reason to send. sendProvisioningAck() swallows its own errors -
      // an ack failure must not turn this already-successful delivery into a
      // 500 the platform then redelivers.
      onProvisioned: async (ws) => {
        await sendProvisioningAck({ workspaceId: ws, status: "ready", deliveryId: event.id });
      },
    });
  } catch {
    // retryable:true, and it is the honest answer - the platform WILL retry, and
    // a 500 here means our handler failed, not that the delivery was bad.
    return errorResponse(500, "WEBHOOK_PROCESSING_FAILED", "handler failed; safe to redeliver", {
      retryable: true,
    });
  }
  return new Response("", { status: 200 });
}
