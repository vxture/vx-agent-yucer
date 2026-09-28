import { notFound, redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { resolveNavigation } from "../../lib/navigation";
import { lockedPage } from "../../components/locked-page";

// /upgrade/<module> - where a locked launcher row goes (owner 2026-09-28):
// the upgrade template in the centre pane, the board and the deck unchanged.
// A module the member can already open goes to the module; one that is not a
// tier gap (unknown, or refused on permission - upgrading would not open it)
// is not found.

export const dynamic = "force-dynamic";

export default async function UpgradeRoute({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const session = await resolveAppSession();
  if (!session) return null;
  const page = lockedPage(session, module);
  if (page) return page;
  const open = resolveNavigation(session.authz, session.entitlement).find((e) => e.key === module && e.state === "visible");
  if (open) redirect(open.href);
  notFound();
}
