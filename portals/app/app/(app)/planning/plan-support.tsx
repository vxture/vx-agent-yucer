"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  Button,
  Drawer,
  EmptyState,
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
import { loadPlanningCustomerBudget } from "./plan-actions";
import type { PlanSources } from "./plan-data";
type Props = {
  content: PlanContent;
  regionId: string;
  sources: PlanSources;
  edit: ((c: PlanContent) => void) | null;
  disabled: boolean;
};
export function PlanSupport({
  content: c,
  regionId,
  sources,
  edit,
  disabled,
}: Props) {
  const locale = useLocale();
  const { PLAN_VERSION_TEXT: T, PLAN_VERSION_ERROR: E } = useMessages();
  const [sourcePlanId, setSourcePlanId] = useState<string | null>(null);
  const sourceRequest = useRef(0);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [mode, setMode] = useState<"customer" | "team" | "action" | null>(null);
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
  const target = c.targets.find(
    (t) =>
      t.scope === `territory:${regionId}` &&
      t.metric === "revenue" &&
      t.period === `Y${c.year}`,
  );
  const open = (m: typeof mode) => {
    setMode(m);
    setSourcePlanId(null);
    setError("");
    setAccountId("");
    setBudget("");
    setContribution("");
    setNote("");
    setQuery("");
    setObjective("");
  };
  const add = () => {
    if (!edit) return;
    const next = structuredClone(c);
    const key = crypto.randomUUID();
    if (mode === "customer") {
      const account = sources.accounts.find((a) => a.id === accountId);
      if (!account || !target || !/^\d+(\.\d{1,2})?$/.test(contribution)) {
        setError(E.invalid_contribution!);
        return;
      }
      const prior = c.budgets.find(
        (b) =>
          b.accountId === account.id &&
          b.period === target.period &&
          b.metric === "revenue" &&
          b.currency === target.currency,
      );
      if (!prior && (!/^\d+(\.\d{1,2})?$/.test(budget) || !note.trim())) {
        setError(E.budget_basis_required!);
        return;
      }
      const b: CustomerBudget = prior ?? {
        key,
        accountId: account.id,
        name: account.name,
        tier: account.tier,
        period: target.period,
        metric: "revenue",
        currency: target.currency,
        amount: budget,
        sourcePlanId,
        sourceReadAt: new Date().toISOString(),
        note,
      };
      if (!prior) next.budgets.push(b);
      const x: CustomerContribution = {
        key: crypto.randomUUID(),
        budgetKey: b.key,
        targetKey: target.key,
        regionId,
        responsibility,
        amount: contribution,
      };
      next.contributions.push(x);
    } else if (mode === "team") {
      if (!role.trim() || !/^\d+(\.\d{1,2})?$/.test(member ? percent : fte)) {
        setError(E.invalid_resource!);
        return;
      }
      const x: TeamAllocation = {
        key,
        regionId,
        memberSub: member || null,
        memberName: sources.members.find((m) => m.sub === member)?.name ?? "",
        unitId: unit || null,
        unitName: sources.units.find((u) => u.id === unit)?.name ?? "",
        role,
        start,
        end,
        percent: member ? Number(percent) : 0,
        requestedFte: member ? null : fte,
        note,
      };
      next.team.push(x);
    } else if (mode === "action") {
      if (!objective.trim() || !member) {
        setError(E.invalid_action!);
        return;
      }
      const x: PlanAction = {
        key,
        regionId,
        targetKey: target?.key ?? null,
        accountId: null,
        objective,
        ownerSub: member,
        due,
        evidenceRefs: [],
      };
      next.actions.push(x);
    }
    edit(next);
    setMode(null);
  };
  const removeContribution = (key: string) => {
    const next = structuredClone(c);
    next.contributions = next.contributions.filter((x) => x.key !== key);
    next.budgets = next.budgets.filter((b) =>
      next.contributions.some((x) => x.budgetKey === b.key),
    );
    edit?.(next);
  };
  const tableAction = (onClick: () => void) =>
    edit ? (
      <Button size="sm" variant="ghost" disabled={disabled} onClick={onClick}>
        {T.remove}
      </Button>
    ) : null;
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
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  T.customer,
                  T.customerBudget,
                  T.contribution,
                  T.responsibility,
                  T.note,
                  ...(edit ? [T.remove] : []),
                ].map((l) => (
                  <TableHead key={l}>{l}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.contributions
                .filter((x) => x.regionId === regionId)
                .map((x) => {
                  const b = c.budgets.find((b) => b.key === x.budgetKey)!;
                  return (
                    <TableRow key={x.key}>
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
                      <TableCell>{b.note}</TableCell>
                      {edit ? (
                        <TableCell>
                          {tableAction(() => removeContribution(x.key))}
                        </TableCell>
                      ) : null}
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
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  T.member,
                  T.role,
                  T.unit,
                  T.percent,
                  T.period,
                  ...(edit ? [T.remove] : []),
                ].map((l) => (
                  <TableHead key={l}>{l}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.team
                .filter((x) => x.regionId === regionId)
                .map((x) => (
                  <TableRow key={x.key}>
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
                    {edit ? (
                      <TableCell>
                        {tableAction(() =>
                          edit({
                            ...c,
                            team: c.team.filter((y) => y.key !== x.key),
                          }),
                        )}
                      </TableCell>
                    ) : null}
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
          <Table>
            <TableHeader>
              <TableRow>
                {[T.objective, T.owner, T.due, ...(edit ? [T.remove] : [])].map(
                  (l) => (
                    <TableHead key={l}>{l}</TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.actions
                .filter((x) => x.regionId === regionId)
                .map((x) => (
                  <TableRow key={x.key}>
                    <TableCell>{x.objective}</TableCell>
                    <TableCell>
                      {sources.members.find((m) => m.sub === x.ownerSub)
                        ?.name ?? x.ownerSub}
                    </TableCell>
                    <TableCell>{x.due}</TableCell>
                    {edit ? (
                      <TableCell>
                        {tableAction(() =>
                          edit({
                            ...c,
                            actions: c.actions.filter((y) => y.key !== x.key),
                          }),
                        )}
                      </TableCell>
                    ) : null}
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
        onClose={() => setMode(null)}
        width="md"
        title={
          mode === "customer"
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
        <div className="flex flex-col gap-lg">
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
                  onChange={(e) => {
                    const id = e.target.value;
                    setAccountId(id);
                    setSourcePlanId(null);
                    setBudget("");
                    setNote("");
                    const request = ++sourceRequest.current;
                    setSourceLoading(false);
                    if (id) {
                      setSourceLoading(true);
                      void loadPlanningCustomerBudget(id, c.year)
                        .then((result) => {
                          if (request !== sourceRequest.current) return;
                          setSourceLoading(false);
                          if (!result.ok)
                            setError(E[result.error] ?? E.source_read_failed!);
                          else if (
                            result.source &&
                            result.source.currency === target?.currency
                          ) {
                            setBudget(result.source.amount);
                            setSourcePlanId(result.source.id);
                            setNote(
                              `${T.customerBudget} · ${result.source.period}`,
                            );
                          }
                        })
                        .catch(() => {
                          if (request === sourceRequest.current) {
                            setSourceLoading(false);
                            setError(E.source_read_failed!);
                          }
                        });
                    }
                  }}
                >
                  <option value="">{T.select}</option>
                  {sources.accounts
                    .filter(
                      (a) =>
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
              {c.budgets.some(
                (b) =>
                  b.accountId === accountId &&
                  b.period === target?.period &&
                  b.currency === target?.currency,
              ) ? (
                <p className="text-body-small text-muted-foreground">
                  {T.customerBudget}:{" "}
                  {
                    c.budgets.find(
                      (b) =>
                        b.accountId === accountId &&
                        b.period === target?.period &&
                        b.currency === target?.currency,
                    )?.amount
                  }{" "}
                  {target?.currency}
                </p>
              ) : (
                <>
                  <Field>
                    <FieldLabel htmlFor="plan-budget">
                      {T.customerBudget}
                    </FieldLabel>
                    <Input
                      id="plan-budget"
                      inputMode="decimal"
                      value={budget}
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
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </Field>
                </>
              )}
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
            <Button size="md" variant="secondary" onClick={() => setMode(null)}>
              {T.cancel}
            </Button>
            <Button size="md" disabled={sourceLoading} onClick={add}>
              {T.confirm}
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
