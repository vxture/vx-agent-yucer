import { Banner } from "@vxture/design-ui";
import { can } from "../../../authz/decide";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { XiaoyuMemory } from "../../components/xiaoyu-memory";
import { PageCrumbs } from "../../components/page-crumbs";
export const dynamic = "force-dynamic";
export default async function MemoryPage() {
  const session = await resolveAppSession();
  if (!session) return null;
  if (!can(session.authz, session.entitlement, "copilot.ask", "ui").allowed) {
    const t = await getMessages();
    return <Banner tone="warning" title={t.XIAOYU_TEXT.accessChanged} />;
  }
  const t = await getMessages();
  return (
    <>
      <PageCrumbs
        trail={[{ label: t.XIAOYU_TEXT.title, href: "/copilot" }]}
        current={t.XIAOYU_MEMORY.title}
      />
      <XiaoyuMemory />
    </>
  );
}
