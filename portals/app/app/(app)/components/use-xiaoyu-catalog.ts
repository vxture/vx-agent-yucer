"use client";
import {useEffect,useState} from "react";
import {useXiaoyu} from "./xiaoyu-provider";
import type {FormReviewCatalog} from "../../domains/copilot/lib/form-review";
export function useXiaoyuCatalog(){
  const {bundle,busy}=useXiaoyu();
  const [state,setState]=useState<{taskId:string;revision:number;catalogs:Record<string,FormReviewCatalog>}|null>(null);
  const [retry,setRetry]=useState(0);
  const taskId=bundle?.task.id,revision=bundle?.task.revision;
  useEffect(()=>{
    setState(null);
    if(!taskId || revision===undefined || busy || !bundle?.drafts.some(d=>d.contractVersion==="business-form/1"))return;
    const abort=new AbortController();
    void fetch(`/api/copilot/tasks/${taskId}/forms`,{cache:"no-store",signal:abort.signal}).then(async response=>{
      if(!response.ok)throw Error();
      const data=await response.json();
      if(!abort.signal.aborted && data.revision===revision)setState({taskId,revision,catalogs:data.catalogs});
    }).catch(()=>{});
    const refresh=()=>setRetry(n=>n+1);
    window.addEventListener("focus",refresh);
    return ()=>{abort.abort();window.removeEventListener("focus",refresh);};
  },[taskId,revision,busy,retry]);
  const available=!!state && state.taskId===taskId && state.revision===revision && !busy;
  return {catalogs:available?state.catalogs:{},available,retry:()=>setRetry(n=>n+1)};
}
