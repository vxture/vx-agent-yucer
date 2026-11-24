import type { TaskBundle } from "../task-store";
/** Untrusted text is fenced with a delimiter longer than any supplied fence. */
function block(text:string){const length=Math.max(3,...[...text.matchAll(/`+/g)].map(m=>m[0].length+1));const fence="`".repeat(length);return `${fence}text\n${text}\n${fence}`;}
export function collaborationMarkdown(bundle:TaskBundle,receipts:unknown){
  return ["# Yucer collaboration",block(bundle.task.goal),`Task: ${bundle.task.id}`,`Status: ${bundle.task.status}`,"## Results and private drafts",...bundle.drafts.filter(d=>d.key!=="conversation-input" && d.key!=="selected-skill" && d.text).flatMap(d=>[block(d.key),block(d.text)]),"## Verified execution receipts",block(JSON.stringify(receipts,null,2)),"## Conversation",...bundle.messages.flatMap(m=>[`### ${m.role}`,block(m.content)])].join("\n\n")+"\n";
}
