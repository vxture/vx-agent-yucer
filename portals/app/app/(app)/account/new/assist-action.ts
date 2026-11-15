"use server";

import { AtlasClient } from "../../../agent/atlas/client";
import { RunosClient } from "../../../agent/runos/client";
import { prepareAccountRegistration, type RegistrationAssistInput } from "../../../domains/account/registration-service";
import { getCopilotStore, getStrategyStore } from "../../../domains/shared/registry";
import { resolveAppSession, tenantIdOf } from "../../lib/session";
import { resolveLocale } from "../../lib/i18n/locale";

export async function assistAccountRegistration(input: RegistrationAssistInput) {
  const session = await resolveAppSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  return prepareAccountRegistration({
    workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement, store: session.stores.account(),
  }, input, {
    tenantId: tenantIdOf(session), subjectToken: (await session.accessToken()) ?? undefined,
    locale: await resolveLocale(), copilotStore: getCopilotStore(), strategyStore: getStrategyStore(),
    atlasClient: new AtlasClient(), runosClient: new RunosClient(),
  });
}
