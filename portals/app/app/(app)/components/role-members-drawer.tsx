"use client";

import { useMemo, useState } from "react";
import { Button, Drawer, EmptyState, Input } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import type { RoleMemberSummary } from "./role-panel";
import { NameOverflowTag } from "./tag";

/* 查看成员 - who holds this role today, read only (owner, 2026-09-16). The
 * counterpart of 权限详情: that drawer answers "what can this role do", this
 * one answers "who has it". Both open from the row's read-only group, for
 * every reader admin.member.view lets onto this page - not only the editors
 * who see 关联成员 too.
 *
 * SEARCHES BY NAME, same as every roster search in this app (role-panel.tsx's
 * own toolbar): a plain client-side substring filter, no debounce.
 *
 * A VERTICAL LIST, ONE ROW PER PERSON (owner, 2026-09-16: 纵向清单式排列, same
 * shape 添加成员/关联成员 use) - not the tag-cloud this drawer shipped with
 * first. Each row also carries the member's own org unit(s), on the RIGHT
 * (owner: 辅助信息应该靠右显示) - auxiliary to this drawer's subject (who
 * holds the role), same reasoning 组织管理's own 查看成员 shows role tags.
 */
export function RoleMembersDrawer({
  role,
  members,
  open,
  onClose,
}: {
  readonly role: { readonly code: string; readonly name: string } | null;
  readonly members: readonly RoleMemberSummary[];
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const { ROLE_TEXT } = useMessages();
  const [query, setQuery] = useState("");

  const holders = useMemo(
    () => (role ? members.filter((m) => m.roles.includes(role.code)) : []),
    [role, members],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === "" ? holders : holders.filter((m) => m.name.toLowerCase().includes(q));
  }, [holders, query]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={role ? ROLE_TEXT.membersTitle(role.name) : ""}
      description={role ? ROLE_TEXT.membersWhy(holders.length) : ""}
      closeLabel={ROLE_TEXT.detailsDone}
      footer={
        <div className="gap-sm flex items-center justify-end">
          <Button variant="secondary" onClick={onClose}>{ROLE_TEXT.detailsDone}</Button>
        </div>
      }
    >
      <div className="gap-md flex flex-col">
        {holders.length === 0 ? (
          <EmptyState title={ROLE_TEXT.noMember} description={ROLE_TEXT.membersEmptyWhy} />
        ) : (
          <>
            <Input
              type="search"
              className="w-full"
              value={query}
              placeholder={ROLE_TEXT.membersSearchPlaceholder}
              aria-label={ROLE_TEXT.membersSearchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
            />
            {filtered.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">{ROLE_TEXT.membersSearchEmpty}</p>
            ) : (
              <ul className="gap-2xs flex flex-col">
                {filtered.map((m) => (
                  <li key={m.sub} className="gap-sm flex items-center justify-between rounded-sm px-2xs py-2xs">
                    <span className="text-body-sm">{m.name}</span>
                    <NameOverflowTag names={m.orgUnitNames} empty={ROLE_TEXT.ungrouped} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
