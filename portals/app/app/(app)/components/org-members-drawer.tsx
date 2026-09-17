"use client";

import { useMemo, useState } from "react";
import { Button, Drawer, EmptyState, Input } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import type { OrgMemberSummary } from "./org-panel";
import { NameOverflowTag } from "./tag";

/* 查看成员 - who is placed in this unit today, read only (owner, 2026-09-16).
 * Pulled OUT of 单位详情's own tag-cloud section into its own drawer, the
 * same shape /admin/roles' 查看成员 uses: a vertical list, one row per
 * person, searchable by name - not a wrapped cloud of tags, which had no room
 * for the role(s) each person holds (this drawer's own auxiliary info, on
 * the right - owner: 辅助信息应该靠右显示).
 */
export function OrgMembersDrawer({
  unit,
  members,
  open,
  onClose,
}: {
  readonly unit: { readonly id: string; readonly name: string } | null;
  readonly members: readonly OrgMemberSummary[];
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const { ORG_TEXT } = useMessages();
  const [query, setQuery] = useState("");

  const placed = useMemo(
    () => (unit ? members.filter((m) => m.unitIds.includes(unit.id)) : []),
    [unit, members],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === "" ? placed : placed.filter((m) => m.name.toLowerCase().includes(q));
  }, [placed, query]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={unit ? ORG_TEXT.membersTitle(unit.name) : ""}
      description={unit ? ORG_TEXT.detailsMembers(placed.length) : ""}
      closeLabel={ORG_TEXT.detailsDone}
      footer={
        <div className="gap-sm flex items-center justify-end">
          <Button variant="secondary" onClick={onClose}>{ORG_TEXT.detailsDone}</Button>
        </div>
      }
    >
      <div className="gap-md flex flex-col">
        {placed.length === 0 ? (
          <EmptyState title={ORG_TEXT.noMember} description={ORG_TEXT.detailsNoMembers} />
        ) : (
          <>
            <Input
              type="search"
              className="w-full"
              value={query}
              placeholder={ORG_TEXT.membersSearchPlaceholder}
              aria-label={ORG_TEXT.membersSearchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
            />
            {filtered.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">{ORG_TEXT.membersSearchEmpty}</p>
            ) : (
              <ul className="gap-2xs flex flex-col">
                {filtered.map((m) => (
                  <li key={m.sub} className="gap-sm flex items-center justify-between rounded-sm px-2xs py-2xs">
                    <span className="text-body-sm">{m.name}</span>
                    <NameOverflowTag names={m.roleNames} empty={ORG_TEXT.noRole} />
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
