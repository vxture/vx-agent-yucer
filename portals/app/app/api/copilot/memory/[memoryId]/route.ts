import { memoryHttp } from "../handler";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function PATCH(request:Request,route:{params:Promise<{memoryId:string}>}) {return memoryHttp(request,"change",(await route.params).memoryId);}
