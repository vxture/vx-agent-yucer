import { notFound } from "next/navigation";
import { ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../../../../lib/session";
import { getAccountDetail } from "../../../../../domains/account/service";
import { listInteractions } from "../../../../../domains/account/field-service";
import { getFieldStore } from "../../../../../domains/shared/registry";
import { InteractionTimeline } from "../../../../components/interaction-timeline";

export const dynamic = "force-dynamic";

export default async function EvidencePage({ params }: { params: Promise<{ id: string; evidenceId: string }> }) {
  const { id, evidenceId } = await params;
  const session = await resolveAppSession();
  if (!session) return null;
  const ctx = { workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement };
  const account = await getAccountDetail({ ...ctx, store: session.stores.account() }, id);
  if (!account.ok) notFound();
  const records = await listInteractions({ ...ctx, store: getFieldStore() }, { accountId: id });
  if (!records.ok) notFound();
  const evidence = records.value.find((record) => record.id === evidenceId);
  if (!evidence) notFound();
  // Verbatim evidence, scoped again on every visit; no model-generated content.
  return <ViewLayout><InteractionTimeline items={[evidence]} hideDescription /></ViewLayout>;
}
