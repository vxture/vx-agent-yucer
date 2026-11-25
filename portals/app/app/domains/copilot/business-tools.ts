import type { ToolDefinition } from "../../agent/atlas/types";
import { FORM_FIELDS, FORM_MODULES } from "./lib/business-form";
export const BUSINESS_TOOLS: ToolDefinition[] = [
  {
    name: "query_business",
    description:
      "Read current authorized Yucer business records beyond the current page. Lists return bounded previews with matchedCount and nextOffset; do not mistake a page or omitted text for the full business picture. Continue with offset=nextOffset and identical filters when needed. Use id and optional fields (dot paths/array indices, e.g. criteria.customerNeed or revisions.2.content.targets) to inspect relevant details. For a single string field with id, follow textPage.nextOffset as textOffset for remaining text. Current records override memory; drafts are not published facts. Never send SQL.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: [
            "account",
            "opportunity",
            "segment",
            "solution",
            "product",
            "strategy",
            "sales_plan",
            "sales_target", "campaign", "lead", "project",
          ],
        },
        id: { type: "string" },
        query: { type: "string" },
        year: { type: "integer" },
        offset: { type: "integer", minimum: 0, maximum: 1000000 },
        limit: { type: "integer", minimum: 1, maximum: 20 },
        fields: { type: "array", minItems: 1, maxItems: 10, items: { type: "string" } },
        textOffset: { type: "integer", minimum: 0, description: "Character offset for one string field; requires id and exactly one fields entry." },
      },
      required: ["kind"],
    },
  },
  {
    name: "business_form_contract",
    description:
      "Get the native versioned form fields before preparing a business draft. This does not save or publish business records.",
    parameters: {
      type: "object",
      properties: { module: { type: "string", enum: [...FORM_MODULES] } },
      required: ["module"],
    },
  },
  {
    name: "prepare_business_form",
    description:
      "Prepare or refine a private native business form draft, then open it for human review. Only listed native fields are accepted. Populate researched facts in fields, not just the reply. For customer website and creditCode, fieldEvidence can populate them from an exact source quote containing the full customer name and value. Reuse the same key to refine; human edits are preserved. Relations require UUIDs from authorized queries. This never saves or publishes a business record.",
    parameters: {
      type: "object",
      properties: {
        module: { type: "string", enum: [...FORM_MODULES] },
        key: {
          type: "string",
          description:
            "Stable draft key, 1-64 letters/digits/underscore/hyphen",
        },
        targetId: {
          type: "string",
          description: "Existing business UUID; omit for new",
        },
        fields: { type: "object" },
        fieldEvidence: {type:"array",maxItems:2,items:{type:"object",properties:{field:{type:"string",enum:["creditCode","website"]},value:{type:"string"},sourceId:{type:"string"},quote:{type:"string",maxLength:1500}},required:["field","value","sourceId","quote"]}},
      },
      required: ["module", "key", "fields"],
    },
  },
  {
    name: "open_business_page",
    description:
      "Prepare a registered page link for Yucer to open after the turn. A navigation_ready result is not proof the browser already opened it. Does not submit anything.",
    parameters: {
      type: "object",
      properties: {
        module: {
          type: "string",
          enum: [...FORM_MODULES, "account", "opportunity", "product"],
        },
        id: { type: "string" },
        create: { type: "boolean" },
      },
      required: ["module"],
    },
  },
];
export const formContract = (module: keyof typeof FORM_FIELDS) => ({
  version: "business-form/1",
  module,
  fields: FORM_FIELDS[module],
  notes: {
    account: "Customer creation only. name required; optional region/province, configured industryId/segmentId/customerTypeId/customerSizeId/customerNatureId UUIDs, creditCode, website, employeeCount, tier standard/key/strategic, parentId/childLinks and native operating plan. Owner is the current user, never invent contacts. Query accounts first to check duplicates. Prepare one stable key per customer; up to 10 in one task can share a reviewed grant. Missing facts stay null.",
    segment:
      "criteria={industries:string[],regions:string[],sizes:string[],needSummary:string,customerNeed:string,buyingScenario:string,expectedOutcome:string,entryBarrier:string}; priority 0-9999; status active/paused/retired. solutionIds and productIds are UUID arrays.",
    solution:
      "items=[{productId:UUID,quantity:number,optional:boolean,note:string|null}]. novelty existing/new/null. Only real catalog product UUIDs.",
    strategy:
      "result is the native StrategyResult structure. targetMarkets=[{segmentId:UUID,intent:focus|validate,approach:string|null}]. Required strategyTypeId and value proposition use configured UUIDs. No fabricated owners or metrics.",
    sales_plan:
      "year=integer; content=the full existing PlanContent aggregate (schemaVersion=1,year,periods,regions,targets,budgets,contributions,team,actions,assumptions,allocationNote,capacityNote,strategyAcceptances). Read it first. Preserve UUIDs and published strategy snapshots.",
  }[module],
  save: false,
  publish: false,
});

export const EXECUTION_TOOLS: ToolDefinition[] = [
 {name:"request_business_execution",description:"Request an immutable save/publish proposal for a private native form. The server persists it for user review and task-scoped authorization; this tool does not grant or execute. Never claim saved from this result.",parameters:{type:"object",properties:{key:{type:"string"},operation:{type:"string",enum:["save","publish"]}},required:["key","operation"]}},
 {name:"read_execution_receipts",description:"Read server-verified execution receipts for this private task. Only an accessible real receipt establishes a save or publication. Do not infer success from a draft or queued proposal.",parameters:{type:"object",properties:{}}},
];
