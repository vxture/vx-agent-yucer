import { getAuthzStore } from "../../authz/store";
import type { AppSession } from "../../(app)/lib/session";
import {
  getStrategyStore,
  getCatalogStore,
  getSalesPlanStore,
} from "../shared/registry";
import {
  upsertSegment,
  createPlan,
  editPlan,
  publishStrategy,
} from "../strategy/service";
import { upsertSolution } from "../catalog/service";
import { changeSalesPlan, readSalesPlan } from "../planning/plan-service";
import {
  canonical,
  planVersions,
  type PlanContent,
} from "../planning/plan-model";
import {
  mergeFormFields,
  FORM_FIELDS,
  type BusinessForm,
} from "./lib/business-form";
import type { RuleResult } from "../shared/result";
import type { TaskObject } from "./lib/task-contract";

export interface BusinessReceipt {
  object: TaskObject;
  version: string;
  href: string;
  operation: "save" | "publish";
}
export function requireResult<T>(result: RuleResult<T>): T {
  if (!result.ok)
    throw Error(result.violations[0]?.code ?? "business_write_refused");
  return result.value;
}
/** Calls only the same services used by native forms. The caller owns the
 * enclosing transaction, source checks and immutable execution proposal. */
export async function writeBusinessForm(
  session: AppSession,
  form: BusinessForm,
  operation: "save" | "publish",
  stepId: string,
): Promise<TaskObject> {
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const strategy = {
    ...base,
    store: getStrategyStore(),
    catalog: getCatalogStore(),
    memberDirectory: getAuthzStore(),
  };
  if (
    operation === "publish" &&
    !["strategy", "sales_plan"].includes(form.module)
  )
    throw Error("operation_not_registered");
  let fields = form.fields;
  if (form.targetId && form.module !== "sales_plan") {
    let original: Record<string, unknown> | undefined;
    if (form.module === "segment")
      original = (await strategy.store.listSegments(session.workspaceId)).find(
        (r) => r.id === form.targetId,
      ) as unknown as Record<string, unknown>;
    if (form.module === "strategy")
      original = (await strategy.store.getPlan(
        session.workspaceId,
        form.targetId,
      )) as unknown as Record<string, unknown>;
    if (form.module === "solution") {
      const catalog = getCatalogStore(),
        row = (await catalog.listSolutions(session.workspaceId)).find(
          (r) => r.id === form.targetId,
        );
      if (row)
        original = {
          ...row,
          items: await catalog.listSolutionItems(session.workspaceId, row.id),
        };
    }
    if (!original) throw Error("not_found");
    if (
      operation === "publish" &&
      Object.entries(fields).some(
        ([key, value]) => canonical(value) !== canonical(original![key]),
      )
    )
      throw Error("unsaved_form_changes");
    fields = mergeFormFields(
      Object.fromEntries(
        FORM_FIELDS[form.module]
          .filter((k) => original![k] !== undefined)
          .map((k) => [k, original![k]]),
      ),
      fields,
    );
  }
  if (form.module === "segment") {
    type SegmentInput = Parameters<typeof upsertSegment>[1];
    const patch = fields as Partial<Omit<SegmentInput, "criteria">> & {
      criteria?: Partial<SegmentInput["criteria"]>;
    };
    const input: SegmentInput = {
      ...patch,
      segmentCode: "",
      name: patch.name ?? "",
      criteria: { industries: [], regions: [], ...patch.criteria },
      priority: patch.priority ?? 0,
      status: patch.status ?? "active",
    };
    const value = requireResult(
      await upsertSegment(
        strategy,
        input,
        form.targetId ? { editId: form.targetId } : "create",
      ),
    );
    return { kind: "segment", id: value.id };
  }
  if (form.module === "solution") {
    const input = { ...fields, solutionCode: "", items: fields.items ?? [] };
    const value = requireResult(
      await upsertSolution(
        { ...base, store: getCatalogStore() },
        input as unknown as Parameters<typeof upsertSolution>[1],
        form.targetId ? { editId: form.targetId } : "create",
      ),
    );
    return { kind: "solution", id: value.id };
  }
  if (form.module === "strategy") {
    if (operation === "publish") {
      if (!form.targetId) throw Error("saved_draft_required");
      const current = await strategy.store.getPlan(
        session.workspaceId,
        form.targetId,
      );
      if (!current) throw Error("not_found");
      // Publishing never silently saves pending edits.
      requireResult(
        await publishStrategy(strategy, current.id, current.editToken ?? 1),
      );
      return { kind: "strategy", id: current.id };
    }
    const value = form.targetId
      ? requireResult(
          await editPlan(
            strategy,
            form.targetId,
            fields as unknown as Parameters<typeof editPlan>[2],
          ),
        )
      : requireResult(
          await createPlan(
            strategy,
            { ...fields, planNo: "" } as Parameters<typeof createPlan>[1],
            { autoNumber: true },
          ),
        );
    return { kind: "strategy", id: value.id };
  }
  const ctx = {
    ...base,
    store: getSalesPlanStore(),
    strategy: getStrategyStore(),
    scope: session.scope,
  };
  const year = Number(fields.year),
    content = fields.content as PlanContent;
  let plan = await readSalesPlan(ctx, year);
  let state = plan ? planVersions(plan, new Date().toISOString()) : null;
  if (operation === "publish") {
    if (!plan || !state?.draft) throw Error("saved_draft_required");
    if (canonical(content) !== canonical(state.draft.content))
      throw Error("unsaved_form_changes");
    plan = await changeSalesPlan(ctx, {
      year,
      expectedEventNo: state.eventNo,
      requestKey: `xy_${stepId}`,
      command: {
        kind: "release",
        revisionId: state.draft.id,
        editToken: state.draft.editToken,
        reason: "Xiaoyu confirmed release",
      },
    });
  } else {
    if (!state?.draft) {
      plan = await changeSalesPlan(ctx, {
        year,
        expectedEventNo: state?.eventNo ?? 0,
        requestKey: `xy_${stepId}_draft`,
        command: {
          kind: "draft",
          content,
          scope: content.releaseScope ?? "company",
        },
      });
      state = planVersions(plan, new Date().toISOString());
    }
    if (!state?.draft) throw Error("draft_not_found");
    plan = await changeSalesPlan(ctx, {
      year,
      expectedEventNo: state.eventNo,
      requestKey: `xy_${stepId}`,
      command: {
        kind: "save",
        revisionId: state.draft.id,
        editToken: state.draft.editToken,
        content,
      },
    });
  }
  return { kind: "sales_plan", id: plan.id };
}
