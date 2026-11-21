"use client";
import { initializeNewLogoEstimates } from "../lib/planning-autofill";
import { StrategyHandoffPanel } from "./strategy-handoff-panel";
import { companyPlanningRevision, regionalPlanningRevision } from "../../domains/planning/plan-workflow";
import { PlanDraftAssistant } from "./plan-draft-assistant";
import { MemberPicker } from "../components/member-picker";
import { planningHref } from "../lib/planning-workspace";
import { MemberName } from "../lib/member-names";
import { Section } from "../components/help-section";
import { TitleHelp } from "../components/title-help";
import { planningFindings } from "../../domains/planning/plan-checks";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  MetricListCard,
  Checkbox,
  Drawer,
  EmptyState,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@vxture/design-ui";
import { ConfirmDestructive } from "../components/confirm-destructive";
import { RowActions } from "../components/table-fittings";
import { Tag } from "../components/tag";
import { PageActionButton } from "../components/page-header-actions";
import { NewEntryButton } from "../components/form-page";
import { ModuleHeadline } from "../components/module-headline";
import { useLocale, useMessages } from "../lib/i18n/provider";
import {
  excludePlanningRegion,
  planningReleaseTimeError,
} from "../lib/planning-operations";
import { previewTargetDelta } from "../lib/planning-preview";
import { attainmentHref } from "../lib/attainment-workspace";
import {
  checkSalesPlanDraftAction,
  salesPlanCommandAction,
} from "./plan-actions";
import {
  planVersions,
  comparePlanContents,
} from "../../domains/planning/plan-state";
import type { PlanCommand } from "../../domains/planning/plan-service";
import type { PlanContent, SalesPlan } from "../../domains/planning/plan-model";
import type { PlanSources } from "./plan-data";
import {
  CompanyTargetAllocation,
} from "./company-target-summary";
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
  legacyCompanyIds,
  initialRevision,
  initialRegion,
  initialPeriod,
}: {
  initialPlan: SalesPlan | null;
  initialNow: string;
  previewContent: PlanContent;
  year: number;
  canEdit: boolean;
  sources: PlanSources;
  legacyIds: string[];
  legacyCompanyIds: string[];
  initialRevision?: string;
  initialRegion?: string;
  initialPeriod?: string;
}) {
  const locale = useLocale();
  const {
    PLAN_WORKSPACE_TEXT: W,
    STRATEGY_HANDOFF_TEXT: H,
    PLAN_VERSION_TEXT: T,
    PLAN_VERSION_ERROR: E,
    PLANNING_TEXT: P,
    DS_LABELS,
  } = useMessages();
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [pendingCommand, transition] = useTransition();
  const [assistantBusy, setAssistantBusy] = useState(false);
  const pending = pendingCommand || assistantBusy;
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
  // A saved draft is an explicit editing session, never the daily landing view.
  const [view, setView] = useState(initialRevision ?? "current");
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
  const companyEditing = editing && c?.releaseScope === "company";
  const regionalEditing = editing && c?.releaseScope === "regions";
  const companyRevision =
    plan && revision?.state === "sealed"
      ? companyPlanningRevision(plan, revision)
      : plan && state.current
        ? companyPlanningRevision(plan, state.current)
        : null;
  const regionalReference = revision?.state === "draft" ? state.current ?? revision : revision;
  const regionalBasis = plan && regionalReference ? regionalPlanningRevision(plan, regionalReference) : null;
  const managedLegacyIds =
    companyEditing && !c?.regions.length ? legacyCompanyIds : legacyIds;
  const publishLabel = companyEditing
    ? T.publishCompany
    : regionalEditing
      ? T.publishRegions
      : T.publish;
  let draftStateLabel: string = T.draft;
  if (companyEditing) draftStateLabel = W.scopeCompany;
  if (regionalEditing) draftStateLabel = W.scopeRegions;
  const dirty =
    editing && JSON.stringify(c) !== JSON.stringify(state.draft?.content);
  const [diffSection, setDiffSection] = useState("all");
  const [regionId, setRegionId] = useState<string | null>(
    initialRegion ?? null,
  );
  useEffect(() => {
    setView(initialRevision ?? "current");
    setRegionId(initialRegion ?? null);
  }, [initialRevision, initialRegion]);
  const [reason, setReason] = useState("");
  const [effective, setEffective] = useState("");
  const [when, setWhen] = useState("immediate");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<
    "release" | "discard" | "close" | "cancel" | "lock" | null
  >(null);
  const [excludeId, setExcludeId] = useState<string | null>(null);
  const [adopt, setAdopt] = useState(false);
  const [lockPeriod, setLockPeriod] = useState(`${year}Q1`);
  const [checksOpen, setChecksOpen] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [panel, setPanel] = useState<"diff" | "history" | "version" | null>(
    null,
  );
  const lockedPeriods = (plan?.events ?? [])
    .filter((event) => event.kind === "lock")
    .map((event) => event.period!);
  const estimatedDraft = useRef<string | null>(null);
  useEffect(() => {
    if (!companyEditing || !state.draft || estimatedDraft.current === state.draft.id) return;
    estimatedDraft.current = state.draft.id;
    const filled = initializeNewLogoEstimates(c, lockedPeriods);
    if (filled !== c) setContent(filled);
  }, [companyEditing, state.draft?.id]);
  const lockablePeriods =
    state.current?.content.periods.filter(
      (period) => period.parent && period.end <= now.slice(0, 10),
    ) ?? [];
  const selectedLockPeriod = lockablePeriods.find(
    (period) => period.key === lockPeriod,
  );
  const releaseTimeError =
    when === "future"
      ? planningReleaseTimeError(effective, year, Date.now())
      : null;
  useEffect(() => {
    if (!lockablePeriods.some((period) => period.key === lockPeriod))
      setLockPeriod(
        lockablePeriods.find((period) => !lockedPeriods.includes(period.key))
          ?.key ?? "",
      );
  }, [lockablePeriods.map((period) => period.key).join("|"), lockPeriod]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const leavePage = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element)?.closest("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!window.confirm(W.leaveDraft)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", leavePage, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", leavePage, true);
    };
  }, [dirty, W.leaveDraft]);
  const inFlight = useRef(false);
  const requests = useRef(new Map<string, string>());
  const edit = editing
    ? (next: PlanContent) => {
        setContent(next);
        setError("");
      }
    : null;
  const checkDraft = async (candidate: SalesPlan, publish: boolean) => {
    const draft = planVersions(candidate, new Date().toISOString()).draft;
    if (!draft) return;
    try {
      const checked = await checkSalesPlanDraftAction({
        year,
        revisionId: draft.id,
        editToken: draft.editToken,
      });
      setCheckError(
        checked.ok ? "" : (E[checked.error] ?? E.plan_save_failed!),
      );
      setChecksOpen(!publish || !checked.ok);
      setPanel(publish && checked.ok ? "version" : null);
    } catch {
      setCheckError(E.plan_save_failed!);
      setChecksOpen(true);
    }
  };
  const run = (
    command: PlanCommand,
    afterSave?: "publish" | "browse" | "check",
  ) => {
    if (inFlight.current) return;
    inFlight.current = true;
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
        if (command.kind !== "cancel" && command.kind !== "lock") {
          setContent(s.draft?.content ?? null);
          const nextView = (command.kind === "draft" || command.kind === "save") && afterSave !== "browse" ? (s.draft?.id ?? "current") : "current";
          setView(nextView);
          const nextContent = nextView === "current" ? s.current?.content : s.draft?.content;
          const nextRegion = nextContent?.releaseScope !== "company" && nextContent?.regions.some(r => r.id === regionId) ? regionId : null;
          setRegionId(nextRegion);
          window.history.replaceState(null, "", planningHref({ year, revision: nextView, region: nextRegion, period: initialPeriod }));
        }
        setMessage(command.kind === "save" ? T.saved : T.done);
        setConfirm(null);
        setPanel(null);
        if (afterSave === "publish" || afterSave === "check")
          await checkDraft(result.plan, afterSave === "publish");
        router.refresh();
      } catch {
        setError(E.plan_save_failed!);
      } finally {
        inFlight.current = false;
      }
    });
  };
  const choose = (value: string) => {
    if (dirty) {
      setError(T.saveFirst);
      return false;
    }
    setView(value);
    const targetRevision = value === "baseline" ? state.baseline?.id : value;
    window.history.replaceState(null, "", planningHref({ year, revision: targetRevision }));
    setError("");
    setMessage("");
    setRegionId(null);
    return true;
  };
  const selectRegion = (id: string | null) => {
    setRegionId(id);
    window.history.replaceState(null, "", planningHref({ year, revision: view === "baseline" ? state.baseline?.id : view, region: id, period: initialPeriod }));
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
      return revision ? planningFindings(c) : [];
    } catch {
      return null;
    }
  }, [c, revision]);
  const diff = c ? comparePlanContents(state.current?.content ?? null, c) : [];
  const sectionLabel: Record<string, string> = {
    regions: T.regions,
    periods: T.period,
    targets: T.target,
    budgets: T.customerBudget,
    contributions: T.contribution,
    team: T.team,
    actions: T.actions,
    strategyAcceptances: H.handoff,
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
      return (
        <span className="inline-flex flex-wrap items-center gap-xs">
          <MemberName
            sub={r.memberSub as string | null}
            name={r.memberName as string | null}
            fallback={T.demand}
          />
          <span>
            {String(r.role)}
            {" \u00b7 "}
            {String(r.percent)}%{" \u00b7 "}
            {String(r.start)} - {String(r.end)}
          </span>
        </span>
      );
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
    if (!c || !edit || pending || lockedPeriods.length) return;
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
  const currentRegion = companyEditing ? undefined : c?.regions.find((r) => r.id === regionId);
  const companyTarget = c?.targets.find(
    (t) =>
      t.scope === "workspace" &&
      t.period === `Y${year}` &&
      t.metric === "revenue",
  );
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
  const confirmVersion = (kind: NonNullable<typeof confirm>) => {
    setError("");
    if (kind === "release" && when === "future") {
      const code = planningReleaseTimeError(effective, year, Date.now());
      if (code) {
        setError(E[code]!);
        return;
      }
    }
    setPanel(null);
    setConfirm(kind);
  };
  const cancelConfirm = () => {
    if (!pending) {
      setConfirm(null);
      setPanel("version");
    }
  };
  const confirmLabel =
    confirm === "release"
      ? publishLabel
      : confirm === "discard"
        ? T.discard
        : confirm === "cancel"
          ? T.cancelSchedule
          : confirm === "lock"
            ? T.lock
            : T.close;
  const auxiliaryActions = [
    ...(editing
      ? [
          {
            id: "browse",
            label: T.browse,
            icon: "eye" as const,
            onSelect: () => {
              if (dirty)
                run(
                  {
                    kind: "save",
                    revisionId: state.draft!.id,
                    editToken: state.draft!.editToken,
                    content: c!,
                  },
                  "browse",
                );
              else choose("current");
            },
          },
        ]
      : []),
    ...(revision
      ? [
          {
            id: "diff",
            label: T.diff,
            icon: "git-branch" as const,
            onSelect: () => {
              setDiffSection("all");
              setPanel("diff");
            },
          },
        ]
      : []),
    {
      id: "history",
      label: T.history,
      icon: "clock-counter-clockwise" as const,
      onSelect: () => setPanel("history"),
    },
    ...(canEdit &&
    !state.closed &&
    (state.draft || state.current || state.scheduled)
      ? [
          {
            id: "version",
            label: T.version,
            icon: "settings" as const,
            onSelect: () => setPanel("version"),
          },
        ]
      : []),
  ];
  return (
    <div className="@container flex flex-col gap-xl">
      <ModuleHeadline
        moduleKey="planning"
        help={
          companyEditing
            ? T.companyFlowHint
            : regionalEditing
              ? T.regionFlowHint
              : T.companyFlowHint
        }
        tags={
          <>
            <StatusBadge tone="info">Y{year}</StatusBadge>
            {state.closed ? <Tag>{T.closed}</Tag> : null}
            {editing ? (
              <StatusBadge tone="warning">
                {dirty ? T.dirty : draftStateLabel}
              </StatusBadge>
            ) : revision ? (
              <StatusBadge tone="info">
                {T.published} V{revision.version}
              </StatusBadge>
            ) : null}
          </>
        }
        pageActions={{
          context: (
            <>
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
                  .filter(
                    (r) =>
                      r.state === "sealed" ||
                      (editing && r.id === state.draft?.id),
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.state === "draft"
                        ? T.draft
                        : `V${r.version} · ${r.id === state.scheduled?.id ? T.scheduled : T.snapshot}`}
                    </option>
                  ))}
              </NativeSelect>
            </>
          ),
          secondary: (
            <>
              <PageActionButton
                onClick={() => {
                  if (editing && dirty)
                    run(
                      {
                        kind: "save",
                        revisionId: state.draft!.id,
                        editToken: state.draft!.editToken,
                        content: c!,
                      },
                      "check",
                    );
                  else if (editing && plan)
                    transition(async () => {
                      await checkDraft(plan, false);
                    });
                  else {
                    setCheckError("");
                    setChecksOpen(true);
                  }
                }}
                disabled={!revision || pending}
              >
                {T.insights}
                {findings?.length ? ` · ${findings.length}` : ""}
              </PageActionButton>
              {!editing &&
              !state.draft &&
              state.current &&
              canEdit &&
              !state.closed ? (
                <PageActionButton
                  disabled={pending}
                  onClick={() => {
                    setReason(T.planRegions);
                    run({
                      kind: "draft",
                      content: {} as PlanContent,
                      scope: "regions",
                    });
                  }}
                >
                  {T.planRegions}
                </PageActionButton>
              ) : null}
              {editing ? (
                <PageActionButton
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
                </PageActionButton>
              ) : null}
            </>
          ),
          primary: (
            <>
              {canEdit && !editing && !state.closed ? (
                state.draft || state.current ? (
                  <PageActionButton intent="primary" disabled={pending} onClick={() =>
                    state.draft ? choose(state.draft.id) : run({
                      kind: "draft",
                      content: {} as PlanContent,
                      scope: "company",
                    })
                  }>
                    {state.draft ? T.resume : T.adjustCompany}
                  </PageActionButton>
                ) : (
                  <NewEntryButton label={T.create} disabled={pending} onClick={() =>
                    run({ kind: "draft", content: {} as PlanContent, scope: "company" })
                  } />
                )
              ) : null}
              {editing ? (
                <PageActionButton
                  intent="primary"
                  disabled={pending}
                  onClick={() => {
                    if (dirty)
                      run(
                        {
                          kind: "save",
                          revisionId: state.draft!.id,
                          editToken: state.draft!.editToken,
                          content: c!,
                        },
                        "publish",
                      );
                    else if (plan)
                      transition(async () => {
                        await checkDraft(plan, true);
                      });
                  }}
                >
                  {publishLabel}
                </PageActionButton>
              ) : null}
            </>
          ),
          more: auxiliaryActions.length ? (
            <RowActions
              label={`${T.version} · Y${year}`}
              items={auxiliaryActions}
              disabled={pending}
            />
          ) : undefined,
        }}
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
            disabled={pending}
            onClick={() => choose(state.scheduled!.id)}
          >
            {T.version}
          </Button>
        </p>
      ) : null}
      {!revision && !editing ? (
        <EmptyState title={W.noPublication} description={state.draft ? W.draftAvailable : W.noPublicationHint} />
      ) : (
        <>
          {edit && (companyEditing || (regionalEditing && currentRegion?.included)) ? (
            <PlanDraftAssistant key={`${state.draft!.id}|${state.draft!.editToken}|${regionId ?? "company"}`} content={c}
              context={{ year, revisionId: state.draft!.id, editToken: state.draft!.editToken, regionId: regionId ?? undefined }}
              edit={edit} disabled={pendingCommand} onBusy={setAssistantBusy}/>
          ) : null}
          {needsSourceRefresh && edit && !companyEditing ? (
            <div className="flex items-center gap-md text-body-small text-muted-foreground">
              {T.sourceChanged}
              <Button
                size="md"
                variant="secondary"
                disabled={pending || !!lockedPeriods.length}
                title={lockedPeriods.length ? T.lockedHint : undefined}
                onClick={refreshRegions}
              >
                {T.refreshSources}
              </Button>
            </div>
          ) : null}
          <Section
            icon="target"
            title={currentRegion ? currentRegion.name : T.company}
            help={regionalEditing ? T.regionFlowHint : T.targetHint}
            action={
              <div className="flex items-center gap-md">
                {!currentRegion && companyRevision ? (
                  <StatusBadge tone={companyEditing ? "warning" : "info"}>
                    {companyEditing ? T.draft : `${T.published} V${companyRevision.version}`}
                  </StatusBadge>
                ) : null}
                {currentRegion ? (
                  <Button
                    size="md"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => selectRegion(null)}
                  >
                    {T.back}
                  </Button>
                ) : null}
                {!editing && revision?.state === "sealed" ? (
                  <Link
                    href={attainmentHref({
                      period: initialPeriod ?? `Y${year}`,
                      scope: currentRegion
                        ? `territory:${currentRegion.id}`
                        : "workspace",
                      planRevision: revision.id,
                    })}
                    className="text-body-small text-muted-foreground transition-colors hover:text-primary"
                  >
                    {T.actual}
                  </Link>
                ) : null}
                <RowActions
                  label={`${currentRegion?.name ?? T.company} · ${T.version}`}
                  items={auxiliaryActions}
                  disabled={pending}
                />
              </div>
            }
          >
            {currentRegion && !edit ? (
              <div className="mb-md flex flex-wrap items-center gap-sm text-body">
                <span className="text-muted-foreground">{T.owner}:</span>
                <MemberName sub={currentRegion.ownerSub} fallback={W.ownerPending}/>
              </div>
            ) : null}
            {currentRegion && edit ? (
              <div className="mb-lg flex flex-wrap items-end gap-md">
                <Field>
                  <FieldLabel htmlFor="plan-region-participation">
                    {T.included}
                  </FieldLabel>
                  <NativeSelect
                    id="plan-region-participation"
                    value={currentRegion.included ? "yes" : "no"}
                    disabled={pending || !!lockedPeriods.length}
                    title={lockedPeriods.length ? T.lockedHint : undefined}
                    onChange={(e) => {
                      const included = e.target.value === "yes";
                      const next = structuredClone(c);
                      next.regions = next.regions.map((r) =>
                        r.id === regionId ? { ...r, included } : r,
                      );
                      if (!included) {
                        setExcludeId(currentRegion.id);
                        return;
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
                <Field className="min-w-48">
                  <FieldLabel htmlFor="plan-region-owner">{T.owner}</FieldLabel>
                  <MemberPicker id="plan-region-owner" label={T.owner} value={currentRegion.ownerSub} disabled={pending || !sources.canTeam || !!lockedPeriods.length}
                    options={sources.canTeam ? sources.members.map(m => ({ value: m.sub, label: m.name })) : null}
                    onValueChange={sub => edit({ ...c, regions: c.regions.map(r => r.id === currentRegion.id ? { ...r, ownerSub: sub || null } : r) })}/>
                </Field>
                {!currentRegion.included ? (
                  <Field className="flex-1">
                    <FieldLabel htmlFor="plan-region-reason">
                      {T.exclusionReason}
                    </FieldLabel>
                    <Input
                      id="plan-region-reason"
                      value={currentRegion.reason}
                      disabled={pending || !!lockedPeriods.length}
                      maxLength={8000}
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
                initiallyOpen={!!initialPeriod && initialPeriod !== `Y${year}`}
                content={c}
                scope={
                  currentRegion ? `territory:${currentRegion.id}` : "workspace"
                }
                edit={regionalEditing && !currentRegion ? null : edit}
                disabled={pending}
                lockedPeriods={lockedPeriods}
                headerInfo={
                  !currentRegion ? (
                    <CompanyTargetAllocation
                      content={c}
                      target={companyTarget}
                      currency={sources.currency}
                    />
                  ) : undefined
                }

              />
            ) : (
              <p className="text-body-small text-muted-foreground">
                {currentRegion.reason}
              </p>
            )}
          </Section>
          <StrategyHandoffPanel content={c} sources={sources} edit={edit} regionId={regionId} disabled={pending} lockedPeriods={lockedPeriods}/>
          {companyEditing ? null : currentRegion ? (
            currentRegion.included ? (
              <PlanSupport
                key={currentRegion.id}
                content={c}
                regionId={currentRegion.id}
                sources={sources}
                lockedPeriods={lockedPeriods}
                edit={edit}
                disabled={pending}
              />
            ) : null
          ) : !revision && !editing ? (
            <EmptyState title={T.companyFirst} />
          ) : c.regions.length ? (
            <PlanRegions
              content={c}
              onSelect={selectRegion}
              basis={regionalBasis ? <span className="text-body-small text-muted-foreground">{W.regionalBasis} V{regionalBasis.version}</span> : undefined}
              onAttainment={
                !editing
                  ? (id) =>
                      router.push(
                        attainmentHref({
                          period: `Y${year}`,
                          scope: `territory:${id}`,
                          planRevision: revision?.id,
                        }),
                      )
                  : undefined
              }
              editing={editing}
              disabled={pending}
              lockedPeriods={lockedPeriods}
            />
          ) : null}
          <PlanAssumptions
            content={c}
            edit={edit}
            disabled={pending}
            onReview={() => {
              setDiffSection("assumptions");
              setPanel("diff");
            }}
          />
        </>
      )}
      <ConfirmDestructive
        open={!!excludeId}
        onOpenChange={(open) => {
          if (!open) setExcludeId(null);
        }}
        verb={T.excludeRegion}
        target={
          c?.regions.find((region) => region.id === excludeId)?.name ??
          T.regions
        }
        consequence={T.excludeRegionHint}
        cancelLabel={T.cancel}
        titleTemplate={DS_LABELS.confirmTitleTemplate}
        onConfirm={() => {
          if (edit && c && excludeId && !pending && !lockedPeriods.length)
            edit(excludePlanningRegion(c, excludeId));
          setExcludeId(null);
        }}
      />
      <Drawer
        open={panel === "diff"}
        onClose={() => setPanel(null)}
        width="lg"
        title={T.diff}
        description={T.publishHint}
        closeLabel={T.cancel}
      >
        <div className="flex flex-col gap-lg">
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
          <p className="mb-md text-body-small text-muted-foreground">
            {diff.length} {T.changes}
            {dirty ? ` · ${T.saveFirst}` : ""}
          </p>
          {diff.some(
            (item) => diffSection === "all" || item.section === diffSection,
          ) ? (
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
                    (d) => diffSection === "all" || d.section === diffSection,
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
                              ? previewTargetDelta(
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
            <p className="text-body-small text-muted-foreground">{T.noDiff}</p>
          )}
        </div>
      </Drawer>
      <Drawer
        open={checksOpen}
        onClose={() => setChecksOpen(false)}
        width="md"
        title={
          <span className="inline-flex items-center gap-xs">
            {T.insights}
            <TitleHelp topic={T.insights}>{T.insightsHint}</TitleHelp>
          </span>
        }
        closeLabel={T.cancel}
      >
        {checkError ? (
          <p className="mb-md text-body-small text-destructive" role="alert">
            {checkError}
          </p>
        ) : null}
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
                        selectRegion(f.regionId);
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
        <Drawer
          open={panel === "version"}
          onClose={() => {
            if (!pending) setPanel(null);
          }}
          width="md"
          title={editing ? publishLabel : T.version}
          description={T.reasonHint}
          closeLabel={T.cancel}
        >
          {error ? (
            <p className="mb-md text-body-small text-destructive" role="alert">
              {error}
            </p>
          ) : null}
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
                    disabled={pending}
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
                      disabled={pending}
                      aria-invalid={
                        (!!effective && !!releaseTimeError) || undefined
                      }
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
                    (when === "future" && !!releaseTimeError)
                  }
                  onClick={() => confirmVersion("release")}
                >
                  {publishLabel}
                </Button>
                <Button
                  size="md"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => confirmVersion("discard")}
                >
                  {T.discard}
                </Button>
              </div>
            ) : null}
            {editing && effective && releaseTimeError ? (
              <p className="text-body-small text-destructive" role="alert">
                {E[releaseTimeError]}
              </p>
            ) : null}
            {state.scheduled ? (
              <Button
                size="md"
                variant="secondary"
                disabled={pending || !reason.trim()}
                onClick={() => confirmVersion("cancel")}
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
                  disabled={pending || !lockablePeriods.length}
                  onChange={(e) => setLockPeriod(e.target.value)}
                >
                  {!lockablePeriods.length ? (
                    <option value="">{T.noFinishedPeriods}</option>
                  ) : null}
                  {lockablePeriods.map((period) => (
                    <option
                      key={period.key}
                      value={period.key}
                      disabled={lockedPeriods.includes(period.key)}
                    >
                      {period.key}
                      {lockedPeriods.includes(period.key)
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
                    dirty ||
                    !selectedLockPeriod ||
                    !!state.scheduled ||
                    plan?.events.some(
                      (e) => e.kind === "lock" && e.period === lockPeriod,
                    )
                  }
                  title={
                    dirty
                      ? T.saveFirst
                      : !selectedLockPeriod
                        ? T.noFinishedPeriods
                        : undefined
                  }
                  onClick={() => confirmVersion("lock")}
                >
                  {T.lock}
                </Button>
                <Button
                  size="md"
                  variant="ghost"
                  disabled={pending || !reason.trim()}
                  onClick={() => confirmVersion("close")}
                >
                  {T.close}
                </Button>
              </div>
            ) : null}
          </div>
        </Drawer>
      ) : null}
      <Drawer
        open={panel === "history"}
        onClose={() => setPanel(null)}
        width="lg"
        title={
          <span className="inline-flex items-center gap-xs">
            {T.history}
            <TitleHelp topic={T.history}>{T.baselineHint}</TitleHelp>
          </span>
        }
        closeLabel={T.cancel}
      >
        {error ? (
          <p className="mb-md text-body-small text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {plan?.events.some((e) => e.kind !== "draft" && e.kind !== "save") ? (
          <>
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
                {[...(plan?.events ?? [])]
                  .filter((e) => e.kind !== "draft" && e.kind !== "save")
                  .reverse()
                  .map((e) => (
                    <TableRow key={e.no}>
                      <TableCell>
                        {e.revisionId &&
                        plan.revisions.some(
                          (r) => r.id === e.revisionId && r.state === "sealed",
                        ) ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (choose(e.revisionId!)) setPanel(null);
                            }}
                          >
                            {plan?.revisions.find((r) => r.id === e.revisionId)
                              ?.version
                              ? `V${plan?.revisions.find((r) => r.id === e.revisionId)?.version}`
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
                        <MemberName
                          sub={e.actor}
                          name={
                            sources.members.find((m) => m.sub === e.actor)?.name
                          }
                        />
                      </TableCell>
                      <TableCell>{e.reason || "—"}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </>
        ) : (
          <EmptyState title={T.empty} />
        )}
      </Drawer>
      <Drawer
        open={!!confirm}
        onClose={cancelConfirm}
        width="md"
        title={
          confirm === "release"
            ? companyEditing
              ? T.publishCompanyConfirm
              : regionalEditing
                ? T.publishRegionsConfirm
                : T.publishConfirm
            : confirm === "discard"
              ? T.discardConfirm
              : confirm === "cancel"
                ? T.cancelSchedule
                : confirm === "lock"
                  ? T.lock
                  : T.closeConfirm
        }
        description={
          confirm === "release"
            ? T.publishHint
            : confirm === "discard"
              ? T.discardHint
              : confirm === "cancel"
                ? T.cancelScheduleHint
                : confirm === "lock"
                  ? T.lockHint
                  : T.closeHint
        }
        closeLabel={T.cancel}
      >
        <div className="flex flex-col gap-lg">
          {error ? (
            <p className="text-body-small text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <p className="text-body-small text-muted-foreground">
            {reason || T.baseline}
          </p>
          {confirm === "lock" ? (
            <p className="text-body-small">{lockPeriod}</p>
          ) : null}
          {confirm === "release" ? (
            <>
              <p className="text-body-small">
                {when === "future"
                  ? `${T.scheduled} · ${effective.replace("T", " ")}`
                  : T.immediate}
              </p>
              <p className="text-body-small">
                {T.diff} · {diff.length} {T.changes}
              </p>
              {managedLegacyIds.length ? (
                <>
                  <p className="text-body-small text-muted-foreground">
                    {T.adoptHint}
                  </p>
                  <label className="flex items-center gap-sm text-body-small">
                    <Checkbox
                      checked={adopt}
                      disabled={pending}
                      onCheckedChange={(value) => setAdopt(value === true)}
                    />
                    {T.adopt} · {managedLegacyIds.length}
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
              onClick={cancelConfirm}
            >
              {T.cancel}
            </Button>
            <Button
              size="md"
              disabled={
                pending ||
                (confirm === "release" && managedLegacyIds.length > 0 && !adopt)
              }
              onClick={() => {
                if (confirm === "release" && state.draft) {
                  if (when === "future") {
                    const code = planningReleaseTimeError(
                      effective,
                      year,
                      Date.now(),
                    );
                    if (code) {
                      setError(E[code]!);
                      return;
                    }
                  }
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
                          adoptions: managedLegacyIds.map((targetId) => ({
                            targetId,
                            snapshot: null,
                          })),
                        }
                      : {}),
                  });
                } else if (confirm === "discard" && state.draft)
                  run({
                    kind: "discard",
                    revisionId: state.draft.id,
                    editToken: state.draft.editToken,
                  });
                else if (confirm === "cancel") run({ kind: "cancel", reason });
                else if (confirm === "lock" && selectedLockPeriod)
                  run({ kind: "lock", period: lockPeriod, reason });
                else if (confirm === "close") run({ kind: "close", reason });
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
