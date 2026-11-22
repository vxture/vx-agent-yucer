import { createHash } from "node:crypto";
import { can } from "../../../authz/decide";
import {
  resolveFreshAppSession,
  type AppSession,
} from "../../../(app)/lib/session";
import { getAccountDetail } from "../../../domains/account/service";
import { getOpportunityDetail } from "../../../domains/pipeline/service";
import { listLeads } from "../../../domains/signal/service";
import { listProducts, listSolutions } from "../../../domains/catalog/service";
import { currentStrategyPlans } from "../../../domains/strategy/lib/current-plans";
import {
  listPlans,
  listSegments,
  listCampaigns,
} from "../../../domains/strategy/service";
import { listProjects } from "../../../domains/delivery/service";
import {
  getCatalogStore,
  getCopilotStore,
  getDeliveryStore,
  getStrategyStore,
  getTaskStore,
} from "../../../domains/shared/registry";
import type {
  TaskObject,
  TaskSource,
} from "../../../domains/copilot/lib/task-contract";
import type { TaskContext } from "../../../domains/copilot/task-service";

// Only identity and source-version metadata cross this boundary in 01A.
// Business field query/form adapters belong to 04A. Scoped stores are mandatory.
export async function readTaskSource(
  session: AppSession,
  object: TaskObject,
): Promise<TaskSource | null> {
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  let value: unknown = null;
  switch (object.kind) {
    case "account": {
      const r = await getAccountDetail(
        { ...base, store: session.stores.account() },
        object.id,
      );
      value = r.ok ? r.value.account : null;
      break;
    }
    case "opportunity": {
      const r = await getOpportunityDetail(
        { ...base, store: session.stores.pipeline() },
        object.id,
      );
      value = r.ok ? r.value : null;
      break;
    }
    case "lead": {
      const r = await listLeads({ ...base, store: session.stores.signal() });
      value = r.ok ? r.value.find((x) => x.id === object.id) : null;
      break;
    }
    case "strategy":
    case "plan": {
      const r = await listPlans({ ...base, store: getStrategyStore() });
      value = r.ok
        ? r.value
            .filter((x) => {
              const current = currentStrategyPlans(r.value).find(
                (p) => (p.lineageId ?? p.id) === (x.lineageId ?? x.id),
              );
              return current?.id === x.id;
            })
            .find((x) => x.id === object.id)
        : null;
      break;
    }
    case "segment": {
      const r = await listSegments({ ...base, store: getStrategyStore() });
      value = r.ok ? r.value.find((x) => x.id === object.id) : null;
      break;
    }
    case "campaign": {
      const r = await listCampaigns({ ...base, store: getStrategyStore() });
      value = r.ok ? r.value.find((x) => x.id === object.id) : null;
      break;
    }
    case "product": {
      const r = await listProducts({ ...base, store: getCatalogStore() });
      value = r.ok ? r.value.find((x) => x.id === object.id) : null;
      break;
    }
    case "solution": {
      const r = await listSolutions({ ...base, store: getCatalogStore() });
      value = r.ok ? r.value.find((x) => x.solution.id === object.id) : null;
      break;
    }
    case "project": {
      const r = await listProjects({ ...base, store: getDeliveryStore() });
      const project = r.ok ? r.value.find((x) => x.id === object.id) : null;
      const account = project
        ? await getAccountDetail(
            { ...base, store: session.stores.account() },
            project.accountId,
          )
        : null;
      value = account?.ok ? project : null;
      break;
    }
  }
  if (!value) return null;
  return {
    ...object,
    version: createHash("sha256")
      .update(
        JSON.stringify(value, (_k, v) =>
          typeof v === "bigint" ? v.toString() : v,
        ),
      )
      .digest("hex"),
  };
}

export async function taskRequestContext(): Promise<{
  context: TaskContext;
  session: AppSession;
} | null> {
  const session = await resolveFreshAppSession();
  if (
    !session ||
    !can(session.authz, session.entitlement, "copilot.ask", "data").allowed
  )
    return null;
  return {
    session,
    context: {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getTaskStore(),
      sessions: getCopilotStore(),
      source: (object) => readTaskSource(session, object),
      refresh: async () => (await taskRequestContext())?.context ?? null,
    },
  };
}
