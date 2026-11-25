import { readPrivateTask,type TaskContext } from "../../../../../domains/copilot/task-service";
import type { AppSession } from "../../../../../(app)/lib/session";
import { errorResponse } from "../../../../../platform/envelope";
import { taskResponse } from "../../http";
import { formReviewCatalog } from "../../form-review";
type Access={context:TaskContext;session:AppSession};
export async function formReviewHttp(taskId:string,resolve:()=>Promise<Access|null>,load=formReviewCatalog):Promise<Response>{
  try{
    const access=await resolve();
    if(!access)return errorResponse(403,"COPILOT_TASK_ACCESS_DENIED","task access refused");
    const result=await readPrivateTask(access.context,taskId);
    if(!result.ok)return taskResponse(result);
    const catalogs=await load(access.session,result.value);
    const current=await readPrivateTask(access.context,taskId);
    if(!current.ok)return taskResponse(current);
    if(current.value.task.revision!==result.value.task.revision)return errorResponse(409,"COPILOT_TASK_CONFLICT","task changed");
    return Response.json({revision:result.value.task.revision,catalogs},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return errorResponse(503,"COPILOT_TASK_UNAVAILABLE","form review unavailable");}
}
