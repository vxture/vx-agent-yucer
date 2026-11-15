"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Combobox, Separator, useToast } from "@vxture/design-ui";
import { AccountHierarchyFields, type AccountHierarchyValues } from "./account-hierarchy-fields";
import { planAccountRegistrationHierarchy, type RegistrationHierarchy } from "../../domains/account/lib/parent";
import type { RegistrationAccountOption, RegistrationHierarchyResult, RegistrationRelationProposal } from "../../domains/account/lib/registration-hierarchy";
import type { RegistrationAssistInput, RegistrationAssistResult } from "../../domains/account/registration-service";
import { AccountOperatingFields } from "./account-operating-fields";
import { operatingValues, operatingPlan, operatingError } from "../lib/account-plan-form";
import { defaultPeriod } from "../lib/periods";
import type { AccountPlanDraft, AccountTier } from "../../domains/account/store";
import { REGISTRATION_FIELDS, type RegistrationDraftValues, type RegistrationSuggestion } from "../../domains/account/lib/registration-draft";
import { FORM_ENTRY_CLASS } from "./form-page";
import { DialogForm } from "./dialog-form";
import { ViewHeader } from "./business-controls";
import { createPortal } from "react-dom";
import { usePageAssistantSlot } from "./form-assist-slot";
import { AccountRegistrationAssistant, type RegistrationMessage } from "./account-registration-assistant";
import { useMessages } from "../lib/i18n/provider";
import { explainModelPlaneError } from "../lib/model-plane-error";
import { AccountFields, toAccountFieldValues, toAccountPatch, type AccountFieldVocab, type AccountPatchShape } from "./account-fields";

/** One shared form: an assistant fills a draft, and a person confirms the save. */
export function AccountCreateForm({ vocab, accounts, onCreate, onAssist, canAssist, initialTier = "standard" }: {
  readonly accounts:readonly RegistrationAccountOption[]|null;
  readonly initialTier?: AccountTier;
  readonly vocab: AccountFieldVocab;
  readonly canAssist: boolean;
  readonly onAssist: (input: RegistrationAssistInput) => Promise<RegistrationAssistResult>;
  readonly onCreate: (input: AccountPatchShape & RegistrationHierarchy & { tier?: AccountTier; plan?: AccountPlanDraft }) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
}) {
  const { ACCOUNT_BASICS_TEXT: B, ACCOUNT_REGISTRATION_TEXT: T, ACCOUNT_ERROR, ACCOUNT_PARENT_TEXT:P, POSITION_TEXT, COPILOT_TEXT } = useMessages();
  const assistantSlot = usePageAssistantSlot();
  const router = useRouter();
  const { toast } = useToast();
  const [saving, startSave] = useTransition();
  const [assisting, startAssist] = useTransition();
  const [values, setValues] = useState(() => toAccountFieldValues());
  const [hierarchy,setHierarchy]=useState<AccountHierarchyValues>({parentId:"",childIds:[]});
  const [relationResult,setRelationResult]=useState<RegistrationHierarchyResult>();
  const [tier, setTier] = useState<AccountTier>(initialTier);
  const [operating, setOperating] = useState(() => operatingValues(defaultPeriod()));
  const [text, setText] = useState("");
  const [thread, setThread] = useState<string>();
  const [recovery, setRecovery] = useState<{ sessionId: string; messageId: string; text: string }>();
  const [messages, setMessages] = useState<readonly RegistrationMessage[]>([]);
  const [changed, setChanged] = useState<readonly string[]>([]);
  const [suggestions, setSuggestions] = useState<readonly RegistrationSuggestion[]>([]);
  const [similar, setSimilar] = useState<readonly { id: string; name: string; accountNo: string }[]>([]);
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  const busy = saving || assisting;
  const submitting = useRef(false);
  const assistInFlight = useRef(false);
  const labels = { ...B, industryId: B.industry, segmentCode: B.segment, customerTypeId: B.customerType, customerSizeId: B.customerSize, customerNatureId: B.customerNature, tier: POSITION_TEXT.designate, period: POSITION_TEXT.planPeriod, targetAmount: POSITION_TEXT.planTarget,
    contactCadenceDays: POSITION_TEXT.cadenceContact, execCadenceDays: POSITION_TEXT.cadenceExec };
  const current = (): RegistrationDraftValues => ({ ...values, tier, period: operating.period, targetAmount: operating.targetAmount,
    contactCadenceDays: operating.contactCadenceDays, execCadenceDays: operating.execCadenceDays });
  const assist = () => {
    if (busy || assistInFlight.current || !text.trim() || text.length > 4000) return;
    assistInFlight.current = true;
    const question = text.trim();
    setError(undefined);
    setChanged([]);
    const retry = recovery?.text === question ? recovery : undefined;
    startAssist(async () => {
      try {
        const result = await onAssist({ text: question, values: current(), hierarchy:{parentId:hierarchy.parentId||null,childIds:hierarchy.childIds}, sessionId: retry?.sessionId ?? thread, retryMessageId: retry?.messageId });
        if (!result.ok) {
          if (result.sessionId) setThread(result.sessionId);
          setRecovery(result.recovery ? { ...result.recovery, text: question } : undefined);
          setError(result.error === "invalid_draft" ? T.assistInvalidDraft : result.error === "invalid_input" ? T.assistInvalid
            : result.error === "denied" || result.error === "not_authenticated" ? T.assistDenied : result.error === "atlas_ATLAS_NOT_CONFIGURED" || result.error === "no_active_tenant" ? T.assistUnavailable : explainModelPlaneError(result.error, COPILOT_TEXT));
          return;
        }
        const { patch } = result;
        setSuggestions(result.suggestions);
        setRelationResult(result.hierarchy);
        setHierarchy(previous=>({
          parentId:previous.parentId||result.hierarchy.parent?.id||"",
          childIds:[...new Set([...previous.childIds,...result.hierarchy.children.map(a=>a.id)])],
        }));
        const basics = Object.fromEntries(REGISTRATION_FIELDS.filter(key => patch[key] !== undefined).map(key => [key, patch[key]]));
        setValues(previous => ({ ...previous, ...basics }));
        if (patch.tier === "strategic" || patch.tier === "key" || patch.tier === "standard") setTier(patch.tier);
        setOperating(previous => ({ ...previous,
          enabled: previous.enabled || ["period", "targetAmount", "contactCadenceDays", "execCadenceDays"].some(key => key in patch),
          ...(patch.period ? { period: patch.period } : {}), ...(patch.targetAmount ? { targetAmount: patch.targetAmount } : {}),
          ...(patch.contactCadenceDays ? { contactCadenceDays: patch.contactCadenceDays } : {}), ...(patch.execCadenceDays ? { execCadenceDays: patch.execCadenceDays } : {}),
        }));
        setMessages(previous => [...previous, { role: "user", text: question }, { role: "assistant", text: result.message, sources: result.sources }]);
        setChanged([
          ...Object.keys(patch).map(key => labels[key as keyof typeof labels] as string).filter(Boolean),
          ...(result.hierarchy.parent ? [P.field] : []),
          ...(result.hierarchy.children.length ? [P.addChildField] : []),
        ]);
        setSimilar(result.similar.filter(a=>a.id!==result.hierarchy.existing?.account.id)); setThread(result.sessionId); setRecovery(undefined); setText("");
      } catch { setError(explainModelPlaneError("turn_failed", COPILOT_TEXT)); }
      finally { assistInFlight.current = false; }
    });
  };
  const hierarchyInput=():RegistrationHierarchy=>({
    parentId:hierarchy.parentId||null,
    childLinks:hierarchy.childIds.map(accountId=>({accountId,expectedParentId:accounts?.find(a=>a.id===accountId)?.parentId ?? null})),
  });
  const hierarchyError=()=>{
    if(!accounts)return hierarchy.parentId||hierarchy.childIds.length ? "hierarchy_changed" : null;
    const checked=planAccountRegistrationHierarchy(hierarchyInput(),accounts,"registration-draft");
    return checked.ok?null:checked.violations[0]!.code;
  };
  const selectProposal=(proposal:RegistrationRelationProposal,id:string)=>{
    if(!accounts?.some(a=>a.id===id))return;
    const next=proposal.kind==="parent"?{...hierarchy,parentId:id}:{...hierarchy,childIds:[...new Set([...hierarchy.childIds,id])]};
    const checked=planAccountRegistrationHierarchy({parentId:next.parentId||null,childLinks:next.childIds.map(accountId=>({accountId,expectedParentId:accounts.find(a=>a.id===accountId)?.parentId ?? null}))},accounts,"registration-draft");
    if(!checked.ok){toast({tone:"danger",title:ACCOUNT_ERROR[checked.violations[0]!.code]??ACCOUNT_ERROR.denied});return;}
    setHierarchy(next);setRelationResult(previous=>previous?{...previous,proposals:previous.proposals.filter(p=>p!==proposal)}:previous);
  };
  const review = () => {
    const invalid = hierarchyError() ?? operatingError(tier, operating);
    if (invalid) { toast({ tone: "danger", title: ACCOUNT_ERROR[invalid] ?? ACCOUNT_ERROR.denied }); return; }
    if (!values.name.trim()) return;
    setConfirm(true);
  };
  const submit = () => {
    if (submitting.current) return;
    submitting.current = true;
    startSave(async () => {
      try {
        const invalid = hierarchyError() ?? operatingError(tier, operating);
        if (invalid) { toast({ tone: "danger", title: ACCOUNT_ERROR[invalid] ?? ACCOUNT_ERROR.denied }); return; }
        const r = await onCreate({ ...toAccountPatch(values), ...hierarchyInput(), tier, plan: operatingPlan(tier, operating) });
        if (!r.ok) { toast({ tone: "danger", title: ACCOUNT_ERROR[r.error] ?? ACCOUNT_ERROR.denied }); return; }
        router.push(`/account/${r.id}`); router.refresh();
      } catch { toast({ tone: "danger", title: ACCOUNT_ERROR.denied }); }
      finally { submitting.current = false; }
    });
  };
  const named = (key: "industries" | "segments" | "regions" | "customerTypes" | "customerSizes" | "customerNatures", value: string) =>
    vocab[key].find(option => (key === "regions" ? option.name : option.id) === value)?.name ?? value;
  const display = { ...values, industryId: named("industries", values.industryId), segmentCode: named("segments", values.segmentCode),
    customerTypeId: named("customerTypes", values.customerTypeId), customerSizeId: named("customerSizes", values.customerSizeId), customerNatureId: named("customerNatures", values.customerNatureId) };
  const tierLabel = tier === "strategic" ? POSITION_TEXT.tierStrategic : tier === "key" ? POSITION_TEXT.tierKey : POSITION_TEXT.tierStandard;
  const suggestionValue = (suggestion: RegistrationSuggestion, value: string) => {
    const choices = { industryId: "industries", segmentCode: "segments", customerTypeId: "customerTypes", customerSizeId: "customerSizes", customerNatureId: "customerNatures" } as const;
    return suggestion.field in choices ? named(choices[suggestion.field as keyof typeof choices], value) : value;
  };
  const applySuggestion = (suggestion: RegistrationSuggestion) => {
    if (busy || !REGISTRATION_FIELDS.some(key => key === suggestion.field)) return;
    setValues(previous => ({ ...previous, [suggestion.field]: suggestion.value }));
    setChanged([labels[suggestion.field]]);
    setSuggestions(previous => previous.filter(item => item.field !== suggestion.field));
    setMessages(previous => [...previous, { role: "assistant", text: `${T.assistUpdated} ${labels[suggestion.field]}: ${suggestionValue(suggestion, suggestion.value)}`, sources: [suggestion] }]);
  };
  const relations = <>
      {suggestions.length ? <div className="flex flex-col gap-sm" data-registration-suggestions>
        {suggestions.map(suggestion => <div key={`${suggestion.field}-${suggestion.value}`} className="flex flex-wrap items-center gap-sm text-body-small">
          <span className="text-muted-foreground">{labels[suggestion.field]}</span>
          <span>{suggestionValue(suggestion, suggestion.currentValue)} <span className="text-muted-foreground">{"\u2192"}</span> {suggestionValue(suggestion, suggestion.value)}</span>
          {suggestion.url ? <a href={suggestion.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary" title={suggestion.excerpt}>{T.researchSource(1)}</a> : null}
          <Button type="button" size="md" variant="secondary" disabled={busy} onClick={() => applySuggestion(suggestion)}>{T.applyResearch}</Button>
        </div>)}
      </div> : null}
      {relationResult?.existing ? <div className="flex flex-col gap-xs text-body-small" data-registration-existing>
        <span className="text-muted-foreground">{T.existingCustomer}</span>
        <Link target="_blank" rel="noopener noreferrer" className="text-body text-primary-text transition-colors hover:text-primary" href={`/account/${relationResult.existing.account.id}`}>{relationResult.existing.account.name} {relationResult.existing.account.accountNo}</Link>
        <div className="flex flex-wrap gap-x-lg gap-y-xs text-muted-foreground">
          <span>{P.field}: {relationResult.existing.parent?.name ?? P.none}</span>
          <span>{P.addChildField}: {relationResult.existing.children.map(a=>a.name).join(" / ")||T.noSubsidiaries}</span>
        </div>
      </div>:null}
      {relationResult?.proposals.length ? <div className="flex flex-col gap-sm" data-registration-relation-proposals>
        {relationResult.proposals.map((proposal,index)=><div key={index} className="flex flex-wrap items-center gap-sm text-body-small">
          <span className="text-muted-foreground">{proposal.kind==="parent"?P.field:P.addChildField}</span><span>{proposal.name}</span>
          <span className="text-muted-foreground">{proposal.status==="missing"?T.relationNotRegistered:proposal.status==="ambiguous"?T.relationChoose:T.relationConflict}</span>
          {proposal.status==="ambiguous"?<Combobox items={proposal.candidates.map(a=>({value:a.id,label:`${a.name} \u00b7 ${a.accountNo}`}))}
            disabled={busy} onValueChange={id=>selectProposal(proposal,id)} placeholder={T.chooseAccount} searchPlaceholder={T.searchAccounts} className="max-w-full"/>
            : proposal.status==="conflict"?<Button type="button" size="md" variant="secondary" disabled={busy} onClick={()=>selectProposal(proposal,proposal.candidates[0]!.id)}>{T.confirmRelation}</Button>:null}
        </div>)}
      </div>:null}
      {similar.length ? <div className="flex flex-wrap items-center gap-sm text-body-small" role="status"><span className="text-muted-foreground">{T.assistSimilar}</span>
        {similar.map(account => <Link key={account.id} target="_blank" rel="noopener noreferrer" className="text-primary-text transition-colors hover:text-primary" href={`/account/${account.id}`}>{account.name} {account.accountNo}</Link>)}
      </div> : null}
  </>;
  const assistantProps = {
    canAssist, busy, assisting, messages, text, error,
    status: assisting ? T.assistPending : changed.length ? `${T.assistUpdated} ${changed.join(" / ")}` : messages.length ? T.assistNoChanges : "",
    customerName: values.name, customerTierLabel: tierLabel, onTextChange: setText, onSend: assist, onReview: review, relations,
  };
  return <div className={`flex min-w-0 flex-col gap-lg ${FORM_ENTRY_CLASS}`} data-business-form data-account-registration>
    <ViewHeader icon="user-plus" title={B.createTitle} help={T.createHelp}
      action={<Button size="xl" disabled={busy || !values.name.trim()} onClick={review}>{T.reviewSubmit}</Button>} />
    <AccountRegistrationAssistant {...assistantProps} compact={!!assistantSlot} />
    {assistantSlot ? createPortal(<AccountRegistrationAssistant {...assistantProps} dock />, assistantSlot) : null}
    <Card className="flex w-full flex-col gap-lg p-lg">
      <AccountFields values={values} onChange={setValues} vocab={vocab} pending={busy} accountNo={null} />
      <Separator />
      <AccountHierarchyFields accounts={accounts} value={hierarchy} onChange={setHierarchy} disabled={busy}/>
      <Separator />
      <AccountOperatingFields tier={tier} onTierChange={setTier} values={operating} onChange={setOperating} disabled={busy} />
      <div className="flex justify-end gap-sm border-t border-dashed border-border pt-lg">
        <Button size="xl" variant="secondary" disabled={busy} onClick={() => router.push("/account")}>{B.createCancel}</Button>
        <Button size="xl" className="text-body" disabled={busy || !values.name.trim()} onClick={review}>{T.reviewSubmit}</Button>
      </div>
    </Card>
    <DialogForm open={confirm} onOpenChange={open => { if (!saving) setConfirm(open); }} title={T.confirmTitle}
      submitLabel={T.confirmSubmit} cancelLabel={T.confirmEdit} submitting={saving} onSubmit={event => { event.preventDefault(); submit(); }}>
      <div className="flex flex-col gap-md" data-registration-confirm>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-lg gap-y-sm">
          {REGISTRATION_FIELDS.filter(key => display[key].trim()).map(key => <div key={key} className="contents"><dt className="text-body-small text-muted-foreground">{labels[key]}</dt><dd className="min-w-0 break-words text-body text-foreground">{display[key]}</dd></div>)}
          <dt className="text-body-small text-muted-foreground">{P.field}</dt><dd className="text-body">{accounts?.find(a=>a.id===hierarchy.parentId)?.name ?? P.none}</dd>
          {hierarchy.childIds.length?<><dt className="text-body-small text-muted-foreground">{P.addChildField}</dt><dd className="flex flex-col gap-xs text-body">
            {hierarchy.childIds.map(id=>{const child=accounts?.find(a=>a.id===id);return child?<span key={id}>{child.name}{child.parentId?<span className="ml-xs text-body-small text-muted-foreground">{T.moveFrom(accounts?.find(a=>a.id===child.parentId)?.name ?? T.registeredParent)}</span>:null}</span>:null;})}
          </dd></>:null}
          <dt className="text-body-small text-muted-foreground">{POSITION_TEXT.designate}</dt><dd className="text-body">{tierLabel}</dd>
          {operatingPlan(tier, operating) ? (["period", "targetAmount", "contactCadenceDays", "execCadenceDays"] as const).map(key =>
            <div key={key} className="contents"><dt className="text-body-small text-muted-foreground">{labels[key]}</dt><dd className="text-body">{operating[key] || T.notProvided}</dd></div>) : null}
          <dt className="text-body-small text-muted-foreground">{B.accountNo}</dt><dd className="text-body">{T.numberAuto}</dd>
        </dl>
        <p className="text-body-small text-muted-foreground">{T.confirmHelp}</p>
      </div>
    </DialogForm>
  </div>;
}
