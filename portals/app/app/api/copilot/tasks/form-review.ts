import type { AppSession } from "../../../(app)/lib/session";
import { ALL_PROVINCES } from "../../../domains/shared/provinces";
import { readBusinessForm, type FormModule } from "../../../domains/copilot/lib/business-form";
import type { FormReviewCatalog, ReviewOption } from "../../../domains/copilot/lib/form-review";
import type { TaskBundle } from "../../../domains/copilot/task-store";
import { businessBindings, businessRecords } from "./business";
import { readTaskSource } from "./context";

const record = (v:unknown):Record<string,unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string,unknown> : {};
function choices(value: unknown): ReviewOption[] {
  if(!Array.isArray(value))return [];
  return value.flatMap(v=>{
    if(typeof v === "string")return [{value:v,label:v}];
    const row=record(v),value=row.id??row.sub,name=row.name;
    return typeof value === "string" && typeof name === "string" ? [{value,label:name}] : [];
  });
}
/** Names are resolved on demand through scoped domain reads; never stored in
 * private form snapshots or cached across members/workspaces. */
export async function formReviewCatalog(session: AppSession, bundle: TaskBundle): Promise<Record<string,FormReviewCatalog>> {
  const forms=bundle.drafts.filter(d=>d.contractVersion==="business-form/1").map(d=>({key:d.key,form:readBusinessForm(d.text)}));
  const contracts=new Map<FormModule, Record<string,unknown>>();
  const bindings=businessBindings(session,object=>readTaskSource(session,object));
  for(const {form} of forms)if(!contracts.has(form.module)){
    contracts.set(form.module,record((await bindings.contract(form.module,Number(form.fields.year)||undefined)).configuration));
  }
  const labels: Record<string,string>={};
  const configuration=new Map<FormModule,Record<string,ReviewOption[]>>();
  for(const [module,config] of contracts){
    const groups=Object.fromEntries(Object.entries(record(config.vocabulary)).map(([key,value])=>[key,choices(value)]));
    for(const key of ["strategyTypes","members","options"])if(config[key])groups[key]=choices(config[key]);
    for(const rows of Object.values(groups))for(const row of rows)labels[row.value]=row.label;
    if(module==="account")groups.provinces=ALL_PROVINCES.map(v=>({value:v,label:v}));
    configuration.set(module,groups);
  }
  // Only resolve related business records when the form actually references
  // them. These services apply the current user's domain scope and permission.
  const relationKinds=new Set<string>();
  const visit=(value:unknown,key="")=>{
    if(Array.isArray(value)){for(const row of value)visit(row,key);return;}
    if(value && typeof value==="object"){for(const [k,v] of Object.entries(value))visit(v,k);return;}
    if(typeof value!=="string" || !value)return;
    const kind=/^(?:parentId|expectedParentId|accountId)$/.test(key)?"account":/^segmentId$/.test(key)?"segment":/^productIds?$/.test(key)?"product":/^solutionIds?$/.test(key)?"solution":null;
    if(kind)relationKinds.add(kind);
  };
  for(const {form} of forms){visit(form.fields);visit(form.baseline);}
  for(const kind of relationKinds){
    for(const row of await businessRecords(session,kind)){
      const data=record(row.data),name=(kind==="solution"?record(data.solution):data).name;
      if(typeof name==="string")labels[row.object.id]=name;
    }
  }
  return Object.fromEntries(forms.map(({key,form})=>[key,{labels,options:configuration.get(form.module)??{}}]));
}
