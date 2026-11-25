import { localDebuggerEndpoint } from "./local-debugger.mjs";
import assert from 'node:assert/strict';
import {writeFile, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// Reuse the only local server and logged-in Chrome. Layout fixtures are read-only;
// they do not prove real model, permission, execution or persistence behavior.
const base='http://127.0.0.1:4060', debug='http://127.0.0.1:9334';
const output=await mkdtemp(join(tmpdir(),'yucer-xiaoyu-preview-'));
console.log('Preview evidence directory:',output);
const status=await(await fetch(base+'/api/status')).json();
assert.equal(status.c2.deployStage,'dev');assert.equal(status.c2.resolver,'mock');
assert.equal(status.data.database.configured,false);assert.equal(status.planes.atlas.configured,false);
const taskId=crypto.randomUUID(), now=new Date().toISOString();
const task={id:taskId,workspaceId:crypto.randomUUID(),actorSub:'local-layout-fixture',sessionId:crypto.randomUUID(),goal:'Market planning (layout preview)',status:'active',ruleVersion:'xiaoyu/1',revision:3,page:null,createdAt:now,updatedAt:now};
const form={module:'segment',targetId:null,baseVersion:null,manualFields:[],sources:[],fields:{name:'Platform software customers (layout preview)',status:'active',priority:1,criteria:{industries:[],regions:[],sizes:[],needSummary:'Reduce repetitive analysis and reporting.',customerNeed:'[Hypothesis] Use natural language to simplify platform workflows.',buyingScenario:'[Hypothesis] Validate integration conditions in a small pilot.'}}};
const bundle={task,references:[],drafts:[{id:crypto.randomUUID(),key:'layout_market',text:JSON.stringify(form),contractVersion:'business-form/1',revision:3,createdAt:now}],checkpoint:null,messages:[{id:crypto.randomUUID(),seq:1,role:'user',content:'Focus on software platform customers. Exclude field hardware.',createdAt:now},{id:crypto.randomUUID(),seq:2,role:'assistant',content:'Start with a small analysis-to-report pilot. Review the market draft on the workboard.\n\nConfirm the decision maker and integration conditions before proceeding.',createdAt:now}],turns:[],legacy:[],currentRuleVersion:'xiaoyu/1',ruleChanged:false,recovery:{interruptedRequests:[]}};
class CDP {
 constructor(url){this.ws=new WebSocket(localDebuggerEndpoint(url));this.next=0;this.pending=new Map();this.listeners=new Set();this.ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else for(const f of this.listeners)void f(m);});}
 async send(method,params={}){if(this.ws.readyState!==1)await new Promise((r,j)=>{this.ws.addEventListener('open',r,{once:true});this.ws.addEventListener('error',j,{once:true});});const id=++this.next;const p=new Promise((resolve,reject)=>this.pending.set(id,{resolve,reject,timer:setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},45000)}));this.ws.send(JSON.stringify({id,method,params}));return p;}
 close(){for(const p of this.pending.values())clearTimeout(p.timer);this.ws.close();}
}
const info=await(await fetch(debug+'/json/version')).json(), browser=new CDP(info.webSocketDebuggerUrl);
const {targetId}=await browser.send('Target.createTarget',{url:'about:blank'});
const tabs=await(await fetch(debug+'/json/list')).json(),page=new CDP(tabs.find(t=>t.id===targetId).webSocketDebuggerUrl);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const evaluate=async expression=>{const r=await page.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
async function until(expression){for(let i=0;i<160;i++){if(await evaluate(expression).catch(()=>false))return;await pause(250);}throw Error('Timeout: '+expression);}
async function click(text){assert.ok(await evaluate(`(()=>{const e=[...document.querySelectorAll('button,a')].find(e=>e.checkVisibility()&&!e.disabled&&(e.innerText.trim()===${JSON.stringify(text)}||e.getAttribute('aria-label')===${JSON.stringify(text)}));e?.click();return !!e;})()`),'Missing '+text);await pause(180);}
const count=()=>evaluate(`[...document.querySelectorAll('[data-assistant-composer]')].filter(e=>e.checkVisibility()).length`);
const screenshot=async name=>{const shot=await page.send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,name+'.png'),Buffer.from(shot.data,'base64'));};
let fixtureError;
page.listeners.add(async m=>{
 if(m.method!=='Fetch.requestPaused')return;
 try{
  assert.equal(m.params.request.method,'GET');
  const path=new URL(m.params.request.url).pathname;
  const response=path.endsWith('/execution')?{canPrepare:false,steps:[],receipts:[],grants:[]}:path==='/api/copilot/tasks'?[task]:bundle;
  await page.send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(response)).toString('base64')});
 }catch(error){fixtureError=error;await page.send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'BlockedByClient'}).catch(()=>{});}
});
try{
 await page.send('Page.enable');await page.send('Network.enable');
 await page.send('Network.setCookie',{name:'NEXT_LOCALE',value:'zh-CN',url:base,path:'/'});
 await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await page.send('Page.navigate',{url:base+'/copilot'});
 await until(`!!document.querySelector('#xiaoyu-full-input')&&!document.querySelector('#xiaoyu-full-input').disabled`);
 await click('\u65b0\u5bf9\u8bdd');
 assert.equal(await count(),1);
 assert.equal(await evaluate(`!!document.querySelector('[data-xiaoyu-surface] a[href*=memory],[data-xiaoyu-surface] a[href*=knowledge]')`),false);
 if(await evaluate(`document.querySelector('[data-xiaoyu-surface]').dataset.conversationWidth==='wide'`))await evaluate(`document.querySelector('[data-xiaoyu-conversation] [data-assistant-width-toggle]').click()`);
 const panelWidth=()=>evaluate(`document.querySelector('[data-xiaoyu-conversation]').parentElement.getBoundingClientRect().width`);
 const rem=await evaluate(`parseFloat(getComputedStyle(document.documentElement).fontSize)`);
 assert.equal(await panelWidth(),26.25*rem);
 assert.ok(await evaluate(`document.querySelector('[data-xiaoyu-board]').getBoundingClientRect().width>document.querySelector('[data-xiaoyu-conversation]').parentElement.getBoundingClientRect().width`));
 await screenshot('welcome-narrow-1440');
 await evaluate(`document.querySelector('[data-xiaoyu-conversation] [data-assistant-width-toggle]').click()`);await pause(250);
 assert.ok(Math.abs(await panelWidth()-Math.min(47.5*rem,Math.max(30*rem,1440*.46)))<1);
 assert.ok(await evaluate(`document.cookie.includes('yucer_assistant_width=wide')`));
 await screenshot('welcome-wide-1440');
 await page.send('Page.reload');await until(`document.querySelector('[data-xiaoyu-surface]')?.dataset.conversationWidth==='wide'&&!!document.querySelector('#xiaoyu-full-input')&&!document.querySelector('#xiaoyu-full-input').disabled`);
 assert.ok(Math.abs(await panelWidth()-Math.min(47.5*rem,Math.max(30*rem,1440*.46)))<1);
 await evaluate(`document.querySelector('[data-xiaoyu-conversation] [data-assistant-width-toggle]').click()`);await pause(180);
 console.log('PASS DS narrow/wide geometry and width preference restored after reload');
 await page.send('Fetch.enable',{patterns:[{urlPattern:base+'/api/copilot/tasks*',requestStage:'Request'}]});
 await page.send('Page.navigate',{url:base+'/copilot?task='+taskId});
 await until(`document.querySelector('[data-xiaoyu-surface]')?.dataset.taskId===${JSON.stringify(taskId)}`);
 await until(`!!document.querySelector('[data-xiaoyu-board] a[href^="/segment/new?xyTask="]')`);
 assert.equal(await evaluate(`document.querySelector('[data-xiaoyu-conversation]').innerText.includes('Platform software customers (layout preview)')`),false);
 for(const [width,height]of [[1440,1000],[1024,800],[720,800],[390,844],[390,600]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await pause(250);
  assert.equal(await count(),1);
  const fit=await evaluate(`({scroll:document.documentElement.scrollWidth,bottom:document.querySelector('[data-assistant-composer]').getBoundingClientRect().bottom})`);
  assert.ok(fit.scroll<=width+1);assert.ok(fit.bottom<=height+1);
  if(width<880){await click('\u5de5\u4f5c\u677f');assert.equal(await count(),0);await screenshot('board-'+width+'-'+height);await click('\u4efb\u52a1\u5bf9\u8bdd');}
  else await screenshot('results-'+width+'-'+height);
 }
 await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 const before=await evaluate(`document.querySelector('[data-assistant-composer]').getBoundingClientRect().bottom`);
 await click('\u5c55\u5f00\u5b8c\u6574\u5185\u5bb9');assert.equal(await evaluate(`document.querySelector('[data-assistant-composer]').getBoundingClientRect().bottom`),before);
 await click('\u6536\u8d77\u5b8c\u6574\u5185\u5bb9');
 await evaluate(`document.querySelector('#xiaoyu-full-input').focus()`);await page.send('Input.insertText',{text:'Keep this unsent requirement across modules'});
 await evaluate(`document.querySelector('[data-xiaoyu-conversation] [data-assistant-width-toggle]').click()`);await pause(180);
 const fullWide=await panelWidth();
 await evaluate(`document.querySelector('[data-xiaoyu-board] a[href^="/segment/new?xyTask="]').click()`);
 await until(`location.pathname==='/segment/new'&&document.querySelector('#xiaoyu-dock-input')?.checkVisibility()`);
 assert.equal(await evaluate(`document.querySelector('#xiaoyu-dock-input').value`),'Keep this unsent requirement across modules');assert.equal(await count(),1);
 assert.equal(await evaluate(`document.querySelector('[data-assistant-width]').dataset.assistantWidth`),'wide');
 assert.ok(Math.abs(await evaluate(`document.querySelector('[data-assistant-frame]').closest('aside').getBoundingClientRect().width`)-fullWide)<1);
 await evaluate(`document.querySelector('[data-assistant-frame] [data-assistant-width-toggle]').click()`);await pause(180);
 assert.equal(await evaluate(`document.querySelector('[data-assistant-frame]').closest('aside').getBoundingClientRect().width`),26.25*rem);
 console.log('PASS workboard and business dock share width preference, dimensions and switch control');
 await evaluate(`document.querySelector('[data-assistant-workbench]').click()`);await until(`!!document.querySelector('[data-xiaoyu-surface=full]')`);assert.equal(await count(),1);
 await evaluate(`document.querySelector('[data-assistant-close]').click()`);await until(`document.querySelector('[data-xiaoyu-surface=full]')?.dataset.conversationOpen==='false'`);
 await evaluate(`document.querySelector('[data-assistant-dock-trigger] button').click()`);await until(`document.querySelector('[data-assistant-composer]')?.checkVisibility()`);assert.equal(await count(),1);
 assert.equal(await evaluate(`document.querySelector('[data-assistant-composer] textarea').value`),'Keep this unsent requirement across modules');
 await until(`location.pathname==='/copilot'&&document.querySelector('[data-xiaoyu-surface]')?.dataset.taskId===${JSON.stringify(taskId)}`);
 assert.equal(await panelWidth(),26.25*rem);
 assert.equal(await evaluate(`document.querySelector('#xiaoyu-full-input').value`),'Keep this unsent requirement across modules');
 if(fixtureError)throw fixtureError;
 console.log('PASS default two-pane layout; results stay on board; five viewports; expanded report keeps composer reachable; cross-page task and unsent requirement; close/reopen/collaboration space; one composer. Read-only layout fixtures only, no business writes or model calls.');
}finally{await page.send('Fetch.disable').catch(()=>{});await browser.send('Target.closeTarget',{targetId}).catch(()=>{});page.close();browser.close();}
