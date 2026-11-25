import type { ReadEvidence } from "../../../agent/orchestrator/turn";
import type { BusinessForm, FormFields } from "./business-form";
import { publicSourceUrl } from "./task-artifacts";
export interface FormFieldEvidence { field: "creditCode"|"website"; value:string; sourceId:string; quote:string }
type ProposedFieldEvidence = Omit<FormFieldEvidence,"quote"> & {quote?:string};
function receiptTexts(content:string):string[] {
  const texts:string[]=[];
  let remaining=2000;
  const visit=(value:unknown,depth=0):void=>{
    if(--remaining<0 || depth>8)return;
    if(typeof value==="string"){texts.push(value);return;}
    if(value && typeof value==="object")for(const child of Object.values(value))visit(child,depth+1);
  };
  try{visit(JSON.parse(content));return texts;}catch{return [content];}
}
function receiptContainsQuote(content:string,quote:string):boolean {
  return content.includes(quote) || receiptTexts(content).some(text=>text.includes(quote));
}
function websiteValue(value:string):string|null {
  return publicSourceUrl(value.startsWith("www.")?`https://${value}`:value);
}
function quotedWebsite(quote:string,value:string):boolean {
  return quote.includes(value) || [...quote.matchAll(/(?:https?:\/\/|www\.)[^\s<>"\\]+/gi)]
    .some(match=>websiteValue(match[0])===value);
}
interface TextSpan {index:number;length:number}
function occurrences(text:string,value:string):TextSpan[]{
  const spans:TextSpan[]=[];
  for(let index=text.indexOf(value);index>=0&&spans.length<20;index=text.indexOf(value,index+value.length))spans.push({index,length:value.length});
  return spans;
}
function enclosingQuote(text:string,names:TextSpan[],values:TextSpan[]):string|null {
  let best:string|null=null;
  for(const entity of names)for(const fact of values){
    const start=Math.min(entity.index,fact.index),end=Math.max(entity.index+entity.length,fact.index+fact.length);
    if(end-start<=1500 && (best===null||end-start<best.length))best=text.slice(start,end);
  }
  return best;
}
/** Derive provenance from one receipt leaf; the model need not reproduce its
 * transport escaping or whitespace. Never stitch documents or invent a quote. */
function groundedQuote(content:string,name:string,field:FormFieldEvidence["field"],value:string):string|null {
  let best:string|null=null;
  for(const text of receiptTexts(content)){
    const names=occurrences(text,name);
    if(!names.length)continue;
    const values=field==="website"?[...text.matchAll(/(?:https?:\/\/|www\.)[^\s<>"\\]+/gi)]
      .filter(match=>websiteValue(match[0])===value).slice(0,20).map(match=>({index:match.index,length:match[0].length})):occurrences(text,value);
    const quote=enclosingQuote(text,names,values);
    if(quote && (best===null||quote.length<best.length))best=quote;
  }
  return best;
}
function validProposedEvidence(value:unknown):value is ProposedFieldEvidence[]{
  return Array.isArray(value) && value.length<=2 && value.every(row=>row && typeof row==="object" &&
    Object.keys(row).every(k=>["field","value","sourceId","quote"].includes(k)) &&
    ["creditCode","website"].includes(row.field) && typeof row.value==="string" && row.value.length<=500 &&
    typeof row.sourceId==="string" && /^read-\d+-\d+$/.test(row.sourceId) &&
    (row.quote===undefined || (typeof row.quote==="string" && row.quote.length>0 && row.quote.length<=1500))) && new Set(value.map(v=>v.field)).size===value.length;
}
export function validFieldEvidence(value:unknown):value is FormFieldEvidence[]{
  return validProposedEvidence(value) && value.every(row=>typeof row.quote==="string");
}
/** A source-backed extraction is still a proposal for human review. Matching
 * the receipt, exact entity name and quoted value is mandatory; no regex scan
 * over unrelated sources or model prose may silently populate a customer. */
export function applyAccountEvidence(previous:BusinessForm|null,fields:FormFields,claims:unknown,evidence:readonly ReadEvidence[]):{fields:FormFields;evidence:FormFieldEvidence[]}{
  const retained=previous && (fields.name===undefined || fields.name===previous.fields.name)?previous.fieldEvidence??[]:[];
  if(claims===undefined)return {fields,evidence:retained};
  if(!validProposedEvidence(claims))throw Error("invalid_form_evidence");
  const next={...fields}, accepted:FormFieldEvidence[]=[];
  const name=String(fields.name??previous?.fields.name??"").trim();
  for(const claim of claims){
    const source=evidence.find(row=>row.id===claim.sourceId);
    if(!name || !source)throw Error("invalid_form_evidence");
    if(claim.field==="creditCode" && !/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(claim.value))throw Error("invalid_form_evidence");
    const value=claim.field==="website"?websiteValue(claim.value):claim.value;
    if(!value)throw Error("invalid_form_evidence");
    const quote=claim.quote??groundedQuote(source.content,name,claim.field,value);
    if(!quote || !receiptContainsQuote(source.content,quote) || !quote.includes(name) ||
      !(claim.field==="website"?quotedWebsite(quote,value):quote.includes(value)))throw Error("invalid_form_evidence");
    if(previous?.manualFields.includes(claim.field))continue;
    const existing=next[claim.field];
    if(existing && (claim.field==="website" && typeof existing==="string"?websiteValue(existing):existing)!==value)throw Error("conflicting_form_evidence");
    next[claim.field]=value;accepted.push({...claim,value,quote});
  }
  const replaced=new Set(accepted.map(v=>v.field));
  return {fields:next,evidence:[...retained.filter(v=>!replaced.has(v.field)),...accepted]};
}
