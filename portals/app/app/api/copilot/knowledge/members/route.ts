import { knowledgeHttp } from "../handler";
export const dynamic = "force-dynamic";
export const GET = (r: Request) => knowledgeHttp(r, "members");
