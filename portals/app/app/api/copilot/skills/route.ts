import { taskRequestContext } from "../tasks/context";
import { tenantIdOf } from "../../../(app)/lib/session";
import { RunosClient } from "../../../agent/runos/client";
import { errorResponse } from "../../../platform/envelope";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  try{
    const access=await taskRequestContext();if(!access)return errorResponse(403,"COPILOT_TASK_ACCESS_DENIED","access refused");
    const tenantId=await tenantIdOf(access.session);if(!tenantId)throw Error();
    const params=new URL(request.url).searchParams,query=params.get("q")?.slice(0,200)||"*",cursor=query==="*"?params.get("cursor")?.slice(0,2000):undefined;
    const result=await new RunosClient().discoverPage({query,limit:50,filter:{primitive_type:"skill"},...(cursor?{cursor}:{})},{workspaceId:access.session.workspaceId,tenantId,subjectToken:(await access.session.accessToken())??undefined,taskId:"skill-catalog"});
    const live=await taskRequestContext();if(!live || live.session.workspaceId!==access.session.workspaceId || live.session.user.sub!==access.session.user.sub)throw Error();
    return Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch{return errorResponse(503,"COPILOT_SKILLS_UNAVAILABLE","skill catalog unavailable");}
}
