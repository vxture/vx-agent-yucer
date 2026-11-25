"use client";
import {useId,useState} from "react";
import {Banner,Button,Field,FieldLabel,Input,NativeSelect,Textarea} from "@vxture/design-ui";
import {useMessages} from "../lib/i18n/provider";
import {useXiaoyu} from "./xiaoyu-provider";
import {useXiaoyuForm} from "./use-xiaoyu-form";
import {mergeFormFields,type BusinessForm,type FormFields} from "../../domains/copilot/lib/business-form";
import {fieldPatch,pathValue,readableText,REVIEW_FIELDS,type FormReviewCatalog} from "../../domains/copilot/lib/form-review";
/** Compact controls bind to the same private native form contract and validator.
 * Saving here retains a draft; execution is still the original receipt flow. */
export function XiaoyuFormSupplement({taskId,formKey,form,catalog,disabled}:{taskId:string;formKey:string;form:BusinessForm;catalog:FormReviewCatalog;disabled:boolean}){
  const {XIAOYU_FORMS:T}=useMessages();
  const {client,busy}=useXiaoyu();
  const [values,setValues]=useState<FormFields>(()=>structuredClone(form.fields));
  const [saving,setSaving]=useState(false);
  const id=useId();
  const binding=useXiaoyuForm(form.module,form.targetId,values,fields=>setValues(previous=>mergeFormFields(previous,fields)),{taskId,key:formKey,publishContext:false});
  const unavailable=binding.state==="error";
  const locked=disabled||busy||saving||binding.state==="loading"||binding.state==="off";
  const label=(path:string)=>T.labels[path.split(".").at(-1) as keyof typeof T.labels]??T.fields;
  return <div className="space-y-md" data-form-supplement>
    <div className="grid grid-cols-1 gap-x-lg gap-y-md @lg:grid-cols-2 @3xl:grid-cols-3">
      {REVIEW_FIELDS[form.module].map(field=>{
        const raw=pathValue(values,field.path),value=raw===null||raw===undefined?"":String(raw);
        const display=readableText(value,catalog.labels,"");
        const set=(next:string)=>setValues(previous=>mergeFormFields(previous,fieldPatch(field.path,field.kind==="number"?(next===""?null:Number(next)):next)));
        const isNumber=field.kind==="number",maximum=isNumber?undefined:field.max;
        const options=field.choices?catalog.options[field.choices]??[]:[];
        const controlId=`${id}-${field.path}`;
        const source=form.fieldEvidence?.find(e=>e.field===field.path && e.value===raw);
        return <Field key={field.path} className={field.kind==="long"?"@lg:col-span-2 @3xl:col-span-3":""}>
          <div className="flex items-center justify-between gap-sm"><FieldLabel htmlFor={controlId} required={field.required}>{label(field.path)}</FieldLabel>
            {maximum?<span className="text-body-small text-muted-foreground">{value.length}/{maximum}</span>:null}</div>
          {field.kind==="select"?<NativeSelect id={controlId} value={value} onChange={e=>set(e.target.value)} disabled={locked}>
            <option value="">{T.choose}</option>
            {value && !options.some(o=>o.value===value)?<option value={value}>{catalog.labels[value]??T.referenceUnavailable}</option>:null}
            {options.map(o=><option key={o.value} value={o.value}>{readableText(o.label,catalog.labels,T.referenceUnavailable)}</option>)}
          </NativeSelect>:field.kind==="long"?<Textarea className="min-h-0 resize-y" id={controlId} rows={2} value={display} maxLength={maximum} onChange={e=>set(e.target.value)} disabled={locked} />:
          <Input id={controlId} type={isNumber?"number":"text"} min={isNumber?field.min:undefined} max={isNumber?field.max:undefined} maxLength={maximum} value={display} required={field.required} onChange={e=>set(e.target.value)} disabled={locked}/>}
          {source?<p className="text-body-small text-muted-foreground">{T.extracted}: {source.sourceId}</p>:null}
        </Field>;
      })}
    </div>
    <div className="flex flex-wrap items-center gap-sm">
      <Button size="md" variant="secondary" disabled={locked} onClick={()=>{setSaving(true);void binding.sync().then(()=>client.refresh()).catch(()=>{}).finally(()=>setSaving(false));}}>{T.retain}</Button>
      <span className="text-body-small text-muted-foreground" role="status">{unavailable?T.unavailable:binding.state==="dirty"?T.syncing:T.draftOnly}</span>
      {unavailable?<Button size="md" variant="ghost" onClick={binding.retry}>{T.retry}</Button>:null}
    </div>
    {unavailable?<Banner tone="warning" title={T.unavailable}/>:null}
  </div>;
}
