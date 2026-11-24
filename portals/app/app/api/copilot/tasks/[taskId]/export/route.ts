import { taskRequestContext } from "../../context";
import { taskResponse } from "../../http";
import { readPrivateTask } from "../../../../../domains/copilot/task-service";
import { collaborationMarkdown } from "../../../../../domains/copilot/lib/collaboration-export";
import { errorResponse } from "../../../../../platform/envelope";
export const dynamic="force-dynamic";
export async function GET(_request:Request,route:{params:Promise<{taskId:string}>}){
  try{
    const access=await taskRequestContext();if(!access)return errorResponse(403,"COPILOT_TASK_ACCESS_DENIED","access refused");
    const id=(await route.params).taskId,result=await readPrivateTask(access.context,id);
    if(!result.ok)return taskResponse(result);
    const receipts=access.context.execution ? await access.context.execution.receipts(id) : [];
    const content=collaborationMarkdown(result.value,receipts);
    const live=await readPrivateTask(access.context,id);if(!live.ok)return taskResponse(live);
    if(live.value.task.revision!==result.value.task.revision)return errorResponse(409,"COPILOT_TASK_CHANGED","task changed");
    return new Response(content,{headers:{"Content-Type":"text/markdown; charset=utf-8","Content-Disposition":`attachment; filename="yucer-collaboration-${id}.md"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }catch{return errorResponse(503,"COPILOT_EXPORT_UNAVAILABLE","export unavailable");}
}
