import { knowledgeHttp } from "../handler";
export const POST = (r: Request) => knowledgeHttp(r, "preview");
