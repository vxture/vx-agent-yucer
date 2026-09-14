"use client";

import { useEffect, useState } from "react";
import { ViewHeader } from "@vxture/design-ui";
import type { PlatformCheck, ProbeResult } from "../../api/platform-check/check";

// The self-proof page: renders /api/platform-check (live probes of every
// platform channel) the way /status renders /api/status. Same posture as that
// page - no app shell, so it opens on the day the shell cannot; gating
// (off / authed / public) is enforced by the endpoint.

const card: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 8, padding: "12px 16px", margin: "0 0 12px", maxWidth: 760 };
const detail: React.CSSProperties = { color: "#555", margin: "4px 0 0", wordBreak: "break-word" };

function badge(p: ProbeResult): string {
  if (!p.configured) return "\u{2796}";
  return p.ok ? "\u{1F7E2}" : "\u{1F534}";
}

function Probe({ title, p }: { title: string; p: ProbeResult }) {
  return (
    <section style={card}>
      <h3 style={{ margin: 0 }}>
        {badge(p)} {title}
      </h3>
      <p style={detail}>{p.detail}</p>
    </section>
  );
}

export default function PlatformCheckPage() {
  const [check, setCheck] = useState<PlatformCheck | null>(null);
  const [gate, setGate] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/platform-check", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) setGate("platform check is off on this stack");
        else if (r.status === 401) setGate("sign in to run the platform check");
        else setCheck((await r.json()) as PlatformCheck);
      })
      .catch(() => setGate("platform check unreachable"));
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <ViewHeader title="Platform check" />
      {gate && <p>{gate}</p>}
      {check && (
        <>
          <p style={detail}>probed at {check.time}; every probe is read-only</p>
          <Probe title="C1 - OIDC discovery and JWKS" p={check.c1} />
          <Probe title="C1 out - S2S token exchange" p={check.tokenMint} />
          <Probe title="C2 - live entitlement" p={check.c2} />
          <Probe title="C3 up - usage consume" p={check.c3Up} />
          <Probe title="C3 up - replay probe (checklist #5)" p={check.c3Replay} />
          <Probe title="C3 down - webhook verifier and deliveries" p={check.c3Down} />
          <Probe title="Atlas (model plane)" p={check.planes.atlas} />
          <Probe title="Runos (capability plane)" p={check.planes.runos} />
          <Probe title="arda (shared-data plane)" p={check.planes.arda} />
        </>
      )}
    </main>
  );
}
