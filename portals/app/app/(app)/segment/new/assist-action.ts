"use server";

import { AtlasClient } from "../../../agent/atlas/client";
import { RunosClient } from "../../../agent/runos/client";
import { getCatalogStore, getCopilotStore, getStrategyStore } from "../../../domains/shared/registry";
import { prepareSegmentDraft, type SegmentAssistInput } from "../../../domains/strategy/segment-assist-service";
import { resolveAppSession, tenantIdOf } from "../../lib/session";
import { resolveLocale } from "../../lib/i18n/locale";

export async function assistSegmentDraft(input: SegmentAssistInput) {
  const session = await resolveAppSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  const base = { workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement };
  return prepareSegmentDraft({ ...base, store: getStrategyStore() }, input, {
    tenantId: tenantIdOf(session), subjectToken: (await session.accessToken()) ?? undefined, locale: await resolveLocale(),
    account: { ...base, store: session.stores.account() }, catalog: getCatalogStore(), copilotStore: getCopilotStore(),
    atlasClient: new AtlasClient(), runosClient: new RunosClient(),
  });
}
