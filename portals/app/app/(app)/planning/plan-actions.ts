"use server";
import { revalidatePath } from "next/cache";
import { can } from "../../authz/decide";
import { resolveAppSession } from "../lib/session";
import { getPlanningStore } from "../../domains/shared/registry";
import {
  changeSalesPlan,
  readSalesPlan,
  type PlanCommand,
} from "../../domains/planning/plan-service";
import {
  demand,
  digest,
  PlanError,
  planVersions,
} from "../../domains/planning/plan-model";
import {
  checkPlanRead,
  freshPlan,
  loadPlanSources,
  salesPlanContext,
  verifyPlanSources,
} from "./plan-data";
export async function salesPlanCommandAction(input: {
  year: number;
  expectedEventNo: number;
  requestKey: string;
  command: PlanCommand;
}) {
  const session = await resolveAppSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  try {
    const requestDigest = digest({
      command: input.command,
      expectedEventNo: input.expectedEventNo,
      actor: session.user.sub,
    });
    const ctx = { ...salesPlanContext(session), requestDigest };
    const plan = await readSalesPlan(ctx, input.year);
    for (const r of plan?.revisions ?? []) checkPlanRead(session, r.content);
    const retry = plan?.events.find((e) => e.requestKey === input.requestKey);
    if (retry) {
      demand(retry.requestHash === requestDigest, "idempotency_conflict");
      demand(
        can(
          session.authz,
          session.entitlement,
          "planning.target.update",
          "data",
        ).allowed,
        "plan_denied",
      );
      return { ok: true as const, plan: plan! };
    }
    const command = structuredClone(input.command);
    if (
      command.kind === "draft" ||
      command.kind === "save" ||
      command.kind === "release"
    ) {
      const sources = await loadPlanSources(session);
      if (command.kind === "draft") {
        command.content = freshPlan(input.year, sources);
        if (
          !planVersions(
            plan ?? {
              id: "",
              workspaceId: session.workspaceId,
              year: input.year,
              revisions: [],
              events: [],
              legacy: [],
            },
            new Date().toISOString(),
          ).current &&
          !command.restoreId
        ) {
          const legacy = await getPlanningStore().listTargets(
            session.workspaceId,
          );
          for (const t of legacy.filter(
            (t) => t.status !== "closed" && t.scopeType !== "owner",
          )) {
            const period = /^Y?\d{4}$/.test(t.period)
              ? `Y${t.period.replace(/^Y/, "")}`
              : t.period;
            if (!command.content.periods.some((p) => p.key === period))
              continue;
            const scope =
              t.scopeType === "workspace"
                ? "workspace"
                : `territory:${t.territoryId}`;
            if (
              scope !== "workspace" &&
              !command.content.regions.some(
                (r) => `territory:${r.id}` === scope,
              )
            )
              continue;
            const existing = command.content.targets.find(
              (x) =>
                x.scope === scope &&
                x.period === period &&
                x.metric === t.metric,
            );
            const value = {
              key: existing?.key ?? crypto.randomUUID(),
              scope,
              period,
              metric: t.metric,
              currency:
                t.targetValue.unit === "money" ? t.targetValue.currency : null,
              floor: null,
              target: String(t.targetValue.amount),
              stretch: null,
              note: "",
            };
            command.content.targets = command.content.targets.filter(
              (x) => x !== existing,
            );
            command.content.targets.push(value);
          }
        }
      } else if (command.kind === "save")
        await verifyPlanSources(session, command.content, sources, true);
      else {
        const r = plan?.revisions.find((r) => r.id === command.revisionId);
        demand(r, "draft_not_found");
        await verifyPlanSources(session, r.content, sources);
        const legacy = await getPlanningStore().listTargets(
          session.workspaceId,
        );
        const conflicts = legacy.filter(
          (t) =>
            !t.id.startsWith("plan_") &&
            t.status !== "closed" &&
            r.content.periods.some(
              (p) =>
                p.key ===
                (/^Y?\d{4}$/.test(t.period)
                  ? `Y${t.period.replace(/^Y/, "")}`
                  : t.period),
            ) &&
            (t.scopeType === "workspace" ||
              (t.scopeType === "territory" &&
                r.content.regions.some(
                  (region) => region.id === t.territoryId,
                ))) &&
            !plan?.legacy.some((a) => a.targetId === t.id),
        );
        /* The release adopts the entire managed scope, including optional
           legacy metrics removed from the new draft. Their old values must
           not reappear as an independent target after publication. */

        if (!plan?.revisions.some((r) => r.state === "sealed")) {
          demand(
            conflicts.every((t) =>
              command.adoptions?.some((a) => a.targetId === t.id),
            ),
            "legacy_confirmation_required",
          );
          command.adoptions = conflicts.map((t) => ({
            targetId: t.id,
            snapshot: t,
          }));
        } else command.adoptions = undefined;
      }
    }
    const result = await changeSalesPlan(ctx, { ...input, command });
    for (const path of [
      "/planning",
      "/attainment",
      "/pipeline",
      "/forecast",
      "/",
    ])
      revalidatePath(path);
    return { ok: true as const, plan: result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof PlanError ? error.code : "plan_save_failed",
    };
  }
}
export async function loadPlanningCustomerBudget(
  accountId: string,
  year: number,
) {
  const session = await resolveAppSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  try {
    const sources = await loadPlanSources(session);
    demand(
      sources.accounts.some((a) => a.id === accountId),
      "account_unknown",
    );
    const plan = await session.stores
      .account()
      .getAccountPlan(session.workspaceId, accountId);
    return {
      ok: true as const,
      source:
        plan &&
        plan.status === "active" &&
        (plan.period === `Y${year}` || plan.period === `${year}`) &&
        plan.targetAmount !== null
          ? {
              id: plan.id,
              amount: String(plan.targetAmount),
              currency: sources.currency,
              period: `Y${year}`,
            }
          : null,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof PlanError ? error.code : "source_read_failed",
    };
  }
}
