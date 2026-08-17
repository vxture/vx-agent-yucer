import { BRAND } from "@yucer/shared/brand";
import { errorResponse } from "../../platform/envelope";
import { verifySignature, webhookSecrets } from "../lib/verify";
import { handleProvisioning, type ProvisioningEvent } from "../lib/handler";
import { getProvisioningStore } from "../lib/store";
import { getEntitlementResolver } from "../../entitlement/resolver";

// POST /provisioning/webhook (product_200 section 4, 080-rp section 4). Verify
// over RAW bytes first (401 on failure / stale timestamp), then hand to the
// idempotent + ordered handler. A processing error returns 500 so the platform
// retries; a valid-but-duplicate/stale event still acks 2xx.
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
