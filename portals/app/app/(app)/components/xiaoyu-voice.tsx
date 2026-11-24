"use client";
import { useEffect,useRef,useState } from "react";
import { Button,Icon } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
type Recognition={lang:string;interimResults:boolean;continuous:boolean;start:()=>void;stop:()=>void;abort:()=>void;onresult:((e:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;onerror:(()=>void)|null;onend:(()=>void)|null};
export function XiaoyuVoice({value,onChange,disabled,scope,onStatus}:{value:string;onChange:(text:string)=>void;disabled:boolean;scope:string;onStatus:(text:string)=>void}){
  const {XIAOYU_INPUT:T}=useMessages();
  const [listening,setListening]=useState(false);
  const recognition=useRef<Recognition|null>(null);
  const current=useRef({onChange,onStatus,disabled,value});current.current={onChange,onStatus,disabled,value};
  useEffect(()=>()=>{const r=recognition.current;recognition.current=null;if(r){r.onresult=null;r.onend=null;r.onerror=null;r.abort();}},[scope]);
  useEffect(()=>{if(disabled){recognition.current?.abort();setListening(false);}},[disabled]);
  return <Button type="button" size="icon-xl" variant={listening?"secondary":"ghost"} disabled={disabled} aria-pressed={listening} aria-label={listening?T.stopVoice:T.voice} title={T.voiceHint} onClick={()=>{
    if(listening){recognition.current?.stop();return;}
    const browser=window as unknown as {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
    const Constructor=browser.SpeechRecognition??browser.webkitSpeechRecognition;
    if(!Constructor){onStatus(T.voiceUnavailable);return;}
    const r=new Constructor();recognition.current=r;r.lang="zh-CN";r.interimResults=false;r.continuous=false;
    r.onresult=e=>{if(recognition.current!==r || current.current.disabled)return;const text=Array.from(e.results).map(result=>result[0]?.transcript??"").join("");current.current.onChange(`${current.current.value}${current.current.value?"\n":""}${text}`.slice(0,4000));};
    r.onerror=()=>{setListening(false);current.current.onStatus(T.voiceFailed);};r.onend=()=>setListening(false);
    try{r.start();setListening(true);onStatus(T.listening);}catch{onStatus(T.voiceFailed);}
  }}><Icon name="microphone" size="sm" /></Button>;
}
