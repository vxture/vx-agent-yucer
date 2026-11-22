import { topicsHttp } from "../handler";
import { topicRequestContext } from "../../tasks/context";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  route: { params: Promise<{ topicId: string }> },
) {
  return topicsHttp(
    request,
    "change",
    (await route.params).topicId,
    topicRequestContext,
  );
}
