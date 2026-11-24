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
const visit=async (path,selector)=>{await page.send('Page.navigate',{url:base+path});await until(`!!document.querySelector(${JSON.stringify(selector)})`)};
try {
 await page.send('Page.enable');await page.send('Page.bringToFront');await page.send('Runtime.enable');
 await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 await visit('/','[data-home-overview]');
 test('The root is the overview instead of a redirect',await evaluate("location.pathname==='/'"));
 test('Four real-service metric cards and the robot entry',await evaluate("document.querySelectorAll('[data-home-stat]').length===4&&!!document.querySelector('a[data-home-xiaoyu]')"));
 test('Today and the robot are separate destinations',await evaluate("document.querySelector('[data-home-overview] a[href=\"/copilot/today\"]')&&document.querySelector('a[data-home-xiaoyu]').getAttribute('href').startsWith('/copilot')"));
 test('Numbers and support text align to label text at 24px',await evaluate("[...document.querySelectorAll('[data-home-stat]')].every(c=>getComputedStyle(c.children[1]).paddingLeft==='24px'&&getComputedStyle(c.children[2]).paddingLeft==='24px')"));
 test('Missing first-order target is not replaced with zero',await evaluate("(()=>{const c=document.querySelector('[data-home-stat=new]');return c.children[1].textContent.includes('\u2014')&&c.children[2].textContent.includes('\u5c1a\u672a')})()"));
 test('Units use body typography instead of metric typography',await evaluate("[...document.querySelectorAll('[data-home-stat] p:first-of-type span')].every(e=>getComputedStyle(e).fontSize==='14px')"));
 for(const width of [1440,1024,390,320]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height:width<500?844:960,deviceScaleFactor:1,mobile:false});await pause(450);
  test('Overview has no horizontal overflow at '+width+'px',await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
 }
 await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 test('Robot respects reduced-motion preference',await evaluate("getComputedStyle(document.querySelector('[data-home-xiaoyu] .robot-eyes')).animationName==='none'"));
 await page.send('Emulation.setEmulatedMedia',{features:[]});
 const home=await page.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/xc02-home.png',Buffer.from(home.data,'base64'));
 await evaluate("document.querySelector('[data-home-overview] a[href=\"/copilot/today\"]').click()");
 await until("location.pathname==='/copilot/today'&&!!document.querySelector('[data-xiaoyu-topics] details')");
 test('Today is an independent fixed-template page',await evaluate("[...document.querySelectorAll('[data-xiaoyu-topics] h2')].map(e=>e.textContent).length===4"));
 test('Today retains provenance and at most three direct actions',await evaluate("[...document.querySelectorAll('[data-xiaoyu-topics] details')].every(d=>d.parentElement.querySelectorAll('button').length===4&&d.parentElement.textContent.includes('\u89c4\u5219'))"));
 test('Both scene headers stay 56px',await evaluate("document.querySelector('[data-xiaoyu-board] header').getBoundingClientRect().height===56&&document.querySelector('[data-assistant-header]').getBoundingClientRect().height===56"));
 const today=await page.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/xc02-today.png',Buffer.from(today.data,'base64'));
 for(const width of [390,320]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});await pause(450);
  test('Today remains reachable at '+width+'px',await evaluate("document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('[data-xiaoyu-board]').checkVisibility({visibilityProperty:true})"));
 }
 await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 await visit('/copilot?view=judgements&scope=mine','[data-xiaoyu-topics]');
 test('Legacy daily URL preserves the requested data scope',await evaluate("location.pathname==='/copilot/today'&&new URLSearchParams(location.search).get('scope')==='mine'"));
 await visit('/copilot','[data-task-identity]');
 for(const width of [1440,1024,390,320]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height:width<500?844:960,deviceScaleFactor:1,mobile:false});await pause(450);
  if(!await evaluate("document.querySelector('[data-xiaoyu-board]').checkVisibility({visibilityProperty:true})")) await evaluate("document.querySelector('[data-xiaoyu-surface=full] > [role=group] button:last-child').click()");
  await pause(450);
  test('Task title and identity fit at '+width+'px',await evaluate("(()=>{const h=document.querySelector('[data-xiaoyu-board] header'),g=document.querySelector('[data-task-identity]');return h.getBoundingClientRect().height===56&&g.getBoundingClientRect().height===32&&g.scrollWidth<=g.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1})()"));
 }
 await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 const workspace=await page.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/xc03-task-workspace.png',Buffer.from(workspace.data,'base64'));
 await visit('/','[data-home-overview]');
 await writeFile('/private/tmp/xc02-browser-report.json',JSON.stringify({results,stage:'local-demo',realAcceptance:false},null,2));
 console.log(JSON.stringify({passed:results.length,results}));
} finally {page.ws.close()}
