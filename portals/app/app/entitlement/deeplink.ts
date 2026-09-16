import { BRAND } from "@yucer/shared/brand";

// Conversion deep-link constructor (product_200 section 3.2; the integration
// rules' C2 "conversion deep link"). REVISED 2026-09-16 (rules artifact v24):
// the exit is the PUBLIC WEBSITE's pricing page, not the console's /subscribe
// screen - console /subscribe is the confirmation step AFTER a tier is picked
// on the pricing page (entered from the pricing page's own CTA), not a
// product-side entry point. That was the old shape here
// ({console}/subscribe?product=&intent=), which the console degrades for any
// product with no plans registered in its catalogue - the click landed on the
// console's subscription home with no error on either side.
//
// The pricing page recognises exactly one param: `product`. No `intent` (the
// page is not state-aware - the rules deliberately dropped that distinction
// for this exit), no `workspace_id` (the console resolves the subscribing
// workspace from the session), no locale segment (the website itself 307s to
// /zh-CN/ or /en-US/ off the visitor's own NEXT_LOCALE cookie; this product's
// own locale cookie is host-scoped to its own domain and the website cannot
// read it, so splicing a guessed segment here would override the visitor's
// actual choice on vxture.com with this product's guess).
//
// Attach ONLY to an explicit user click - never auto-redirect.

/**
 * NEXT_PUBLIC_WEBSITE_URL empty means "hide the one decorative outward link on
 * the gate screens" (websiteUrl(), (app)/lib/website-url.ts) - that opt-out
 * must not also take down the product's one conversion exit, so this reads
 * the same variable but always falls back to the real default rather than
 * treating an empty value as "no link".
 */
export function pricingUrl(): string {
  const base = (process.env.NEXT_PUBLIC_WEBSITE_URL || "https://vxture.com").replace(/\/$/, "");
  const u = new URL(`${base}/pricing`);
  u.searchParams.set("product", BRAND.productCode);
  return u.toString();
}
