// POST /api/webhooks/vxture - the delivery address the platform REGISTERED for
// yucer's provisioning webhook (platform handoff, 2026-09-14). The handler is
// /provisioning/webhook (product_200 section 4) and is re-exported here
// unchanged: same raw-body HMAC check over both secrets, same idempotent and
// ordered handler, same L1 envelope on refusal.
export { POST } from "../../../provisioning/webhook/route";
export const dynamic = "force-dynamic";
