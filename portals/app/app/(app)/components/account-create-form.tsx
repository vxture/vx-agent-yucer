"use client";

import { AccountOperatingFields } from "./account-operating-fields";
import { operatingValues, operatingPlan, operatingError } from "../lib/account-plan-form";
import { defaultPeriod } from "../lib/periods";
import type { AccountPlanDraft, AccountTier } from "../../domains/account/store";
import { FormFields } from "./form-page";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Separator, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import {
  AccountFields,
  toAccountFieldValues,
  toAccountPatch,
  type AccountFieldVocab,
  type AccountPatchShape,
} from "./account-fields";

// 新建客户 (owner, 2026-09-23: 独立页面全字段表单). The same field block the
// 客户总编辑 drawer edits with (account-fields.tsx), so the two cannot drift;
// on success the person lands on the new customer's page, where the
// completeness card says what is still missing.
export function AccountCreateForm({
  vocab,
  onCreate,
  initialTier = "standard",
}: {
  readonly initialTier?: AccountTier;
  readonly vocab: AccountFieldVocab;
  readonly onCreate: (input: AccountPatchShape & { tier?: AccountTier; plan?: AccountPlanDraft }) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
}) {
  const { ACCOUNT_BASICS_TEXT, ACCOUNT_ERROR } = useMessages();
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [values, setValues] = useState(() => toAccountFieldValues());
  const [tier, setTier] = useState<AccountTier>(initialTier);
  const [operating, setOperating] = useState(() => operatingValues(defaultPeriod()));

  const submit = () =>
    start(async () => {
      const invalid = operatingError(tier, operating);
      if (invalid) {
        toast({ tone: "danger", title: ACCOUNT_ERROR[invalid] ?? ACCOUNT_ERROR.denied });
        return;
      }
      const r = await onCreate({ ...toAccountPatch(values), tier, plan: operatingPlan(tier, operating) });
      if (!r.ok) {
        toast({ tone: "danger", title: ACCOUNT_ERROR[r.error] ?? ACCOUNT_ERROR.denied ?? r.error });
        return;
      }
      router.push(`/account/${r.id}`);
    });

  return (
    // max-w-2xl was the trap in memory: the DS container tokens shadow
    // Tailwind's, so it clamped this card to ~48px and every label stacked one
    // character per line (found 2026-09-24 by opening /account/new). The
    // form uses the app's own two-column FormFields like every other page.
    <Card className="flex w-full flex-col gap-lg p-lg">
      <FormFields>
        <AccountFields values={values} onChange={setValues} vocab={vocab} pending={pending} accountNo={null} />
      </FormFields>
      <Separator />
      <AccountOperatingFields tier={tier} onTierChange={setTier} values={operating} onChange={setOperating} disabled={pending} />
      <div className="flex justify-end gap-sm">
        <Button variant="secondary" disabled={pending} onClick={() => router.push("/account")}>
          {ACCOUNT_BASICS_TEXT.createCancel}
        </Button>
        <Button disabled={pending || values.name.trim() === ""} onClick={submit}>
          {ACCOUNT_BASICS_TEXT.createSubmit}
        </Button>
      </div>
    </Card>
  );
}
