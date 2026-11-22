import { topicFeed } from "../../../domains/judgement/topic-feed";
import { snoozeJudgement } from "../../../domains/judgement/service";
import {
  readTopicEvidence,
  type TopicContext,
} from "../../../domains/judgement/topic-service";
import {
  getTopicStore,
  getPlanningStore,
} from "../../../domains/shared/registry";
import { listTargets, attainment } from "../../../domains/planning/service";
import { readProductRoster } from "../../../platform/product-roster";
import { getAuthzStore } from "../../../authz/store";
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
  getMemoryStore,
  getKnowledgeStore,
} from "../../../domains/shared/registry";
import type {
  TaskObject,
  TaskSource,
} from "../../../domains/copilot/lib/task-contract";
import type { TaskContext } from "../../../domains/copilot/task-service";

export function topicBindings(session: AppSession) {
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    stores: session.stores,
    allowWorkspaceMetrics: session.scope.kind === "workspace",
  };
  return {
    ...base,
    topics: getTopicStore(),
    accessVersion: createHash("sha256")
      .update(
        JSON.stringify({
          permissions: [...session.authz.permissions].sort((a, b) =>
            a.localeCompare(b),
          ),
          scope: session.scope,
          tier: session.entitlement.tier,
          bundled: session.entitlement.bundled,
        }),
      )
      .digest("hex"),
    judgements: (scope?: "mine" | "all", includeSnoozed = false) =>
      topicFeed(base, { scope, includeSnoozed }),
    snooze: (
      id: string,
      urgency: import("../../../domains/judgement/lib/judgement").Urgency,
    ) =>
      snoozeJudgement(
        { ...base, store: getCopilotStore() },
        { judgementId: id, urgency },
      ),
  };
}
export async function topicRequestContext(): Promise<TopicContext | null> {
  const access = await taskRequestContext();
  return access
    ? {
        ...access.context,
        ...topicBindings(access.session),
        refresh: topicRequestContext,
      }
    : null;
}

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
    case "judgement": {
      const evidence = await readTopicEvidence(
        topicBindings(session),
        object.id,
      );
      return evidence ? { ...object, version: evidence.version } : null;
    }
    case "sales_target": {
      const ctx = { ...base, store: getPlanningStore() },
        rows = await listTargets(ctx);
      const target = rows.ok
        ? rows.value.find((t) => t.id === object.id)
        : null;
      if (
        !target ||
        (session.scope.kind !== "workspace" &&
          target.ownerSub !== session.user.sub)
      )
        return null;
      const actual = await attainment(ctx, target.period);
      if (!actual.ok) return null;
      value = actual.value.find((r) => r.target.id === object.id) ?? null;
      break;
    }
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
      memory: getMemoryStore(),
      knowledge: getKnowledgeStore(),
      knowledgeMembers: async () => {
        const roster = await readProductRoster(
          session.workspaceId,
          session.user.activeOrg,
        );
        if (roster !== null)
          return roster.map((m) => ({
            sub: m.subject,
            displayName: m.displayName,
          }));
        if (
          process.env.DEPLOY_STAGE === "production" ||
          process.env.DEPLOY_STAGE === "beta"
        )
          throw new Error("knowledge_roster_unavailable");
        return (await getAuthzStore().listMembers(session.workspaceId))
          .filter((m) => m.status === "active")
          .map((m) => ({ sub: m.sub, displayName: m.displayName }));
      },
      sessions: getCopilotStore(),
      source: (object) => readTaskSource(session, object),
      judgementEvidence: async (objects) => {
        const rows = [];
        for (const o of objects.filter((o) => o.kind === "judgement")) {
          const r = await readTopicEvidence(topicBindings(session), o.id);
          if (!r || r.version !== o.version) throw new Error("source_changed");
          rows.push(r.finding);
        }
        return rows;
      },
      refresh: async () => (await taskRequestContext())?.context ?? null,
    },
  };
}
