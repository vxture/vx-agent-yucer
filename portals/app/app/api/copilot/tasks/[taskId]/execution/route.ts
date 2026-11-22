import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { getOidcConfig } from "../../../../../auth/lib/config";
import { taskRequestContext } from "../../context";
import { writeBusinessForm } from "../../../../../domains/copilot/execution-domain";
import { executionHttp } from "./handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Route = { params: Promise<{ taskId: string }> };
async function context() {
  const access = await taskRequestContext();
  const cookie = (await cookies()).get(getOidcConfig().cookieName)?.value;
  if (!access || !cookie) return null;
  return {
    task: access.context,
    sessionHash: createHash("sha256").update(cookie).digest("hex"),
    write: async (
      ...args: Parameters<typeof writeBusinessForm> extends [
        unknown,
        ...infer Rest,
      ]
        ? Rest
        : never
    ) => {
      const fresh = await taskRequestContext();
      if (
        !fresh ||
        fresh.session.workspaceId !== access.session.workspaceId ||
        fresh.session.user.sub !== access.session.user.sub
      )
        throw Error("access_changed");
      return writeBusinessForm(fresh.session, ...args);
    },
  };
}
export async function GET(request: Request, route: Route) {
  return executionHttp(request, (await route.params).taskId, context);
}
export async function POST(request: Request, route: Route) {
  return executionHttp(request, (await route.params).taskId, context);
}
