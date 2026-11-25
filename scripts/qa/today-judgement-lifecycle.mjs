import assert from "node:assert/strict";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localDebuggerEndpoint } from "./local-debugger.mjs";

// Controlled HTTP responses test browser lifecycle only. This script refuses
// a configured database, model or non-local origin and never writes business data.
const base = "http://localhost:4060";
const status = await (await fetch(base + "/api/status")).json();
assert.equal(status.c2.deployStage, "dev");
assert.equal(status.data.database.configured, false);
assert.equal(status.planes.atlas.configured, false);
const tabs = await (await fetch("http://127.0.0.1:9334/json/list")).json();
const target = tabs.find(t => t.type === "page" && t.url.startsWith(base + "/"));
assert.ok(target, "Open the existing local preview tab first");
const ws = new WebSocket(localDebuggerEndpoint(target.webSocketDebuggerUrl));
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let sequence = 0;
const requests = new Map(), held = [], results = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.method === "Fetch.requestPaused") { held.push(m.params); return; }
  const pending = requests.get(m.id);
  if (!pending) return;
  requests.delete(m.id); clearTimeout(pending.timer);
  m.error ? pending.reject(Error(m.error.message)) : pending.resolve(m.result);
};
const call = (method, params = {}) => {
  const id = ++sequence;
  const value = new Promise((resolve, reject) => requests.set(id, { resolve, reject,
    timer: setTimeout(() => { requests.delete(id); reject(Error("CDP timeout: " + method)); }, 20000) }));
  ws.send(JSON.stringify({ id, method, params })); return value;
};
const evaluate = async expression => {
  const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error("Browser evaluation failed");
  return r.result.value;
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async expression => {
  for (let n = 0; n < 450; n++) {
    if (await evaluate(expression)) return;
    await pause(100);
  }
  throw Error("Browser state did not settle: " + expression);
};
const nextRequest = async () => {
  for (let n = 0; n < 100; n++) { if (held.length) return held.shift(); await pause(100); }
  throw Error("Missing expected feed request");
};
const reply = async (request, value, code = 200) => {
  try {
    await call("Fetch.fulfillRequest", {
      requestId: request.requestId, responseCode: code,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Cache-Control", value: "private, no-store" }],
      body: Buffer.from(JSON.stringify(value)).toString("base64"),
    });
  } catch (error) {
    // Development Strict Mode cancels its first effect. The live replacement
    // must receive the controlled response, never fall through to real data.
    if (!String(error.message).includes("Invalid InterceptionId")) throw error;
    await call("Fetch.fulfillRequest", {
      requestId: (await nextRequest()).requestId, responseCode: code,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(value)).toString("base64"),
    });
  }
};
const check = (name, pass) => { assert.ok(pass, name); results.push(name); console.log("PASS " + name); };
const click = async (selector, index = 0) => {
  const point = await evaluate(`(()=>{const r=document.querySelectorAll(${JSON.stringify(selector)})[${index}].getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await call("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 });
};
const output = await mkdtemp(join(tmpdir(), "yucer-today-lifecycle-"));
let restored = false;
try {
  await call("Page.enable"); await call("Runtime.enable"); await call("Page.bringToFront");
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  if (await evaluate("location.pathname") !== "/copilot/today") await call("Page.navigate", { url: base + "/copilot/today" });
  await until("!!document.querySelector('[data-judgement-card]') && document.querySelector('[data-xiaoyu-topics]').getAttribute('aria-busy')==='false'");
  const feed = await evaluate("fetch('/api/copilot/topics',{cache:'no-store'}).then(r=>r.json())");
  const previous = structuredClone(feed), current = structuredClone(feed);
  previous.pendingUpdate = true; previous.judgements[0].finding.claim = "QA previous result";
  current.pendingUpdate = false; current.judgements[0].finding.claim = "QA updated result";
  await call("Fetch.enable", { patterns: [{ urlPattern: base + "/api/copilot/topics*", requestStage: "Request" }] });
  await call("Page.reload");
  const initial = await nextRequest();
  await until("!!document.querySelector('[data-daily-summary]')");
  check("Initial request asks for the authorized saved report", new URL(initial.request.url).searchParams.get("mode") === "snapshot");
  check("Loading does not claim insufficient data", await evaluate("!document.querySelector('[data-xiaoyu-topics]').textContent.includes('\u8d44\u6599\u4e0d\u8db3') && !document.querySelector('[data-judgement-card]')"));
  await reply(initial, previous);
  const replacement = await nextRequest();
  await until("document.querySelector('[data-judgement-claim]')?.textContent.includes('QA previous result')");
  check("Saved results remain readable while the replacement is pending", await evaluate("!!document.querySelector('[data-judgement-updating]') && document.querySelector('[data-xiaoyu-topics]').getAttribute('aria-busy')==='true'"));
  check("Only the second request asks for the current result", !new URL(replacement.request.url).searchParams.has("mode"));
  await reply(replacement, current);
  await until("document.querySelector('[data-judgement-claim]')?.textContent.includes('QA updated result') && document.querySelector('[data-xiaoyu-topics]').getAttribute('aria-busy')==='false'");
  check("Updated content replaces the old result without clearing the board", true);
  await evaluate("window.__judgementCard = document.querySelector('[data-judgement-card]'); document.querySelector('[data-today-header] button[aria-label=\"\u5237\u65b0\u5224\u65ad\"]').click()");
  const manual = await nextRequest();
  check("Manual checking keeps the existing card and shows lightweight status", await evaluate("window.__judgementCard === document.querySelector('[data-judgement-card]') && !!document.querySelector('[data-judgement-updating]')"));
  await reply(manual, current);
  await until("document.querySelector('[data-xiaoyu-topics]').getAttribute('aria-busy')==='false'");
  check("Unchanged results retain their existing DOM and content", await evaluate("window.__judgementCard === document.querySelector('[data-judgement-card]') && document.querySelector('[data-judgement-claim]').textContent.includes('QA updated result')"));
  await evaluate("for(let n=0;n<5;n++) window.dispatchEvent(new Event('focus'))");
  await pause(250);
  check("Repeated activation inside the cooldown starts no new request", held.length === 0);
  await evaluate("window.dispatchEvent(new Event('yucer:business-updated'))");
  const changed = await nextRequest();
  await evaluate("window.dispatchEvent(new Event('yucer:business-updated'))");
  await reply(changed, current);
  const coalesced = await nextRequest();
  await reply(coalesced, current);
  await until("document.querySelector('[data-xiaoyu-topics]').getAttribute('aria-busy')==='false'");
  check("Changes arriving during a read are coalesced instead of lost", held.length === 0);
  await click("[data-today-scope]");
  await until("document.querySelectorAll('[role=menuitemradio]').length===3");
  await click("[role=menuitemradio]", 1);
  const scoped = await nextRequest();
  check("Scope switching withholds the preceding scope immediately", await evaluate("!document.querySelector('[data-judgement-card]')"));
  check("Scope switching uses its own saved report request", new URL(scoped.request.url).searchParams.get("scope") === "mine");
  const own = { ...current, scope: "mine" };
  await reply(scoped, own);
  await until("!!document.querySelector('[data-judgement-card]') && document.querySelector('[data-xiaoyu-topics]').getAttribute('aria-busy')==='false'");
  check("Business record links are available without expanding evidence", await evaluate("!!document.querySelector('[data-judgement-evidence-link]') && !document.querySelector('[data-judgement-evidence-content]')?.checkVisibility({visibilityProperty:true})"));
  check("Evidence controls retain DS height and horizontal padding", await evaluate("(()=>{const e=document.querySelector('[data-judgement-evidence]'),s=getComputedStyle(e);return e.getBoundingClientRect().height===32 && parseFloat(s.paddingLeft)>0 && parseFloat(s.paddingRight)>0})()"));
  await evaluate("document.querySelector('[data-judgement-evidence]').click()");
  await until("!!document.querySelector('[data-judgement-evidence-content]')");
  check("Evidence shows trigger, kind, date and quotation in a single expansion", await evaluate("(()=>{const e=document.querySelector('[data-judgement-evidence-content]');return e.textContent.includes('\u89e6\u53d1\u6761\u4ef6') && !!e.querySelector('time') && e.textContent.includes('\u672a\u8bb0\u5f55')})()"));
  for (const width of [1440, 1024, 390, 320]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: width < 500 ? 844 : 960, deviceScaleFactor: 1, mobile: false });
    await pause(250);
    check("No horizontal overflow at " + width + "px", await evaluate("document.documentElement.scrollWidth <= innerWidth+1"));
    check("DS title remains 56px at " + width + "px", await evaluate("document.querySelector('[data-today-header]').getBoundingClientRect().height===56"));
  }
  await evaluate("window.dispatchEvent(new Event('yucer:business-updated'))");
  await reply(await nextRequest(), { error: "access_denied" }, 403);
  await until("document.querySelector('[data-xiaoyu-topics]').getAttribute('aria-busy')==='false'");
  check("Access refusal clears cached cards instead of continuing to expose them", await evaluate("!document.querySelector('[data-judgement-card]') && !document.querySelector('[data-judgement-evidence-content]')"));
  await evaluate("window.dispatchEvent(new Event('yucer:business-updated'))");
  await reply(await nextRequest(), { ...own, judgements: [], scanned: 0, dataAvailable: false });
  await until("document.querySelector('[data-xiaoyu-topics]').getAttribute('aria-busy')==='false'");
  check("A completed genuinely empty read can show insufficient data", await evaluate("!document.querySelector('[data-judgement-card]') && document.querySelector('[data-daily-summary] p').textContent.includes('\u8d44\u6599\u4e0d\u8db3')"));
  await call("Fetch.disable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await call("Page.reload");
  await until("!!document.querySelector('[data-judgement-card]') && document.querySelector('[data-xiaoyu-topics]').getAttribute('aria-busy')==='false'");
  restored = true;
  await evaluate("document.querySelector('[data-judgement-evidence]').click()");
  await pause(300);
  const capture = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(join(output, "today-evidence-1440.png"), Buffer.from(capture.data, "base64"));
  await writeFile(join(output, "report.json"), JSON.stringify({ stage: "local-demo", realAcceptance: false, results }, null, 2));
  console.log(JSON.stringify({ passed: results.length, output, results }));
} finally {
  await call("Fetch.disable").catch(() => {});
  if (!restored) await call("Page.reload").catch(() => {});
  for (const item of requests.values()) clearTimeout(item.timer);
  ws.close();
}
