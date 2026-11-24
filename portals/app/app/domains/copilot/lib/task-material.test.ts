import {test} from "node:test";
import assert from "node:assert/strict";
import {textMaterial,readTaskMaterial} from "./task-material";
import {collaborationMarkdown} from "./collaboration-export";
import type {TaskBundle} from "../task-store";
test("attachments accept bounded UTF8 material, preserve evidence digest and reject disguised binary",()=>{
 const bytes=new TextEncoder().encode("name,industry\nExample,GIS");const m=textMaterial("customers.csv",bytes);assert.equal(m.text,"name,industry\nExample,GIS");assert.match(m.digest,/^[a-f0-9]{64}$/);assert.deepEqual(readTaskMaterial(JSON.stringify(m)),m);
 for(const [name,b] of [["x.exe",bytes],["x.txt",new Uint8Array([0,1])],["x.txt",new Uint8Array(25000)],["x.json",bytes]] as const)assert.throws(()=>textMaterial(name,b));
 assert.equal(readTaskMaterial("unparsed"),null);
});
test("collaboration export excludes unsent input and fences executable-looking supplied content",()=>{
 const bundle={task:{id:"task",goal:"Review",status:"active"},drafts:[{key:"conversation-input",text:"UNSENT"},{key:"market",text:"```\n<script>untrusted</script>"}],messages:[{role:"assistant",content:"Result"}]} as TaskBundle;
 const text=collaborationMarkdown(bundle,[]);assert.ok(!text.includes("UNSENT"));assert.ok(text.includes("````text"));assert.ok(text.includes("## Conversation"));assert.ok(text.includes("## Verified execution receipts"));
});
