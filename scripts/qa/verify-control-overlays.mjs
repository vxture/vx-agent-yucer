/** Read-only overlay, public-state and contextual-entry verification.
 * Requires a dedicated CDP tab. Never submits a form or selects a write action.
 */
import {writeFile, readFile, mkdir} from "node:fs/promises";
import {inspectionExpression} from "./control-inspection.mjs";
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1]};
const tabId=arg("--tab");if(!tabId)throw Error("Specify --tab ID");
const base=arg("--base","http://localhost:4060"),out=arg("--out","/tmp/yucer-control-overlays.json");
const tabs=await(await fetch(arg("--cdp","http://localhost:9333")+"/json/list")).json();
const tab=tabs.find(t=>t.id===tabId);if(!tab)throw Error("Review tab missing");
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener("open",r,{once:true}));
let seq=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(Number.isSafeInteger(m.id)&&pending.has(m.id)){const handler=pending.get(m.id);pending.delete(m.id);if(typeof handler==="function")handler(m)}};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+" timeout"))},90000);pending.set(id,m=>{clearTimeout(timer);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result)});ws.send(JSON.stringify({id,method,params}))});
const ev=async expression=>{const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async expression=>{for(let i=0;i<250;i++){try{if(await ev(expression))return}catch{}await sleep(200)}throw Error("Timed out: "+expression)};
const go=async path=>{
 for(let attempt=0;attempt<6;attempt++){
  try{
   const n=await call("Page.navigate",{url:base+path});if(n.errorText)throw Error(n.errorText);
   await sleep(200);
   await until(`location.pathname===${JSON.stringify(path.split('?')[0])}&&document.readyState==='complete'&&!!document.querySelector('button')`);
   await until(`Array.from(document.querySelectorAll('button')).some(b=>Object.keys(b).some(k=>k.startsWith('__reactProps')))`);
   await sleep(400);return;
  }catch(e){if(attempt===5)throw e;console.log('Retry '+path+': '+e.message);await sleep(1500)}
 }
};
// Pass text as CDP values, never splice UI labels into executable source.
const invoke=async(fn,args)=>{
 const global=await call("Runtime.evaluate",{expression:"globalThis"});
 const objectId=global.result.objectId;
 try{
  const r=await call("Runtime.callFunctionOn",{objectId,functionDeclaration:fn.toString(),arguments:args.map(value=>({value})),returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;
 }finally{await call("Runtime.releaseObject",{objectId})}
};
const click=async(text,selector=null)=>invoke(function(text,selector){
 const root=selector?document.querySelector(selector):document;
 const e=Array.from(root?.querySelectorAll('button,[role=menuitem]')??[]).find(e=>e.getBoundingClientRect().height>0&&e.textContent.trim()===text);
 if(!e)throw Error('Missing control '+text);e.click();
},[text,selector]);
const label=async text=>invoke(function(text){
 const e=Array.from(document.querySelectorAll('button[aria-label]')).find(e=>e.getAttribute('aria-label')===text);
 if(!e)throw Error('Missing label');e.click();
},[text]);
const escape=async()=>{await call("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});await call("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});await sleep(300)};
const dialog="document.querySelector('[role=dialog]')";
const resume=process.argv.includes("--resume");
const previous=resume?JSON.parse(await readFile(out,"utf8")):{};
const checks=previous.checks??[],entries=previous.entries??[];
const complete=name=>resume&&checks.some(c=>c.name===name&&!c.violations.length);
const original=arg("--restore",await ev("location.href"));
const shotDir=arg("--screenshots");if(shotDir)await mkdir(shotDir,{recursive:true});
async function check(name,shot=false){await sleep(350);const r=await ev(inspectionExpression);delete r.links;const old=checks.findIndex(c=>c.name===name);if(old>=0)checks.splice(old,1);checks.push({name,...r});await writeFile(out,JSON.stringify({checks,entries},null,2)+"\n");console.log(name+": "+r.controls.length+" controls, "+r.violations.length+" violations");if(r.violations.length)throw Error(name+" has control violations");if(shot&&shotDir){const s=await call("Page.captureScreenshot",{format:"png"});await writeFile(shotDir+"/"+name+".png",Buffer.from(s.data,"base64"))}}
async function menuInTable(){await ev(`(()=>{const e=document.querySelector('table button[aria-haspopup=menu]:not(:disabled)');if(!e)throw Error('No table action menu');e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}))})()`);await until(`!!document.querySelector('[role=menuitem]')`);await sleep(250)}
try{
 await call("Page.enable");await call("Runtime.enable");await call("Emulation.setDeviceMetricsOverride",{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
 if(!complete('strategy-market-settings')) {
 await go('/strategy/plan_demo_1');
 await click('\u5173\u8054\u7ec6\u5206\u5e02\u573a');await until(`!!document.querySelector('[data-strategy-relations-task=markets]')`);await check('strategy-market-drawer',true);await click('\u53d6\u6d88','[role=dialog]');
 await click('\u5173\u8054\u65b9\u6848');await until(`!!document.querySelector('[data-strategy-relations-task=solutions]')`);await check('strategy-solution-drawer');await click('\u53d6\u6d88','[role=dialog]');
 await ev(`document.querySelector('[data-strategy-target-market] button[aria-haspopup=menu]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}))`);await until(`!!document.querySelector('[role=menuitem]')`);await check('strategy-action-menu');await click('\u6295\u5165\u8bbe\u7f6e');await until(`!!document.querySelector('[data-strategy-relations-task=market]')`);await check('strategy-market-settings');await click('\u53d6\u6d88','[role=dialog]');
 }
 if(!complete('named-account-drawer')) {
 await go('/named');await click('\u5173\u8054\u5ba2\u6237');await until(`!!${dialog}?.querySelector('input')`);await check('named-account-drawer',true);await escape();
 }
 if(!complete('planning-check-drawer')) {
 await go('/planning');await ev(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.startsWith('\u89c4\u5212\u68c0\u67e5')).click()`);await until(`!!document.querySelector('[role=dialog]')`);await check('planning-check-drawer');await escape();
 }
 if(!complete('configuration-dialog')) {
 await go('/admin/opportunity');await click('\u65b0\u5efa\u7c7b\u578b');await until(`!!document.querySelector('[role=dialog] input')`);await check('configuration-dialog',true);await escape();
 }
 // The four edit pages are reached through their real row menus, never guessed ids.
 for(const domain of ['division','members','org','roles']){
  if(complete('admin-'+domain+'-edit'))continue;
  await go('/admin/'+domain+(domain==='members'?'?view=list':''));await menuInTable();await check('admin-'+domain+'-menu');
  await ev(`(()=>{const e=Array.from(document.querySelectorAll('[role=menuitem]')).find(e=>/\u914d\u7f6e|\u7f16\u8f91/.test(e.textContent)&&e.getAttribute('aria-disabled')!=='true');if(!e)throw Error('No edit action');e.click()})()`);
  await until(`location.pathname.startsWith('/admin/${domain}/')&&!!document.querySelector('main [data-slot=field]')`);await sleep(400);
  entries.push({route:'/admin/'+domain+'/[id]',sample:await ev('location.pathname')});await check('admin-'+domain+'-edit');
 }
 await go('/strategy');await label('\u6253\u5f00\u7528\u6237\u83dc\u5355');await check('header-user-panel',true);await escape();
 await ev(`Array.from(document.querySelectorAll('button')).find(b=>b.getAttribute('aria-label')?.startsWith('\u5f53\u524d\u5de5\u4f5c\u533a\u4e0e\u79df\u6237')).click()`);await check('header-organization-panel');await escape();
 await label('\u5207\u6362\u529f\u80fd\u57df');await check('launcher-panel');
 await ev(`(()=>{const e=Array.from(document.querySelectorAll('[role=dialog] a[href="/pipeline"]')).find(e=>e.getBoundingClientRect().height>0);if(!e)throw Error('Launcher link missing');e.click()})()`);
 await until(`location.pathname==='/pipeline'&&!document.querySelector('[role=dialog]')`);await check('launcher-closes-after-selection');
 await go('/gate-screens');
 for(const name of ['\u672a\u767b\u5f55\u5f15\u5bfc\u9875','\u6062\u590d\u767b\u5f55','\u672a\u8ba2\u9605','\u65e0\u89d2\u8272','\u5df2\u9000\u51fa']){
  await click(name,'[role=radiogroup]');await check('public-'+['\u672a\u767b\u5f55\u5f15\u5bfc\u9875','\u6062\u590d\u767b\u5f55','\u672a\u8ba2\u9605','\u65e0\u89d2\u8272','\u5df2\u9000\u51fa'].indexOf(name));
  const preserved=await ev(`Array.from(document.querySelectorAll('[data-control-size=preserve]')).map(e=>({h:e.getBoundingClientRect().height,font:getComputedStyle(e).fontSize}))`);
  if(preserved.some(e=>e.h!==48||e.font!=='14px'))throw Error('Public CTA exception changed');
 }
 await call("Emulation.setDeviceMetricsOverride",{width:780,height:1000,deviceScaleFactor:1,mobile:false});await go('/named');await click('\u5173\u8054\u5ba2\u6237');await until(`!!${dialog}?.querySelector('input')`);await check('narrow-drawer');if(!await ev(`${dialog}.scrollWidth<=${dialog}.clientWidth`))throw Error('Drawer overflows');await escape();
 console.log('PASS read-only overlays, menus, contextual edit entries, public states and narrow drawer');
}finally{try{await escape();await call("Page.navigate",{url:original});await call("Emulation.clearDeviceMetricsOverride")}finally{await writeFile(out,JSON.stringify({checks,entries},null,2)+"\n");ws.close()}}
