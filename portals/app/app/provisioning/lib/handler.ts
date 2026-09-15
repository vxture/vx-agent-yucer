import type { ProvisioningStore } from "./store";

// Provisioning event handling (product_200 section 4, 080-rp section 4). The
// platform guarantees at-least-once only, so duplicate + out-of-order delivery
// WILL happen; the handler is idempotent + ordered. Business-space init must be
// re-entrant; deprovision archives (never hard-deletes).

export interface ProvisioningEvent {
  id: string; // = X-Vxture-Delivery; idempotency key
  type: string; // tenant.provisioned | tenant.deprovisioned | subscription_changed | grant.invalidated
  occurred_at?: number;
  seq: number; // per (workspace, product), monotonic
  workspace_id: string;
  tenant_id?: string;
  application: string; // = product_code
  plan?: string | null;
  data?: unknown;
}

export interface HandleResult {
  ok: true;
  handled: boolean;
  reason?: "wrong-product" | "duplicate" | "stale" | "processed";
}

export interface HandlerDeps {
  store: ProvisioningStore;
  product: string;
  onSubscriptionChanged?: (workspaceId: string) => void; // C2 cache evict: subscription_changed AND tenant.*
  onProvisioned?: (workspaceId: string) => Promise<void> | void; // re-entrant init
}

// The only two types the platform ever attaches a real seq to. subscription_changed
// and grant.invalidated never carry one - route.ts defaults the field to 0 for them
// purely to satisfy ProvisioningEvent's shape, and that 0 is not a real sequence
// position. Ordering must not be judged against it, and it must not overwrite the
// real watermark set by an actual tenant.* event: a notification arriving after this
// workspace's first tenant.provisioned would otherwise be born "stale" forever (0 is
// never greater than a lastSeq that has already advanced past it), and grant/
// subscription-cache invalidation would silently stop firing from that point on.
const SEQ_BEARING_TYPES = new Set(["tenant.provisioned", "tenant.deprovisioned"]);

export async function handleProvisioning(
  event: ProvisioningEvent,
  deps: HandlerDeps,
): Promise<HandleResult> {
  // Reject events addressed to another product.
  if (event.application !== deps.product) {
    return { ok: true, handled: false, reason: "wrong-product" };
  }

  // Idempotency: a repeated delivery must not re-run side effects.
  if (await deps.store.isDelivered(event.id)) {
    return { ok: true, handled: false, reason: "duplicate" };
  }

  const seqBearing = SEQ_BEARING_TYPES.has(event.type);

  // Ordering: ignore stale/replayed seq (but still ack 2xx at the route). Only
  // applies to the two event types that actually carry one - see the comment above.
  if (seqBearing) {
    const lastSeq = await deps.store.getLastSeq(event.workspace_id, deps.product);
    if (event.seq <= lastSeq) {
      return { ok: true, handled: false, reason: "stale" };
    }
  }

  switch (event.type) {
    case "tenant.provisioned":
      await deps.store.upsertInstance(event.workspace_id, deps.product, "provisioned");
      await deps.onProvisioned?.(event.workspace_id);
      // Both tenant events change what this workspace is entitled to, so the
      // C2 cache goes here as well (reference implementation: both evict the
      // workspace's C2 entry). A cached `status: null` would otherwise outlive
      // the provisioning by up to the cache TTL.
      deps.onSubscriptionChanged?.(event.workspace_id);
      break;
    case "tenant.deprovisioned":
      // Archive, not hard-delete (080-rp section 4 / product_240 section 6#21).
      await deps.store.upsertInstance(event.workspace_id, deps.product, "deprovisioned");
      deps.onSubscriptionChanged?.(event.workspace_id);
      break;
    case "subscription_changed":
      deps.onSubscriptionChanged?.(event.workspace_id);
      break;
    case "grant.invalidated":
      // Asset-face products re-scope here; neutral template just dedups.
      break;
    default:
      // Unknown event: record delivery so retries stop, take no action.
      break;
  }

  await deps.store.markDelivered(event.id, { type: event.type, result: "processed" });
  if (seqBearing) {
    await deps.store.setSeq(event.workspace_id, deps.product, event.seq);
  }
  return { ok: true, handled: true, reason: "processed" };
}
