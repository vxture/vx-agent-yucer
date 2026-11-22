import { knowledgeHttp } from "../handler";
export const PATCH = async (
  r: Request,
  c: { params: Promise<{ knowledgeId: string }> },
) => knowledgeHttp(r, "change", (await c.params).knowledgeId);
