"use client";

import Link from "next/link";
import { DetailList, DetailRow, Section } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { AccountParentPanel, type AccountParentPanelProps } from "./account-parent-panel";

// 单位信息 (owner, 2026-09-18: 客户详情页重排; 2026-09-20: 行业/区域从
// header 搬到这里 - 严格按照设计实施, mockup 原话: "行业、位置这些是固有属性，
// 属于栏1的档案，不是header该扛的身份信息"). 上级 + 下级 + 固有属性，同一张
// 图的三部分。
//
// THE PARENT HALF IS NOT NEW. AccountParentPanel has read the fact and written
// it (incr/0025) since batch 6c; this only moves it inside a titled card next
// to its other half instead of floating above the grid on its own row.
//
// THE CHILD HALF NEEDS NO NEW READ. Every other account's parentId is already
// in the same accountRows list AccountParentPanel's own picker excludes a
// subtree from - filtering it by parentId === this account IS "who reports to
// me", so a second query would only duplicate a read the page already makes.
export function OrgUnitPanel({
  children,
  accountId,
  parentId,
  parentName,
  accounts,
  canWrite,
  onSetParent,
  industry,
  region,
}: AccountParentPanelProps & {
  readonly children: readonly { id: string; name: string }[];
  readonly industry: string | null;
  readonly region: string | null;
}) {
  const { ACCOUNT_TEXT } = useMessages();
  return (
    <Section icon="buildings" title={ACCOUNT_TEXT.orgUnitTitle} description={ACCOUNT_TEXT.orgUnitWhy}>
      <div className="flex flex-col gap-sm">
        {industry || region ? (
          <DetailList>
            {industry ? <DetailRow label={ACCOUNT_TEXT.orgUnitIndustry}>{industry}</DetailRow> : null}
            {region ? <DetailRow label={ACCOUNT_TEXT.orgUnitRegion}>{region}</DetailRow> : null}
          </DetailList>
        ) : null}
        <AccountParentPanel
          accountId={accountId}
          parentId={parentId}
          parentName={parentName}
          accounts={accounts}
          canWrite={canWrite}
          onSetParent={onSetParent}
        />
        {children.length > 0 ? (
          <details className="text-body-sm">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer select-none">
              {ACCOUNT_TEXT.orgUnitChildren(children.length)}
            </summary>
            <div className="mt-xs pl-md flex flex-col gap-2xs">
              {children.map((c) => (
                <Link
                  key={c.id}
                  href={`/account/${c.id}`}
                  className="text-muted-foreground hover:text-foreground min-w-0 truncate hover:underline"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </Section>
  );
}
