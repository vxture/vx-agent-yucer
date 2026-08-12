import { BRAND } from "@yucer/shared/brand";
import { serviceIdentity } from "@vxture/shared";

// Skeleton landing. The domain UI (the app route group) and the contract-facing
// auth/entitlement gates arrive in later batches; this shell only proves the app
// builds and serves.
export default function HomePage() {
  const { gitSha } = serviceIdentity({ service: `${BRAND.productCode}-app`, product: BRAND.productCode });
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>{BRAND.displayName}</h1>
      <p>Vxture product template shell. Build {gitSha}.</p>
    </main>
  );
}
