import { localDebuggerEndpoint } from "./local-debugger.mjs";
import assert from 'node:assert/strict';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const output = await mkdtemp(join(tmpdir(), 'yucer-shared-panel-'));
console.log('Evidence directory:', output);
// Local-only browser acceptance; no model or business writes are permitted.
async function cdp(url) {
  const ws = new WebSocket(localDebuggerEndpoint(url));
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
 await page.send('Page.enable');await page.send('Page.bringToFront');await page.send('Runtime.enable');await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 await visit('/copilot');
 const task=await evaluate(`fetch('/api/copilot/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),goal:'XC-01 local continuity acceptance',targets:[]})}).then(r=>r.json())`);
 assert.match(task.id,/^[a-f0-9-]{36}$/);await visit('/copilot?task='+task.id);
 await page.send('Runtime.evaluate',{expression:`(${visibleInput}).focus()`});await page.send('Input.insertText',{text:'XC-01 unfinished question'});
 await until(`fetch('/api/copilot/tasks/${task.id}').then(r=>r.json()).then(b=>b.drafts.some(d=>d.key==='conversation-input'&&d.text==='XC-01 unfinished question'))`);
 test('Unsent input is saved in the owner-scoped private draft',true);
 const geo=await evaluate(`(()=>{const s=document.querySelector('[data-xiaoyu-surface=full]'),h=s.querySelector('[data-assistant-header]'),b=s.querySelector('[data-assistant-transcript]').parentElement.parentElement,c=s.querySelector('[data-assistant-composer]').parentElement;return {h:h.getBoundingClientRect().height,headers:s.querySelectorAll('[data-assistant-header]').length,bodyLeft:getComputedStyle(b).paddingLeft,bodyRight:getComputedStyle(b).paddingRight,composer:getComputedStyle(c).paddingLeft,mode:s.querySelectorAll('[data-assistant-mode]').length,footer:s.querySelectorAll('[data-assistant-footer]').length}})()`);
 test('One 56px header, inline authority and no extra footer',geo.h===56&&geo.headers===1&&geo.mode===1&&geo.footer===0);
 test('Shared reading insets 24px/32px; composer outer inset16px',geo.bodyLeft==='24px'&&geo.bodyRight==='32px'&&geo.composer==='16px');
 const identity=await evaluate(`(()=>{const g=document.querySelector('[data-task-identity]');return {height:g.getBoundingClientRect().height,sizes:[...g.children].map(e=>getComputedStyle(e).fontSize),name:g.children[1].textContent,overflow:g.scrollWidth-g.clientWidth}})()`);
 test('Task type, name and state use one 32px component group',identity.height===32&&identity.overflow<=1);
 test('The three task elements share 12px typography',identity.sizes.length===3&&identity.sizes.every(s=>s==='12px'));
 test('Task identity uses the actual task name',identity.name==='XC-01 local continuity acceptance');

 await evaluate(`document.querySelector('[data-xiaoyu-conversation] [data-assistant-width-toggle]').click()`);await pause(500);
 test('Wide/narrow switch retains the input',await evaluate(`(${visibleInput}).value==='XC-01 unfinished question'`));
 await page.send('Page.reload');await until(`!!(${visibleInput}) && (${visibleInput}).value==='XC-01 unfinished question'`);test('Refresh restores unsent text without a model call',true);
 // Navigate through the independent Today scene, then its real business source Link.
 await evaluate("document.querySelector('[data-xiaoyu-board] a[href=\"/copilot/today\"]').click()");
 await until("location.pathname==='/copilot/today'");
 await until("!!document.querySelector('[data-judgement-evidence]')");
 test('Today opens without a sidebar even after a task conversation',await evaluate("document.querySelector('[data-assistant-width]').dataset.paneOpen==='false'"));
 await evaluate("document.querySelector('[data-judgement-evidence]').click()");
 await until("!!document.querySelector('[data-judgement-evidence-link]')");
 const sourcePath = await evaluate("document.querySelector('[data-judgement-evidence-link]').getAttribute('href')");
 await evaluate("document.querySelector('[data-judgement-evidence-link]').click()");
 await until(`location.pathname===${JSON.stringify(sourcePath)}`);
 await until("!!document.querySelector('[data-assistant-dock-trigger] button')");
 if(await evaluate("document.querySelector('[data-assistant-width]')?.dataset.paneOpen!=='true'")) await evaluate("document.querySelector('[data-assistant-dock-trigger] button').click()");
 await pause(450);
 await until(`!!(${visibleInput})`);
 test('Task input continues from workspace to a business page',await evaluate(`(${visibleInput}).value==='XC-01 unfinished question'`));
 test('Business sidebar has one visible input and one header',await evaluate(`(()=>{const s=document.querySelector('[data-assistant-frame]');return [...s.querySelectorAll('textarea')].filter(e=>e.checkVisibility({visibilityProperty:true})).length===1&&[...s.querySelectorAll('[data-assistant-header]')].filter(e=>e.checkVisibility({visibilityProperty:true})).length===1})()`));
 await evaluate("document.querySelector('[data-assistant-frame] [data-assistant-close]').click()");await pause(450);
 test('Closing preserves mounted input',await evaluate(`!!document.querySelector('[data-assistant-frame] textarea')`));
 await evaluate("document.querySelector('[data-assistant-dock-trigger] button').click()");await pause(450);
 await until(`!!(${visibleInput})`);test('Reopening retains the same question',await evaluate(`(${visibleInput}).value==='XC-01 unfinished question'`));
 const toolbar = await evaluate(`(()=>{const h=[...document.querySelectorAll('[data-assistant-header]')].find(e=>e.checkVisibility({visibilityProperty:true}));return [...h.querySelectorAll('button')].map(e=>e.hasAttribute('data-assistant-width-toggle')?'width':e.hasAttribute('data-assistant-history')?'history':e.hasAttribute('data-assistant-more')?'more':e.hasAttribute('data-assistant-close')?'close':e.querySelector('[data-icon=plus]')?'new':e.getAttribute('aria-label'))})()`);
 test('Toolbar ends with width, new, history, more and close',toolbar.slice(-5).join('|').match(/^width\|.*\|history\|more\|close$/));
 await evaluate("document.querySelector('[data-assistant-dock-trigger] button').click()");await pause(450);
 test('Header only summons a panel and keeps it open on repeat click',await evaluate(`location.pathname===${JSON.stringify(sourcePath)}&&document.querySelector('[data-assistant-width]').dataset.paneOpen==='true'`));
 await evaluate("document.querySelector('[data-assistant-workbench]').click()");
 await until("location.pathname==='/copilot'&&!!document.querySelector('[data-xiaoyu-surface=full]')");await until(`!!(${visibleInput})`);
 test('Sidebar title enters collaboration space with the same task and input',await evaluate(`new URLSearchParams(location.search).get('task')===${JSON.stringify(task.id)}&&(${visibleInput}).value==='XC-01 unfinished question'`));
 await evaluate("document.querySelector('[data-xiaoyu-surface=full] [data-assistant-close]').click()");
 await until(`document.querySelector('[data-xiaoyu-surface=full]').dataset.conversationOpen==='false'&&!(${visibleInput})`);
 test('Closing full workspace chat expands the board and preserves its input',await evaluate(`document.querySelector('[data-xiaoyu-surface=full]').dataset.conversationOpen==='false'&&!!document.querySelector('#xiaoyu-full-input')&&!(${visibleInput})`));
 await evaluate("document.querySelector('[data-assistant-dock-trigger] button').click()");await until(`!!(${visibleInput})`);await pause(450);
 test('Header reopens workspace chat without navigating or losing input',await evaluate(`location.pathname==='/copilot'&&(${visibleInput}).value==='XC-01 unfinished question'`));
 for(const width of [1440,1024,390,320]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height:width<500?844:960,deviceScaleFactor:1,mobile:false});await pause(450);
  const m=await evaluate(`(()=>{const h=[...document.querySelectorAll('[data-assistant-header]')].find(e=>e.checkVisibility({visibilityProperty:true}));return {width:innerWidth,doc:document.documentElement.scrollWidth,header:h?.getBoundingClientRect().height,overflow:h?h.scrollWidth-h.clientWidth:0}})()`);
  if(!(m.doc<=m.width+1&&m.header===56&&m.overflow<=1)) console.log(m);
  test('Sidebar geometry at '+width+'px',m.doc<=m.width+1&&m.header===56&&m.overflow<=1);
  if(width<500){
   await evaluate("document.querySelector('[data-xiaoyu-surface=full] [data-assistant-close]').click()");await until("document.querySelector('[data-xiaoyu-board]').checkVisibility({visibilityProperty:true})");
   test('Closing mobile conversation reveals its board at '+width+'px',await evaluate("document.querySelector('[data-xiaoyu-board]').checkVisibility({visibilityProperty:true})"));
   await evaluate("document.querySelector('[data-assistant-dock-trigger] button').click()");await pause(450);
   test('Header summons the mobile conversation at '+width+'px',await evaluate(`!!(${visibleInput})`));
  }
 }
 await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await pause(450);
 const shot=await page.send('Page.captureScreenshot',{format:'png'});await writeFile(join(output, 'xc01-shared-panel.png'),Buffer.from(shot.data,'base64'));
 await writeFile(join(output, 'xc01-browser-report.json'),JSON.stringify({results,geometry:geo,taskId:task.id},null,2));console.log(JSON.stringify({passed:results.length,geometry:geo,taskId:task.id}));
}finally{page.ws.close()}
