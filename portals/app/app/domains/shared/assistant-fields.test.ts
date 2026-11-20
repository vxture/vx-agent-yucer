import test from "node:test";
import assert from "node:assert/strict";
import { readAssistantFields } from "./assistant-fields";
test("structured drafts decode plain JSON and optional fences with linear whitespace handling", () => {
  const json = '{"fields":{"name":"Draft"},"message":" Review ","clearFields":["summary"]}';
  for (const text of [json, `  ${json}  `, `\n\x60\x60\x60json\n${json}\n\x60\x60\x60\n`, `\x60\x60\x60\n${json}\n\x60\x60\x60`]) {
    assert.deepEqual(readAssistantFields(text), { fields: { name: "Draft" }, message: "Review", clearFields: ["summary"] });
  }
  for (const text of ['null', '[]', '{}', '{"fields":[]}', 'I filled the form', ' '.repeat(100000) + '```']) assert.equal(readAssistantFields(text), null);
  assert.deepEqual(readAssistantFields('{"fields":{},"message":false,"clearFields":"name"}'), { fields: {}, message: "", clearFields: [] });
  assert.equal(readAssistantFields(JSON.stringify({ fields: {}, message: 'x'.repeat(1600) }))?.message.length, 1500);
});
