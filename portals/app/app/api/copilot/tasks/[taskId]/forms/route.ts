import { taskRequestContext } from "../../context";
import { formReviewHttp } from "./handler";
export const dynamic="force-dynamic";
export const runtime="nodejs";
type Route={params:Promise<{taskId:string}>};
export async function GET(_request:Request,route:Route):Promise<Response>{
  return formReviewHttp((await route.params).taskId,taskRequestContext);
}
