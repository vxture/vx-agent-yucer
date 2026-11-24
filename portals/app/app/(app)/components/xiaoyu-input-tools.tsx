"use client";
import { useEffect,useRef,useState } from "react";
import { Button,DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,Icon,Popover,PopoverTrigger,PopoverContent,Input,useToast } from "@vxture/design-ui";
import { useXiaoyu } from "./xiaoyu-provider";
import { useMessages } from "../lib/i18n/provider";
import { XiaoyuVoice } from "./xiaoyu-voice";
import type { TaskBundle } from "../../domains/copilot/task-store";
function materialName(text:string){try{const value=JSON.parse(text);return typeof value.name==="string"?value.name:"";}catch{return "";}}
async function request(path:string,init?:RequestInit){const response=await fetch(path,init);if(!response.ok)throw Error();return response.json();}
export function XiaoyuInputTools({disabled}:{disabled:boolean}){
  const {client,bundle,input}=useXiaoyu();const {XIAOYU_INPUT:T}=useMessages();
  const {toast}=useToast();
  const file=useRef<HTMLInputElement>(null),lock=useRef(false);
  const [pending,setPending]=useState(false),[status,setStatus]=useState(""),[skills,setSkills]=useState<{capability_id:string;title:string}[]>([]),[query,setQuery]=useState(""),[cursor,setCursor]=useState<string|undefined>(),[skillOpen,setSkillOpen]=useState(false);
  useEffect(()=>{if(status)toast({tone:status===T.failed||status===T.voiceFailed||status===T.skillsUnavailable?"warning":"info",title:status});},[status,toast,T]);
  async function task(){
    const state=client.getSnapshot();if(state.bundle)return state.bundle.task.id;
    const saved=await request("/api/copilot/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:crypto.randomUUID(),goal:state.input.trim().slice(0,1000)||T.materialTask,targets:[]})});
    await client.select(saved.id);client.setInput(state.input);return saved.id as string;
  }
  async function work(run:()=>Promise<void>){if(disabled||lock.current)return;lock.current=true;setPending(true);setStatus("");try{await run();await client.refresh(false);}catch{setStatus(T.failed);}finally{lock.current=false;setPending(false);}}
  const upload=(chosen:File)=>work(async()=>{const id=await task();const data=new FormData();data.set("file",chosen);await request(`/api/copilot/tasks/${id}/materials`,{method:"POST",body:data});setStatus(T.materialReady);});
  useEffect(()=>{
    const form=file.current?.closest("form");if(!form)return;
    const over=(event:DragEvent)=>{if(event.dataTransfer?.types.includes("Files"))event.preventDefault();};
    const drop=(event:DragEvent)=>{if(!event.dataTransfer?.files.length)return;event.preventDefault();const chosen=event.dataTransfer.files[0];if(chosen)void upload(chosen);};
    form.addEventListener("dragover",over);form.addEventListener("drop",drop);
    return ()=>{form.removeEventListener("dragover",over);form.removeEventListener("drop",drop);};
  },[upload]);
  async function note(id:string,key:string,text:string){const b=await request(`/api/copilot/tasks/${id}`) as TaskBundle;await request(`/api/copilot/tasks/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"notes",revision:b.task.revision,key,text,contractVersion:"private-notes/1"})});}
  async function catalog(more=false){try{const params=new URLSearchParams({q:query||"*"});if(more&&cursor)params.set("cursor",cursor);const r=await request(`/api/copilot/skills?${params}`);setSkills(old=>more?[...old,...r.capabilities]:r.capabilities);setCursor(r.next_cursor);}catch{setStatus(T.skillsUnavailable);}}
  const materials=bundle?.drafts.filter(d=>d.key.startsWith("material_") && d.text);
  return <>
    <input ref={file} type="file" accept=".txt,.md,.csv,.json" className="sr-only" aria-label={T.upload} disabled={disabled||pending} onChange={event=>{
      const chosen=event.currentTarget.files?.[0];event.currentTarget.value="";if(!chosen)return;
      void upload(chosen);
    }}/>
    <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size={materials?.length?"md":"icon-xl"} variant="ghost" disabled={disabled||pending} aria-label={T.add} title={materials?.map(m=>materialName(m.text)).join(" / ")||T.add}><Icon name="plus" size="sm" />{materials?.length?<span className="text-body-small text-muted-foreground">{materials.length}</span>:null}</Button></DropdownMenuTrigger><DropdownMenuContent align="start" width="sm"><DropdownMenuItem onSelect={()=>file.current?.click()}>{T.upload}</DropdownMenuItem>{materials?.map(m=><DropdownMenuItem key={m.key} onSelect={()=>void work(async()=>{await note(await task(),m.key,"");})}>{T.removeMaterial}: {materialName(m.text)}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
    <Popover open={skillOpen} onOpenChange={open=>{setSkillOpen(open);if(open)void catalog();}}><PopoverTrigger asChild><Button type="button" size="md" variant="ghost" disabled={disabled||pending}><Icon name="magic-wand" size="sm" />{bundle?.drafts.find(d=>d.key==="selected-skill")?.text?T.skillSelected:T.skills}</Button></PopoverTrigger><PopoverContent width="md" align="start" className="max-h-96 space-y-sm overflow-y-auto">
      <div className="flex gap-xs"><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder={T.searchSkills} aria-label={T.searchSkills}/><Button size="md" onClick={()=>void catalog()}>{T.search}</Button></div>
      <Button size="md" variant="ghost" onClick={()=>void work(async()=>{await note(await task(),"selected-skill","");setSkillOpen(false);})}>{T.automatic}</Button>
      {skills.map(skill=><Button key={skill.capability_id} size="md" variant="ghost" className="w-full justify-start" onClick={()=>void work(async()=>{await note(await task(),"selected-skill",skill.capability_id);setSkillOpen(false);})}>{skill.title}</Button>)}
      {cursor?<Button size="md" variant="secondary" onClick={()=>void catalog(true)}>{T.more}</Button>:null}
    </PopoverContent></Popover>
    <span className="min-w-0 flex-1"/>
    <XiaoyuVoice value={input} onChange={client.setInput} scope={bundle?.task.id??"new"} disabled={disabled||pending} onStatus={setStatus}/>
    {status?<span className="sr-only" role="status">{status}</span>:null}
  </>;
}
