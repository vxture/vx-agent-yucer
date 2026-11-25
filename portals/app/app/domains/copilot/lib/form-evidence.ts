import type { ReadEvidence } from "../../../agent/orchestrator/turn";
import type { BusinessForm, FormFields } from "./business-form";
import { publicSourceUrl } from "./task-artifacts";
export interface FormFieldEvidence { field: "creditCode"|"website"; value:string; sourceId:string; quote:string }
function receiptContainsQuote(content:string,quote:string):boolean {
  if(content.includes(quote))return true;
  // MCP receipts are serialized JSON. Match an exact quote within one decoded
  // text leaf, without joining documents or treating metadata as a new source.
  let remaining=2000;
  const contains=(value:unknown,depth=0):boolean=>{
    if(--remaining<0 || depth>8)return false;
    if(typeof value==="string")return value.includes(quote);
    if(!value || typeof value!=="object")return false;
    return Object.values(value).some(child=>contains(child,depth+1));
  };
  try{return contains(JSON.parse(content));}catch{return false;}
}
function websiteValue(value:string):string|null {
  return publicSourceUrl(value.startsWith("www.")?`https://${value}`:value);
}
function quotedWebsite(quote:string,value:string):boolean {
  return quote.includes(value) || [...quote.matchAll(/(?:https?:\/\/|www\.)[^\s<>"\\]+/gi)]
    .some(match=>websiteValue(match[0])===value);
}
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
    if(!name || !source || !receiptContainsQuote(source.content,claim.quote) || !claim.quote.includes(name))throw Error("invalid_form_evidence");
    if(claim.field==="creditCode" && !/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(claim.value))throw Error("invalid_form_evidence");
    const value=claim.field==="website"?websiteValue(claim.value):claim.value;
    if(!value || !(claim.field==="website"?quotedWebsite(claim.quote,value):claim.quote.includes(value)))throw Error("invalid_form_evidence");
    if(previous?.manualFields.includes(claim.field))continue;
    const existing=next[claim.field];
    if(existing && (claim.field==="website" && typeof existing==="string"?websiteValue(existing):existing)!==value)throw Error("conflicting_form_evidence");
    next[claim.field]=value;accepted.push({...claim,value});
  }
  const replaced=new Set(accepted.map(v=>v.field));
  return {fields:next,evidence:[...retained.filter(v=>!replaced.has(v.field)),...accepted]};
}
