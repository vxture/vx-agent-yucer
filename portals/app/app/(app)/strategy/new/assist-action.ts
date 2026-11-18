"use server";
import { AtlasClient } from "../../../agent/atlas/client";
import { RunosClient } from "../../../agent/runos/client";
import { getAuthzStore } from "../../../authz/store";
import {
  getCatalogStore,
  getCopilotStore,
  getStrategyStore,
} from "../../../domains/shared/registry";
import {
  preparePlanDraft,
  type PlanAssistInput,
} from "../../../domains/strategy/plan-assist-service";
import { resolveAppSession, tenantIdOf } from "../../lib/session";
import { resolveLocale } from "../../lib/i18n/locale";
export async function assistStrategyDraft(input: PlanAssistInput) {
  const session = await resolveAppSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  return preparePlanDraft(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getStrategyStore(),
      memberDirectory: getAuthzStore(),
    },
    input,
    {
      tenantId: tenantIdOf(session),
      subjectToken: (await session.accessToken()) ?? undefined,
      locale: await resolveLocale(),
      catalog: getCatalogStore(),
      copilotStore: getCopilotStore(),
      atlasClient: new AtlasClient(),
      runosClient: new RunosClient(),
    },
  );
}
