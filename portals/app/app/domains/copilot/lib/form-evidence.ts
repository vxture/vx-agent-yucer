import type { ReadEvidence } from "../../../agent/orchestrator/turn";
import type { BusinessForm, FormFields } from "./business-form";
import { publicSourceUrl } from "./task-artifacts";
export interface FormFieldEvidence { field: "creditCode"|"website"; value:string; sourceId:string; quote:string }
export function validFieldEvidence(value:unknown):value is FormFieldEvidence[]{
  return Array.isArray(value) && value.length<=2 && value.every(row=>row && typeof row==="object" &&
    Object.keys(row).every(k=>["field","value","sourceId","quote"].includes(k)) &&
    ["creditCode","website"].includes(row.field) && typeof row.value==="string" && row.value.length<=500 &&
    typeof row.sourceId==="string" && /^read-\d+-\d+$/.test(row.sourceId) &&
    typeof row.quote==="string" && row.quote.length>0 && row.quote.length<=1500) && new Set(value.map(v=>v.field)).size===value.length;
}
/** A source-backed extraction is still a proposal for human review. Matching
 * the receipt, exact entity name and quoted value is mandatory; no regex scan
 * over unrelated sources or model prose may silently populate a customer. */
export function applyAccountEvidence(previous:BusinessForm|null,fields:FormFields,claims:unknown,evidence:readonly ReadEvidence[]):{fields:FormFields;evidence:FormFieldEvidence[]}{
  const retained=previous && (fields.name===undefined || fields.name===previous.fields.name)?previous.fieldEvidence??[]:[];
  if(claims===undefined)return {fields,evidence:retained};
  if(!validFieldEvidence(claims))throw Error("invalid_form_evidence");
  const next={...fields}, accepted:FormFieldEvidence[]=[];
  const name=String(fields.name??previous?.fields.name??"").trim();
  for(const claim of claims){
    const source=evidence.find(row=>row.id===claim.sourceId);
    if(!name || !source || !source.content.includes(claim.quote) || !claim.quote.includes(name) || !claim.quote.includes(claim.value))throw Error("invalid_form_evidence");
    if(claim.field==="creditCode" && !/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(claim.value))throw Error("invalid_form_evidence");
    if(claim.field==="website" && !publicSourceUrl(claim.value))throw Error("invalid_form_evidence");
    if(previous?.manualFields.includes(claim.field))continue;
    if(next[claim.field] && next[claim.field]!==claim.value)throw Error("conflicting_form_evidence");
    next[claim.field]=claim.value;accepted.push(claim);
  }
  const replaced=new Set(accepted.map(v=>v.field));
  return {fields:next,evidence:[...retained.filter(v=>!replaced.has(v.field)),...accepted]};
}
