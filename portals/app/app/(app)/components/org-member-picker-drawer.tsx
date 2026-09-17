"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, Drawer, EmptyState, Input, useToast } from "@vxture/design-ui";
import { useRouter } from "next/navigation";
import { useMessages } from "../lib/i18n/provider";
import { setUnitMembersAction } from "../admin/org/actions";
import type { OrgMemberSummary } from "./org-panel";
import { NameOverflowTag } from "./tag";

/* 添加成员 - tick who is placed in this unit, from the unit's own side (owner,
 * 2026-09-16). setUnitMembersAction reconciles each toggled member's FULL
 * unit set (setMemberUnits replaces it whole, 0053: 一人可在多个组织) rather
 * than this drawer's own picks, so a member's OTHER units are never touched
 * by ticking or unticking them here - the same want/held diff /admin/roles'
 * 关联成员 runs, just diffing unit membership instead of role membership.
 *
 * A SAVE FLOW, NOT A VIEW: plain component state, re-seeded from who is
 * placed here today each time a DIFFERENT unit opens - the same shape
 * role-member-picker-drawer.tsx already uses.
 *
 * Each row also shows the member's role(s), on the right - this drawer's own
 * auxiliary info, the same pairing 查看成员 shows.
 */
export function OrgMemberPickerDrawer({
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
  const { ORG_ERROR, ORG_TEXT } = useMessages();
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open || !unit) return;
    setSelected(new Set(members.filter((m) => m.unitIds.includes(unit.id)).map((m) => m.sub)));
    setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit?.id, open]);

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
      if (!unit) return;
      const r = await setUnitMembersAction(unit.id, [...selected]);
      if (!r.ok) {
        toast({ tone: "danger", title: ORG_ERROR[r.error] ?? r.error });
        return;
      }
      toast({ tone: "success", title: ORG_TEXT.addMembersDone(selected.size) });
      onClose();
      router.refresh();
    });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={unit ? ORG_TEXT.addMembersTitle(unit.name) : ""}
      description={ORG_TEXT.addMembersWhy}
      closeLabel={ORG_TEXT.cancel}
      footer={
        <div className="gap-sm flex items-center justify-end">
          <Button variant="secondary" disabled={pending} onClick={onClose}>{ORG_TEXT.cancel}</Button>
          <Button disabled={pending} onClick={save}>{ORG_TEXT.addMembersSave}</Button>
        </div>
      }
    >
      <div className="gap-md flex flex-col">
        {members.length === 0 ? (
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
                  <li key={m.sub}>
                    <label className="gap-sm hover:bg-muted flex items-center justify-between rounded-sm px-2xs py-2xs">
                      <span className="gap-sm flex items-center">
                        <input type="checkbox" checked={selected.has(m.sub)} onChange={() => toggle(m.sub)} />
                        <span className="text-body-sm">{m.name}</span>
                      </span>
                      <NameOverflowTag names={m.roleNames} empty={ORG_TEXT.noRole} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-muted-foreground text-body-sm">{ORG_TEXT.addMembersCount(selected.size)}</p>
          </>
        )}
      </div>
    </Drawer>
  );
}
