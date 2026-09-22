"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Button, Drawer, Field, FieldLabel, Input, NativeSelect, Separator, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { ALL_PROVINCES } from "../../domains/shared/provinces";

// 基础信息表单 (owner, 2026-09-20: 设计图严格对齐 - 先做基础信息表单，智能
// 采集先跳过).
//
// EVERY FIELD HERE ALREADY HAD A REAL COLUMN before this form existed -
// updateAccountBasics() (domains/account/service.ts) is the first SERVICE
// VERB to write more than one of them at once, not the first thing to make
// them writable. name/region/province/industryId/segmentCode/creditCode/
// website/employeeCount have been in the store's updateAccount() patch type
// since their own increments (0024/0035/0040); customerTypeId/
// customerSizeId/customerNatureId since 0071/0072. This is the TD-016 shape
// again: the column, the grant and the store method all existed, and nothing
// in the interface could reach them.
//
// 客户类型/客户规模/客户性质 ARE NOT IN THE MOCKUP - it predates incr/0071/
// 0072. They are real, writable, currently-unexposed-anywhere columns on
// this exact record, and this form's whole job is "edit this account's
// classification" - leaving them out because an older mockup does not know
// about them would be the same mistake as the DataTable that never showed
// email/wechat (contact-roster.tsx's own history).
//
// SKIPPED, on the owner's own instruction (先做基础信息表单，智能采集先跳过):
// 智能采集 (AI-driven external enrichment) as a capability, and the four
// fields the mockup only drew as its target (客户简称/成立日期/注册资本/
// 详细地址/企业介绍) - none of those has a column yet, and adding one
// speculatively for a field nobody asked to write manually would be scope
// this instruction did not cover.

export interface VocabOption {
  readonly id: string;
  readonly name: string;
}

export interface AccountBasicsFormProps {
  readonly accountId: string;
  readonly accountNo: string;
  readonly name: string;
  readonly region: string | null;
  readonly province: string | null;
  readonly industryId: string | null;
  readonly segmentCode: string | null;
  readonly customerTypeId: string | null;
  readonly customerSizeId: string | null;
  readonly customerNatureId: string | null;
  readonly creditCode: string | null;
  readonly website: string | null;
  readonly employeeCount: number | null;
  readonly industries: readonly VocabOption[];
  /** id = segmentCode itself - account.segment_code stores the code, not a
   *  uuid join (see SegmentRecord vs. IndustryRecord/CustomerTypeRecord). */
  readonly segments: readonly VocabOption[];
  readonly customerTypes: readonly VocabOption[];
  readonly customerSizes: readonly VocabOption[];
  readonly customerNatures: readonly VocabOption[];
  readonly canWrite: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSave: (
    accountId: string,
    patch: {
      name?: string;
      region?: string | null;
      province?: string | null;
      industryId?: string | null;
      segmentCode?: string | null;
      customerTypeId?: string | null;
      customerSizeId?: string | null;
      customerNatureId?: string | null;
      creditCode?: string | null;
      website?: string | null;
      employeeCount?: number | null;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
  /** org-relations-editor.tsx, built server-side in page.tsx and mounted here
   *  as the drawer's second card - mockup nests "上下级关联" right after
   *  "基础信息" inside the same edit surface (owner, 2026-09-20: 死死记住
   *  设计文件), and "单位信息" as a title already covers org-structure facts
   *  the same way it covers industry/region. Absent for a read-only member,
   *  same as the rest of this form. */
  readonly orgRelations?: ReactNode;
  /** contact-management-list.tsx, the third card in the same edit surface -
   *  mockup nests "客户联系人" right after "上下级关联" (with 销售负责人's own
   *  separate drawer between them in the raw mockup, which stays out of this
   *  one per its own note). Same read-only-list-plus-row-menu content as the
   *  mockup's own 客户联系人 card, reusing 栏1's ContactCard for the row
   *  shape. Absent for a read-only member. */
  readonly contactManagement?: ReactNode;
}

/** "" in a <select>/<input> means "unset" throughout this form - converted
 *  back to null on submit, never sent as an empty string to a nullable
 *  column. */
const blank = (v: string | null) => v ?? "";

export function AccountBasicsForm({
  accountId,
  accountNo,
  name,
  region,
  province,
  industryId,
  segmentCode,
  customerTypeId,
  customerSizeId,
  customerNatureId,
  creditCode,
  website,
  employeeCount,
  industries,
  segments,
  customerTypes,
  customerSizes,
  customerNatures,
  canWrite,
  open,
  onOpenChange,
  onSave,
  orgRelations,
  contactManagement,
}: AccountBasicsFormProps) {
  const { ACCOUNT_BASICS_TEXT, ACCOUNT_ERROR, DS_LABELS } = useMessages();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const [nameValue, setNameValue] = useState(name);
  const [regionValue, setRegionValue] = useState(blank(region));
  const [provinceValue, setProvinceValue] = useState(blank(province));
  const [industryValue, setIndustryValue] = useState(blank(industryId));
  const [segmentValue, setSegmentValue] = useState(blank(segmentCode));
  const [customerTypeValue, setCustomerTypeValue] = useState(blank(customerTypeId));
  const [customerSizeValue, setCustomerSizeValue] = useState(blank(customerSizeId));
  const [customerNatureValue, setCustomerNatureValue] = useState(blank(customerNatureId));
  const [creditCodeValue, setCreditCodeValue] = useState(blank(creditCode));
  const [websiteValue, setWebsiteValue] = useState(blank(website));
  const [employeeCountValue, setEmployeeCountValue] = useState(
    employeeCount != null ? String(employeeCount) : "",
  );

  // Reset to the current record every time the drawer opens, same as the old
  // openDrawer() did on click - just triggered by the controlling prop now
  // (owner, 2026-09-20: 死死记住设计文件 - the trigger moved to
  // account-header-menu.tsx's shared "···" menu).
  useEffect(() => {
    if (!open) return;
    setNameValue(name);
    setRegionValue(blank(region));
    setProvinceValue(blank(province));
    setIndustryValue(blank(industryId));
    setSegmentValue(blank(segmentCode));
    setCustomerTypeValue(blank(customerTypeId));
    setCustomerSizeValue(blank(customerSizeId));
    setCustomerNatureValue(blank(customerNatureId));
    setCreditCodeValue(blank(creditCode));
    setWebsiteValue(blank(website));
    setEmployeeCountValue(employeeCount != null ? String(employeeCount) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!canWrite) return null;

  const submit = () =>
    start(async () => {
      const r = await onSave(accountId, {
        name: nameValue,
        region: regionValue === "" ? null : regionValue,
        province: provinceValue === "" ? null : provinceValue,
        industryId: industryValue === "" ? null : industryValue,
        segmentCode: segmentValue === "" ? null : segmentValue,
        customerTypeId: customerTypeValue === "" ? null : customerTypeValue,
        customerSizeId: customerSizeValue === "" ? null : customerSizeValue,
        customerNatureId: customerNatureValue === "" ? null : customerNatureValue,
        creditCode: creditCodeValue === "" ? null : creditCodeValue,
        website: websiteValue === "" ? null : websiteValue,
        employeeCount: employeeCountValue.trim() === "" ? null : Number(employeeCountValue),
      });
      if (!r.ok) {
        toast({ tone: "danger", title: ACCOUNT_ERROR[r.error ?? "denied"] ?? r.error ?? "" });
        return;
      }
      toast({ tone: "success", title: ACCOUNT_BASICS_TEXT.saved });
      onOpenChange(false);
    });

  return (
    <Drawer
      open={open}
      onClose={() => onOpenChange(false)}
      width="md"
      title={ACCOUNT_BASICS_TEXT.title}
      description={ACCOUNT_BASICS_TEXT.why}
      closeLabel={DS_LABELS.confirmCancel}
      footer={
        <div className="gap-sm flex items-center justify-end">
          <Button variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
            {ACCOUNT_BASICS_TEXT.cancel}
          </Button>
          <Button disabled={pending || nameValue.trim() === ""} onClick={submit}>
            {ACCOUNT_BASICS_TEXT.save}
          </Button>
        </div>
      }
    >
        <div className="gap-lg flex flex-col">
          <Field>
            <FieldLabel>{ACCOUNT_BASICS_TEXT.name}</FieldLabel>
            <Input value={nameValue} onChange={(ev) => setNameValue(ev.target.value)} disabled={pending} />
          </Field>

          {/* 只读派生标识 - 系统生成, 不能改 (与 designate-account.tsx 的
              定级抽屉不共用同一套字段, 但都遵守栏1"这里的事实不可点改"的
              惯例). */}
          <Field>
            <FieldLabel>{ACCOUNT_BASICS_TEXT.accountNo}</FieldLabel>
            <Input value={accountNo} disabled />
          </Field>

          <Field>
            <FieldLabel>{ACCOUNT_BASICS_TEXT.region}</FieldLabel>
            <Input value={regionValue} onChange={(ev) => setRegionValue(ev.target.value)} disabled={pending} />
          </Field>

          <Field>
            <FieldLabel>{ACCOUNT_BASICS_TEXT.province}</FieldLabel>
            <NativeSelect value={provinceValue} onChange={(ev) => setProvinceValue(ev.target.value)} disabled={pending}>
              <option value="">{ACCOUNT_BASICS_TEXT.provincePick}</option>
              {ALL_PROVINCES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel>{ACCOUNT_BASICS_TEXT.industry}</FieldLabel>
            <NativeSelect value={industryValue} onChange={(ev) => setIndustryValue(ev.target.value)} disabled={pending}>
              <option value="">{ACCOUNT_BASICS_TEXT.industryPick}</option>
              {industries.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </NativeSelect>
          </Field>

          {segments.length > 0 ? (
            <Field>
              <FieldLabel>{ACCOUNT_BASICS_TEXT.segment}</FieldLabel>
              <NativeSelect value={segmentValue} onChange={(ev) => setSegmentValue(ev.target.value)} disabled={pending}>
                <option value="">{ACCOUNT_BASICS_TEXT.segmentPick}</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}

          <Field>
            <FieldLabel>{ACCOUNT_BASICS_TEXT.customerType}</FieldLabel>
            <NativeSelect value={customerTypeValue} onChange={(ev) => setCustomerTypeValue(ev.target.value)} disabled={pending}>
              <option value="">{ACCOUNT_BASICS_TEXT.customerTypePick}</option>
              {customerTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel>{ACCOUNT_BASICS_TEXT.customerSize}</FieldLabel>
            <NativeSelect value={customerSizeValue} onChange={(ev) => setCustomerSizeValue(ev.target.value)} disabled={pending}>
              <option value="">{ACCOUNT_BASICS_TEXT.customerSizePick}</option>
              {customerSizes.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel>{ACCOUNT_BASICS_TEXT.customerNature}</FieldLabel>
            <NativeSelect value={customerNatureValue} onChange={(ev) => setCustomerNatureValue(ev.target.value)} disabled={pending}>
              <option value="">{ACCOUNT_BASICS_TEXT.customerNaturePick}</option>
              {customerNatures.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel>{ACCOUNT_BASICS_TEXT.creditCode}</FieldLabel>
            <Input value={creditCodeValue} onChange={(ev) => setCreditCodeValue(ev.target.value)} disabled={pending} />
          </Field>

          <Field>
            <FieldLabel>{ACCOUNT_BASICS_TEXT.website}</FieldLabel>
            <Input value={websiteValue} onChange={(ev) => setWebsiteValue(ev.target.value)} disabled={pending} />
          </Field>

          <Field>
            <FieldLabel>{ACCOUNT_BASICS_TEXT.employeeCount}</FieldLabel>
            <Input
              type="number"
              min="0"
              value={employeeCountValue}
              onChange={(ev) => setEmployeeCountValue(ev.target.value)}
              disabled={pending}
            />
          </Field>

          {orgRelations ? (
            <>
              <Separator />
              {orgRelations}
            </>
          ) : null}

          {contactManagement ? (
            <>
              <Separator />
              {contactManagement}
            </>
          ) : null}
        </div>
    </Drawer>
  );
}
