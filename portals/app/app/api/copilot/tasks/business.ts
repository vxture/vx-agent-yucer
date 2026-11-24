import { listLeads } from "../../../domains/signal/service";
import { listProjects } from "../../../domains/delivery/service";
import { listTargets } from "../../../domains/planning/service";
import { featureKeysFor } from "../../../entitlement/capability";
import { getAuthzStore } from "../../../authz/store";
import { segmentVocabulary } from "../../../domains/strategy/segment-assist-service";
import {
  listStrategyOptions,
  listStrategyTypes,
} from "../../../domains/strategy/type-service";
import { formContract } from "../../../domains/copilot/business-tools";
import { emptyStrategyResult } from "../../../domains/strategy/lib/strategy-result";
import { createHash } from "node:crypto";
import type { AppSession } from "../../../(app)/lib/session";
import { can } from "../../../authz/decide";
import {
  getStrategyStore,
  getCatalogStore,
  getSalesPlanStore,
} from "../../../domains/shared/registry";
import { listAccounts, listIndustries, listCustomerTypes, listCustomerSizes, listCustomerNatures, listMarketDivisions } from "../../../domains/account/service";
import { listPipeline } from "../../../domains/pipeline/service";
import { listSegments, listPlans, listCampaigns } from "../../../domains/strategy/service";
import { currentStrategyPlans } from "../../../domains/strategy/lib/current-plans";
import { listProducts, listSolutions } from "../../../domains/catalog/service";
import { readSalesPlan } from "../../../domains/planning/plan-service";
import {
  emptyContent,
  planVersions,
  validateContent,
  type PlanContent,
} from "../../../domains/planning/plan-model";
import {
  fieldsFor,
  FORM_FIELDS,
  type BusinessForm,
  type FormModule,
} from "../../../domains/copilot/lib/business-form";
import {
  UUID,
  type TaskObject,
  type TaskSource,
} from "../../../domains/copilot/lib/task-contract";
export const digest = (v: unknown) =>
  createHash("sha256")
    .update(
      JSON.stringify(v, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    )
    .digest("hex");
export function accessSource(session: AppSession): TaskSource {
  const h = digest([session.workspaceId, session.user.sub]);
  return {
    kind: "access",
    id: `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`,
    version: digest({
      permissions: [...session.authz.permissions].sort((a, b) =>
        a.localeCompare(b),
      ),
      scope: session.scope,
      features: featureKeysFor(session.entitlement).sort((a, b) => a.localeCompare(b)),
    }),
  };
}
export async function businessRecords(
  session: AppSession,
  kind: string,
  year?: number,
): Promise<{ object: TaskObject; data: unknown }[]> {
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const strategy = { ...base, store: getStrategyStore() },
    catalog = { ...base, store: getCatalogStore() };
  switch (kind) {
    case "lead": {
      const result=await listLeads({...base,store:session.stores.signal()});
      if(!result.ok)throw Error("permission_denied");return result.value.map(data=>({object:{kind,id:data.id},data}));
    }
    case "campaign": {
      const result=await listCampaigns(strategy);
      if(!result.ok)throw Error("permission_denied");return result.value.map(data=>({object:{kind,id:data.id},data}));
    }
    case "project": {
      const {getDeliveryStore}=await import("../../../domains/shared/registry");
      const result=await listProjects({...base,store:getDeliveryStore()});
      if(!result.ok)throw Error("permission_denied");
      const accounts=await listAccounts({...base,store:session.stores.account()});
      if(!accounts.ok)throw Error("permission_denied");
      const visible=new Set(accounts.value.map(row=>row.id));
      return result.value.filter(row=>visible.has(row.accountId)).map(data=>({object:{kind:"project" as const,id:data.id},data}));
    }
    case "sales_target": {
      const result=await listTargets({...base,store:(await import("../../../domains/shared/registry")).getPlanningStore()});
      if(!result.ok)throw Error("permission_denied");return result.value.filter(row=>session.scope.kind==="workspace"||row.ownerSub===session.user.sub).map(data=>({object:{kind,id:data.id},data}));
    }
    case "account": {
      const r = await listAccounts({
        ...base,
        store: session.stores.account(),
      });
      if (!r.ok) throw Error("permission_denied");
      return r.value.map((data) => ({ object: { kind, id: data.id }, data }));
    }
    case "opportunity": {
      const r = await listPipeline(
        { ...base, store: session.stores.pipeline() },
        { includeClosed: true },
      );
      if (!r.ok) throw Error("permission_denied");
      return r.value.map((data) => ({ object: { kind, id: data.id }, data }));
    }
    case "segment": {
      const r = await listSegments(strategy);
      if (!r.ok) throw Error("permission_denied");
      return r.value.map((data) => ({ object: { kind, id: data.id }, data }));
    }
    case "strategy": {
      const r = await listPlans(strategy);
      if (!r.ok) throw Error("permission_denied");
      const current = currentStrategyPlans(r.value);
      return r.value
        .filter(
          (p) => p.status === "draft" || current.some((c) => c.id === p.id),
        )
        .map((data) => ({ object: { kind, id: data.id }, data }));
    }
    case "product": {
      const r = await listProducts(catalog);
      if (!r.ok) throw Error("permission_denied");
      return r.value.map((data) => ({ object: { kind, id: data.id }, data }));
    }
    case "solution": {
      const r = await listSolutions(catalog);
      if (!r.ok) throw Error("permission_denied");
      return r.value.map((data) => ({
        object: { kind, id: data.solution.id },
        data,
      }));
    }
    case "sales_plan": {
      if (
        session.scope.kind !== "workspace" ||
        !can(session.authz, session.entitlement, "planning.target.view", "data")
          .allowed
      )
        throw Error("permission_denied");
      const store = getSalesPlanStore(),
        rows = await store.list(session.workspaceId),
        result = [];
      for (const row of rows.filter(
        (r) => year === undefined || r.year === year,
      )) {
        const data = await readSalesPlan(
          { ...base, store, scope: session.scope },
          row.year,
        );
        if (data)
          result.push({
            object: { kind: "sales_plan" as const, id: data.id },
            data,
          });
      }
      return result;
    }
    default:
      throw Error("business_query_denied");
  }
}
export function businessBindings(
  session: AppSession,
  source: (o: TaskObject) => Promise<TaskSource | null>,
) {
  return {
    access: accessSource(session),
    async contract(module: FormModule, year = new Date().getFullYear()) {
      const base = {
        workspaceId: session.workspaceId,
        sub: session.user.sub,
        holder: session.authz,
        entitlement: session.entitlement,
      };
      const catalog = getCatalogStore(),
        strategy = getStrategyStore();
      const configuration: Record<string, unknown> = {
        currency: (await catalog.getPricingPolicy(session.workspaceId))
          .defaultCurrency,
      };
      if (module === "account") {
        const ctx={...base,store:session.stores.account()};
        const rows=await Promise.all([listIndustries(ctx),listCustomerTypes(ctx),listCustomerSizes(ctx),listCustomerNatures(ctx),listMarketDivisions(ctx),listSegments({...base,store:strategy})]);
        configuration.vocabulary=Object.fromEntries(["industries","customerTypes","customerSizes","customerNatures","regions","segments"].map((k,i)=>[k,rows[i]?.ok?rows[i].value:[]]));
        configuration.owner="Current user; assignment uses the original customer service.";
      }
      if (module === "sales_plan") {
        if (
          session.scope.kind !== "workspace" ||
          !can(
            session.authz,
            session.entitlement,
            "planning.target.view",
            "data",
          ).allowed
        )
          throw Error("permission_denied");
        configuration.contentTemplate = {
          ...emptyContent(year, [], String(configuration.currency)),
          releaseScope: "company",
        };
      }
      if (module === "segment")
        configuration.vocabulary = await segmentVocabulary(
          { ...base, store: session.stores.account() },
          catalog,
        );
      if (module === "strategy") {
        const types = await listStrategyTypes({ ...base, store: strategy }),
          options = await listStrategyOptions({ ...base, store: strategy });
        if (!types.ok || !options.ok) throw Error("permission_denied");
        configuration.strategyTypes = types.value.filter((t) => t.enabled);
        configuration.options = options.value.filter((t) => t.enabled);
        configuration.resultTemplate = emptyStrategyResult();
        configuration.members = (
          await getAuthzStore().listMembers(session.workspaceId)
        )
          .filter((m) => m.status === "active")
          .map((m) => ({ sub: m.sub, name: m.displayName }));
      }
      return { ...formContract(module), configuration };
    },
    async query(input: Record<string, unknown>) {
      if (
        !Object.keys(input).every((k) =>
          ["kind", "id", "query", "year"].includes(k),
        ) ||
        typeof input.kind !== "string" ||
        (input.id !== undefined &&
          (typeof input.id !== "string" || !UUID.test(input.id))) ||
        (input.query !== undefined &&
          (typeof input.query !== "string" || input.query.length > 200)) ||
        (input.year !== undefined &&
          (!Number.isInteger(input.year) ||
            Number(input.year) < 2000 ||
            Number(input.year) > 2200))
      )
        throw Error("business_query_denied");
      const rows = await businessRecords(
          session,
          input.kind,
          input.year as number | undefined,
        ),
        query = String(input.query ?? "").toLocaleLowerCase();
      const selected = rows
          .filter(
            (r) =>
              (!input.id || r.object.id === input.id) &&
              (!query ||
                JSON.stringify(r.data).toLocaleLowerCase().includes(query)),
          )
          .slice(0, 20),
        records = [];
      for (const row of selected) {
        const ref = await source(row.object);
        if (!ref) throw Error("source_unavailable");
        records.push({ source: ref, record: row.data });
      }
      return {
        records,
        sources: [accessSource(session), ...records.map((r) => r.source)],
        limited: rows.length > 20,
        recordState: "Current records; draft statuses are not published facts.",
      };
    },
    async prepare(form: BusinessForm) {
      fieldsFor(form.module, form.fields);
      const permissions = {
        account: "account.upsert",
        segment: "strategy.segment.upsert",
        solution: "catalog.solution.upsert",
        strategy: form.targetId
          ? "strategy.plan.update"
          : "strategy.plan.create",
        sales_plan: "planning.target.update",
      } as const;
      if (
        !can(
          session.authz,
          session.entitlement,
          permissions[form.module],
          "data",
        ).allowed
      )
        throw Error("permission_denied");
      if (form.module === "sales_plan" && form.fields.content !== undefined) {
        const content = form.fields.content as PlanContent;
        validateContent(content, false);
        if (content.year !== form.fields.year) throw Error("invalid_form_year");
        const existing=await readSalesPlan({workspaceId:session.workspaceId,sub:session.user.sub,holder:session.authz,entitlement:session.entitlement,scope:session.scope,store:getSalesPlanStore()},content.year);
        if((existing?.id??null)!==form.targetId)throw Error("planning_target_changed");
      }
      if (form.module === "account") {
        if(form.targetId)throw Error("operation_not_registered");
        const ctx={workspaceId:session.workspaceId,sub:session.user.sub,holder:session.authz,entitlement:session.entitlement,store:session.stores.account()};
        const groups=await Promise.all([listIndustries(ctx),listCustomerTypes(ctx),listCustomerSizes(ctx),listCustomerNatures(ctx)]);
        const keys=["industryId","customerTypeId","customerSizeId","customerNatureId"];
        for(let i=0;i<keys.length;i++){const group=groups[i];if(form.fields[keys[i]!] && (!group?.ok || !group.value.some(row=>row.id===form.fields[keys[i]!])))throw Error("invalid_form_configuration");}
      }
      let baseline = {};
      const sources: TaskSource[] = [accessSource(session)];
      if (form.module === "strategy") {
        const store = getStrategyStore();
        const types = await store.listStrategyTypes(session.workspaceId),
          options = await store.listStrategyOptions(session.workspaceId);
        if (
          form.fields.strategyTypeId &&
          !types.some((t) => t.enabled && t.id === form.fields.strategyTypeId)
        )
          throw Error("invalid_form_configuration");
        const result = form.fields.result as
          | import("../../../domains/strategy/lib/strategy-result").StrategyResult
          | undefined;
        if (
          result &&
          ((result.valuePropositionId &&
            !options.some(
              (o) =>
                o.enabled &&
                o.kind === "value" &&
                o.id === result.valuePropositionId,
            )) ||
            result.pathIds.some(
              (id) =>
                !options.some(
                  (o) => o.enabled && o.kind === "path" && o.id === id,
                ),
            ))
        )
          throw Error("invalid_form_configuration");
        if (
          form.fields.ownerSub &&
          !(await getAuthzStore().listMembers(session.workspaceId)).some(
            (m) => m.status === "active" && m.sub === form.fields.ownerSub,
          )
        )
          throw Error("invalid_form_owner");
      }
      if (form.module === "segment" && form.fields.criteria) {
        const base = {
          workspaceId: session.workspaceId,
          sub: session.user.sub,
          holder: session.authz,
          entitlement: session.entitlement,
          store: session.stores.account(),
        };
        const vocab = await segmentVocabulary(base, getCatalogStore()),
          criteria = form.fields.criteria as Record<string, unknown>;
        for (const key of ["industries", "regions", "sizes"] as const)
          if (
            criteria[key] &&
            !(criteria[key] as string[]).every((v) => vocab[key].includes(v))
          )
            throw Error("invalid_form_configuration");
      }
      if (form.targetId) {
        const own = await source({ kind: form.module, id: form.targetId });
        if (!own) throw Error("source_unavailable");
        if (form.baseVersion && form.baseVersion !== own.version)
          throw Error("source_changed");
        form = { ...form, baseVersion: own.version };
        sources.push(own);
        const row = (await businessRecords(session, form.module, form.fields.year as number | undefined)).find(r => r.object.id === form.targetId)?.data;
        if (!row || typeof row !== "object") throw new Error("source_unavailable");
        let record = row as Record<string, unknown>;
        if (form.module === "solution") record = {...record, ...record.solution as Record<string, unknown>};
        if (form.module === "sales_plan") {
          const versions = planVersions(row as Parameters<typeof planVersions>[0], new Date().toISOString());
          record = {year: form.fields.year, content: (versions.draft ?? versions.current)?.content};
        }
        baseline = Object.fromEntries(FORM_FIELDS[form.module].filter(k => record[k] !== undefined).map(k => [k,record[k]]));
      }
      const fields = form.fields,
        links: TaskObject[] = [];
      if(form.module==="account") {
        if(fields.segmentId) links.push({kind:"segment",id:String(fields.segmentId)});
        if(fields.parentId) links.push({kind:"account",id:String(fields.parentId)});
        for(const child of (fields.childLinks??[]) as {accountId:string}[]) links.push({kind:"account",id:child.accountId});
      }
      for (const [field, kind] of [
        ["solutionIds", "solution"],
        ["productIds", "product"],
      ] as const) {
        if (fields[field] !== undefined) {
          if (!Array.isArray(fields[field]) || fields[field].length > 100)
            throw Error("invalid_form_relation");
          for (const id of fields[field] as unknown[]) {
            if (typeof id !== "string" || !UUID.test(id))
              throw Error("invalid_form_relation");
            links.push({ kind, id });
          }
        }
      }
      if (form.module === "strategy" && fields.targetMarkets !== undefined) {
        if (
          !Array.isArray(fields.targetMarkets) ||
          fields.targetMarkets.length > 100
        )
          throw Error("invalid_form_relation");
        for (const t of fields.targetMarkets) {
          if (!t || typeof t !== "object" || !UUID.test(String(t.segmentId)))
            throw Error("invalid_form_relation");
          if (
            ![null, "focus", "validate"].includes(t.intent) ||
            !(t.approach === null || typeof t.approach === "string")
          )
            throw Error("invalid_form_relation");
          links.push({ kind: "segment", id: t.segmentId });
          for (const [key, kind] of [
            ["productIds", "product"],
            ["solutionIds", "solution"],
          ] as const) {
            if (t[key] !== undefined) {
              if (!Array.isArray(t[key])) throw Error("invalid_form_relation");
              for (const id of t[key]) {
                if (typeof id !== "string" || !UUID.test(id))
                  throw Error("invalid_form_relation");
                links.push({ kind, id });
              }
            }
          }
        }
      }
      if (form.module === "solution" && fields.items !== undefined) {
        if (!Array.isArray(fields.items) || fields.items.length > 100)
          throw Error("invalid_form_relation");
        for (const item of fields.items) {
          if (
            !item ||
            typeof item !== "object" ||
            !UUID.test(String(item.productId))
          )
            throw Error("invalid_form_relation");
          links.push({ kind: "product", id: item.productId });
        }
      }
      for (const link of links) {
        const ref = await source(link);
        if (!ref) throw Error("source_unavailable");
        sources.push(ref);
      }
      return { ...form, baseline, sources };
    },
  };
}
