import { memoryHttp } from "../../../memory/handler";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function POST(request:Request,route:{params:Promise<{taskId:string}>}) {return memoryHttp(request,"capture",(await route.params).taskId);}
