// Deploy-stage guard for the offline mock resolver. Mirrors the reference
// implementation (vx-agent-vxtpl app/lib/deploy-stage.ts; the product
// integration reference: "mock and real resolvers are let through by stage,
// not by care").
//
// yucer's mock entitlement resolver exists so the whole UI is explorable with
// an empty .env - a genuine local-dev and CI convenience. On a deployed stack
// it is a trap: a missing PLATFORM_API_URL makes the app serve entitlements
// out of MOCK_TIER, granting or denying paid access on the strength of an
// environment variable, and the only signal is a badge on /status nobody is
// watching. Production ran exactly that way from 2026-09-10 to 2026-09-14
// (`resolver: mock` on /api/status) before this guard existed.
//
// So the mock path is allowed by stage, not by accident. DEPLOY_STAGE is
// injected at image build (build.yml derives it from the git ref: v*.*.* ->
// production, beta-* -> beta, anything else -> dev).

export type DeployStage = "dev" | "beta" | "production";

/** Pure form, for readers that carry their own env snapshot (lib/status.ts). */
export function deployStageOf(raw: string | undefined): DeployStage {
  return raw === "production" || raw === "beta" ? raw : "dev";
}

export function deployStage(): DeployStage {
  return deployStageOf(process.env.DEPLOY_STAGE);
}

/** True on a stage where a mock resolver must never stand in for a real one. */
export function isDeployedStage(): boolean {
  return deployStage() !== "dev";
}

/**
 * Refuse to fall back to a mock resolver on a deployed stage.
 *
 * ALLOW_MOCK_ON_DEPLOY=on is the deliberate override - for a stack that has to
 * come up before the platform issues its values. It is loud on purpose: it
 * names itself here, and /api/status reports the resolver as mock and the
 * override as set, regardless.
 */
export function assertMockAllowed(channel: string, requiredEnv: string): void {
  if (!isDeployedStage()) return;
  if (process.env.ALLOW_MOCK_ON_DEPLOY === "on") {
    console.warn(
      `[${channel}] running the MOCK resolver on stage '${deployStage()}' because ` +
        `ALLOW_MOCK_ON_DEPLOY=on. This serves fabricated data. Configure ${requiredEnv}.`,
    );
    return;
  }
  throw new Error(
    `[${channel}] refusing to start on stage '${deployStage()}' without ${requiredEnv}: ` +
      "a deployed stack must not serve mock data. Configure it, or set " +
      "ALLOW_MOCK_ON_DEPLOY=on to accept fabricated data deliberately.",
  );
}
