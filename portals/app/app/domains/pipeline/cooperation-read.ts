import type { AccountStore } from "../account/store";
import type { PipelineContext } from "./service";
import type { ForecastScope } from "./lib/forecast";
import { readCooperationHistory } from "../account/cooperation-service";
import { listAccounts } from "../account/service";
import { verifiedNewLogos } from "./lib/attainment-analysis";

/** No first-recorded-win fallback: pre-system history and attribution must be verified. */
export async function forecastNewLogos(
  ctx: PipelineContext & {
    accounts?: AccountStore;
    completeCooperationRoster?: boolean;
  },
  period: string,
  scope: ForecastScope,
): Promise<number | null> {
  if (!ctx.accounts) return null;
  const accountContext = { ...ctx, store: ctx.accounts };
  const [accounts, history] = await Promise.all([
    listAccounts(accountContext),
    readCooperationHistory(accountContext),
  ]).catch(() => [null, null] as const);
  if (!accounts?.ok || !history?.ok) return null;
  const key =
    scope.scopeType === "workspace"
      ? "workspace"
      : scope.scopeType === "territory"
        ? `territory:${scope.territoryId}`
        : `owner:${scope.ownerSub}`;
  return verifiedNewLogos(
    history.value,
    accounts.value,
    key,
    period,
    ctx.completeCooperationRoster === true,
  ).value;
}
