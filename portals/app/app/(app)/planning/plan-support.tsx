"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Button,
  Drawer,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@vxture/design-ui";
import { RowActions } from "../components/table-fittings";
import { useLocale, useMessages } from "../lib/i18n/provider";
import type {
  PlanContent,
  CustomerBudget,
  CustomerContribution,
  TeamAllocation,
  PlanAction,
} from "../../domains/planning/plan-model";
import { PlanError, minor } from "../../domains/planning/plan-values";
import {
  planningEntryLocked,
  prunePlanningBudgets,
  validatePlanningAction,
  validatePlanningContribution,
  validatePlanningTeam,
} from "../lib/planning-operations";
import { loadPlanningCustomerBudget } from "./plan-actions";
import type { PlanSources } from "./plan-data";
type Props = {
  content: PlanContent;
  regionId: string;
  sources: PlanSources;
  edit: ((c: PlanContent) => void) | null;
  disabled: boolean;
  lockedPeriods?: readonly string[];
};
export function PlanSupport({
  content: c,
  regionId,
  sources,
  edit,
  disabled,
  lockedPeriods = [],
}: Props) {
  const locale = useLocale();
  const {
    PLAN_VERSION_TEXT: T,
    PLAN_VERSION_ERROR: E,
    DS_LABELS,
  } = useMessages();
  const [sourcePlanId, setSourcePlanId] = useState<string | null>(null);
  const sourceRequest = useRef(0);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceMessage, setSourceMessage] = useState("");
  const [mode, setMode] = useState<"customer" | "team" | "action" | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [accountId, setAccountId] = useState("");
  const [budget, setBudget] = useState("");
  const [contribution, setContribution] = useState("");
  const [note, setNote] = useState("");
  const [responsibility, setResponsibility] = useState<"primary" | "support">(
    "primary",
  );
  const [member, setMember] = useState("");
  const [role, setRole] = useState(T.salesRole);
  const [percent, setPercent] = useState("100");
  const [fte, setFte] = useState("1");
  const [unit, setUnit] = useState("");
  const [objective, setObjective] = useState("");
  const [due, setDue] = useState(`${c.year}-12-31`);
  const [start, setStart] = useState(`${c.year}-01-01`);
  const [end, setEnd] = useState(`${c.year + 1}-01-01`);
  const [error, setError] = useState("");
  const heldContribution = c.contributions.find(
    (item) => item.key === editingKey,
  );
  const target =
    c.targets.find((item) => item.key === heldContribution?.targetKey) ??
    c.targets.find(
      (t) =>
        t.scope === `territory:${regionId}` &&
        t.metric === "revenue" &&
        t.period === `Y${c.year}`,
    );
  useEffect(
    () => () => {
      sourceRequest.current++;
    },
    [],
  );
  const close = () => {
    sourceRequest.current++;
    setSourceLoading(false);
    setMode(null);
  };
  const readBudget = (id: string) => {
    const request = ++sourceRequest.current;
    setSourceLoading(true);
    setSourceMessage("");
    setError("");
    void loadPlanningCustomerBudget(id, c.year)
      .then((result) => {
        if (request !== sourceRequest.current) return;
        setSourceLoading(false);
        if (!result.ok) setError(E[result.error] ?? E.source_read_failed!);
        else if (
          result.source &&
          result.source.currency === target?.currency &&
          result.source.period === target?.period
        ) {
          setBudget(result.source.amount);
          setSourcePlanId(result.source.id);
          setNote(`${T.customerBudget} · ${result.source.period}`);
          setSourceMessage(T.budgetLoaded);
        } else {
          setSourcePlanId(null);
          setSourceMessage(T.budgetManualHint);
        }
      })
      .catch(() => {
        if (request === sourceRequest.current) {
          setSourceLoading(false);
          setError(E.source_read_failed!);
        }
      });
  };
  const selectAccount = (id: string) => {
    sourceRequest.current++;
    setSourceLoading(false);
    setAccountId(id);
    setSourcePlanId(null);
    setSourceMessage("");
    setBudget("");
    setNote("");
    setError("");
    const prior = c.budgets.find(
      (b) =>
        b.accountId === id &&
        b.period === target?.period &&
        b.metric === target?.metric &&
        b.currency === target?.currency,
    );
    if (prior) {
      setBudget(prior.amount);
      setNote(prior.note);
      setSourcePlanId(prior.sourcePlanId);
    } else if (id) readBudget(id);
  };
  const open = (m: NonNullable<typeof mode>, key: string | null = null) => {
    sourceRequest.current++;
    setSourceLoading(false);
    setMode(m);
    setEditingKey(key);
    setSourcePlanId(null);
    setSourceMessage("");
    setError("");
    setAccountId("");
    setBudget("");
    setContribution("");
    setNote("");
    setQuery("");
    setObjective("");
    setMember("");
    setRole(T.salesRole);
    setPercent("100");
    setFte("1");
    setUnit("");
    setResponsibility("primary");
    setStart(`${c.year}-01-01`);
    setEnd(`${c.year + 1}-01-01`);
    setDue(`${c.year}-12-31`);
    if (m === "customer" && key) {
      const line = c.contributions.find((item) => item.key === key)!;
      const held = c.budgets.find((item) => item.key === line.budgetKey)!;
      setAccountId(held.accountId);
      setBudget(held.amount);
      setSourcePlanId(held.sourcePlanId);
      setNote(held.note);
      setContribution(line.amount);
      setResponsibility(line.responsibility);
    } else if (m === "team" && key) {
      const held = c.team.find((item) => item.key === key)!;
      setMember(held.memberSub ?? "");
      setRole(held.role);
      setPercent(String(held.percent));
      setFte(held.requestedFte ?? "1");
      setUnit(held.unitId ?? "");
      setStart(held.start);
      setEnd(held.end);
      setNote(held.note);
    } else if (m === "action" && key) {
      const held = c.actions.find((item) => item.key === key)!;
      setMember(held.ownerSub ?? "");
      setObjective(held.objective);
      setDue(held.due);
    }
  };
  const apply = () => {
    if (
      !edit ||
      disabled ||
      sourceLoading ||
      !mode ||
      (mode === "customer" ? !sources.canCustomers : !sources.canTeam)
    )
      return;
    try {
      const next = structuredClone(c);
      const key = editingKey ?? crypto.randomUUID();
      if (mode === "customer") {
        const account = sources.accounts.find((a) => a.id === accountId);
        if (!account || !target) throw new PlanError("invalid_contribution");
        minor(budget);
        if (!sourcePlanId && !note.trim())
          throw new PlanError("budget_basis_required");
        const prior = c.budgets.find(
          (b) =>
            b.accountId === account.id &&
            b.period === target.period &&
            b.metric === target.metric &&
            b.currency === target.currency,
        );
        const b: CustomerBudget = {
          key: prior?.key ?? crypto.randomUUID(),
          accountId: account.id,
          name: account.name,
          tier: account.tier,
          period: target.period,
          metric: target.metric,
          currency: target.currency,
          amount: budget,
          sourcePlanId,
          sourceReadAt: prior?.sourceReadAt ?? new Date().toISOString(),
          note: note.trim(),
        };
        next.budgets = [
          ...next.budgets.filter((item) => item.key !== b.key),
          b,
        ];
        const x: CustomerContribution = {
          key,
          budgetKey: b.key,
          targetKey: target.key,
          regionId,
          responsibility,
          amount: contribution,
        };
        // A shared budget change must account for every other region as well.
        if (planningEntryLocked(c, lockedPeriods, target))
          throw new PlanError("closed_period_changed");
        validatePlanningContribution(next, x);
        next.contributions = [
          ...next.contributions.filter((item) => item.key !== key),
          x,
        ];
      } else if (mode === "team") {
        if (
          (member && !sources.members.some((item) => item.sub === member)) ||
          (unit && !sources.units.some((item) => item.id === unit))
        )
          throw new PlanError("invalid_resource");
        if (member) minor(percent);
        const x: TeamAllocation = {
          key,
          regionId,
          memberSub: member || null,
          memberName: sources.members.find((m) => m.sub === member)?.name ?? "",
          unitId: unit || null,
          unitName: sources.units.find((u) => u.id === unit)?.name ?? "",
          role: role.trim(),
          start,
          end,
          percent: member ? Number(percent) : 0,
          requestedFte: member ? null : fte,
          note: note.trim(),
        };
        validatePlanningTeam(next, x);
        if (planningEntryLocked(c, lockedPeriods, x))
          throw new PlanError("closed_period_changed");
        next.team = [...next.team.filter((item) => item.key !== key), x];
      } else {
        if (!sources.members.some((item) => item.sub === member))
          throw new PlanError("member_unknown");
        const prior = c.actions.find((item) => item.key === key);
        const x: PlanAction = {
          key,
          regionId,
          targetKey: prior ? prior.targetKey : (target?.key ?? null),
          accountId: prior?.accountId ?? null,
          objective: objective.trim(),
          ownerSub: member,
          due,
          evidenceRefs: prior?.evidenceRefs ?? [],
        };
        validatePlanningAction(next, x);
        if (planningEntryLocked(c, lockedPeriods, x))
          throw new PlanError("closed_period_changed");
        next.actions = [...next.actions.filter((item) => item.key !== key), x];
      }
      edit(prunePlanningBudgets(next, c));
      close();
    } catch (cause) {
      setError(
        cause instanceof PlanError
          ? (E[cause.code] ?? E.invalid_plan!)
          : E.invalid_plan!,
      );
    }
  };
  const rowActions = (
    m: NonNullable<typeof mode>,
    key: string,
    label: string,
    locked: boolean,
    remove: () => void,
  ) => (
    <RowActions
      label={`${T.operations} · ${label}`}
      disabled={disabled}
      items={
        edit && (m === "customer" ? sources.canCustomers : sources.canTeam)
          ? [
              {
                id: "edit",
                label: T.editItem,
                icon: "edit",
                disabled: locked,
                hint: locked ? T.lockedHint : undefined,
                onSelect: () => open(m, key),
              },
              {
                id: "remove",
                label: T.remove,
                icon: "trash",
                danger: true,
                disabled: locked,
                hint: locked ? T.lockedHint : undefined,
                confirm: {
                  verb: T.remove,
                  target: label,
                  consequence: T.removeHint,
                  titleTemplate: DS_LABELS.confirmTitleTemplate,
                  cancelLabel: T.cancel,
                  pendingLabel: DS_LABELS.confirmPending,
                  onConfirm: remove,
                },
              },
            ]
          : []
      }
    />
  );
  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-col gap-md">
        <div className="flex items-center justify-between gap-md">
          <div>
            <h3 className="text-heading-3">{T.customers}</h3>
            <p className="text-body-small text-muted-foreground">
              {T.customerHint}
            </p>
          </div>
          <RowActions
            label={T.addCustomer}
            disabled={disabled || !target}
            items={
              edit && sources.canCustomers
                ? [
                    {
                      id: "add",
                      label: T.addCustomer,
                      icon: "plus",
                      onSelect: () => open("customer"),
                    },
                  ]
                : []
            }
          />
        </div>
        {c.contributions.some((x) => x.regionId === regionId) ? (
          <Table className="table-fixed min-w-panel-lg">
            <TableHeader>
              <TableRow>
                {[
                  "",
                  T.customer,
                  T.customerBudget,
                  T.contribution,
                  T.responsibility,
                  T.note,
                  "",
                ].map((l, i, columns) => (
                  <TableHead
                    key={i}
                    className={
                      i === 0 || i === columns.length - 1
                        ? "w-table-col-fixed text-center"
                        : undefined
                    }
                  >
                    {i === columns.length - 1 ? T.operations : l}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.contributions
                .filter((x) => x.regionId === regionId)
                .map((x, index) => {
                  const b = c.budgets.find((b) => b.key === x.budgetKey)!;
                  return (
                    <TableRow key={x.key}>
                      <TableCell className="w-table-col-fixed text-center text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <Link
                          className="font-medium transition-colors hover:text-primary"
                          href={`/account/${b.accountId}`}
                        >
                          {b.name}
                        </Link>
                        <p className="text-label-small text-muted-foreground">
                          {b.period} · {b.currency}
                        </p>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {Number(b.amount).toLocaleString(locale)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {Number(x.amount).toLocaleString(locale)}
                      </TableCell>
                      <TableCell>
                        {x.responsibility === "primary" ? T.primary : T.support}
                      </TableCell>
                      <TableCell className="truncate" title={b.note}>
                        {b.note}
                      </TableCell>
                      <TableCell className="w-table-col-fixed text-center">
                        {rowActions(
                          "customer",
                          x.key,
                          b.name,
                          c.targets.some(
                            (line) =>
                              line.key === x.targetKey &&
                              planningEntryLocked(c, lockedPeriods, line),
                          ),
                          () =>
                            edit?.(
                              prunePlanningBudgets(
                                {
                                  ...c,
                                  contributions: c.contributions.filter(
                                    (item) => item.key !== x.key,
                                  ),
                                },
                                c,
                              ),
                            ),
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        ) : (
          <p className="py-md text-body-small text-muted-foreground">
            {T.customerEmpty}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-md">
        <div className="flex items-center justify-between gap-md">
          <div>
            <h3 className="text-heading-3">{T.team}</h3>
            <p className="text-body-small text-muted-foreground">
              {T.teamHint}
            </p>
          </div>
          <RowActions
            label={T.addMember}
            disabled={disabled}
            items={
              edit && sources.canTeam
                ? [
                    {
                      id: "add",
                      label: T.addMember,
                      icon: "plus",
                      onSelect: () => open("team"),
                    },
                  ]
                : []
            }
          />
        </div>
        {c.team.some((x) => x.regionId === regionId) ? (
          <Table className="table-fixed min-w-panel-lg">
            <TableHeader>
              <TableRow>
                {["", T.member, T.role, T.unit, T.percent, T.period, ""].map(
                  (l, i, columns) => (
                    <TableHead
                      key={i}
                      className={
                        i === 0 || i === columns.length - 1
                          ? "w-table-col-fixed text-center"
                          : undefined
                      }
                    >
                      {i === columns.length - 1 ? T.operations : l}
                    </TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.team
                .filter((x) => x.regionId === regionId)
                .map((x, index) => (
                  <TableRow key={x.key}>
                    <TableCell className="w-table-col-fixed text-center text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      {x.memberSub ? x.memberName : T.demand}
                    </TableCell>
                    <TableCell>{x.role}</TableCell>
                    <TableCell>{x.unitName || "—"}</TableCell>
                    <TableCell>
                      {x.memberSub ? `${x.percent}%` : `${x.requestedFte} FTE`}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {x.start} — {x.end}
                    </TableCell>
                    <TableCell className="w-table-col-fixed text-center">
                      {rowActions(
                        "team",
                        x.key,
                        x.memberName || T.demand,
                        planningEntryLocked(c, lockedPeriods, x),
                        () =>
                          edit?.({
                            ...c,
                            team: c.team.filter((item) => item.key !== x.key),
                          }),
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        ) : (
          <p className="py-md text-body-small text-muted-foreground">
            {T.teamEmpty}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-md">
        <div className="flex items-center justify-between gap-md">
          <div>
            <h3 className="text-heading-3">{T.actions}</h3>
            <p className="text-body-small text-muted-foreground">
              {T.actionHint}
            </p>
          </div>
          <RowActions
            label={T.addAction}
            disabled={disabled}
            items={
              edit && sources.canTeam
                ? [
                    {
                      id: "add",
                      label: T.addAction,
                      icon: "plus",
                      onSelect: () => open("action"),
                    },
                  ]
                : []
            }
          />
        </div>
        {c.actions.some((x) => x.regionId === regionId) ? (
          <Table className="table-fixed min-w-panel-lg">
            <TableHeader>
              <TableRow>
                {["", T.objective, T.owner, T.due, ""].map((l, i, columns) => (
                  <TableHead
                    key={i}
                    className={
                      i === 0 || i === columns.length - 1
                        ? "w-table-col-fixed text-center"
                        : undefined
                    }
                  >
                    {i === columns.length - 1 ? T.operations : l}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.actions
                .filter((x) => x.regionId === regionId)
                .map((x, index) => (
                  <TableRow key={x.key}>
                    <TableCell className="w-table-col-fixed text-center text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>{x.objective}</TableCell>
                    <TableCell>
                      {sources.members.find((m) => m.sub === x.ownerSub)
                        ?.name ?? x.ownerSub}
                    </TableCell>
                    <TableCell>{x.due}</TableCell>
                    <TableCell className="w-table-col-fixed text-center">
                      {rowActions(
                        "action",
                        x.key,
                        x.objective,
                        planningEntryLocked(c, lockedPeriods, x),
                        () =>
                          edit?.({
                            ...c,
                            actions: c.actions.filter(
                              (item) => item.key !== x.key,
                            ),
                          }),
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        ) : (
          <p className="py-md text-body-small text-muted-foreground">
            {T.actionEmpty}
          </p>
        )}
      </div>
      <Drawer
        open={mode !== null}
        onClose={close}
        width="md"
        title={
          editingKey
            ? T.editItem
            : mode === "customer"
              ? T.addCustomer
              : mode === "team"
                ? T.addMember
                : T.addAction
        }
        description={
          mode === "customer"
            ? T.customerHint
            : mode === "team"
              ? T.teamHint
              : T.actionHint
        }
        closeLabel={T.cancel}
      >
        <fieldset
          disabled={disabled || !edit}
          className="flex min-w-0 flex-col gap-lg"
        >
          {mode === "customer" ? (
            <>
              <Field>
                <FieldLabel htmlFor="plan-account-query">
                  {T.customerSearch}
                </FieldLabel>
                <Input
                  id="plan-account-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="plan-account">{T.customer}</FieldLabel>
                <NativeSelect
                  id="plan-account"
                  value={accountId}
                  disabled={!!editingKey}
                  onChange={(e) => selectAccount(e.target.value)}
                >
                  <option value="">{T.select}</option>
                  {sources.accounts
                    .filter(
                      (a) =>
                        a.id === accountId ||
                        !query ||
                        a.name
                          .toLocaleLowerCase()
                          .includes(query.toLocaleLowerCase()),
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <p className="text-body-small text-muted-foreground">
                {T.budgetSharedHint}
              </p>
              <Field>
                <FieldLabel htmlFor="plan-budget">
                  {T.customerBudget} · {target?.currency}
                </FieldLabel>
                <Input
                  id="plan-budget"
                  inputMode="decimal"
                  value={budget}
                  disabled={sourceLoading}
                  onChange={(e) => {
                    setBudget(e.target.value);
                    setSourcePlanId(null);
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="plan-budget-note">
                  {T.budgetNote}
                </FieldLabel>
                <Input
                  id="plan-budget-note"
                  disabled={sourceLoading}
                  value={note}
                  maxLength={8000}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <Button
                size="md"
                variant="secondary"
                disabled={!accountId || sourceLoading}
                onClick={() => readBudget(accountId)}
              >
                {sourceLoading ? T.budgetLoading : T.budgetRetry}
              </Button>
              {sourceMessage ? (
                <p
                  className="text-body-small text-muted-foreground"
                  role="status"
                >
                  {sourceMessage}
                </p>
              ) : null}
              <Field>
                <FieldLabel htmlFor="plan-contribution">
                  {T.contribution}
                </FieldLabel>
                <Input
                  id="plan-contribution"
                  inputMode="decimal"
                  value={contribution}
                  onChange={(e) => setContribution(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="plan-responsibility">
                  {T.responsibility}
                </FieldLabel>
                <NativeSelect
                  id="plan-responsibility"
                  value={responsibility}
                  onChange={(e) =>
                    setResponsibility(e.target.value as typeof responsibility)
                  }
                >
                  <option value="primary">{T.primary}</option>
                  <option value="support">{T.support}</option>
                </NativeSelect>
              </Field>
            </>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="plan-member">{T.member}</FieldLabel>
                <NativeSelect
                  id="plan-member"
                  value={member}
                  onChange={(e) => setMember(e.target.value)}
                >
                  <option value="">
                    {mode === "team" ? T.demand : T.select}
                  </option>
                  {sources.members.map((m) => (
                    <option key={m.sub} value={m.sub}>
                      {m.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {mode === "team" ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="plan-role">{T.role}</FieldLabel>
                    <Input
                      id="plan-role"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="plan-unit">{T.unit}</FieldLabel>
                    <NativeSelect
                      id="plan-unit"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                    >
                      <option value="">{T.noUnit}</option>
                      {sources.units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="plan-percent">
                      {member ? T.percent : T.requestedFte}
                    </FieldLabel>
                    <Input
                      id="plan-percent"
                      inputMode="decimal"
                      value={member ? percent : fte}
                      onChange={(e) =>
                        member
                          ? setPercent(e.target.value)
                          : setFte(e.target.value)
                      }
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-md">
                    <Field>
                      <FieldLabel htmlFor="plan-start">{T.start}</FieldLabel>
                      <Input
                        type="date"
                        id="plan-start"
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="plan-end">{T.end}</FieldLabel>
                      <Input
                        type="date"
                        id="plan-end"
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                      />
                    </Field>
                  </div>
                </>
              ) : (
                <>
                  <Field>
                    <FieldLabel htmlFor="plan-objective">
                      {T.objective}
                    </FieldLabel>
                    <Input
                      id="plan-objective"
                      value={objective}
                      onChange={(e) => setObjective(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="plan-due">{T.due}</FieldLabel>
                    <Input
                      type="date"
                      id="plan-due"
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                    />
                  </Field>
                </>
              )}
            </>
          )}
          {error ? (
            <p role="alert" className="text-body-small text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-sm">
            <Button size="md" variant="secondary" onClick={close}>
              {T.cancel}
            </Button>
            <Button
              size="md"
              disabled={disabled || sourceLoading || !edit}
              onClick={apply}
            >
              {T.apply}
            </Button>
          </div>
        </fieldset>
      </Drawer>
    </div>
  );
}
