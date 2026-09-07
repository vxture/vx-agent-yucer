import { Card, EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
// A SERVER component, so the dictionary is awaited rather than hooked. The
// locale comes from the request; next/headers caches it, so several server
// components asking cost one resolution.
import { getMessages } from "../lib/i18n/server";
import { getSignalStore } from "../../domains/shared/registry";
import { listSignals } from "../../domains/signal/service";
import { can } from "../../authz/decide";
import { SignalQueue, type QueueSignal } from "../components/signal-queue";
import { scoreSignal } from "../../domains/signal/lib/scoring";
import { actOnSignal } from "./actions";
import { loadFailureText } from "../lib/load-failure";
import { ModuleHeadline } from "../components/module-headline";

// D5 商机智探 - SIGNALS ONLY since 2026-09-06 (design_yucer_110).
//
// The lead list used to sit under this inbox, which made one page manage two
// objects with two lifecycles: a signal is 升级/忽略/判重/重新评分, a lead runs
// new -> working -> qualified -> converted. Leads have their own module now,
// and this page is what its name says.
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
    store: session.stores.signal(),
  };

  const result = await listSignals(ctx, { limit: 100 });

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
      {/* THE MODULE HEADER, no fold (owner, 2026-09-06). Card and icon like
          every other module; the counts that used to BE the title are badges
          beside it now.

          THE TITLE IS THE MODULE'S NAME. It used to be "12 条情报待判", which
          is a reading of today's inbox rather than a name - so the page's
          heading changed every time a signal arrived, and never matched the
          menu entry that got you here. The count is still the first thing
          said; it is just said as a badge, which is what a count is.

          EVERY BADGE IS COUNTED OFF THE SAME `enriched` ARRAY the queue below
          is built from, so the header cannot describe a different inbox. */}
      <ModuleHeadline
        moduleKey="signal"
        description={SIGNAL_TEXT.description}
        tags={
          <>
            <StatusBadge tone="success">
              {enriched.length > 0 ? SIGNAL_TEXT.tagSignals(enriched.length) : SIGNAL_TEXT.leadNone}
            </StatusBadge>
            {namedCount > 0 ? (
              <StatusBadge tone="info">{SIGNAL_TEXT.tagNamed(namedCount)}</StatusBadge>
            ) : null}
            {/* DECAY IS SAID ONCE, HERE. It is continuous, so on a dataset of
                any age most rows are stale; flagging each one turns a true
                statement into wallpaper. */}
            {staleCount > 0 ? (
              <StatusBadge tone="warning">{SIGNAL_TEXT.tagStale(staleCount)}</StatusBadge>
            ) : null}
          </>
        }
      />

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
    </ViewLayout>
  );
}
