import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localDebuggerEndpoint } from './local-debugger.mjs';

test('CDP discovery permits only the fixed loopback service and target grammar', () => {
  for (const kind of ['page', 'browser']) {
    const endpoint = `ws://127.0.0.1:9334/devtools/${kind}/ABC-123`;
    assert.equal(localDebuggerEndpoint(endpoint), endpoint);
  }
  for (const endpoint of [
    'ws://example.org:9334/devtools/page/ABC',
    'wss://127.0.0.1:9334/devtools/page/ABC',
    'ws://127.0.0.1:9335/devtools/page/ABC',
    'ws://user:pass@127.0.0.1:9334/devtools/page/ABC',
    'ws://127.0.0.1:9334/devtools/page/ABC?redirect=other',
    'ws://127.0.0.1:9334/devtools/page/ABC#other',
    'ws://127.0.0.1:9334/devtools/page/ABC/extra',
    'ws://127.0.0.1:9334/devtools/page/%2fother',
    'ws://127.0.0.1:9334/other/ABC',
    'invalid',
  ]) assert.throws(() => localDebuggerEndpoint(endpoint));
});
