"use server";

import { AtlasClient } from "../../../agent/atlas/client";
import { RunosClient } from "../../../agent/runos/client";
import { prepareCatalogDraft, type CatalogAssistInput } from "../../../domains/catalog/catalog-assist-service";
import { getCatalogStore, getCopilotStore } from "../../../domains/shared/registry";
import { resolveAppSession, tenantIdOf } from "../../lib/session";
import { resolveLocale } from "../../lib/i18n/locale";

export async function assistSolutionDraft(input: CatalogAssistInput) {
  const session = await resolveAppSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  return prepareCatalogDraft({ workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz,
    entitlement: session.entitlement, store: getCatalogStore() }, "solution", input, {
    tenantId: tenantIdOf(session), subjectToken: (await session.accessToken()) ?? undefined,
    locale: await resolveLocale(), copilotStore: getCopilotStore(), atlasClient: new AtlasClient(), runosClient: new RunosClient(),
  });
}
