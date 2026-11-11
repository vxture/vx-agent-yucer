import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import {
  canonical,
  demand,
  type PlanContent,
  type PlanEvent,
  type SalesPlan,
} from "./plan-model";
import type { SalesPlanStore } from "./plan-store";

type Db = Prisma.TransactionClient;
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
async function load(
  db: Db,
  workspaceId: string,
  year: number,
): Promise<SalesPlan | null> {
  const root = await db.salesPlan.findUnique({
    where: { workspaceId_year: { workspaceId, year } },
  });
  if (!root) return null;
  const where = { workspaceId, planId: root.id };
  const [revisions, events, legacy] = await Promise.all([
    db.salesPlanRevision.findMany({ where, orderBy: { createdAt: "asc" } }),
    db.salesPlanEvent.findMany({ where, orderBy: { eventNo: "asc" } }),
    db.salesPlanLegacyTarget.findMany({ where }),
  ]);
  return {
    id: root.id,
    workspaceId,
    year,
    revisions: revisions.map((r) => ({
      id: r.id,
      state: r.state as "draft" | "sealed" | "abandoned",
      editToken: r.editToken,
      version: r.versionNo,
      baseId: r.baseRevisionId,
      restoresId: r.restoresRevisionId,
      content: r.content as unknown as PlanContent,
      contentHash: r.contentHash,
      reason: r.changeReason,
      createdBy: r.createdBySub,
      createdAt: r.createdAt.toISOString(),
      sealedBy: r.sealedBySub,
      sealedAt: r.sealedAt?.toISOString() ?? null,
    })),
    events: events.map((e) => ({
      no: e.eventNo,
      kind: e.kind as PlanEvent["kind"],
      revisionId: e.revisionId,
      relatedNo: e.relatedEventNo,
      period: e.periodKey,
      at: e.recordedAt.toISOString(),
      effectiveAt: e.effectiveAt.toISOString(),
      actor: e.actorSub,
      reason: e.reason,
      requestKey: e.requestKey,
      requestHash: e.requestHash,
    })),
    legacy: legacy.map((l) => ({
      targetId: l.legacyTargetId,
      revisionId: l.adoptedRevisionId,
      snapshot: l.legacySnapshot,
    })),
  };
}
export class PrismaSalesPlanStore implements SalesPlanStore {
  async list(workspaceId: string) {
    const db = await getPrismaClient();
    return db.$transaction(
      async (tx) => {
        const roots = await tx.salesPlan.findMany({ where: { workspaceId } });
        return (
          await Promise.all(roots.map((r) => load(tx, workspaceId, r.year)))
        ).filter((p): p is SalesPlan => p !== null);
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async read(workspaceId: string, year: number) {
    const db = await getPrismaClient();
    return db.$transaction((tx) => load(tx, workspaceId, year), {
      isolationLevel: "RepeatableRead",
    });
  }
  async adopted(workspaceId: string, targetId: string) {
    const db = await getPrismaClient();
    return Boolean(
      await db.salesPlanLegacyTarget.findUnique({
        where: {
          workspaceId_legacyTargetId: { workspaceId, legacyTargetId: targetId },
        },
      }),
    );
  }
  async transact<T>(
    workspaceId: string,
    year: number,
    run: (plan: SalesPlan) => T | Promise<T>,
  ): Promise<T> {
    const db = await getPrismaClient();
    return db.$transaction(
      async (tx) => {
        await tx.salesPlan.upsert({
          where: { workspaceId_year: { workspaceId, year } },
          create: { workspaceId, year },
          update: {},
        });
        await tx.$queryRaw`SELECT id FROM yucer_gtm.sales_plan WHERE workspace_id=${workspaceId}::uuid AND year=${year} FOR UPDATE`;
        const before = (await load(tx, workspaceId, year))!;
        const plan = structuredClone(before);
        const result = await run(plan);
        const release = plan.events.find(
          (e) =>
            e.kind === "release" &&
            !before.events.some((old) => old.no === e.no),
        );
        if (release) {
          const content = plan.revisions.find(
            (r) => r.id === release.revisionId,
          )!.content;
          const legacyRows = await tx.salesTarget.findMany({
            where: {
              workspaceId,
              status: { not: "closed" },
              scopeType: { in: ["workspace", "territory"] },
            },
          });
          demand(
            legacyRows.every(
              (t) =>
                !content.periods.some(
                  (p) =>
                    p.key ===
                    (/^Y?\d{4}$/.test(t.period)
                      ? `Y${t.period.replace(/^Y/, "")}`
                      : t.period),
                ) ||
                (t.scopeType === "territory" &&
                  !content.regions.some((r) => r.id === t.territoryId)) ||
                plan.legacy.some((a) => a.targetId === t.id),
            ),
            "legacy_source_changed",
          );
        }
        for (const adoption of plan.legacy
          .filter((l) => !before.legacy.some((x) => x.targetId === l.targetId))
          .sort((a, b) => a.targetId.localeCompare(b.targetId))) {
          await tx.$queryRaw`SELECT id FROM yucer_gtm.sales_target WHERE workspace_id=${workspaceId}::uuid AND id=${adoption.targetId}::uuid FOR UPDATE`;
          const current = await tx.salesTarget.findFirst({
            where: { workspaceId, id: adoption.targetId },
          });
          const source = adoption.snapshot as {
            period?: string;
            scopeType?: string;
            territoryId?: string | null;
            ownerSub?: string | null;
            metric?: string;
            status?: string;
            targetValue?: { amount: number; currency?: string };
          };
          demand(
            current &&
              source &&
              current.period === source.period &&
              current.scopeType === source.scopeType &&
              current.territoryId === source.territoryId &&
              current.ownerSub === source.ownerSub &&
              current.metric === source.metric &&
              current.status === source.status &&
              Number(current.targetAmount) === source.targetValue?.amount &&
              current.currency === (source.targetValue?.currency ?? null),
            "legacy_source_changed",
          );
        }
        for (const r of plan.revisions) {
          const old = before.revisions.find((x) => x.id === r.id);
          if (!old)
            await tx.salesPlanRevision.create({
              data: {
                id: r.id,
                workspaceId,
                planId: plan.id,
                baseRevisionId: r.baseId,
                restoresRevisionId: r.restoresId,
                state: "draft",
                editToken: r.editToken,
                content: json(r.content),
                createdBySub: r.createdBy,
                createdAt: new Date(r.createdAt),
              },
            });
          else if (
            old.state === "draft" &&
            (old.content !== r.content || old.editToken !== r.editToken) &&
            r.state !== "sealed"
          ) {
            const data = {
              content: json(r.content),
              editToken: r.editToken,
              state: r.state,
            };
            if (!assertWritable("yucer_gtm.sales_plan_revision", data).ok)
              throw new Error("locked_plan_column");
            if (canonical(old) !== canonical(r))
              await tx.salesPlanRevision.update({ where: { id: r.id }, data });
          }
        }
        for (const e of plan.events.filter(
          (e) => !before.events.some((x) => x.no === e.no),
        )) {
          const hash =
            plan.revisions.find((r) => r.id === e.revisionId)?.contentHash ??
            null;
          await tx.$executeRaw`SELECT yucer_gtm.sales_plan_record_event(${workspaceId}::uuid,${plan.id}::uuid,${e.revisionId}::uuid,${e.no}::integer,${e.kind}::text,${e.relatedNo}::integer,${e.period}::text,${e.at}::timestamptz,${e.effectiveAt}::timestamptz,${e.actor}::text,${e.reason}::text,${e.requestKey}::text,${e.requestHash}::text,${hash}::text)`;
        }
        for (const l of plan.legacy.filter(
          (l) => !before.legacy.some((x) => x.targetId === l.targetId),
        ))
          await tx.salesPlanLegacyTarget.create({
            data: {
              workspaceId,
              planId: plan.id,
              legacyTargetId: l.targetId,
              adoptedRevisionId: l.revisionId,
              legacySnapshot: json(l.snapshot),
            },
          });
        return result;
      },
      { timeout: 15000 },
    );
  }
}
