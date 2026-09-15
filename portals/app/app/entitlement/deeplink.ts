import { BRAND } from "@yucer/shared/brand";
import { ctaFor, type Entitlement, type Tier } from "./types";

// Conversion deep-link constructor (product_200 section 3.2; the integration
// rules' C2 "conversion deep link"): the single conversion exit to
// vxture-console. Attach ONLY to an explicit user click - never auto-redirect.
// product + intent are required; workspace_id is resolved by the console
// session and MUST NOT be sent by the product.
//
// The intent vocabulary is the console's: subscribe | upgrade | renew | addon.
// `subscribe` was missing here until 2026-09-14, and every lockout sent
// `upgrade` - the rules' second trap ("status: null is never-subscribed and
// should lead to a first purchase; expired should lead to a renewal; mixing
// them shows the wrong CTA forever").

export type Intent = "subscribe" | "upgrade" | "renew" | "addon";

/**
 * The intent a workspace's entitlement calls for, derived from the CTA branch
 * in types.ts (product_240 section 2.4 #9) so the two never disagree:
 *
 *   never subscribed (status null)          -> subscribe
 *   expired / cancelled / suspended         -> renew
 *   overdue (payment to fix)                -> renew  (the console has no
 *                                              "pay" intent; renewal is where
 *                                              a lapsed payment is put right)
 *   in good standing                        -> upgrade
 */
export function intentFor(e: Entitlement): Intent {
  switch (ctaFor(e)) {
    case "subscribe":
      return "subscribe";
    case "renew":
    case "pay":
      return "renew";
    default:
      return "upgrade";
  }
}

export function subscribeUrl(opts: { intent: Intent; targetTier?: Tier; metric?: string }): string {
  const base = (process.env.NEXT_PUBLIC_CONSOLE_URL ?? "https://console.vxture.com").replace(/\/$/, "");
  const u = new URL(`${base}/subscribe`);
  u.searchParams.set("product", BRAND.productCode);
  u.searchParams.set("intent", opts.intent);
  if (opts.targetTier) u.searchParams.set("target_tier", opts.targetTier);
  if (opts.metric) u.searchParams.set("metric", opts.metric);
  return u.toString();
}
