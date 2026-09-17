"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, Drawer, EmptyState, Input, useToast } from "@vxture/design-ui";
import { useRouter } from "next/navigation";
import { useMessages } from "../lib/i18n/provider";
import { setRoleMembersAction } from "../admin/roles/actions";
import type { RoleMemberSummary } from "./role-panel";
import { NameOverflowTag } from "./tag";

/* 关联成员 - tick who holds this role, from the role's side (owner,
 * 2026-09-16). The same assignRole/revokeRole the member roster's own role
 * picker calls (admin/members/actions.ts's saveMemberAction) reconciling a
 * MEMBER's set of roles - here it is one ROLE's set of members instead, but
 * the underlying verbs, gate and last-administrator guard are the same ones,
 * unchanged (see setRoleMembersAction).
 *
 * A SAVE FLOW, NOT A VIEW, so plain component state is enough - the same
 * shape org-unit-form.tsx's 选择区域 drawer already uses (checkbox list,
 * commit on the footer's button). Re-seeded from the current holders each
 * time a DIFFERENT role opens, never while the drawer stays open, so a tick
 * mid-edit is not overwritten by a background refresh landing behind it.
 *
 * SEARCHES BY NAME - the request this drawer exists to satisfy alongside
 * 查看成员. No other checkbox-in-a-drawer picker in this app has needed one
 * yet (the org-unit division picker's list is short); a workspace roster is
 * not.
 */
export function RoleMemberPickerDrawer({
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
  const { ROLE_ERROR, ROLE_TEXT } = useMessages();
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open || !role) return;
    setSelected(new Set(members.filter((m) => m.roles.includes(role.code)).map((m) => m.sub)));
    setQuery("");
    // Re-seed only when a role starts being edited, not on every roster
    // refresh the drawer stays open through.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role?.code, open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === "" ? members : members.filter((m) => m.name.toLowerCase().includes(q));
  }, [members, query]);

  const toggle = (sub: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sub)) next.delete(sub);
      else next.add(sub);
      return next;
    });
  };

  const save = () =>
    start(async () => {
      if (!role) return;
      const r = await setRoleMembersAction(role.code, [...selected]);
      if (!r.ok) {
        toast({ tone: "danger", title: ROLE_ERROR[r.error] ?? r.error });
        return;
      }
      toast({ tone: "success", title: ROLE_TEXT.linkMembersDone(selected.size) });
      onClose();
      router.refresh();
    });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={role ? ROLE_TEXT.linkMembersTitle(role.name) : ""}
      description={ROLE_TEXT.linkMembersWhy}
      closeLabel={ROLE_TEXT.cancel}
      footer={
        <div className="gap-sm flex items-center justify-end">
          <Button variant="secondary" disabled={pending} onClick={onClose}>{ROLE_TEXT.cancel}</Button>
          <Button disabled={pending} onClick={save}>{ROLE_TEXT.linkMembersSave}</Button>
        </div>
      }
    >
      <div className="gap-md flex flex-col">
        {members.length === 0 ? (
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
                  <li key={m.sub}>
                    <label className="gap-sm hover:bg-muted flex items-center justify-between rounded-sm px-2xs py-2xs">
                      <span className="gap-sm flex items-center">
                        <input type="checkbox" checked={selected.has(m.sub)} onChange={() => toggle(m.sub)} />
                        <span className="text-body-sm">{m.name}</span>
                      </span>
                      <NameOverflowTag names={m.orgUnitNames} empty={ROLE_TEXT.ungrouped} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-muted-foreground text-body-sm">{ROLE_TEXT.linkMembersCount(selected.size)}</p>
          </>
        )}
      </div>
    </Drawer>
  );
}
