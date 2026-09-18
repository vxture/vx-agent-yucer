"use client";

import Link from "next/link";
import { Section } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { AccountParentPanel, type AccountParentPanelProps } from "./account-parent-panel";

// 单位信息 (owner, 2026-09-18: 客户详情页重排) - 上级 + 下级，同一张图的两半.
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
}: AccountParentPanelProps & {
  readonly children: readonly { id: string; name: string }[];
}) {
  const { ACCOUNT_TEXT } = useMessages();
  return (
    <Section icon="buildings" title={ACCOUNT_TEXT.orgUnitTitle} description={ACCOUNT_TEXT.orgUnitWhy}>
      <div className="flex flex-col gap-sm">
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
