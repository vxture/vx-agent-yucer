import Link from "next/link";
import {
  EmptyState,
  MetricGrid,
  Section,
  StatusBadge,
  ViewHeader,
  ViewLayout,
  type MetricGridItem,
} from "@vxture/design-ui";
import { resolveAppSession } from "../../lib/session";
import {
  getFieldStore,
  getPipelineStore,
} from "../../../domains/shared/registry";
import { captureAdoption } from "../../../domains/account/field-service";
import { CAPTURE_CRITERION } from "../../../domains/account/lib/capture-metric";
import { listPipeline } from "../../../domains/pipeline/service";
import type { OpportunityRecord } from "../../../domains/pipeline/store";
import type { Stage } from "../../../domains/pipeline/lib/stage";

import { getMessages } from "../../lib/i18n/server";
import { loadFailureText } from "../../lib/load-failure";
// The instrument behind ADR-012's kill criterion.
//
// Stage 1 was shipped with a condition attached - if the capture habit does not
// form, the reasoning stages are not built - and a condition nobody can read is
// a form of words. This page is the reading.
//
// It deliberately shows the WORKING, not just the verdict: the weekly numbers,
// the denominator, and the deals that went dark. A single adoption score would
// be trusted or dismissed, and neither reaction is a decision. Someone has to
// be able to disagree with this page using the same numbers it used.

export const dynamic = "force-dynamic";

export default async function AdoptionPage() {
  const { ADOPTION_TEXT, SHELL_TEXT, STAGE_LABEL, LOAD_ERROR } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const now = new Date();
  // includeClosed, and it is load-bearing rather than tidy.
  //
  // listPipeline defaults to open-only, so without this the denominator is
  // "deals open RIGHT NOW" - and closing an untouched deal would retroactively
  // raise every past week's coverage, quietly carrying the workspace over the
  // 50% bar without anyone recording anything. capture-metric has a test
  // asserting the denominator is historical; it passed because it called the
  // pure function with closed deals the page never supplied.
  const opportunities = await listPipeline(
    { ...base, store: getPipelineStore() },
    { includeClosed: true },
  );
  if (!opportunities.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(opportunities.violations, LOAD_ERROR)}
      />
    );
  }

  const result = await captureAdoption(
    { ...base, store: getFieldStore() },
    opportunities.value.map((o: OpportunityRecord) => ({
      id: o.id,
      createdAt: o.createdAt,
      closedAt: o.closedAt,
    })),
    { now },
  );
  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(result.violations, LOAD_ERROR)}
      />
    );
  }

  const { weeks, assessment, touched } = result.value;

  const verdict = {
    adopted: {
      tone: "success" as const,
      label: ADOPTION_TEXT.verdictAdopted,
      hint: ADOPTION_TEXT.verdictAdoptedHint,
    },
    not_adopted: {
      tone: "danger" as const,
      label: ADOPTION_TEXT.verdictNotAdopted,
      hint: ADOPTION_TEXT.verdictNotAdoptedHint,
    },
    too_early: {
      tone: "info" as const,
      label: ADOPTION_TEXT.verdictTooEarly,
      hint: ADOPTION_TEXT.verdictTooEarlyHint,
    },
    no_data: {
      tone: "neutral" as const,
      label: ADOPTION_TEXT.verdictNoData,
      hint: ADOPTION_TEXT.verdictNoDataHint,
    },
  }[assessment.verdict];

  const pct = (v: number | null) =>
    v === null ? "-" : `${Math.round(v * 100)}%`;

  const metrics: MetricGridItem[] = [
    {
      id: "verdict",
      label: ADOPTION_TEXT.title,
      value: verdict.label,
      trend: verdict.hint,
      tone: verdict.tone,
    },
    {
      id: "coverage",
      label: ADOPTION_TEXT.coverage,
      value: pct(assessment.judgedCoverage),
      trend: ADOPTION_TEXT.coverageHint,
      tone: "neutral",
    },
    {
      id: "criterion",
      label: `${Math.round(CAPTURE_CRITERION.minCoverage * 100)}%`,
      value: `${assessment.judgedWeeks}/${CAPTURE_CRITERION.judgeWeeks}`,
      trend: ADOPTION_TEXT.criterion(
        Math.round(CAPTURE_CRITERION.minCoverage * 100),
        CAPTURE_CRITERION.judgeWeeks,
      ),
      tone: "neutral",
    },
  ];

  // Open deals with nothing recorded anywhere in the window. This is the part a
  // manager can act on today - the weekly percentages describe the team, these
  // name the deals.
  const touchedIds = new Set(touched);
  const windowStart = weeks[0]?.weekStart ?? now;
  const dark = opportunities.value.filter(
    (o: OpportunityRecord) => o.closedAt === null && !touchedIds.has(o.id),
  );

  return (
    <ViewLayout>
      <ViewHeader
        icon="chart-bar"
        title={ADOPTION_TEXT.title}
        description={ADOPTION_TEXT.description}
        action={
          <StatusBadge tone={verdict.tone} dot>
            {verdict.label}
          </StatusBadge>
        }
      />

      <MetricGrid items={metrics} />

      {/* Stated in the interface, not only in a comment. If people read this as
          a ranking they will record for the ranking, and the number stops
          measuring the thing it was built to measure. */}
      <StatusBadge tone="info">{ADOPTION_TEXT.notAScoreboard}</StatusBadge>

      <Section title={ADOPTION_TEXT.week} description={ADOPTION_TEXT.rateHint}>
        <table>
          <thead>
            <tr>
              <th scope="col">{ADOPTION_TEXT.week}</th>
              <th scope="col">{ADOPTION_TEXT.openDeals}</th>
              <th scope="col">{ADOPTION_TEXT.touched}</th>
              <th scope="col">{ADOPTION_TEXT.notes}</th>
              <th scope="col">{ADOPTION_TEXT.coverage}</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.weekStart.toISOString()}>
                <th scope="row">
                  {w.weekStart.toISOString().slice(0, 10)}
                  {/* The current week is shown because a manager wants to know
                      how it is going - and marked because otherwise its number
                      is read as a result. A Monday morning row saying 0% is an
                      artifact of the calendar, not a fact about the team, and
                      an unmarked artifact is indistinguishable from a verdict. */}
                  {w.complete ? null : (
                    <StatusBadge tone="info">
                      {ADOPTION_TEXT.weekInProgress}
                    </StatusBadge>
                  )}
                </th>
                <td>
                  {w.opportunities === 0
                    ? ADOPTION_TEXT.noDeals
                    : w.opportunities}
                </td>
                <td>{w.covered}</td>
                <td>{w.interactions}</td>
                {/* Null, not zero: a week with no open deals is not a week the
                    team failed to record anything. */}
                <td>{w.complete ? pct(w.coverage) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title={ADOPTION_TEXT.darkDeals}
        description={ADOPTION_TEXT.darkDealsHint}
      >
        {dark.length === 0 ? (
          <EmptyState
            title={ADOPTION_TEXT.darkDealsEmpty}
            description={windowStart.toISOString().slice(0, 10)}
          />
        ) : (
          <ul>
            {dark.map((o: OpportunityRecord) => (
              <li key={o.id}>
                <StatusBadge tone="neutral">
                  {STAGE_LABEL[o.stage as Stage] ?? o.stage}
                </StatusBadge>
                <Link href={`/pipeline/${o.id}`}>{o.name}</Link>
                <span>{o.ownerSub ?? "-"}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </ViewLayout>
  );
}
