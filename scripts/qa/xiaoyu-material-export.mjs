import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
// Local demo transport/UI acceptance. This never calls a model or writes a business record.
const base='http://localhost:4060';
const status=await(await fetch(base+'/api/status')).json();
assert.equal(status.c2.deployStage,'dev');assert.equal(status.data.database.configured,false);
const tabs=await(await fetch('http://127.0.0.1:9334/json/list')).json();
const target=tabs.find(t=>t.type==='page'&&t.url.startsWith(base+'/'));assert.ok(target);
const ws=new WebSocket('ws://127.0.0.1:9334'+new URL(target.webSocketDebuggerUrl).pathname);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
const waiting=new Map();let seq=0;
ws.onmessage=e=>{const m=JSON.parse(e.data),p=waiting.get(m.id);if(p){clearTimeout(p.timer);waiting.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
const send=(method,params={})=>{const id=++seq;const p=new Promise((resolve,reject)=>waiting.set(id,{resolve,reject,timer:setTimeout(()=>reject(Error(method)),30000)}));ws.send(JSON.stringify({id,method,params}));return p;};
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const until=async expression=>{for(let i=0;i<160;i++){if(await evaluate(expression).catch(()=>false))return;await new Promise(r=>setTimeout(r,250));}throw Error(expression);};
const results=[];const test=(name,value)=>{assert.ok(value,name);results.push(name);};
try{
 await send('Page.enable');await send('Page.bringToFront');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/copilot'});await until("!!document.querySelector('[data-xiaoyu-conversation] textarea')");
 const task=await evaluate(`fetch('/api/copilot/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),goal:'XC-06 material and export acceptance',targets:[]})}).then(r=>r.json())`);assert.ok(task.id);
 await send('Page.navigate',{url:base+'/copilot?task='+task.id});await until("!!document.querySelector('[data-task-identity]')");
 const upload=async(name,text)=>evaluate(`(async()=>{const data=new FormData();data.set('file',new File([${JSON.stringify(text)}],${JSON.stringify(name)}));const r=await fetch('/api/copilot/tasks/${task.id}/materials',{method:'POST',body:data});return {status:r.status,body:await r.json()};})()`);
 const material=await upload('acceptance.md','# Local reference\nActual UTF-8 text for this private task.');
 test('The server parses UTF-8 material and stores a private task draft',material.status===200&&material.body.drafts.some(d=>d.text.includes('task-material/1')&&d.text.includes('Actual UTF-8')));
 test('Invalid JSON is refused',(await upload('broken.json','{"broken":')).status===400);
 test('Unsupported binary formats are refused',(await upload('not-supported.pdf','sample')).status===400);
 test('Oversized multipart material is refused',(await upload('large.txt','a'.repeat(31000))).status===413);
 await send('Page.reload');await until("!!document.querySelector('[data-task-identity]')");
 await evaluate(`(async()=>{let b=await fetch('/api/copilot/tasks/${task.id}').then(r=>r.json());return fetch('/api/copilot/tasks/${task.id}',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'notes',revision:b.task.revision,key:'conversation-input',text:'UNSENT_PRIVATE_MARKER',contractVersion:'private-notes/1'})});})()`);
 const exported=await evaluate(`fetch('/api/copilot/tasks/${task.id}/export').then(async r=>({status:r.status,cache:r.headers.get('Cache-Control'),file:r.headers.get('Content-Disposition'),body:await r.text()}))`);
 test('One export includes the collaboration material and task identity',exported.status===200&&exported.body.includes('acceptance.md')&&exported.body.includes(task.id)&&exported.file.includes('.md'));
 test('Export excludes the unsent composer and uses private no-store',!exported.body.includes('UNSENT_PRIVATE_MARKER')&&exported.cache==='private, no-store');
 const skill=await evaluate("fetch('/api/copilot/skills').then(async r=>({status:r.status,body:await r.json()}))");
 test('Unconfigured Runos reports capability unavailable',skill.status===503&&skill.body.code==='COPILOT_SKILLS_UNAVAILABLE');
 await send('Page.reload');await until("[...document.querySelectorAll('[data-xiaoyu-conversation] textarea')].some(e=>e.value==='UNSENT_PRIVATE_MARKER')");
 for(const width of [1440,390,320]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});await new Promise(r=>setTimeout(r,450));
  test('Composer controls fit at '+width+'px',await evaluate("(()=>{const c=[...document.querySelectorAll('[data-assistant-composer]')].find(e=>e.checkVisibility({visibilityProperty:true}));return c&&c.scrollWidth<=c.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1})()"));
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/xc06-input-export.png',Buffer.from(shot.data,'base64'));
 await writeFile('/private/tmp/xc06-browser-report.json',JSON.stringify({stage:'local-demo',realModel:false,results},null,2));console.log(JSON.stringify({passed:results.length,results}));
}finally{ws.close();}
