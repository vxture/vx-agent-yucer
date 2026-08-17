import { EmptyState } from "@vxture/design-ui";
import { resolveAppSession } from "./lib/session";
import { HOME_TEXT, SHELL_TEXT } from "./lib/messages";
import { can } from "../authz/decide";
import { getFieldStore } from "../domains/shared/registry";
import { judgementFeed } from "../domains/judgement/service";
import { JudgementWorkspace } from "./components/judgement-workspace";
import { recordFollowUp } from "./account/field-actions";

// The home screen.
//
// It used to be an eight-domain nav beside a list of accounts. A directory
// answers "which customers do I have", and a salesperson opening this on a
// Monday already knows that - what they do not know is which deal went wrong
// over the weekend and why. So the first screen is what the evidence adds up
// to, and the object lists are reachable but are the archive rather than the
// workspace.
//
// The agent is not in the navigation. It was the ninth menu item, which said it
// was optional; it is the product. The stream IS its output, and the column on
// the right is it, present, saying what it is currently looking at.

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope: rawScope } = await searchParams;
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  // Only a scope the reader actually asked for is pinned. Anything else stays
  // undefined so the service can derive it from what this member owns.
  const requested = rawScope === "all" ? "all" : rawScope === "mine" ? "mine" : undefined;
  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const feed = await judgementFeed(ctx, { scope: requested });
  if (!feed.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={feed.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  // Whether anything has been recorded at all. The empty state has to tell
  // "nothing is wrong" apart from "nothing has been recorded, so nothing can be
  // concluded" - they look identical on a screen and mean opposite things.
  const recent = await getFieldStore().listInteractions(session.workspaceId, { limit: 1 });
  const canRecord = can(session.authz, session.entitlement, "account.upsert", "ui").allowed;

  return (
    <JudgementWorkspace
      judgements={feed.value.judgements}
      counts={feed.value.counts}
      scanned={feed.value.scanned}
      scope={feed.value.scope}
      hasAnyRecord={recent.length > 0}
      canRecord={canRecord}
      onRecord={async (text: string) => {
        "use server";
        // No account id: an unanchored note is still worth keeping, and
        // demanding one at capture time is the friction the kill criterion is
        // measuring.
        return recordFollowUp("", {
          channel: "other",
          occurredAt: new Date().toISOString(),
          rawNote: text,
        });
      }}
    />
  );
}
