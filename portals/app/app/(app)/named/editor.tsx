"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Drawer, Field, FieldLabel, Input, NativeSelect, Textarea } from "@vxture/design-ui";
import type { FocusChange, FocusRow, FocusWorkspace } from "../../domains/planning/focus-model";
import type { PlanTarget } from "../../domains/planning/plan-model";
import { FormFields, FormFieldWide } from "../components/form-page";
import { MemberPicker } from "../components/member-picker";
import { useMessages } from "../lib/i18n/provider";
import { focusHref } from "../lib/focus-workspace";
import { loadFocusCandidates, loadFocusTargets, saveFocusChange } from "./focus-actions";
import styles from "../components/deployment-card.module.css";
import links from "../components/business-reference.module.css";
import { FocusDraftAssistant } from "./draft-assistant";

type FocusEditorProps = Readonly<{
  workspace: FocusWorkspace; row?: FocusRow; actionKey?: string; contributionKey?: string; mode?: "add" | "action" | "contribution" | "remove"; onClose: () => void; canCreateAccount?: boolean;
}>;
export function FocusEditor({ workspace: w, row, actionKey, contributionKey, mode = "add", onClose, canCreateAccount = false }: FocusEditorProps) {
  const { FOCUS_TEXT: T, PLAN_VERSION_ERROR: E } = useMessages(), router = useRouter();
  const action = row?.actions.find(a => a.key === actionKey), contribution = row?.contributions.find(c => c.key === contributionKey);
  const [picked, setPicked] = useState<string[]>(row ? [row.id] : []), [query, setQuery] = useState("");
  const [regionId, setRegionId] = useState(action?.regionId ?? contribution?.regionId ?? w.regionId ?? row?.regions[0]?.id ?? w.regions[0]?.id ?? "");
  const [objective, setObjective] = useState(action?.objective ?? ""), [ownerSub, setOwnerSub] = useState(action?.ownerSub ?? w.currentSub), [due, setDue] = useState(action?.due ?? "");
  const [budget, setBudget] = useState(contribution?.budget.amount ?? ""), [amount, setAmount] = useState(contribution?.amount ?? ""), [note, setNote] = useState(contribution?.budget.note ?? ""), [responsibility, setResponsibility] = useState<"primary" | "support">(contribution?.responsibility ?? "primary");
  const [targets, setTargets] = useState<PlanTarget[]>([]), [targetKey, setTargetKey] = useState(contribution?.targetKey ?? ""), [loading, setLoading] = useState(mode === "contribution");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), running = useRef(false), request = useRef<{ hash: string; key: string } | null>(null);
  const changed = useRef(false);
  const [candidates, setCandidates] = useState(w.candidates);
  const [refreshing, setRefreshing] = useState(false);
  const selectedTarget = targets.find(t => t.key === targetKey);
  const unit = targetUnit(selectedTarget, T.count);
  const [assistantBusy, setAssistantBusy] = useState(false);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (changed.current) { e.preventDefault(); } };
    window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler);
  }, []);
  useEffect(() => {
    if (mode !== "contribution" || !w.revision || !regionId) return;
    let active = true; setLoading(true);
    void loadFocusTargets(w.year, w.revision.id, regionId).then(r => {
      if (!active) return;
      if (!r.ok) { setError(E[r.error] ?? T.error); return; }
      if (r.editToken !== w.editToken) { setError(T.stale); return; }
      setTargets(r.targets);
    }).catch(() => { if (active) setError(T.sourceUnavailable); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, regionId, w.year, w.revision, w.editToken, E, T]);
  const close = () => { if (!busy && !assistantBusy && (!changed.current || window.confirm(T.unsaved))) onClose(); };
  const title = focusEditorTitle(mode, contributionKey, actionKey, T);
  const assistantContext = focusAssistantContext(w, row, mode, regionId, targetKey);
  const actionMode = ["add", "action"].includes(mode);
  async function refreshCandidates() {
    if (refreshing || !w.revision || w.editToken === null) return;
    setRefreshing(true); setError("");
    try {
      const result = await loadFocusCandidates(w.year, w.revision.id, w.editToken);
      if (result.ok) setCandidates(result.candidates);
      else setError(E[result.error] ?? T.error);
    } catch { setError(T.sourceUnavailable); } finally { setRefreshing(false); }
  }
  async function save() {
    if (running.current || assistantBusy || loading || !w.revision || !w.canEdit) return;
    let change: FocusChange;
    if (mode === "remove" && row) change = { kind: "remove", accountId: row.id, regionId, period: w.period };
    else if (mode === "contribution" && row) change = { kind: "contribution", accountId: row.id, regionId, targetKey, budget, amount, note, responsibility, key: contributionKey };
    else if (mode === "action" && row) change = { kind: "action", accountId: row.id, regionId, objective, ownerSub: ownerSub || null, due, key: actionKey };
    else change = { kind: "add", accountIds: picked, regionId, objective, ownerSub: ownerSub || null, due };
    if (!validChange(change)) { setError(T.invalid); return; }
    running.current = true; setBusy(true); setError("");
    const input = { year: w.year, revisionId: w.revision.id, editToken: w.editToken, expectedEventNo: w.eventNo, change };
    const hash = JSON.stringify(input);
    if (request.current?.hash !== hash) request.current = { hash, key: crypto.randomUUID() };
    try {
      const result = await saveFocusChange({ ...input, requestKey: request.current!.key });
      if (!result.ok) { setError(E[result.error] ?? T.error); return; }
      changed.current = false; onClose(); router.push(focusHref({ ...w, revisionId: result.revisionId, accountId: mode === "remove" ? undefined : row?.id })); router.refresh();
    } catch { setError(T.error); } finally { running.current = false; setBusy(false); }
  }
  return <Drawer width="md" open onClose={close} title={title} closeLabel={T.cancel} description={mode === "remove" ? T.removeHint : undefined}>
    <fieldset disabled={busy || assistantBusy || !w.canEdit} className="flex min-w-0 flex-col gap-lg" onChange={() => { changed.current = true; }}>
      {mode === "add" ? <FocusCustomerSelection candidates={candidates} query={query} onQuery={setQuery} picked={picked} onToggle={(id, checked) => { changed.current = true; setPicked(ids => checked ? [...ids, id] : ids.filter(value => value !== id)); }} canCreateAccount={canCreateAccount} refreshing={refreshing} onRefresh={refreshCandidates}/> : null}
      {mode !== "add" && row ? <p className="text-body font-semibold">{row.name}</p> : null}
      {assistantContext ? <FocusDraftAssistant key={`${w.year}:${assistantContext.revisionId}:${w.editToken}:${assistantContext.accountId}:${regionId}:${targetKey}`} name={row!.name} context={assistantContext} values={{ objective, due, budget, amount, note }} disabled={busy || loading} onBusy={setAssistantBusy} onApply={patch => { changed.current = true; if (patch.objective !== undefined) { setObjective(patch.objective); } if (patch.due !== undefined) { setDue(patch.due); } if (patch.budget !== undefined) { setBudget(patch.budget); } if (patch.amount !== undefined) { setAmount(patch.amount); } if (patch.note !== undefined) { setNote(patch.note); } }}/> : null}
      <FormFields>
        <Field><FieldLabel>{T.region}</FieldLabel><NativeSelect aria-label={T.region} value={regionId} onChange={e => { setRegionId(e.target.value); setTargetKey(""); }}>{w.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</NativeSelect></Field>
        {actionMode ? <><Field><FieldLabel>{T.owner}</FieldLabel><MemberPicker value={ownerSub} onValueChange={v => { changed.current = true; setOwnerSub(v); }} options={w.members.map(m => ({ value: m.sub, label: m.name }))} label={T.owner} emptyLabel={T.noMembers}/></Field><Field><FieldLabel htmlFor="focus-due" required>{T.due}</FieldLabel><Input id="focus-due" type="date" value={due} onChange={e => setDue(e.target.value)}/></Field><FormFieldWide><Field><FieldLabel htmlFor="focus-objective" required>{T.objective}</FieldLabel><Textarea id="focus-objective" rows={1} className="min-h-control-xl field-sizing-content" maxLength={1000} placeholder={T.objectiveExample} value={objective} onChange={e => setObjective(e.target.value)}/><span className="text-body-small text-muted-foreground">{objective.length}/1000</span></Field></FormFieldWide></> : null}
        {mode === "contribution" ? <><FormFieldWide><Field><FieldLabel required>{T.target}</FieldLabel><NativeSelect aria-label={T.target} value={targetKey} disabled={loading} onChange={e => setTargetKey(e.target.value)}><option value="">{T.select}</option>{targets.map(t => <option key={t.key} value={t.key}>{t.period} / {T[`${t.metric}Metric`]} / {t.currency ?? T.count}</option>)}</NativeSelect></Field></FormFieldWide><Field><FieldLabel htmlFor="focus-budget" required>{T.budget}{unit ? ` (${unit})` : ""}</FieldLabel><Input id="focus-budget" inputMode="decimal" value={budget} placeholder={T.amountPlaceholder} onChange={e => setBudget(e.target.value)}/></Field><Field><FieldLabel htmlFor="focus-amount" required>{T.contribution}{unit ? ` (${unit})` : ""}</FieldLabel><Input id="focus-amount" inputMode="decimal" value={amount} placeholder={T.amountPlaceholder} onChange={e => setAmount(e.target.value)}/></Field><Field><FieldLabel>{T.responsibility}</FieldLabel><NativeSelect aria-label={T.responsibility} value={responsibility} onChange={e => setResponsibility(e.target.value as "primary" | "support")}><option value="primary">{T.primary}</option><option value="support">{T.support}</option></NativeSelect></Field><FormFieldWide><Field><FieldLabel htmlFor="focus-note">{T.basis}</FieldLabel><Textarea id="focus-note" rows={1} className="min-h-control-xl field-sizing-content" maxLength={2000} value={note} placeholder={T.notePlaceholder} onChange={e => setNote(e.target.value)}/></Field></FormFieldWide></> : null}
      </FormFields>
      {error ? <p role="alert" className="text-body text-destructive">{error}</p> : null}
      <div className={styles.drawerFooter}><Button data-control-kind="drawer-action" size="xl" variant="secondary" onClick={close}>{T.cancel}</Button><Button data-control-kind="drawer-action" size="xl" disabled={busy || loading || !w.canEdit} onClick={save}>{mode === "remove" ? T.confirmRemove : T.save}</Button></div>
    </fieldset>
  </Drawer>;
}

function focusEditorTitle(mode: NonNullable<FocusEditorProps["mode"]>, contributionKey: string | undefined, actionKey: string | undefined, text: ReturnType<typeof useMessages>["FOCUS_TEXT"]) {
  if (mode === "contribution") return contributionKey ? text.editContribution : text.addContribution;
  if (mode === "action") return actionKey ? text.editAction : text.addAction;
  return mode === "remove" ? text.remove : text.add;
}

function focusAssistantContext(workspace: FocusWorkspace, row: FocusRow | undefined, mode: FocusEditorProps["mode"], regionId: string, targetKey: string) {
  if (!row || !workspace.revision || workspace.editToken === null) return null;
  if (mode !== "action" && mode !== "contribution") return null;
  return { year: workspace.year, revisionId: workspace.revision.id, editToken: workspace.editToken, accountId: row.id, regionId, targetKey: targetKey || undefined };
}

function FocusCustomerSelection({ candidates, query, onQuery, picked, onToggle, canCreateAccount, refreshing, onRefresh }: Readonly<{
  candidates: FocusWorkspace["candidates"]; query: string; onQuery: (value: string) => void; picked: readonly string[];
  onToggle: (id: string, checked: boolean) => void; canCreateAccount: boolean; refreshing: boolean; onRefresh: () => void;
}>) {
  const { FOCUS_TEXT: text } = useMessages();
  return <>
    <p className="text-body text-muted-foreground">{text.selectHelp}</p>
    <Input aria-label={text.search} placeholder={text.search} value={query} onChange={event => onQuery(event.target.value)}/>
    <div className="max-h-panel-sm overflow-y-auto rounded-md border border-border p-md">
      {candidates.filter(account => `${account.name} ${account.accountNo}`.toLowerCase().includes(query.toLowerCase())).map(account => <label key={account.id} className="flex min-h-control-xl items-center gap-sm py-xs text-body">
        <Checkbox checked={picked.includes(account.id)} onCheckedChange={value => onToggle(account.id, value === true)}/>
        <span className="min-w-0"><span className="line-clamp-2">{account.name}</span><span className="text-body-small text-muted-foreground">{account.accountNo}</span></span>
      </label>)}
    </div>
    <div className="flex items-center justify-between text-body"><span>{text.selected} {picked.length} {text.count}</span>{canCreateAccount ? <Link href="/account/new" target="_blank" rel="noopener noreferrer" className={links.textLink}>{text.create}</Link> : null}</div>
    {canCreateAccount ? <p className="text-body-small text-muted-foreground">{text.newCreatedHint}</p> : null}
    <Button size="xl" variant="secondary" disabled={refreshing} onClick={onRefresh}>{text.refresh}</Button>
  </>;
}

function validChange(change: FocusChange) {
  if (change.kind === "removeAction") return true;
  if (!change.regionId) return false;
  if (change.kind === "remove") return true;
  if (change.kind === "contribution") return !!change.targetKey && !!change.budget && !!change.amount;
  if (change.kind === "add" && !change.accountIds.length) return false;
  return !!change.objective.trim() && !!change.due;
}

function targetUnit(target: PlanTarget | undefined, countUnit: string) {
  if (!target) return "";
  return target.currency ?? countUnit;
}
