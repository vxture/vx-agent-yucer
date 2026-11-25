import { CATALOG_TEXT_LIMITS } from "../../catalog/lib/text-limits";
import { SEGMENT_TEXT_LIMITS } from "../../strategy/lib/segment-text-limits";
import type { FormFields, FormModule } from "./business-form";

export interface ReviewOption { value: string; label: string }
export interface FormReviewCatalog { labels: Record<string, string>; options: Record<string, ReviewOption[]> }
export interface ReviewField { path: string; kind?: "select" | "number" | "long"; choices?: string; required?: boolean; max?: number; min?: number }
export const REVIEW_FIELDS: Record<FormModule, readonly ReviewField[]> = {
  account: [
    {path:"name",required:true,max:200}, {path:"tier",kind:"select",choices:"tier"},
    {path:"industryId",kind:"select",choices:"industries"}, {path:"customerSizeId",kind:"select",choices:"customerSizes"},
    {path:"customerTypeId",kind:"select",choices:"customerTypes"}, {path:"customerNatureId",kind:"select",choices:"customerNatures"},
    {path:"region",kind:"select",choices:"regions"}, {path:"province",kind:"select",choices:"provinces"},
    {path:"segmentId",kind:"select",choices:"segments"}, {path:"employeeCount",kind:"number",min:0},
    {path:"creditCode",max:18}, {path:"website",max:500},
  ],
  segment: [
    {path:"name",required:true,max:SEGMENT_TEXT_LIMITS.name}, {path:"status",kind:"select",choices:"status"},
    ...(["needSummary","customerNeed","buyingScenario","expectedOutcome","entryBarrier"] as const).map(key=>({path:`criteria.${key}`,kind:"long" as const,max:SEGMENT_TEXT_LIMITS[key]})),
  ],
  solution: [{path:"name",required:true,max:CATALOG_TEXT_LIMITS.name},{path:"novelty",kind:"select",choices:"novelty"},
    {path:"summary",kind:"long",max:CATALOG_TEXT_LIMITS.summary},{path:"scenario",kind:"long",max:CATALOG_TEXT_LIMITS.scenario}],
  strategy: [{path:"name",required:true,max:200},{path:"period",max:200},{path:"strategyTypeId",kind:"select",choices:"strategyTypes"},
    {path:"ownerSub",kind:"select",choices:"members"},{path:"objective",kind:"long",max:2000},{path:"changeReason",kind:"long",max:2000}],
  sales_plan: [{path:"year",kind:"number",required:true,min:2000,max:2200},{path:"content.allocationNote",kind:"long",max:2000},{path:"content.capacityNote",kind:"long",max:2000}],
};
const UUID_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Display only. Internal keys, form snapshots and URL targets stay untouched. */
export function readableText(text: string, labels: Record<string,string> = {}, unavailable = "\u5173\u8054\u4fe1\u606f\u5f85\u6838\u5bf9"): string {
  return text.replace(UUID_TEXT, id => labels[id.toLowerCase()] ?? unavailable);
}
export function pathValue(fields: FormFields, path: string): unknown {
  return path.split(".").reduce<unknown>((v,key)=>v && typeof v === "object" ? (v as FormFields)[key] : undefined, fields);
}
export function fieldPatch(path: string, value: unknown): FormFields {
  return path.split(".").reverse().reduce<unknown>((v,key)=>({[key]:v}),value) as FormFields;
}
export function reviewValue(value: unknown, labels: Record<string,string>, copy: {empty:string;unavailable:string;yes:string;no:string;entries:string}, depth = 0, field = ""): string {
  if (value === null || value === undefined || value === "") return copy.empty;
  if (typeof value === "boolean") return value ? copy.yes : copy.no;
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return readableText(labels[value] ?? (/(?:Ids?|Sub)$/.test(field)?copy.unavailable:value),labels,copy.unavailable);
  if (depth > 3) return copy.entries;
  if (Array.isArray(value)) return value.length ? value.map(v=>reviewValue(v,labels,copy,depth+1,field)).join(" / ") : copy.empty;
  if (typeof value === "object") {
    const row=value as FormFields;
    const entries=Object.entries(row).filter(([k])=>!/(?:^id$|^key$|version|schemaVersion)/i.test(k));
    return entries.length ? entries.map(([key,v])=>reviewValue(v,labels,copy,depth+1,key)).join(" \u00b7 ") : copy.entries;
  }
  return copy.empty;
}
