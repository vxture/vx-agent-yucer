import { knowledgeHttp } from "./handler";
export const dynamic = "force-dynamic";
export const GET = (r: Request) => knowledgeHttp(r, "list");
export const POST = (r: Request) => knowledgeHttp(r, "create");
