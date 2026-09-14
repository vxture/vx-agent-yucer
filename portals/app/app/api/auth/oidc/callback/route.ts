// GET /api/auth/oidc/callback - the redirect_uri the platform REGISTERED for
// the `yucer` OIDC client (platform handoff, 2026-09-14). The handler is
// /auth/callback (080-rp section 2.3/2.5) and is re-exported here unchanged:
// same single-use state, same code exchange, same token checks, same session.
// Both paths stay served - the canonical one for the contract, this one for
// the registration - and OIDC_REDIRECT_URI must equal whichever one the
// platform holds, because the IdP compares it byte for byte.
export { GET } from "../../../../auth/callback/route";
export const dynamic = "force-dynamic";
