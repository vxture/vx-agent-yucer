import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
// Only run against the explicitly enabled local, in-memory review server.
const base=process.argv[2] ?? 'http://localhost:16414';
const url=new URL(base);
if (!['localhost','127.0.0.1'].includes(url.hostname) || url.protocol!=='http:') throw new Error('Local preview only');
const status=await(await fetch(base+'/api/status')).json();
assert.equal(status.c2.deployStage,'dev'); assert.equal(status.c2.resolver,'mock');
assert.equal(status.data.database.configured,false); assert.equal(status.planes.atlas.configured,false);
const info=await(await fetch('http://localhost:9334/json/version')).json();
class CDP{
 constructor(url){this.ws=new WebSocket(url);this.next=0;this.pending=new Map();this.ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=this.pending.get(m.id);this.pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)}})}
 async send(method,params={}){if(this.ws.readyState!==1)await new Promise(r=>this.ws.addEventListener('open',r,{once:true}));const id=++this.next;const p=new Promise((resolve,reject)=>this.pending.set(id,{resolve,reject}));this.ws.send(JSON.stringify({id,method,params}));return p}
}
const browser=new CDP(info.webSocketDebuggerUrl);
const {targetId}=await browser.send('Target.createTarget',{url:'about:blank'});
const list=await(await fetch('http://localhost:9334/json/list')).json();
const page=new CDP(list.find(t=>t.id===targetId).webSocketDebuggerUrl);
await page.send('Page.enable');await page.send('Network.enable');
await page.send('Network.setExtraHTTPHeaders',{headers:{'Accept-Language':'zh-CN'}});
const evaluate=async expression=>{const r=await page.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression){for(let i=0;i<240;i++){try{if(await evaluate(expression))return;}catch{}await pause(250)}throw new Error('Timeout '+expression)}
await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

try {
await page.send('Page.navigate',{url:base+'/copilot'});
await until('!!document.querySelector("[data-xiaoyu-surface]")');
await until('!document.body.innerText.includes("\u6b63\u5728\u6062\u590d\u4efb\u52a1")');
const created=await evaluate(`fetch('/api/copilot/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),goal:'Market strategy planning (local preview)',targets:[]})}).then(async r=>({status:r.status,task:await r.json()}))`);
assert.equal(created.status,200);const id=created.task.id;
await page.send('Page.navigate',{url:base+'/copilot?task='+id});
await until(`document.querySelector('[data-xiaoyu-surface]')?.dataset.taskId===${JSON.stringify(id)}`);
async function click(text){const okay=await evaluate(`(()=>{const e=[...document.querySelectorAll('button,a')].find(e=>e.checkVisibility()&&e.textContent.trim()===${JSON.stringify(text)});e?.click();return !!e;})()`);assert.ok(okay,'Missing '+text);await pause(250);}
async function fill(selector,text){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(200);}
await fill('#xiaoyu-full-input','Keep this unsent question across modules');
await click('\u65b0\u5efa\u7ec6\u5206\u5e02\u573a');await until('location.pathname==="/segment/new"');await until(`document.querySelector('[data-xiaoyu-surface="dock"]')?.dataset.taskId===${JSON.stringify(id)}`);
const count=()=>evaluate(`[...document.querySelectorAll('[data-assistant-composer]')].filter(e=>e.checkVisibility()).length`);
assert.equal(await count(),1);
assert.equal(await evaluate(`document.querySelector('#xiaoyu-dock-input').value`),'Keep this unsent question across modules');
await click('\u9875\u9762\u586b\u5199');assert.equal(await count(),1);
await click('\u4efb\u52a1\u5bf9\u8bdd');assert.equal(await count(),1);
await evaluate(`document.querySelector('[data-assistant-close]').click()`);await pause(200);assert.equal(await count(),0);
await evaluate(`document.querySelector('[data-assistant-dock-trigger] button').click()`);await pause(200);assert.equal(await count(),1);
assert.equal(await evaluate(`document.querySelector('#xiaoyu-dock-input').value`),'Keep this unsent question across modules');
await evaluate(`document.querySelector('[data-assistant-fullscreen-toggle]').click()`);await until('!!document.querySelector("[data-xiaoyu-surface=full]")');assert.equal(await count(),1);
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await until('!!document.querySelector("[data-xiaoyu-surface=dock]")');
await click('\u67e5\u770b\u7b14\u8bb0');await fill('textarea[maxlength="10000"]','Private checkpoint saved through the real task API');await click('\u4fdd\u5b58\u7b14\u8bb0');await until('!document.body.innerText.includes("\u7b14\u8bb0\u5c1a\u672a\u4fdd\u5b58")');
await fill('#xiaoyu-dock-input','');
await evaluate(`(()=>{const e=document.querySelector('#xiaoyu-dock-input');e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,isComposing:true,bubbles:true}));e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));})()`);
const before=await evaluate(`fetch('/api/copilot/tasks/${id}').then(r=>r.json()).then(b=>({turns:b.turns.length,notes:b.drafts.find(d=>d.key==='notes')?.text}))`);assert.equal(before.turns,0);assert.equal(before.notes,'Private checkpoint saved through the real task API');
// Expanded notes on shorter screens must leave a reachable send control.
for(const [width,height] of [[390,844],[390,720],[720,640],[1440,800]]) {
 await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await pause(300);
 const fit=await evaluate(`(()=>{const e=document.querySelector('[data-xiaoyu-surface]');e.scrollTop=e.scrollHeight;const button=e.querySelector('[data-assistant-composer] button[type=submit]');return {send:button.getBoundingClientRect().bottom,bottom:document.querySelector('[data-assistant-body]').getBoundingClientRect().bottom};})()`);
 assert.ok(fit.send<=fit.bottom+1,'Short-screen send control is clipped');
}
await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await pause(300);
await click('\u6536\u8d77\u7b14\u8bb0');
for(const width of [1440,1024,720,390]){
 await page.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await pause(350);
 const dims=await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,input:document.querySelector('#xiaoyu-dock-input').getBoundingClientRect().toJSON(),dock:document.querySelector('[data-assistant-frame]').getBoundingClientRect().toJSON()})`);assert.ok(dims.scroll<=width+1);console.log('DOCK',dims);
 const shot=await page.send('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/xy01b-dock-'+width+'.png',Buffer.from(shot.data,'base64'));
}
await click('\u5b8c\u6574\u5de5\u4f5c\u533a');await until('location.pathname==="/copilot"');await until(`document.querySelector('[data-xiaoyu-surface]')?.dataset.taskId===${JSON.stringify(id)}`);assert.equal(await count(),1);
await page.send('Page.reload');await until(`document.querySelector('[data-xiaoyu-surface]')?.dataset.taskId===${JSON.stringify(id)}`);await click('\u67e5\u770b\u7b14\u8bb0');assert.equal(await evaluate(`document.querySelector('textarea[maxlength="10000"]').value`),before.notes);
console.log('PASS real task API create / notes, full -> new market -> close/reopen -> fullscreen -> full -> refresh; same task; one composer; IME no turn; four screen sizes. No real OBO model request.');
} finally { await browser.send('Target.closeTarget',{targetId});browser.ws.close();page.ws.close(); }
