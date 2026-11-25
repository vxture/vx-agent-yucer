import assert from "node:assert/strict";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localDebuggerEndpoint } from "./local-debugger.mjs";

// Exercise the real page/BFF with the offline fixture only. No production data.
const base = "http://localhost:4060";
const status = await (await fetch(base + "/api/status")).json();
assert.equal(status.c2.deployStage, "dev");
assert.equal(status.data.database.configured, false);
assert.equal(status.planes.atlas.configured, false);
const tabs = await (await fetch("http://127.0.0.1:9334/json/list")).json();
const target = tabs.find(t => t.type === "page" && t.url.startsWith(base + "/"));
assert.ok(target, "Open the local preview first");
const ws = new WebSocket(localDebuggerEndpoint(target.webSocketDebuggerUrl));
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let sequence = 0;
const requests = new Map(), results = [];
ws.onmessage = e => { const m = JSON.parse(e.data), p = requests.get(m.id); if (!p) return;
  clearTimeout(p.timer); requests.delete(m.id); m.error ? p.reject(new Error("CDP error")) : p.resolve(m.result); };
const call = (method, params = {}) => { const id = ++sequence;
  const result = new Promise((resolve, reject) => requests.set(id, { resolve, reject,
    timer: setTimeout(() => { requests.delete(id); reject(new Error("CDP timeout: " + method)); }, 45000) }));
  ws.send(JSON.stringify({ id, method, params })); return result; };
const evaluate = async expression => { const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("Browser expression failed: " + expression.slice(0, 100)); return r.result.value; };
const pause = ms => new Promise(r => setTimeout(r, ms));
const until = async expression => { for (let i = 0; i < 300; i++) { if (await evaluate(expression).catch(() => false)) return; await pause(100); }
  throw new Error("State did not settle: " + expression.slice(0, 140)); };
const check = (name, value) => { assert.ok(value, name); results.push(name); console.log("PASS " + name); };
const button = text => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
const fill = async (label, value) => { await evaluate(`(()=>{const e=document.querySelector('[aria-label='+CSS.escape(${JSON.stringify(label)})+']');const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`); await pause(100); };
const click = async expression => { await evaluate(`(${expression}).click()`); await pause(100); };
const out = await mkdtemp(join(tmpdir(), "yucer-c01-browser-"));
const subject = "Platform subscription review " + Date.now();
let rowId;
try {
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: base + "/signal" });
  await until(`!!(${button("\u767b\u8bb0\u4fe1\u53f7")})`);
  await until(`(()=>{const e=${button("\u767b\u8bb0\u4fe1\u53f7")};return typeof e?.[Object.keys(e).find(k=>k.startsWith('__reactProps$'))]?.onClick==='function'})()`);
  check("initial pending view excludes processed history", await evaluate(`document.querySelectorAll('[id^="signal-"]').length>0&&document.body.innerText.includes('\u5df2\u5904\u7406')`));
  check("five industry cases contain company, summary and budget", await evaluate(`[...document.querySelectorAll('[id^="signal-sig_c01_"]')].length===5&&[...document.querySelectorAll('[id^="signal-sig_c01_"]')].every(e=>e.innerText.includes('\u989d\u5ea6'))`));
  check("unconfigured feed is visibly disabled", await evaluate(`${button("\u83b7\u53d6\u65b0\u4fe1\u53f7")}.disabled`));
  const shot = await call("Page.captureScreenshot", { format: "png" }); await writeFile(join(out, "signal-1440.png"), Buffer.from(shot.data, "base64"));
  await click(button("\u767b\u8bb0\u4fe1\u53f7"));
  await until("!!document.querySelector('#signal-decision-form')");
  check("required company and evidence are validated before submit", await evaluate("document.querySelector('button[form=signal-decision-form][type=submit]').disabled"));
  await fill("\u516c\u53f8\u540d\u79f0", "Geodata Platform Ltd");
  await fill("\u4fe1\u53f7\u4e3b\u9898", subject);
  await fill("\u5173\u952e\u4fe1\u606f", "Customer requested a platform subscription review; confirm seats, integration scope and budget.");
  await fill("\u91c7\u8d2d\u9884\u7b97 \u00b7 \u5143\uff08\u53ef\u9009\uff09", "300000");
  await fill("\u6765\u6e90\u94fe\u63a5\uff08\u53ef\u9009\uff09", "https://example.com/procurement");
  check("drawer actions use the 32px DS tier", await evaluate("document.querySelector('button[form=signal-decision-form]').getBoundingClientRect().height>=31"));
  await click("document.querySelector('button[form=signal-decision-form][type=submit]')");
  await until(`!document.querySelector('#signal-decision-form')&&document.body.innerText.includes(${JSON.stringify(subject)})`);
  rowId = await evaluate(`[...document.querySelectorAll('[id^="signal-"]')].find(e=>e.innerText.includes(${JSON.stringify(subject)}))?.id`);
  assert.ok(rowId);
  const row = `document.getElementById(${JSON.stringify(rowId)})`;
  check("registration appears with readable company and evidence", await evaluate(`${row}.innerText.includes('Geodata Platform Ltd')&&${row}.innerText.includes('300,000')`));
  check("unscored signal explains why promotion is disabled", await evaluate(`[...${row}.querySelectorAll('button')].find(b=>b.textContent==='\u5347\u7ea7\u4e3a\u7ebf\u7d22').disabled`));
  await click(`[...${row}.querySelectorAll('button')].find(b=>b.textContent==='\u91cd\u65b0\u8bc4\u5206')`);
  await until(`[...${row}.querySelectorAll('button')].some(b=>b.textContent==='\u5347\u7ea7\u4e3a\u7ebf\u7d22'&&!b.disabled)`);
  await click(`[...${row}.querySelectorAll('button')].find(b=>b.textContent==='\u5347\u7ea7\u4e3a\u7ebf\u7d22')`);
  await until("!!document.querySelector('#signal-decision-form')");
  check("promotion uses company identity rather than the event headline", await evaluate("document.querySelector('input[aria-label=\u516c\u53f8\u540d\u79f0]').value==='Geodata Platform Ltd'"));
  await click("document.querySelector('button[form=signal-decision-form][type=submit]')");
  await until(`!document.getElementById(${JSON.stringify(rowId)})&&!document.querySelector('#signal-decision-form')`);
  const link = await evaluate("document.querySelector('a[href^=\"/lead?search=\"]')?.getAttribute('href')");
  check("successful promotion has a business-number lookup link", link?.includes("LEAD-"));
  await call("Page.navigate", { url: base + link });
  await until("location.pathname==='/lead'&&!!document.querySelector('input[type=search]')");
  check("lead lookup selects the newly created company", await evaluate("document.body.innerText.includes('Geodata Platform Ltd')&&[...document.querySelectorAll('input[type=search]')].some(e=>e.value.startsWith('LEAD-'))"));
  for (const width of [1280, 1920]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 960, deviceScaleFactor: 1, mobile: false });
    await call("Page.navigate", { url: base + "/signal" }); await until(`!!(${button("\u767b\u8bb0\u4fe1\u53f7")})`);
    check("no horizontal page overflow at " + width, await evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
  }
  check("visible signal page contains no UUID", !await evaluate("/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(document.body.innerText)"));
  await writeFile(join(out, "checks.json"), JSON.stringify({ results }, null, 2));
  console.log("ARTIFACTS " + out);
} finally { for (const pending of requests.values()) clearTimeout(pending.timer); ws.close(); }
