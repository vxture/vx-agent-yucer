"use client";
import Link from "next/link";
import {useState} from "react";
import {useRouter,useSearchParams} from "next/navigation";
import type {MouseEvent} from "react";
import {Banner,Button,Card,Collapsible,CollapsibleTrigger,CollapsibleContent,Icon} from "@vxture/design-ui";
import {XiaoyuExecution} from "./xiaoyu-execution";
import {XiaoyuFormSupplement} from "./xiaoyu-form-supplement";
import {useXiaoyuCatalog} from "./use-xiaoyu-catalog";
import {useXiaoyu} from "./xiaoyu-provider";
import {useMessages} from "../lib/i18n/provider";
import {readBusinessForm,formChanges,formHref} from "../../domains/copilot/lib/business-form";
import {readableText,reviewValue} from "../../domains/copilot/lib/form-review";
const emptyCatalog={labels:{},options:{}};
export function XiaoyuFormLinks(){
  const {bundle,busy,client}=useXiaoyu(),{XIAOYU_FORMS:T}=useMessages();
  const {catalogs,available,retry}=useXiaoyuCatalog();
  const selected=useSearchParams().get("form"),router=useRouter();
  async function openEditor(event:MouseEvent<HTMLAnchorElement>){
    if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    const href=event.currentTarget.getAttribute("href");
    if(!href || retaining || busy)return;
    setRetaining(true);setFailed(false);
    try{
      const pending:Promise<void>[]=[];window.dispatchEvent(new CustomEvent("xiaoyu:sync-forms",{detail:pending}));
      await Promise.all(pending);await client.refresh();router.push(href);
    }catch{setFailed(true);}finally{setRetaining(false);}
  }
  const [expanded,setExpanded]=useState<Record<string,boolean>>({}),[retaining,setRetaining]=useState(false),[failed,setFailed]=useState(false);
  const drafts=bundle?.drafts.filter(d=>d.contractVersion==="business-form/1")??[];
  return <XiaoyuExecution renderDrafts={saved=><div className="space-y-md" data-task-form-review>
    {drafts.length?<div className="flex flex-wrap items-center gap-sm">
      <h3 className="flex items-center gap-sm text-label-medium"><Icon name="clipboard" size="sm"/>{T.supplement}<span className="text-body-small text-muted-foreground">{drafts.length} {T.entries}</span></h3>
      <div className="ml-auto flex flex-wrap items-center gap-sm">
        <Button size="md" variant="ghost" onClick={()=>setExpanded(Object.fromEntries(drafts.map(d=>[d.key,true])))}>{T.expandAll}</Button>
        <Button size="md" variant="secondary" disabled={retaining||busy||bundle?.task.status!=="active"} onClick={()=>{
          setRetaining(true);setFailed(false);
          const pending:Promise<void>[]=[];window.dispatchEvent(new CustomEvent("xiaoyu:sync-forms",{detail:pending}));
          void Promise.allSettled(pending).then(async results=>{setFailed(results.some(r=>r.status==="rejected"));await client.refresh();}).catch(()=>setFailed(true)).finally(()=>setRetaining(false));
        }}>{T.retainAll}</Button>
      </div>
    </div>:null}
    {failed?<Banner tone="warning" title={T.partialSync}/>:null}
    {drafts.length && !available?<div className="flex items-center gap-sm text-body-small text-muted-foreground" role="status">{T.choicesUnavailable}<Button size="md" variant="ghost" onClick={retry}>{T.retry}</Button></div>:null}
    {drafts.map(d=>{
      try{
        const form=readBusinessForm(d.text),base=catalogs[d.key]??emptyCatalog,catalog={labels:{...T.values,...base.labels},options:{...base.options,...Object.fromEntries(Object.entries({tier:["standard","key","strategic"],status:["active","paused","retired"],novelty:["existing","new"]}).map(([key,values])=>[key,values.map(value=>({value,label:T.values[value as keyof typeof T.values]}))]))}},receipt=saved.get(d.id),changes=formChanges(form);
        const title=readableText(String(form.fields.name??T[form.module]),catalog.labels,T.referenceUnavailable);
        const copy={empty:T.empty,unavailable:T.referenceUnavailable,yes:T.yes,no:T.no,entries:T.structured};
        const common=changes.filter(c=>c.after!==null && c.after!==undefined && c.after!=="" && !Array.isArray(c.after)).slice(0,4);
        return <Card key={`${bundle!.task.id}:${d.key}`} className="@container gap-md p-md" data-form-review-card>
          <div className="flex flex-wrap items-center gap-sm">
            <span className="text-body-small text-muted-foreground">{T[form.module]}</span><h4 className="min-w-0 flex-1 text-label-medium">{title}</h4>
            <span className="text-body-small text-muted-foreground">{receipt?T.savedSnapshot:T.draftSnapshot}</span>
            {!receipt?<Button asChild size="md" variant="ghost"><Link onClick={event=>void openEditor(event)} href={`/copilot?${new URLSearchParams({task:bundle!.task.id,form:d.key})}`}>{T.open}</Link></Button>:null}
          </div>
          <dl className="grid grid-cols-1 gap-x-lg gap-y-sm text-body @lg:grid-cols-2">
            {common.map(change=><div key={change.path} className="flex min-w-0 items-baseline gap-sm">
              <dt className="shrink-0 text-muted-foreground">{T.labels[change.path.split(".").at(-1) as keyof typeof T.labels]??T.fields}</dt>
              <dd className="min-w-0 line-clamp-2 break-words">{reviewValue(change.after,catalog.labels,copy,0,change.path.split(".").at(-1))}</dd>
            </div>)}
          </dl>
          {!receipt?<Collapsible open={expanded[d.key]??drafts.length<=2} onOpenChange={open=>setExpanded(previous=>({...previous,[d.key]:open}))}>
            <CollapsibleTrigger asChild><Button size="md" variant="secondary">{T.editCommon}<Icon name="chevron-down" size="sm"/></Button></CollapsibleTrigger>
            <CollapsibleContent forceMount className="mt-md data-[state=closed]:hidden">
              {selected===d.key?<p className="text-body-small text-muted-foreground">{T.editingOriginal}</p>:<XiaoyuFormSupplement taskId={bundle!.task.id} formKey={d.key} form={form} catalog={catalog} disabled={!available||retaining||bundle!.task.status!=="active"}/>}
            </CollapsibleContent>
          </Collapsible>:null}
          <Collapsible>
            <div className="flex flex-wrap items-center gap-sm border-t border-border pt-sm">
              <CollapsibleTrigger asChild><Button size="md" variant="ghost">{T.fields} ({changes.length})<Icon name="chevron-down" size="sm"/></Button></CollapsibleTrigger>
              <Button asChild size="md" variant="ghost"><Link onClick={event=>void openEditor(event)} href={formHref(form,bundle!.task.id,d.key)}>{T.openOriginal}</Link></Button>
              {form.manualFields.length?<span className="ml-auto text-body-small text-muted-foreground">{T.protected}: {form.manualFields.length}</span>:null}
            </div>
            <CollapsibleContent><dl className="mt-sm grid grid-cols-1 gap-md text-body @lg:grid-cols-2">
              {changes.map(({path,before,after,changed})=><div key={path} className="min-w-0 space-y-xs">
                <dt className="text-muted-foreground">{T.labels[path.split(".").at(-1) as keyof typeof T.labels]??T.labels[path.split(".")[0] as keyof typeof T.labels]??T.fields}</dt>
                <dd className="space-y-xs break-words">
                  {changed && before!==undefined?<p className="text-body-small text-muted-foreground">{T.before}: {reviewValue(before,catalog.labels,copy,0,path.split(".").at(-1))}</p>:null}
                  <p className="line-clamp-3">{reviewValue(after,catalog.labels,copy,0,path.split(".").at(-1))}</p>
                </dd>
              </div>)}
            </dl></CollapsibleContent>
          </Collapsible>
        </Card>;
      }catch{return <Banner key={d.key} tone="warning" title={T.unavailable}/>;}
    })}
  </div>}/>;
}
