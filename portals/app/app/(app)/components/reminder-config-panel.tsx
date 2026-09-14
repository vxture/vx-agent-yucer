"use client";

import { useState, useTransition } from "react";
import { useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { FormActions } from "./form-page";
import {
  ContactRecencyConfig,
  firstContactRecencyError,
  type ContactRecencyForm,
} from "./contact-recency-config";
import { RenewalPolicyConfig, firstRenewalPolicyError } from "./renewal-policy-config";
import type { ContactRecencyPolicy } from "../../domains/account/lib/contact-recency-policy";
import type { RenewalPolicy } from "../../domains/delivery/lib/renewal";

// /admin/reminder's two sections - 联系提醒阈值/续约提醒窗口 - share ONE save
// bar, the same pattern opportunity-config-panel.tsx set for /admin/opportunity
// (owner, 2026-09-13's ruling there applies here too: one config page, one bar).
//
// SEQUENTIAL SAVE, NOT Promise.all - same reasoning as the opportunity panel:
// two unrelated domain actions (account/field recency policy, delivery renewal
// policy), sequential keeps toast order matching the sections' own top-to-
// bottom order.
//
// VALIDATION BLOCKS THE WHOLE CLICK. A dirty section with an invalid value
// stops the save entirely (toast, no request sent), reusing each leaf's own
// exported validator so the message matches what the server would give.
//
// NO MANUAL RESYNC AFTER A PARTIAL SUCCESS - each server action calls
// revalidatePath on its own success, so `dirty` recomputes from fresh props
// on every render rather than a value frozen at mount.
export function ReminderConfigPanel({
  canManage,
  contactRecency,
  renewal,
}: {
  readonly canManage: boolean;
  readonly contactRecency: {
    readonly policy: ContactRecencyPolicy;
    readonly onSave: (input: ContactRecencyPolicy) => Promise<{ ok: boolean; error?: string }>;
  } | null;
  readonly renewal: {
    readonly policy: RenewalPolicy;
    readonly onSave: (input: RenewalPolicy) => Promise<{ ok: boolean; error?: string }>;
  } | null;
}) {
  const { ADMIN_TEXT, CONTACT_RECENCY_ERROR, CONTACT_RECENCY_TEXT, RENEWAL_POLICY_ERROR, RENEWAL_POLICY_TEXT } =
    useMessages();
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const initialContactRecencyForm = (p: ContactRecencyPolicy): ContactRecencyForm => ({
    quietDays: String(p.quietDays),
    staleDays: String(p.staleDays),
    chainWarmDays: String(p.chainWarmDays),
  });
  const [contactRecencyForm, setContactRecencyForm] = useState<ContactRecencyForm>(
    contactRecency
      ? initialContactRecencyForm(contactRecency.policy)
      : { quietDays: "", staleDays: "", chainWarmDays: "" },
  );
  const [renewalWindowDays, setRenewalWindowDays] = useState(
    renewal ? String(renewal.policy.windowDays) : "",
  );

  const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));
  const contactRecencyParsed = {
    quietDays: num(contactRecencyForm.quietDays),
    staleDays: num(contactRecencyForm.staleDays),
    chainWarmDays: num(contactRecencyForm.chainWarmDays),
  };
  const contactRecencyDirty =
    !!contactRecency &&
    canManage &&
    (contactRecencyParsed.quietDays !== contactRecency.policy.quietDays ||
      contactRecencyParsed.staleDays !== contactRecency.policy.staleDays ||
      contactRecencyParsed.chainWarmDays !== contactRecency.policy.chainWarmDays);
  const contactRecencyError = contactRecency
    ? firstContactRecencyError(
        contactRecencyParsed.quietDays,
        contactRecencyParsed.staleDays,
        contactRecencyParsed.chainWarmDays,
      )
    : null;

  const renewalParsed = num(renewalWindowDays);
  const renewalDirty = !!renewal && canManage && renewalParsed !== renewal.policy.windowDays;
  const renewalError = renewal ? firstRenewalPolicyError(renewalParsed) : null;

  const anyDirty = contactRecencyDirty || renewalDirty;

  const save = () => {
    if (contactRecencyDirty && contactRecencyError) {
      toast({ tone: "danger", title: CONTACT_RECENCY_ERROR[contactRecencyError] });
      return;
    }
    if (renewalDirty && renewalError) {
      toast({ tone: "danger", title: RENEWAL_POLICY_ERROR[renewalError] });
      return;
    }
    start(async () => {
      if (contactRecencyDirty && contactRecency) {
        const r = await contactRecency.onSave(contactRecencyParsed);
        toast(
          r.ok
            ? { tone: "success", title: CONTACT_RECENCY_TEXT.saved }
            : { tone: "danger", title: CONTACT_RECENCY_ERROR[r.error ?? "denied"] ?? r.error ?? "" },
        );
      }
      if (renewalDirty && renewal) {
        const r = await renewal.onSave({ windowDays: renewalParsed });
        toast(
          r.ok
            ? { tone: "success", title: RENEWAL_POLICY_TEXT.saved }
            : { tone: "danger", title: RENEWAL_POLICY_ERROR[r.error ?? "denied"] ?? r.error ?? "" },
        );
      }
    });
  };

  const discard = () => {
    if (contactRecency) setContactRecencyForm(initialContactRecencyForm(contactRecency.policy));
    if (renewal) setRenewalWindowDays(String(renewal.policy.windowDays));
  };

  return (
    <>
      {contactRecency ? (
        <ContactRecencyConfig
          policy={contactRecency.policy}
          canWrite={canManage}
          form={contactRecencyForm}
          onFormChange={setContactRecencyForm}
          pending={pending}
        />
      ) : null}
      {renewal ? (
        <RenewalPolicyConfig
          policy={renewal.policy}
          canWrite={canManage}
          windowDays={renewalWindowDays}
          onWindowDaysChange={setRenewalWindowDays}
          pending={pending}
        />
      ) : null}
      {/* STATIC, NOT STICKY - same choice as opportunity-config-panel.tsx. */}
      {canManage && (contactRecency || renewal) ? (
        <FormActions
          saveLabel={ADMIN_TEXT.save}
          discardLabel={ADMIN_TEXT.discard}
          onSave={save}
          onDiscard={discard}
          pending={pending || !anyDirty}
        />
      ) : null}
    </>
  );
}
