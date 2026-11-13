/** Read-only browser verification against a running development server.
 * Explicit CDP tab required; restores its URL and viewport in finally.
 * No save/delete/probe/agent actions are executed.
 * node scripts/qa/audit-page-controls.mjs --tab ID [--out /tmp/result.json]
 */
import { readFile, writeFile } from "node:fs/promises";
import { inspectionExpression } from "./control-inspection.mjs";
const args = process.argv.slice(2);
const arg = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const tabId = arg("--tab");
if (!tabId) throw Error("Specify --tab ID for a dedicated review tab");
const base = arg("--base", "http://localhost:4060");
const cdp = arg("--cdp", "http://localhost:9333");
const out = arg("--out", "/tmp/yucer-controls-browser.json");
const { pages } = JSON.parse(await readFile(new URL("../guardrails/page-surfaces.json", import.meta.url), "utf8"));
const tabs = await (await fetch(`${cdp}/json/list`)).json();
const tab = tabs.find((t) => t.id === tabId);
if (!tab) throw Error("Review tab missing");
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
let seq = 0;
const pending = new Map();
let currentErrors = [];
let status = null;
ws.onmessage = (event) => {
  const m = JSON.parse(event.data);
  if (Number.isSafeInteger(m.id) && pending.has(m.id)) { const handler = pending.get(m.id); pending.delete(m.id); if (typeof handler === "function") handler(m); }
  else if (m.method === "Runtime.exceptionThrown") currentErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  else if (m.method === "Network.responseReceived" && m.params.type === "Document") status = m.params.response.status;
};
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`${method} timeout`)); }, 90000);
    pending.set(id, (m) => { clearTimeout(timer); m.error ? reject(Error(JSON.stringify(m.error))) : resolve(m.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression) {
  const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const originalUrl = arg("--restore", await ev("location.href"));
const originalViewport = await ev("({width:innerWidth,height:innerHeight})");
const selected = arg("--routes", "").split(",").filter(Boolean);
const results = [];
const links = new Set();
const constants = pages.filter((p) => !p.route.includes("[") && p.kind !== "compatibility");
const ordered = [...constants.filter((p) => p.route.split("/").length <= 2), ...constants.filter((p) => p.route.split("/").length > 2), ...pages.filter((p) => p.route.includes("[")), ...pages.filter((p) => p.kind === "compatibility")];
const reserved = new Set(constants.map((p) => p.route));
function sampleFor(p) {
  const regex = new RegExp("^" + p.route.split("/").map((s) => s.startsWith("[") ? "[^/]+" : s).join("/") + "$");
  return p.route.includes("[") ? [...links].find((l) => regex.test(new URL(l).pathname) && !reserved.has(new URL(l).pathname))?.replace(base, "") ?? p.sample : p.sample;
}
async function sampleFromEntry(p) {
  const n = await call("Page.navigate", { url: base + p.entryProbe.path });
  if (n.errorText) throw Error(n.errorText);
  for (let i = 0; i < 250; i++) {
    if (await ev(`location.pathname===${JSON.stringify(p.entryProbe.path.split('?')[0])}&&document.readyState==='complete'&&(()=>{const b=document.querySelector('table button[aria-haspopup=menu]:not(:disabled)');return b&&Object.keys(b).some(k=>k.startsWith('__reactProps'))})()`)) break;
    await sleep(200);
  }
  await sleep(500);
  await ev(`document.querySelector('table button[aria-haspopup=menu]:not(:disabled)').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}))`);
  for (let i = 0; i < 100; i++) {
    if (await ev(`!!document.querySelector('[role=menuitem]')`)) break;
    await sleep(100);
  }
  // Only navigation to an edit page; never execute a write menu item.
  await ev(`(()=>{const pattern=new RegExp(String.fromCodePoint(0x914d,0x7f6e)+'|'+String.fromCodePoint(0x7f16,0x8f91)+'|configure|edit','i');const e=[...document.querySelectorAll('[role=menuitem]')].find(e=>pattern.test(e.textContent)&&e.getAttribute('aria-disabled')!=='true');if(!e)throw Error('No permitted edit entry');e.click()})()`);
  for (let i = 0; i < 250; i++) {
    const next = await ev("location.pathname");
    if (next.startsWith(p.entryProbe.path.split("?")[0] + "/") && next !== p.entryProbe.path.split("?")[0] + "/new") return next;
    await sleep(200);
  }
  throw Error("Contextual edit entry did not navigate");
}

// Only single-line controls. Menu rows, cards, radio/checkbox graphics and
// multiline fields are separately recorded, never incorrectly forced to 32px.
const inspect = inspectionExpression;
try {
  await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
  await call("Emulation.setDeviceMetricsOverride", { width:1600,height:1000,deviceScaleFactor:1,mobile:false });
  for (const p of ordered.filter(p=>!selected.length||selected.includes(p.route))) {
    currentErrors = []; status = null;
    let sample = sampleFor(p);
    try {
      if (p.entryProbe) sample = await sampleFromEntry(p);
      let ready = false;
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const navigation = await call("Page.navigate", { url: base + sample });
          if (navigation.errorText) throw Error(navigation.errorText);
          for (let i = 0; i < 250; i++) {
            await sleep(200);
            try {
              if (await ev("document.readyState==='complete'&&document.body.innerText.length>0&&location.protocol==='http:'")) { ready = true; break; }
            } catch {}
          }
          if (!ready) throw Error("Page did not finish loading");
          break;
        } catch (e) {
          if (attempt === 5) throw e;
          console.log(`${p.route}: retry ${attempt + 1} (${e.message})`);
          await sleep(1500);
        }
      }
      await sleep(350);
      const found = await ev(inspect);
      if (!found.url.startsWith(base)) throw Error(`Navigation failed: ${found.url}`);
      found.links.forEach((l)=>links.add(l)); delete found.links;
      const expected = new RegExp("^" + p.route.split("/").map(s=>s.startsWith("[") ? "[^/]+" : s).join("/") + "$");
      const pageIssues = [...(status >= 400 ? ["http-status"] : []), ...(p.kind !== "compatibility" && !expected.test(new URL(found.url).pathname) && !p.allowedRedirects?.includes(new URL(found.url).pathname) ? ["sample-redirect"] : [])];
      const r = { route:p.route,kind:p.kind,sample,status,...found,errors:currentErrors,pageIssues };
      results.push(r);
      console.log(`${p.route}: ${status} controls=${r.controls.length} violations=${r.violations.length}${r.errors.length?' runtime-errors='+r.errors.length:''}`);
    } catch (e) { results.push({route:p.route,sample,error:e.message});console.log(`${p.route}: ERROR ${e.message}`); }
    await writeFile(out, JSON.stringify({viewport:{width:1600,height:1000},results}, null,2)+"\n");
  }
} finally {
  try { await call("Page.navigate", {url:originalUrl}); await call("Emulation.clearDeviceMetricsOverride"); } finally { ws.close(); }
}
const violations = results.flatMap((r)=>r.violations??[]);
console.log(`${results.length} routes; ${violations.length} control violations. Report: ${out}. Original viewport ${originalViewport.width}x${originalViewport.height}.`);
if (violations.length || results.some((r)=>r.error || r.errors?.length || r.pageIssues?.length)) process.exitCode=1;
