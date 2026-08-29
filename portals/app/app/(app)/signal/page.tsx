import { Card, EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
// A SERVER component, so the dictionary is awaited rather than hooked. The
// locale comes from the request; next/headers caches it, so several server
// components asking cost one resolution.
import { getMessages } from "../lib/i18n/server";
import { getSignalStore } from "../../domains/shared/registry";
import { listLeads, listSignals } from "../../domains/signal/service";
import { can } from "../../authz/decide";
import { SignalQueue, type QueueSignal } from "../components/signal-queue";
import { scoreSignal } from "../../domains/signal/lib/scoring";
import { LeadList } from "../components/lead-list";
import { actOnSignal } from "./actions";
import { actOnLead } from "./lead-actions";
import { TONE_INK } from "../lib/view-model";
import { loadFailureText } from "../lib/load-failure";

// D5 signal inbox.
//
// `canTriage` and `canRescore` only decide which buttons render. Every action
// re-runs both gates on the server, because a disabled button is a courtesy and
// not a control.

export const dynamic = "force-dynamic";

export default async function SignalPage() {
  const { SIGNAL_TEXT, SHELL_TEXT, LOAD_ERROR } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getSignalStore(),
  };

  const [result, leads] = await Promise.all([
    listSignals(ctx, { limit: 100 }),
    listLeads(ctx, { limit: 100 }),
  ]);

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(result.violations, LOAD_ERROR)}
      />
    );
  }

  // The breakdown, recomputed from the SAME inputs the stored score came from,
  // by the same pure rule. Recomputing rather than storing means the shown
  // arithmetic can never drift from the definition - and when today's answer
  // differs from the stored one, the signal has decayed since it was scored,
  // which is worth saying rather than silently showing a stale number.
  const now = new Date();
  const enriched: QueueSignal[] = result.value.map((r) => {
    const b = scoreSignal({
      signalType: r.signalType,
      detectedAt: r.detectedAt,
      accountId: r.accountId,
      now,
    });
    return {
      record: r,
      recomputed: b.ok ? b.value.score : null,
      baseWeight: b.ok ? b.value.baseWeight : 0,
      decay: b.ok ? b.value.decayMultiplier : 0,
      bonus: b.ok ? b.value.matchBonus : 0,
      ageDays: b.ok ? b.value.ageDays : 0,
    };
  });

  // Grouped by line of enquiry, highest score first inside each group.
  //
  // The untargeted group is SHOWN, not hidden: aim decides what to read first,
  // never what is allowed in (ADR-016). Hiding it would quietly turn a reading
  // order into a filter.
  const byScore = (a: QueueSignal, b: QueueSignal) =>
    (b.record.score ?? 0) - (a.record.score ?? 0);
  const groups = [
    {
      key: "named",
      title: SIGNAL_TEXT.groupNamed,
      why: SIGNAL_TEXT.groupNamedWhy,
      items: enriched
        .filter((s) => s.record.targeting === "named_account")
        .sort(byScore),
    },
    {
      key: "domain",
      title: SIGNAL_TEXT.groupDomain,
      why: SIGNAL_TEXT.groupDomainWhy,
      items: enriched
        .filter((s) => s.record.targeting === "product_domain")
        .sort(byScore),
    },
    {
      key: "none",
      title: SIGNAL_TEXT.groupNone,
      why: SIGNAL_TEXT.groupNoneWhy,
      items: enriched
        .filter(
          (s) =>
            s.record.targeting !== "named_account" &&
            s.record.targeting !== "product_domain",
        )
        .sort(byScore),
    },
  ];
  const namedCount = groups[0]!.items.length;
  // Said once. Decay is continuous, so on a dataset of any age most rows are
  // stale; flagging each one turns a true statement into wallpaper.
  const staleCount = enriched.filter(
    (s) =>
      s.recomputed !== null &&
      s.record.score !== null &&
      Math.abs(s.recomputed - s.record.score) >= 5,
  ).length;

  return (
    <ViewLayout>
      {/* Opens with what came in, the same way the home screen does. */}
      <Card className="p-lg">
        {/* ONE child, so Card's gap-xl never fires. Card is
            `flex flex-col gap-xl`; with a heading and two captions as siblings
            it put 32px between a title and its own subtitle. */}
        <div className="flex flex-col gap-2xs">
          <h1 className="text-heading-2 text-foreground">
            {enriched.length > 0
              ? SIGNAL_TEXT.lead(enriched.length)
              : SIGNAL_TEXT.leadNone}
          </h1>
          {staleCount > 0 ? (
            <p className={`text-body-sm ${TONE_INK.warning}`}>
              {SIGNAL_TEXT.staleCount(staleCount)}
            </p>
          ) : null}
          {namedCount > 0 ? (
            <p className="text-muted-foreground text-body-sm">
              {SIGNAL_TEXT.leadNamed(namedCount)}
            </p>
          ) : null}
        </div>
      </Card>

      <SignalQueue
        groups={groups}
        // Both flags come from the SAME gate the server action re-runs. Naming
        // tiers here would be the product re-deriving a commercial conclusion,
        // and it would drift from the matrix the moment packaging changed.
        canTriage={
          can(session.authz, session.entitlement, "signal.triage", "ui").allowed
        }
        canRescore={
          can(session.authz, session.entitlement, "signal.rescore", "ui")
            .allowed
        }
        onAct={actOnSignal}
      />
      {/* Leads sit under the inbox because that is the order the chain runs in:
          a signal is promoted into a lead, and a qualified lead converts. */}
      <LeadList
        leads={leads.ok ? leads.value : []}
        canTriage={
          can(session.authz, session.entitlement, "signal.lead.upsert", "ui")
            .allowed
        }
        canConvert={
          can(session.authz, session.entitlement, "signal.lead.convert", "ui")
            .allowed
        }
        onAct={actOnLead}
      />
    </ViewLayout>
  );
}
