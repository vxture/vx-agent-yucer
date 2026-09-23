"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, useToast } from "@vxture/design-ui";
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
}: {
  readonly vocab: AccountFieldVocab;
  readonly onCreate: (input: AccountPatchShape) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
}) {
  const { ACCOUNT_BASICS_TEXT, ACCOUNT_ERROR } = useMessages();
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [values, setValues] = useState(() => toAccountFieldValues());

  const submit = () =>
    start(async () => {
      const r = await onCreate(toAccountPatch(values));
      if (!r.ok) {
        toast({ tone: "danger", title: ACCOUNT_ERROR[r.error] ?? ACCOUNT_ERROR.denied ?? r.error });
        return;
      }
      router.push(`/account/${r.id}`);
    });

  return (
    <Card className="flex max-w-2xl flex-col gap-lg p-lg">
      <AccountFields values={values} onChange={setValues} vocab={vocab} pending={pending} accountNo={null} />
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
