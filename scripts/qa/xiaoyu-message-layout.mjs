import assert from 'node:assert/strict';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localDebuggerEndpoint } from './local-debugger.mjs';

// Local, synthetic GET responses only. No model call or business writes.
const base = 'http://localhost:4060', debug = 'http://127.0.0.1:9334';
const status = await (await fetch(base + '/api/status')).json();
assert.equal(status.c2.deployStage, 'dev');
assert.equal(status.data.database.configured, false);
assert.equal(status.planes.atlas.configured, false);
const output = await mkdtemp(join(tmpdir(), 'yucer-message-layout-'));
console.log('Evidence directory:', output);
class CDP {
  constructor(url) {
    this.ws = new WebSocket(localDebuggerEndpoint(url)); this.sequence = 0; this.pending = new Map(); this.listeners = new Set();
    this.ws.onmessage = event => {
      const message = JSON.parse(event.data), request = this.pending.get(message.id);
      if (!request) { for (const listener of this.listeners) void listener(message); return; }
      clearTimeout(request.timer); this.pending.delete(message.id);
      message.error ? request.reject(Error(message.error.message)) : request.resolve(message.result);
    };
  }
  async send(method, params = {}) {
    if (this.ws.readyState !== 1) await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    const id = ++this.sequence;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, timer: setTimeout(() => reject(Error('CDP timeout: ' + method)), 45000) }));
    this.ws.send(JSON.stringify({ id, method, params })); return result;
  }
  close() { for (const request of this.pending.values()) clearTimeout(request.timer); this.ws.close(); }
}
const version = await (await fetch(debug + '/json/version')).json(), browser = new CDP(version.webSocketDebuggerUrl);
const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
const tabs = await (await fetch(debug + '/json/list')).json(), page = new CDP(tabs.find(t => t.id === targetId).webSocketDebuggerUrl);
const evaluate = async expression => {
  const result = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression) { for (let i = 0; i < 160; i++) { if (await evaluate(expression).catch(() => false)) return; await pause(200); } throw Error('Timeout: ' + expression); }
const id = crypto.randomUUID(), now = new Date().toISOString();
const task = { id, workspaceId: crypto.randomUUID(), actorSub: 'local-layout-fixture', sessionId: crypto.randomUUID(), goal: 'Message layout preview', status: 'active', ruleVersion: 'xiaoyu/1', revision: 1, page: null, createdAt: now, updatedAt: now };
const text = 'Review the customer information, then confirm the next step.\n\n| Customer | Website | Credit code |\n| --- | --- | --- |\n| Example company | https://example.com | Pending verification |\n\nThe table uses the complete reading width.\n\n```text\nStructured output remains inside the reading area.\n```';
const bundle = { task, references: [], drafts: [], checkpoint: null, messages: [{ id: crypto.randomUUID(), seq: 1, role: 'assistant', content: text, createdAt: now }], turns: [], legacy: [], currentRuleVersion: 'xiaoyu/1', ruleChanged: false, recovery: { interruptedRequests: [] } };
let fixtureError;
page.listeners.add(async message => {
  if (message.method !== 'Fetch.requestPaused') return;
  try {
    assert.equal(message.params.request.method, 'GET');
    const path = new URL(message.params.request.url).pathname;
    const value = path.endsWith('/execution') ? { canPrepare: false, steps: [], receipts: [], grants: [] } : path === '/api/copilot/tasks' ? [task] : bundle;
    await page.send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(value)).toString('base64') });
  } catch (error) { fixtureError = error; await page.send('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'Aborted' }); }
});
const results = [];
try {
  await page.send('Page.enable'); await page.send('Runtime.enable');
  await page.send('Fetch.enable', { patterns: [{ urlPattern: base + '/api/copilot/tasks*', requestStage: 'Request' }] });
  await page.send('Page.navigate', { url: base + '/copilot?task=' + id });
  await until("!!document.querySelector('[data-xiaoyu-conversation] [data-role=assistant] table')");
  for (const width of [1440, 1024, 390, 320]) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false }); await pause(500);
    const geometry = await evaluate(`(()=>{const c=document.querySelector('[data-xiaoyu-conversation]'),r=c.querySelector('[data-role=assistant]'),a=r.firstElementChild,p=r.querySelector('[data-xiaoyu-rich-content] > p'),blocks=[...r.querySelectorAll('[data-xiaoyu-wide-block]')],box=e=>e.getBoundingClientRect();return {top:Math.abs(box(a).top-box(p).top),names:r.querySelectorAll('.text-label').length,left:box(r).left,right:box(r).right,blocks:blocks.map(e=>({left:box(e).left,right:box(e).right})),width:innerWidth,documentWidth:document.documentElement.scrollWidth,readingWidth:box(r).width}})()`);
    assert.ok(geometry.top < 1, 'Reply aligns with the icon top at ' + width);
    assert.equal(geometry.names, 0, 'No repeated agent name at ' + width);
    assert.equal(geometry.blocks.length, 2);
    assert.ok(geometry.blocks.every(b => Math.abs(b.left - geometry.left) < 1 && Math.abs(b.right - geometry.right) < 1), 'Structured blocks use the entire reading width at ' + width);
    assert.ok(geometry.documentWidth <= width + 1, 'No horizontal page overflow at ' + width);
    results.push({ width, ...geometry });
  }
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }); await pause(500);
  const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(output, 'message-layout.png'), Buffer.from(screenshot.data, 'base64'));
  await writeFile(join(output, 'report.json'), JSON.stringify({ stage: 'local-layout-fixture', results }, null, 2));
  if (fixtureError) throw fixtureError;
  console.log(JSON.stringify({ passed: results.length * 5, results }));
} finally {
  await page.send('Fetch.disable').catch(() => {});
  await browser.send('Target.closeTarget', { targetId }).catch(() => {});
  page.close(); browser.close();
}
