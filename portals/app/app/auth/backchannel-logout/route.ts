import { getOidcConfig } from "../lib/config";
import { backchannelResponse } from "../lib/backchannel";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return backchannelResponse(req, getOidcConfig());
}
