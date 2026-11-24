import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Read-only local layout verification. Never invoke business saves or models.
const base = "http://127.0.0.1:4060";
const debug = "http://127.0.0.1:9334";
const output = await mkdtemp(join(tmpdir(), "yucer-global-frame-"));
const manifest = JSON.parse(await readFile(new URL("../guardrails/page-surfaces.json", import.meta.url), "utf8"));
const status = await (await fetch(base + "/api/status")).json();
assert.equal(status.c2.deployStage, "dev");
assert.equal(status.data.database.configured, false);
assert.equal(status.planes.atlas.configured, false);
console.log("Evidence:", output);

class CDP {
  constructor(url) {
    this.ws = new WebSocket("ws://127.0.0.1:9334" + new URL(url).pathname);
    this.pending = new Map(); this.seq = 0;
    this.ws.addEventListener("message", event => {
      const message = JSON.parse(event.data), pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      message.error ? pending.reject(Error(message.error.message)) : pending.resolve(message.result);
    });
  }
  async send(method, params = {}) {
    if (this.ws.readyState !== 1) await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    const id = ++this.seq;
    const promise = new Promise((resolve, reject) => this.pending.set(id, {
      resolve, reject, timer: setTimeout(() => { this.pending.delete(id); reject(Error(method + " timed out")); }, 60000),
    }));
    this.ws.send(JSON.stringify({ id, method, params })); return promise;
  }
  close() { for (const p of this.pending.values()) clearTimeout(p.timer); this.ws.close(); }
}
const version = await (await fetch(debug + "/json/version")).json();
const browser = new CDP(version.webSocketDebuggerUrl);
const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
const tabs = await (await fetch(debug + "/json/list")).json();
const page = new CDP(tabs.find(t => t.id === targetId).webSocketDebuggerUrl);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = async expression => {
  const result = await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
async function until(expression) {
  for (let i = 0; i < 240; i++) {
    if (await evaluate(expression).catch(() => false)) return;
    await pause(250);
  }
  throw Error("Timeout: " + expression);
}
async function hydrated() {
  if (!await evaluate("!!document.querySelector('[data-workspace-width]')")) return;
  await until(`(() => {
    const button=document.querySelector('[data-header-group=user] button');
    return button && Object.keys(button).some(k => k.startsWith('__reactProps$') && typeof button[k].onClick==='function');
  })()`);
}
async function visit(path) {
  for(let attempt=0;attempt<3;attempt++) {
    const previous = await evaluate("performance.timeOrigin");
    const navigation=await page.send("Page.navigate", { url: base + path });
    await until(`performance.timeOrigin!==${previous} && document.readyState!=='loading' && document.body?.innerText.length>15`);
    if(!navigation.errorText && await evaluate("!location.href.startsWith('chrome-error:')")) { await pause(400);await hydrated();return; }
    await pause(1000);
    await fetch(base+'/api/status').catch(()=>{});
  }
  throw Error('Local development server did not recover: '+path);
}
async function reload() {
  const previous = await evaluate("performance.timeOrigin");
  await page.send("Page.reload");
  await until(`performance.timeOrigin!==${previous} && document.readyState!=='loading' && document.body?.innerText.length>15`);
  await hydrated();
}
const measure = () => evaluate(`(() => {
  const pane=document.querySelector('[data-workspace-content]'), scroll=pane?.firstElementChild, box=scroll?.firstElementChild;
  const left=document.querySelector('[data-workspace-left]'),dock=document.querySelector('[data-assistant-width] > aside');
  return {viewport:innerWidth,document:document.documentElement.scrollWidth, width:box?.getBoundingClientRect().width,
    pane:pane?.getBoundingClientRect().width, gutter:box?parseFloat(getComputedStyle(box).paddingLeft):null,
    top:pane?parseFloat(getComputedStyle(pane).paddingTop):null,bottom:box?parseFloat(getComputedStyle(box).paddingBottom):null,
    mode:document.querySelector('[data-workspace-width]')?.dataset.workspaceWidth,
    left:left?.checkVisibility({visibilityProperty:true})?left.getBoundingClientRect().width:null,
    dock:dock?.checkVisibility({visibilityProperty:true})?dock.getBoundingClientRect().width:null,
    text:document.body.innerText.slice(0,180)};
})()`);
const screenshot = async name => {
  const shot = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(output, name + ".png"), Buffer.from(shot.data, "base64"));
};
const results = [], geometry = [];
try {
  await page.send("Page.enable"); await page.send("Network.enable");
  await page.send("Network.setCookie", { name: "NEXT_LOCALE", value: "zh-CN", url: base, path: "/" });
  await page.send('Page.bringToFront');
  if(process.env.QA_ONLY_ROUTES!=='on') {
  await page.send("Emulation.setDeviceMetricsOverride", { width: 2560, height: 1100, deviceScaleFactor: 1, mobile: false });
  await visit("/strategy");
  const subject = (await readFile(new URL("../../portals/app/app/(app)/lib/dev-session.ts", import.meta.url), "utf8")).match(/const DEV_SUB = "([^"]+)"/)?.[1];
  assert.ok(subject, "Find the demo account's preference namespace");
  const cookieName = "yucer_content_width_" + encodeURIComponent(subject);
  async function width(value) {
    await page.send("Network.setCookie", { name: cookieName, value, url: base, path: "/" });
    await reload();
    await until(`document.querySelector('[data-workspace-width]')?.dataset.workspaceWidth===${JSON.stringify(value)}`);
    await pause(450);
  }
  for (const mode of ["standard", "wide"]) {
    await width(mode);
    const m = await measure(); geometry.push({ case: "2560-" + mode, ...m });
    assert.equal(m.width, mode === "wide" ? 1920 : 1536);
    assert.equal(m.gutter, 48); assert.equal(m.top, 12); assert.equal(m.bottom, 80);
    assert.ok(m.document <= m.viewport + 1);
    await screenshot("strategy-2560-" + mode);
  }
  await width("standard");
  // The setting must be discoverable in the existing personal menu.
  await evaluate("document.querySelector('[data-header-group=user] button').click()");
  await until("!!document.querySelector('select[aria-label=\"\\u5185\\u5bb9\\u5bbd\\u5ea6\"]')");
  await evaluate(`(() => { const select=document.querySelector('select[aria-label="\\u5185\\u5bb9\\u5bbd\\u5ea6"]'); const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(select,'wide');select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await until("document.querySelector('[data-workspace-width]').dataset.workspaceWidth==='wide'");
  await pause(450);
  assert.equal((await measure()).width, 1920);
  await screenshot("personal-display-preference");
  await reload();
  await until("document.querySelector('[data-workspace-width]')?.dataset.workspaceWidth==='wide'");
  await width("standard");

  await page.send("Network.setCookie", { name:"yucer_assistant_width", value:"narrow", url:base, path:"/" });
  await page.send("Emulation.setDeviceMetricsOverride", { width:1920, height:1000, deviceScaleFactor:1, mobile:false });
  await visit("/account/acc_demo_1");
  const leftSize = (await measure()).left;
  assert.equal(leftSize,256,"Information dossiers use the DS compact sidebar width");
  const animate = async (selector, trigger) => evaluate(`(async()=>{
    const pane=document.querySelector(${JSON.stringify(selector)}),button=document.querySelector(${JSON.stringify(trigger)});
    const widths=[pane.getBoundingClientRect().width];button.click();
    const started=performance.now();
    do {await new Promise(requestAnimationFrame);widths.push(pane.getBoundingClientRect().width);} while(performance.now()-started<650);
    return widths;
  })()`);
  const intermediate=(frames,size)=>frames.some(w=>w>0&&w<size);
  let frames=await animate('[data-workspace-left]','[data-workspace-left-trigger] button');
  assert.equal(frames[0],leftSize);assert.ok(intermediate(frames,leftSize),JSON.stringify(frames));assert.equal(frames.at(-1),0);
  frames=await animate('[data-workspace-left]','[data-workspace-left-trigger] button');
  assert.equal(frames[0],0);assert.ok(intermediate(frames,leftSize),JSON.stringify(frames));assert.equal(frames.at(-1),leftSize);
  if(await evaluate("document.querySelector('[data-assistant-width]').dataset.paneOpen!=='true'")) {
    await evaluate("document.querySelector('[data-assistant-dock-trigger] button').click()");await pause(450);
  }
  assert.equal((await measure()).dock,420);
  frames=await animate('[data-assistant-width]','[data-assistant-close]');
  assert.equal(frames[0],420);assert.ok(intermediate(frames,420),JSON.stringify(frames));assert.equal(frames.at(-1),0);
  frames=await animate('[data-assistant-width]','[data-assistant-dock-trigger] button');
  assert.equal(frames[0],0);assert.ok(intermediate(frames,420),JSON.stringify(frames));assert.equal(frames.at(-1),420);
  geometry.push({case:'pane-motion',leftAndRight:true,leftSize,frames});
  await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-workspace-left]')).transitionDuration"),'0s');
  await page.send('Emulation.setEmulatedMedia',{features:[]});
  console.log('PASS both pane transitions, intermediate frames and reduced motion');
  await evaluate("document.querySelector('[data-assistant-fullscreen-toggle]').click()");
  await pause(450);
  assert.equal(await evaluate("document.querySelector('[data-assistant-fullscreen]').dataset.assistantFullscreen"),'true');
  assert.equal(await evaluate("Math.round(document.querySelector('[data-assistant-width] > aside').getBoundingClientRect().width)"),1920);
  assert.equal(await evaluate("document.querySelector('[data-workspace-width]').inert"),true);
  await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await pause(450);
  assert.equal(await evaluate("document.querySelector('[data-workspace-width]').inert"),false);
  geometry.push({case:'fullscreen-and-escape',passed:true});

  for (const [w, h] of [[1920,1000],[1440,1000],[1024,800],[390,844]]) {
    await page.send("Emulation.setDeviceMetricsOverride", { width:w, height:h, deviceScaleFactor:1, mobile:false });
    for (const path of ["/strategy", "/account/acc_demo_1", "/pipeline/opp_demo_1", "/admin/roles", "/copilot"]) {
      await visit(path);
      const m = await measure(); geometry.push({ case:w+" "+path,...m });
      assert.ok(m.document <= w + 1, "Document overflow: " + path + " at " + w);
      assert.ok(m.width <= 1536.5, "Center width cap: " + path);
      if (m.left && w >= 1280) assert.equal(m.left,256,"Compact information pane");
      if(path==='/admin/roles') {
        assert.equal(await evaluate("!!document.querySelector('[data-workspace-left]')"),false,"Navigation is not an information pane");
        assert.equal(await evaluate("!!document.querySelector('[data-workspace-left-trigger]')"),false,"Keep the navigation's own toggle");
      }
      if(w===1920)await screenshot(path.replaceAll("/","-")+"-1920");
      console.log('PASS responsive',w,path);
    }
  }
  await page.send("Emulation.setDeviceMetricsOverride", { width:1920, height:1000, deviceScaleFactor:1, mobile:false });
  await visit('/admin/roles');
  const navSize=()=>evaluate("document.querySelector('[data-slot=shell-sidebar-frame]').getBoundingClientRect().width");
  if(await navSize()!==256) {
    await evaluate("document.querySelector('[data-slot=shell-sidebar-nav] button[aria-label=\"\\u5c55\\u5f00\\u5bfc\\u822a\"]').click()");await pause(450);
  }
  assert.equal(await navSize(),256);
  await evaluate("document.querySelector('[data-slot=shell-sidebar-nav] button[aria-label=\"\\u6536\\u8d77\\u5bfc\\u822a\"]').click()");await pause(450);
  assert.equal(await navSize(),64);
  await evaluate("document.querySelector('[data-slot=shell-sidebar-nav] button[aria-label=\"\\u5c55\\u5f00\\u5bfc\\u822a\"]').click()");await pause(450);
  assert.equal(await navSize(),256);
  geometry.push({case:'native-navigation-expanded-collapsed',expanded:256,collapsed:64,passed:true});
  }
  if(process.env.QA_SKIP_ROUTES==='on') {
    console.log('PASS representative layouts; full route sweep skipped explicitly.');
  } else {
  await page.send("Emulation.setDeviceMetricsOverride", { width:1440, height:1000, deviceScaleFactor:1, mobile:false });
  const samples = {};
  for (const section of ['division', 'org', 'roles', 'members']) {
    // Discover actual current demo IDs from the server-rendered client props.
    // Their IDs are not stable across memory-store restarts.
    const html = await (await fetch(base + '/admin/' + section)).text();
    const row = section === 'members'
      ? html.match(/\\"rows\\":\[\{.*?\\"memberId\\":\\"([^"\\]+)\\"/)
      : html.match(/\\"rows\\":\[\{.*?\\"id\\":\\"([^"\\]+)\\"/);
    if (row) samples['/admin/' + section + '/[id]'] = '/admin/' + section + '/' + encodeURIComponent(row[1]);
  }
  const selected = process.env.QA_ROUTES_FROM
    ? [...manifest.pages.slice(Number(process.env.QA_ROUTES_FROM)), manifest.pages.find(p=>p.route==='/admin/members/[id]')]
    : manifest.pages;
  for (const entry of selected) {
    const path = entry.sample || samples[entry.route] || ({
      "/copilot/memory":"/copilot/memory",
    })[entry.route];
    if (!path) { results.push({route:entry.route,status:"no-valid-sample"}); continue; }
    await visit(path);
    const m = await measure();
    const missing = await evaluate("/\\u672a\\u627e\\u5230|\\u4e0d\\u5b58\\u5728/.test(document.querySelector('[data-workspace-content]')?.innerText?.slice(0,160)||'')");
    const current = await evaluate("location.pathname");
    const app = ["workspace", "dossier", "collaboration"].includes(entry.workspaceLayout.mode);
    if(app)assert.ok(m.document <= 1441, "Route overflow: " + path);
    if(app)assert.ok(m.width, "Missing shared container: " + path);
    const redirected = current !== new URL(base + path).pathname;
    const expectedRedirect = entry.workspaceLayout.mode === 'redirect' || entry.allowedRedirects?.includes(current);
    results.push({route:entry.route,path,current,mode:entry.workspaceLayout.mode,status:missing?"sample-not-found":redirected?expectedRedirect?"expected-redirect":"sample-redirected":"visited",width:m.width,document:m.document});
    console.log(results.length + "/" + manifest.pages.length, entry.route, missing?"sample not found":"OK");
    await writeFile(join(output,"report.json"),JSON.stringify({results,geometry},null,2));
  }
  console.log("PASS layout widths, gutters, personal setting, reload, pane widths and page inventory.");
  }
} finally {
  await writeFile(join(output,"report.json"),JSON.stringify({results,geometry},null,2));
  await page.send("Emulation.clearDeviceMetricsOverride").catch(()=>{});
  await browser.send("Target.closeTarget",{targetId}).catch(()=>{});
  page.close();browser.close();
}
