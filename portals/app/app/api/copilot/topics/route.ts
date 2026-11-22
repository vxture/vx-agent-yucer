import { topicsHttp } from "./handler";
import { topicRequestContext } from "../tasks/context";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = (request: Request) =>
  topicsHttp(request, "list", "", topicRequestContext);
export const POST = (request: Request) =>
  topicsHttp(request, "open", "", topicRequestContext);
