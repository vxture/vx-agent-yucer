import { memoryHttp } from "./handler";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(request:Request) {return memoryHttp(request,"list");}
export async function POST(request:Request) {return memoryHttp(request,"create");}
