import { taskRequestContext } from "../../context";
import { privateRequest,taskResponse } from "../../http";
import { readPrivateTask,changePrivateTask } from "../../../../../domains/copilot/task-service";
import { textMaterial } from "../../../../../domains/copilot/lib/task-material";
import { errorResponse } from "../../../../../platform/envelope";
import { randomUUID } from "node:crypto";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function POST(request:Request,route:{params:Promise<{taskId:string}>}){
  const denied=privateRequest(request);if(denied)return denied;
  try{
    // Multipart overhead is bounded too; Content-Length alone is not trusted.
    const reader=request.body?.getReader();if(!reader)throw Error();
    let total=0;const chunks:Uint8Array[]=[];
    while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>30000){await reader.cancel();return errorResponse(413,"COPILOT_MATERIAL_TOO_LARGE","material too large");}chunks.push(part.value);}
    const data=await new Response(new Blob(chunks as BlobPart[]),{headers:{"Content-Type":request.headers.get("Content-Type")??""}}).formData();
    const file=data.get("file");if(!(file instanceof File))throw Error();
    const material=textMaterial(file.name,new Uint8Array(await file.arrayBuffer()));
    const access=await taskRequestContext();if(!access)return errorResponse(403,"COPILOT_TASK_ACCESS_DENIED","access refused");
    const id=(await route.params).taskId,current=await readPrivateTask(access.context,id);
    if(!current.ok)return taskResponse(current);
    if(current.value.drafts.filter(d=>d.key.startsWith("material_")&&d.text).length>=3)throw Error();
    return taskResponse(await changePrivateTask(access.context,id,{action:"notes",revision:current.value.task.revision,key:`material_${randomUUID().replaceAll("-","")}`,text:JSON.stringify(material),contractVersion:"private-notes/1"}));
  }catch{return errorResponse(400,"COPILOT_MATERIAL_INVALID","unsupported or invalid material");}
}
