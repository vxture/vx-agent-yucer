"use client";
import { planningFindings } from "../../domains/planning/plan-checks";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  MetricListCard,
  LabeledValue,
  Checkbox,
  Drawer,
  EmptyState,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@vxture/design-ui";
import { Tag } from "../components/tag";
import { ModuleHeadline } from "../components/module-headline";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { salesPlanCommandAction } from "./plan-actions";
import {
  planVersions,
  comparePlanContents,
  targetDelta,
} from "../../domains/planning/plan-state";
import type { PlanCommand } from "../../domains/planning/plan-service";
import type { PlanContent, SalesPlan } from "../../domains/planning/plan-model";
import type { PlanSources } from "./plan-data";
import { PlanTargets } from "./plan-targets";
import { PlanSupport } from "./plan-support";
import { PlanRegions } from "./plan-regions";
import { PlanAssumptions } from "./plan-assumptions";
import {
  prerequisiteGroups,
  readPrerequisites,
} from "../../domains/planning/plan-prerequisites";
export function PlanningVersionPanel({
  initialPlan,
  initialNow,
  previewContent,
  year,
  canEdit,
  sources,
  legacyIds,
}: {
  initialPlan: SalesPlan | null;
  initialNow: string;
  previewContent: PlanContent;
  year: number;
  canEdit: boolean;
  sources: PlanSources;
  legacyIds: string[];
}) {
  const locale = useLocale();
  const {
    PLAN_VERSION_TEXT: T,
    PLAN_VERSION_ERROR: E,
    PLANNING_TEXT: P,
  } = useMessages();
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [pending, transition] = useTransition();
  const [now, setNow] = useState(initialNow);
  const state = useMemo(
    () =>
      plan
        ? planVersions(plan, now)
        : {
            current: null,
            baseline: null,
            scheduled: null,
            draft: null,
            closed: false,
            eventNo: 0,
          },
    [plan, now],
  );
  useEffect(() => {
    if (!state.scheduled) return;
    const release = plan?.events.find(
      (e) => e.kind === "release" && e.revisionId === state.scheduled!.id,
    );
    if (!release) return;
    const timer = setTimeout(
      () => {
        setNow(new Date().toISOString());
        router.refresh();
      },
      Math.min(
        60_000,
        Math.max(50, new Date(release.effectiveAt).getTime() - Date.now() + 50),
      ),
    );
    return () => clearTimeout(timer);
  }, [plan, state.scheduled, now, router]);
  const [view, setView] = useState(
    initialPlan?.revisions.find((r) => r.state === "draft")?.id ?? "current",
  );
  const revision =
    view === "current"
      ? state.current
      : view === "baseline"
        ? state.baseline
        : (plan?.revisions.find((r) => r.id === view) ?? null);
  const [content, setContent] = useState<PlanContent | null>(
    initialPlan?.revisions.find((r) => r.state === "draft")?.content ?? null,
  );
  const editing =
    !!state.draft &&
    revision?.id === state.draft.id &&
    canEdit &&
    !state.closed;
  const c = editing
    ? (content ?? state.draft!.content)
    : (revision?.content ?? previewContent);
  const dirty =
    editing && JSON.stringify(c) !== JSON.stringify(state.draft?.content);
  const [diffSection, setDiffSection] = useState("all");
  const [regionId, setRegionId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [effective, setEffective] = useState("");
  const [when, setWhen] = useState("immediate");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<
    "release" | "discard" | "close" | null
  >(null);
  const [adopt, setAdopt] = useState(false);
  const [lockPeriod, setLockPeriod] = useState(`${year}Q1`);
  const [checksOpen, setChecksOpen] = useState(false);
  const requests = useRef(new Map<string, string>());
  const edit = editing
    ? (next: PlanContent) => {
        setContent(next);
        setError("");
      }
    : null;
  const run = (command: PlanCommand) =>
    transition(async () => {
      setError("");
      setMessage("");
      const fingerprint = JSON.stringify({ command, event: state.eventNo });
      let requestKey = requests.current.get(fingerprint);
      if (!requestKey) {
        requestKey = crypto.randomUUID();
        requests.current.set(fingerprint, requestKey);
      }
      try {
        const result = await salesPlanCommandAction({
          year,
          expectedEventNo: state.eventNo,
          requestKey,
          command,
        });
        if (!result.ok) {
          setError(E[result.error] ?? E.plan_save_failed!);
          return;
        }
        setPlan(result.plan);
        setNow(new Date().toISOString());
        const s = planVersions(result.plan, new Date().toISOString());
        setContent(s.draft?.content ?? null);
        setView(s.draft?.id ?? "current");
        setMessage(command.kind === "save" ? T.saved : T.done);
        setConfirm(null);
        router.refresh();
      } catch {
        setError(E.plan_save_failed!);
      }
    });
  const choose = (value: string) => {
    if (dirty) {
      setError(T.saveFirst);
      return;
    }
    setView(value);
    setRegionId(null);
  };
  const metricName: Record<string, string> = {
    revenue: P.metricRevenue,
    pipeline: P.metricPipeline,
    new_logo: P.metricNewLogo,
    margin: P.metricMargin,
  };
  const format = (s: string | null | undefined) =>
    s === null || s === undefined
      ? "—"
      : Number(s).toLocaleString(locale, { maximumFractionDigits: 2 });
  const findings = useMemo(() => {
    try {
      return c ? planningFindings(c) : [];
    } catch {
      return null;
    }
  }, [c]);
  const diff = c ? comparePlanContents(state.current?.content ?? null, c) : [];
  const sectionLabel: Record<string, string> = {
    regions: T.regions,
    periods: T.period,
    targets: T.target,
    budgets: T.customerBudget,
    contributions: T.contribution,
    team: T.team,
    actions: T.actions,
    assumptions: T.assumptions,
    allocationNote: T.allocationNote,
    capacityNote: T.capacityNote,
  };
  const describe = (r: Record<string, unknown> | null, section: string) => {
    if (!r) return "—";
    if ("scope" in r)
      return `${r.scope === "workspace" ? T.company : (c?.regions.find((x) => `territory:${x.id}` === r.scope)?.name ?? "—")} · ${r.period} · ${metricName[String(r.metric)] ?? r.metric} · ${T.floor} ${format(r.floor as string)} / ${T.target} ${format(r.target as string)} / ${T.stretch} ${format(r.stretch as string)} ${r.currency ?? T.count}`;
    if ("objective" in r) return `${r.objective} · ${r.due}`;
    if ("memberSub" in r)
      return `${r.memberName || T.demand} · ${r.role} · ${r.percent}% · ${r.start} — ${r.end}`;
    if ("budgetKey" in r)
      return `${c?.budgets.find((b) => b.key === r.budgetKey)?.name ?? T.customer} · ${format(r.amount as string)}`;
    if ("name" in r)
      return `${r.name}${r.amount ? ` · ${format(r.amount as string)}` : ""}${"included" in r ? ` · ${r.included ? T.included : T.excluded}` : ""}`;
    if ("text" in r && section === "assumptions") {
      const groups = readPrerequisites(String(r.text || ""));
      return (
        prerequisiteGroups
          .filter((group) => groups[group].length)
          .map(
            (group) =>
              `${T.prerequisiteLabels[group]}: ${groups[group].join("; ")}`,
          )
          .join(" / ") || "—"
      );
    }
    if ("text" in r) return String(r.text || "—");
    return `${r.key ?? ""} · ${r.start ?? ""} — ${r.end ?? ""}`;
  };
  const refreshRegions = () => {
    if (!c || !edit) return;
    const next = structuredClone(c);
    for (const source of sources.regions) {
      const held = next.regions.find((r) => r.id === source.id);
      if (held) Object.assign(held, source);
      else {
        next.regions.push({
          ...source,
          included: false,
          reason: "",
          ownerSub: null,
        });
      }
    }
    edit(next);
  };
  const currentRegion = c?.regions.find((r) => r.id === regionId);
  const companyTarget = c?.targets.find(
    (t) =>
      t.scope === "workspace" &&
      t.period === `Y${year}` &&
      t.metric === "revenue",
  );
  const allocated =
    c?.targets
      .filter(
        (t) =>
          t.scope !== "workspace" &&
          t.period === `Y${year}` &&
          t.metric === "revenue" &&
          t.currency === companyTarget?.currency &&
          t.target !== null,
      )
      .reduce((n, t) => n + Number(t.target), 0) ?? 0;
  const needsSourceRefresh =
    c &&
    sources.regions.some((r) => {
      const old = c.regions.find((x) => x.id === r.id);
      return (
        !old ||
        old.name !== r.name ||
        JSON.stringify(old.provinces) !== JSON.stringify(r.provinces)
      );
    });
  return (
    <div className="@container flex flex-col gap-xl">
      <ModuleHeadline
        moduleKey="planning"
        tags={
          <>
            <StatusBadge tone="info">Y{year}</StatusBadge>
            {state.closed ? <Tag>{T.closed}</Tag> : null}
            {editing ? (
              <StatusBadge tone="warning">
                {dirty ? T.dirty : T.draft}
              </StatusBadge>
            ) : revision ? (
              <StatusBadge tone="info">V{revision.version}</StatusBadge>
            ) : null}
          </>
        }
        action={
          <div className="flex w-64 flex-wrap items-center gap-sm sm:w-auto">
            <NativeSelect
              wrapperClassName="w-28"
              aria-label={T.year}
              value={year}
              disabled={pending || dirty}
              onChange={(e) => router.push(`/planning?year=${e.target.value}`)}
            >
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>
                  Y{y}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              wrapperClassName="w-40"
              aria-label={T.version}
              value={view}
              disabled={pending || dirty}
              onChange={(e) => choose(e.target.value)}
            >
              <option value="current">
                {T.current}
                {state.current ? ` · V${state.current.version}` : ""}
              </option>
              {state.baseline ? (
                <option value="baseline">
                  {T.baseline} · V{state.baseline.version}
                </option>
              ) : null}
              {plan?.revisions
                .filter((r) => r.state !== "abandoned")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.state === "draft"
                      ? T.draft
                      : `V${r.version} · ${r.id === state.scheduled?.id ? T.scheduled : T.snapshot}`}
                  </option>
                ))}
            </NativeSelect>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => setChecksOpen(true)}
              disabled={!c}
            >
              {T.insights}
              {findings?.length ? ` · ${findings.length}` : ""}
            </Button>
            {canEdit && !state.draft && !state.closed ? (
              <Button
                size="lg"
                disabled={pending}
                onClick={() =>
                  run({ kind: "draft", content: {} as PlanContent })
                }
              >
                {state.current ? T.adjust : T.create}
              </Button>
            ) : null}
            {editing ? (
              <Button
                size="lg"
                variant="secondary"
                disabled={pending || !dirty}
                onClick={() =>
                  run({
                    kind: "save",
                    revisionId: state.draft!.id,
                    editToken: state.draft!.editToken,
                    content: c!,
                  })
                }
              >
                {T.save}
              </Button>
            ) : null}
          </div>
        }
      />
      {error ? (
        <p className="text-body-small text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-body-small text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
      {state.scheduled ? (
        <p className="text-body-small text-muted-foreground">
          {T.scheduled} · V{state.scheduled.version} ·{" "}
          {
            plan?.events.find(
              (e) =>
                e.kind === "release" && e.revisionId === state.scheduled!.id,
            )?.effectiveAt
          }{" "}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => choose(state.scheduled!.id)}
          >
            {T.version}
          </Button>
        </p>
      ) : null}
      {!c ? (
        <EmptyState title={T.noRelease} description={T.noReleaseHint} />
      ) : (
        <>
          {needsSourceRefresh && edit ? (
            <div className="flex items-center gap-md text-body-small text-muted-foreground">
              {T.sourceChanged}
              <Button
                size="md"
                variant="secondary"
                disabled={pending}
                onClick={refreshRegions}
              >
                {T.refreshSources}
              </Button>
            </div>
          ) : null}
          <Section
            icon="target"
            title={currentRegion ? currentRegion.name : T.company}
            description={T.targetHint}
            action={
              currentRegion ? (
                <Button
                  size="md"
                  variant="secondary"
                  onClick={() => setRegionId(null)}
                >
                  {T.back}
                </Button>
              ) : (
                <Link
                  href={`/attainment?period=Y${year}`}
                  className="text-body-small text-muted-foreground transition-colors hover:text-primary"
                >
                  {T.actual}
                </Link>
              )
            }
          >
            {currentRegion && edit ? (
              <div className="mb-lg flex flex-wrap items-end gap-md">
                <Field>
                  <FieldLabel htmlFor="plan-region-participation">
                    {T.included}
                  </FieldLabel>
                  <NativeSelect
                    id="plan-region-participation"
                    value={currentRegion.included ? "yes" : "no"}
                    onChange={(e) => {
                      const included = e.target.value === "yes";
                      const next = structuredClone(c);
                      next.regions = next.regions.map((r) =>
                        r.id === regionId ? { ...r, included } : r,
                      );
                      if (!included) {
                        const removed = next.targets
                          .filter((t) => t.scope === `territory:${regionId}`)
                          .map((t) => t.key);
                        next.targets = next.targets.filter(
                          (t) => !removed.includes(t.key),
                        );
                        next.contributions = next.contributions.filter(
                          (x) => x.regionId !== regionId,
                        );
                        next.team = next.team.filter(
                          (x) => x.regionId !== regionId,
                        );
                        next.actions = next.actions.filter(
                          (x) => x.regionId !== regionId,
                        );
                      } else if (
                        !next.targets.some(
                          (t) =>
                            t.scope === `territory:${regionId}` &&
                            t.period === `Y${year}` &&
                            t.metric === "revenue",
                        )
                      )
                        next.targets.push({
                          key: crypto.randomUUID(),
                          scope: `territory:${regionId}`,
                          period: `Y${year}`,
                          metric: "revenue",
                          currency: sources.currency,
                          floor: null,
                          target: null,
                          stretch: null,
                          note: "",
                        });
                      edit(next);
                    }}
                  >
                    <option value="yes">{T.included}</option>
                    <option value="no">{T.excluded}</option>
                  </NativeSelect>
                </Field>
                {!currentRegion.included ? (
                  <Field className="flex-1">
                    <FieldLabel htmlFor="plan-region-reason">
                      {T.exclusionReason}
                    </FieldLabel>
                    <Input
                      id="plan-region-reason"
                      value={currentRegion.reason}
                      onChange={(e) =>
                        edit({
                          ...c,
                          regions: c.regions.map((r) =>
                            r.id === regionId
                              ? { ...r, reason: e.target.value }
                              : r,
                          ),
                        })
                      }
                    />
                  </Field>
                ) : null}
              </div>
            ) : null}
            {!currentRegion || currentRegion.included ? (
              <PlanTargets
                key={currentRegion?.id ?? "workspace"}
                content={c}
                scope={
                  currentRegion ? `territory:${currentRegion.id}` : "workspace"
                }
                edit={edit}
                disabled={pending}
                summary={
                  !currentRegion ? (
                    <div className="flex flex-wrap gap-x-xl gap-y-md">
                      <LabeledValue
                        label={`${T.allocated} · ${companyTarget?.currency ?? sources.currency}`}
                        value={format(String(allocated))}
                      />
                      <LabeledValue
                        label={T.allocation}
                        value={
                          companyTarget?.target != null
                            ? format(
                                String(
                                  Number(companyTarget.target) - allocated,
                                ),
                              )
                            : "—"
                        }
                      />
                      <LabeledValue
                        label={T.people}
                        value={
                          new Set(
                            c.team
                              .filter((t) => t.memberSub)
                              .map((t) => t.memberSub),
                          ).size
                        }
                      />
                      <LabeledValue
                        label={`${T.needs} · FTE`}
                        value={format(
                          String(
                            c.team
                              .filter((t) => !t.memberSub)
                              .reduce((n, t) => n + Number(t.requestedFte), 0),
                          ),
                        )}
                      />
                    </div>
                  ) : undefined
                }
              />
            ) : (
              <p className="text-body-small text-muted-foreground">
                {currentRegion.reason}
              </p>
            )}
          </Section>
          {currentRegion ? (
            currentRegion.included ? (
              <PlanSupport
                content={c}
                regionId={currentRegion.id}
                sources={sources}
                edit={edit}
                disabled={pending}
              />
            ) : null
          ) : (
            <PlanRegions content={c} onSelect={setRegionId} />
          )}
          <PlanAssumptions content={c} edit={edit} disabled={pending} />
          {editing ? (
            <Section
              icon="git-branch"
              title={T.diff}
              description={T.publishHint}
              action={
                <NativeSelect
                  wrapperClassName="w-40"
                  aria-label={T.diff}
                  value={diffSection}
                  onChange={(e) => setDiffSection(e.target.value)}
                >
                  <option value="all">{T.overview}</option>
                  {Object.entries(sectionLabel).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              }
            >
              <p className="mb-md text-body-small text-muted-foreground">
                {diff.length} {T.changes}
                {dirty ? ` · ${T.saveFirst}` : ""}
              </p>
              {diff.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[T.item, T.before, T.after, T.targetChange].map((l) => (
                        <TableHead key={l}>{l}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diff
                      .filter(
                        (d) =>
                          diffSection === "all" || d.section === diffSection,
                      )
                      .map((d) => (
                        <TableRow key={`${d.section}-${d.key}`}>
                          <TableCell>{sectionLabel[d.section]}</TableCell>
                          <TableCell className="text-body-small text-muted-foreground">
                            {describe(d.before, d.section)}
                          </TableCell>
                          <TableCell className="text-body-small">
                            {describe(d.after, d.section)}
                          </TableCell>
                          <TableCell className="text-body-small whitespace-nowrap">
                            {(() => {
                              const delta =
                                d.section === "targets" && d.before && d.after
                                  ? targetDelta(
                                      d.before.target as string | null,
                                      d.after.target as string | null,
                                    )
                                  : null;
                              return delta
                                ? `${delta.amount} ${d.after?.currency ?? T.count} · ${delta.percent ?? T.noPercent}`
                                : "—";
                            })()}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-body-small text-muted-foreground">
                  {T.noDiff}
                </p>
              )}
            </Section>
          ) : null}
        </>
      )}
      <Drawer
        open={checksOpen}
        onClose={() => setChecksOpen(false)}
        width="md"
        title={T.insights}
        description={T.insightsHint}
        closeLabel={T.cancel}
      >
        {findings === null ? (
          <EmptyState title={T.validation} description={T.checksInvalidHint} />
        ) : findings.length ? (
          <div className="flex flex-col gap-lg">
            {findings.map((f, i) => (
              <MetricListCard
                key={`${f.kind}-${f.regionId}-${i}`}
                title={f.subject}
                note={
                  f.kind === "missing_target"
                    ? T.checkMissingTarget(f.subject)
                    : f.kind === "customer_gap"
                      ? T.checkCustomerGap(
                          f.subject,
                          format(f.value),
                          f.currency ?? "",
                        )
                      : f.kind === "team_gap"
                        ? T.checkTeamGap(f.subject)
                        : f.kind === "over_capacity"
                          ? T.checkCapacity(f.subject, f.value ?? "")
                          : T.checkConcentration(
                              f.subject,
                              format(f.value),
                              f.currency ?? "",
                            )
                }
                footer={
                  f.regionId ? (
                    <Button
                      size="md"
                      variant="secondary"
                      onClick={() => {
                        setRegionId(f.regionId);
                        setChecksOpen(false);
                      }}
                    >
                      {T.regionDetail}
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState title={T.checksEmpty} description={T.checksEmptyHint} />
        )}
      </Drawer>
      {canEdit &&
      !state.closed &&
      (state.draft || state.current || state.scheduled) ? (
        <Section icon="upload" title={T.version} description={T.reasonHint}>
          <div className="flex flex-col gap-lg">
            <Field>
              <FieldLabel htmlFor="plan-change-reason">{T.reason}</FieldLabel>
              <Textarea
                id="plan-change-reason"
                value={reason}
                maxLength={8000}
                rows={2}
                disabled={pending}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            {editing ? (
              <div className="flex flex-wrap items-end gap-md">
                <Field>
                  <FieldLabel htmlFor="plan-effective-kind">
                    {T.effectiveAt}
                  </FieldLabel>
                  <NativeSelect
                    id="plan-effective-kind"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                  >
                    <option value="immediate">{T.immediate}</option>
                    <option value="future">{T.future}</option>
                  </NativeSelect>
                </Field>
                {when === "future" ? (
                  <Field>
                    <FieldLabel htmlFor="plan-effective-time">
                      {T.scheduled}
                    </FieldLabel>
                    <Input
                      type="datetime-local"
                      id="plan-effective-time"
                      value={effective}
                      onChange={(e) => setEffective(e.target.value)}
                    />
                  </Field>
                ) : null}
                <Button
                  size="lg"
                  disabled={
                    pending ||
                    dirty ||
                    (plan?.revisions.some((r) => r.state === "sealed") &&
                      !reason.trim()) ||
                    !!state.scheduled ||
                    (when === "future" && !effective)
                  }
                  onClick={() => setConfirm("release")}
                >
                  {T.publish}
                </Button>
                <Button
                  size="md"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setConfirm("discard")}
                >
                  {T.discard}
                </Button>
              </div>
            ) : null}
            {state.scheduled ? (
              <Button
                size="md"
                variant="secondary"
                disabled={pending || !reason.trim()}
                onClick={() => run({ kind: "cancel", reason })}
              >
                {T.cancelSchedule}
              </Button>
            ) : null}
            {revision?.state === "sealed" && !state.draft ? (
              <Button
                size="md"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run({
                    kind: "draft",
                    content: revision.content,
                    restoreId: revision.id,
                  })
                }
              >
                {T.restore} · V{revision.version}
              </Button>
            ) : null}
            {state.current ? (
              <div className="flex flex-wrap items-center gap-md">
                <NativeSelect
                  aria-label={T.quarters}
                  value={lockPeriod}
                  onChange={(e) => setLockPeriod(e.target.value)}
                >
                  {state.current.content.periods
                    .filter((p) => p.parent && p.end <= now.slice(0, 10))
                    .map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.key}
                        {plan?.events.some(
                          (e) => e.kind === "lock" && e.period === p.key,
                        )
                          ? ` · ${T.lockedPeriod}`
                          : ""}
                      </option>
                    ))}
                </NativeSelect>
                <Button
                  size="md"
                  variant="secondary"
                  disabled={
                    pending ||
                    !reason.trim() ||
                    !!state.scheduled ||
                    plan?.events.some(
                      (e) => e.kind === "lock" && e.period === lockPeriod,
                    )
                  }
                  onClick={() =>
                    run({ kind: "lock", period: lockPeriod, reason })
                  }
                >
                  {T.lock}
                </Button>
                <Button
                  size="md"
                  variant="ghost"
                  disabled={pending || !reason.trim()}
                  onClick={() => setConfirm("close")}
                >
                  {T.close}
                </Button>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}
      {plan?.events.some((e) => e.kind !== "draft" && e.kind !== "save") ? (
        <Section
          icon="clock-counter-clockwise"
          title={T.history}
          description={T.baselineHint}
        >
          <Table>
            <TableHeader>
              <TableRow>
                {[T.version, T.item, T.effectiveAt, T.owner, T.reason].map(
                  (l) => (
                    <TableHead key={l}>{l}</TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...plan.events]
                .filter((e) => e.kind !== "draft" && e.kind !== "save")
                .reverse()
                .map((e) => (
                  <TableRow key={e.no}>
                    <TableCell>
                      {e.revisionId ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => choose(e.revisionId!)}
                        >
                          {plan.revisions.find((r) => r.id === e.revisionId)
                            ?.version
                            ? `V${plan.revisions.find((r) => r.id === e.revisionId)?.version}`
                            : T.draft}
                        </Button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {
                        {
                          release: T.publish,
                          cancel: T.canceled,
                          draft: T.draft,
                          save: T.save,
                          discard: T.abandoned,
                          lock: T.lockedPeriod,
                          close: T.closed,
                        }[e.kind]
                      }
                      {e.period ? ` · ${e.period}` : ""}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {new Date(e.effectiveAt).toLocaleString(locale, {
                        timeZone: "UTC",
                        hour12: false,
                      })}{" "}
                      UTC
                    </TableCell>
                    <TableCell>
                      {sources.members.find((m) => m.sub === e.actor)?.name ??
                        e.actor}
                    </TableCell>
                    <TableCell>{e.reason || "—"}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Section>
      ) : null}
      <Drawer
        open={!!confirm}
        onClose={() => {
          if (!pending) setConfirm(null);
        }}
        width="md"
        title={
          confirm === "release"
            ? T.publishConfirm
            : confirm === "discard"
              ? T.discardConfirm
              : T.closeConfirm
        }
        description={T.publishHint}
        closeLabel={T.cancel}
      >
        <div className="flex flex-col gap-lg">
          <p className="text-body-small text-muted-foreground">
            {reason || T.baseline}
          </p>
          {confirm === "release" ? (
            <>
              <p className="text-body-small">
                {T.diff} · {diff.length} {T.changes}
              </p>
              {!plan?.revisions.some((r) => r.state === "sealed") &&
              legacyIds.length ? (
                <>
                  <p className="text-body-small text-muted-foreground">
                    {T.adoptHint}
                  </p>
                  <label className="flex items-center gap-sm text-body-small">
                    <Checkbox
                      checked={adopt}
                      onCheckedChange={(value) => setAdopt(value === true)}
                    />
                    {T.adopt} · {legacyIds.length}
                  </label>
                </>
              ) : null}
            </>
          ) : null}
          <div className="flex justify-end gap-sm">
            <Button
              size="md"
              variant="secondary"
              disabled={pending}
              onClick={() => setConfirm(null)}
            >
              {T.cancel}
            </Button>
            <Button
              size="md"
              disabled={
                pending ||
                (confirm === "release" &&
                  !plan?.revisions.some((r) => r.state === "sealed") &&
                  legacyIds.length > 0 &&
                  !adopt)
              }
              onClick={() => {
                if (confirm === "release" && state.draft)
                  run({
                    kind: "release",
                    revisionId: state.draft.id,
                    editToken: state.draft.editToken,
                    reason,
                    ...(when === "future" && effective
                      ? { effectiveAt: new Date(effective).toISOString() }
                      : {}),
                    ...(adopt
                      ? {
                          adoptions: legacyIds.map((targetId) => ({
                            targetId,
                            snapshot: null,
                          })),
                        }
                      : {}),
                  });
                else if (confirm === "discard" && state.draft)
                  run({
                    kind: "discard",
                    revisionId: state.draft.id,
                    editToken: state.draft.editToken,
                  });
                else if (confirm === "close") run({ kind: "close", reason });
              }}
            >
              {T.confirm}
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
