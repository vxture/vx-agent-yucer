import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
// Local-only browser acceptance; no model or business writes are permitted.
async function cdp(url) {
  const ws = new WebSocket('ws://127.0.0.1:9334' + new URL(url).pathname);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let sequence = 0; const requests = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data), pending = requests.get(message.id);
    if (!pending) return;
    requests.delete(message.id); clearTimeout(pending.timer);
    message.error ? pending.reject(Error(message.error.message)) : pending.resolve(message.result);
  };
  return { ws, send(method, params = {}) {
    const id = ++sequence;
    const result = new Promise((resolve, reject) => requests.set(id, { resolve, reject,
      timer: setTimeout(() => { requests.delete(id); reject(Error('CDP timeout: ' + method)); }, 20000) }));
    ws.send(JSON.stringify({ id, method, params })); return result;
  } };
}
const base='http://localhost:4060';
const status=await(await fetch(base+'/api/status')).json();
assert.equal(status.c2.deployStage,'dev');assert.equal(status.data.database.configured,false);assert.equal(status.planes.atlas.configured,false);
const tabs=await(await fetch('http://127.0.0.1:9334/json/list')).json();
const target=tabs.find(t=>t.type==='page' && /^http:\/\/(localhost|127\.0\.0\.1):4060\//.test(t.url)); assert.ok(target, 'Open the existing local preview tab first');const page=await cdp(target.webSocketDebuggerUrl);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const evaluate=async expression=>{const r=await page.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const until=async expression=>{for(let i=0;i<160;i++){if(await evaluate(expression).catch(()=>false))return;await pause(250)}throw Error('Timeout '+expression)};
const results=[];const test=(name,value)=>{assert.ok(value,name);results.push(name)};
const visibleInput=`[...document.querySelectorAll('[data-xiaoyu-conversation] textarea')].find(e=>e.checkVisibility({visibilityProperty:true}))`;
const visit=async path=>{await page.send('Page.navigate',{url:base+path});await until(`!!(${visibleInput}) && !(${visibleInput}).disabled`)};
try{
 await page.send('Page.enable');await page.send('Runtime.enable');await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 await visit('/copilot');
 const task=await evaluate(`fetch('/api/copilot/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),goal:'XC-01 local continuity acceptance',targets:[]})}).then(r=>r.json())`);
 assert.match(task.id,/^[a-f0-9-]{36}$/);await visit('/copilot?task='+task.id);
 await page.send('Runtime.evaluate',{expression:`(${visibleInput}).focus()`});await page.send('Input.insertText',{text:'XC-01 unfinished question'});
 await until(`fetch('/api/copilot/tasks/${task.id}').then(r=>r.json()).then(b=>b.drafts.some(d=>d.key==='conversation-input'&&d.text==='XC-01 unfinished question'))`);
 test('Unsent input is saved in the owner-scoped private draft',true);
 const geo=await evaluate(`(()=>{const s=document.querySelector('[data-xiaoyu-surface=full]'),h=s.querySelector('[data-assistant-header]'),b=s.querySelector('[data-assistant-transcript]').parentElement.parentElement,c=s.querySelector('[data-assistant-composer]').parentElement;return {h:h.getBoundingClientRect().height,headers:s.querySelectorAll('[data-assistant-header]').length,bodyLeft:getComputedStyle(b).paddingLeft,bodyRight:getComputedStyle(b).paddingRight,composer:getComputedStyle(c).paddingLeft,mode:s.querySelectorAll('[data-assistant-mode]').length,footer:s.querySelectorAll('[data-assistant-footer]').length}})()`);
 test('One 56px header, inline authority and no extra footer',geo.h===56&&geo.headers===1&&geo.mode===1&&geo.footer===0);
 test('Shared reading insets 24px/32px; composer outer inset16px',geo.bodyLeft==='24px'&&geo.bodyRight==='32px'&&geo.composer==='16px');
 await evaluate(`document.querySelector('[data-xiaoyu-conversation] [data-assistant-width-toggle]').click()`);await pause(500);
 test('Wide/narrow switch retains the input',await evaluate(`(${visibleInput}).value==='XC-01 unfinished question'`));
 await page.send('Page.reload');await until(`!!(${visibleInput}) && (${visibleInput}).value==='XC-01 unfinished question'`);test('Refresh restores unsent text without a model call',true);
 // A real Next Link from the judgment source navigates without replacing the provider.
 await until("!!document.querySelector('[data-xiaoyu-topics] details a[href^=\"/account/\"]')");
 await evaluate("document.querySelector('[data-xiaoyu-topics] details').open=true;document.querySelector('[data-xiaoyu-topics] details a[href^=\"/account/\"]').click()");
 await until("location.pathname.startsWith('/account/')");
 await until(`!!(${visibleInput})`);
 test('Task input continues from workspace to a business page',await evaluate(`(${visibleInput}).value==='XC-01 unfinished question'`));
 test('Business sidebar has one visible input and one header',await evaluate(`(()=>{const s=document.querySelector('[data-assistant-frame]');return [...s.querySelectorAll('textarea')].filter(e=>e.checkVisibility({visibilityProperty:true})).length===1&&[...s.querySelectorAll('[data-assistant-header]')].filter(e=>e.checkVisibility({visibilityProperty:true})).length===1})()`));
 await evaluate("document.querySelector('[data-assistant-frame] [data-assistant-close]').click()");await pause(450);
 test('Closing preserves mounted input',await evaluate(`!!document.querySelector('[data-assistant-frame] textarea')`));
 const open=await evaluate("[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')?.includes('协作')||e.getAttribute('data-agent-dock-toggle')!==null)?.outerHTML");
 const reopen=await evaluate("[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='打开小聿协作栏')?.click()??null");
 // The shell exposes the AI group independently of the route.
 if(!await evaluate(`!!(${visibleInput})`))await evaluate("document.querySelector('[data-header-group=agent] button, [data-header-group=ai] button, [data-assistant-toggle]')?.click()");
 if(!await evaluate(`!!(${visibleInput})`)) { console.log('HEADER BUTTONS',await evaluate("[...document.querySelectorAll('header button')].map(e=>({aria:e.getAttribute('aria-label'),text:e.innerText}))")); }
 await until(`!!(${visibleInput})`);test('Reopening retains the same question',await evaluate(`(${visibleInput}).value==='XC-01 unfinished question'`));
 for(const width of [1440,1024,390,320]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height:width<500?844:960,deviceScaleFactor:1,mobile:false});await pause(450);
  const m=await evaluate(`(()=>{const h=[...document.querySelectorAll('[data-assistant-header]')].find(e=>e.checkVisibility({visibilityProperty:true}));return {width:innerWidth,doc:document.documentElement.scrollWidth,header:h?.getBoundingClientRect().height,overflow:h?h.scrollWidth-h.clientWidth:0}})()`);
  test('Sidebar geometry at '+width+'px',m.doc<=m.width+1&&m.header===56&&m.overflow<=1);
 }
 await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 const shot=await page.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/xc01-shared-panel.png',Buffer.from(shot.data,'base64'));
 await writeFile('/private/tmp/xc01-browser-report.json',JSON.stringify({results,geometry:geo,taskId:task.id},null,2));console.log(JSON.stringify({passed:results.length,geometry:geo,taskId:task.id}));
}finally{page.ws.close()}
