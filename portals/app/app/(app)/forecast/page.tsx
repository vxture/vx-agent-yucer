import { redirect } from "next/navigation";
import { resolveAppSession } from "../lib/session";
import { defaultPeriod } from "../lib/periods";
import { legacyForecastHref, type AttainmentQuery } from "../lib/attainment-workspace";

export const dynamic = "force-dynamic";

// Existing bookmarks retain their period and scope in the review workflow.
export default async function ForecastPage({ searchParams }: { searchParams: Promise<AttainmentQuery> }) {
  const session = await resolveAppSession();
  if (!session) return null;
  redirect(legacyForecastHref(await searchParams, session.user.sub, defaultPeriod(), session.scope));
}
