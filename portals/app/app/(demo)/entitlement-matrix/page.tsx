import { ViewHeader } from "@vxture/design-ui";
import {
  SUBSCRIPTION_STATUSES,
  type SubscriptionStatus,
  TIERS,
  type Tier,
  ctaFor,
  hasDataAccess,
  hasProductAccess,
} from "../../entitlement/types";
import { makeEntitlement } from "../../entitlement/resolver";

// Subscription-tier verification (product_240 section 7): the five tiers x six
// statuses (plus the null / bundled-only edge cases) with their gate + CTA
// outcomes. Pure functions, fully offline - no platform, no session.
export const dynamic = "force-static";

interface Row {
  label: string;
  tier: Tier | null;
  status: SubscriptionStatus | null;
  bundled: boolean;
}

function rows(): Row[] {
  const out: Row[] = [];
  for (const tier of TIERS) {
    for (const status of SUBSCRIPTION_STATUSES) {
      out.push({ label: `${tier} / ${status}`, tier, status, bundled: false });
    }
  }
  out.push({
    label: "null / null (never subscribed)",
    tier: null,
    status: null,
    bundled: false,
  });
  out.push({
    label: "bundled only (no direct purchase)",
    tier: null,
    status: null,
    bundled: true,
  });
  return out;
}

const cellStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "4px 8px",
  textAlign: "left",
};

export default function EntitlementMatrixPage() {
  const data = rows().map((r) => {
    const e = makeEntitlement("ws_demo", "yucer", {
      tier: r.tier,
      status: r.status,
      bundled: r.bundled,
    });
    return {
      ...r,
      productAccess: hasProductAccess(e),
      dataAccess: hasDataAccess(e),
      cta: ctaFor(e),
    };
  });
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      {/* Titled like every other route. The inline-styled <main> stays: this
          page is `force-static` and fully offline by design, and its frame not
          depending on the shell is part of that. */}
      <ViewHeader
        title="Entitlement gating matrix"
        description={
          <>
            Offline demonstration of the C2 gating and CTA rules (product_220
            section 3). UI gate = <code>tier != null</code>; data gate ={" "}
            <code>tier != null || bundled</code>.
          </>
        }
      />
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cellStyle}>tier / status (bundled)</th>
            <th style={cellStyle}>UI access</th>
            <th style={cellStyle}>data access</th>
            <th style={cellStyle}>CTA</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.label}>
              <td style={cellStyle}>
                {r.label}
                {r.bundled ? " [bundled]" : ""}
              </td>
              <td style={cellStyle}>{r.productAccess ? "yes" : "no"}</td>
              <td style={cellStyle}>{r.dataAccess ? "yes" : "no"}</td>
              <td style={cellStyle}>{r.cta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
