"use server";
import { resolveAppSession, tenantIdOf } from "../lib/session";
import { salesPlanContext, loadPlanSources } from "../planning/plan-data";
import { prepareFocusDraft, type FocusAssistInput } from "../../domains/planning/focus-assist";
import { AtlasClient } from "../../agent/atlas/client";
import { RunosClient } from "../../agent/runos/client";
import { getCopilotStore } from "../../domains/shared/registry";
import { resolveLocale } from "../lib/i18n/locale";
import { PlanError } from "../../domains/planning/plan-values";
export async function assistFocusDraft(input: FocusAssistInput) {
  const session = await resolveAppSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  try {
    const sources = await loadPlanSources(session), account = sources.accounts.find(a => a.id === input.accountId);
    if (!account) return { ok: false as const, error: "account_unknown" };
    return await prepareFocusDraft(salesPlanContext(session), input, { account, tenantId: tenantIdOf(session), subjectToken: (await session.accessToken()) ?? undefined, locale: await resolveLocale(), copilotStore: getCopilotStore(), atlasClient: new AtlasClient(), runosClient: new RunosClient() });
  } catch (e) { return { ok: false as const, error: e instanceof PlanError ? e.code : "source_read_failed" }; }
}
