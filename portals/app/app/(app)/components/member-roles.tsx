"use client";

import { useState, useTransition } from "react";
import {
  Button,
  DataTable,
  EmptyState,
  NativeSelect,
  Section,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type DataTableColumn,
} from "@vxture/design-ui";
import {
  ROLE_CODES,
  ROLE_PERMISSIONS,
  type RoleCode,
} from "../../authz/catalog";
import { MEMBER_ERROR, MEMBER_TEXT, ROLE_LABEL } from "../lib/messages";

// Who is in the workspace and what they can do.
//
// The roleless member is the case this screen exists for, so it is called out
// rather than rendered as an empty cell: a blank roles column reads as "nothing
// to see", when it actually means that person opens the product and finds every
// module missing.
//
// The last-administrator guard lives in the service, not here. This surface
// disables the button and says why, but the refusal is re-decided server-side -
// a request that skips the UI gets the same answer, because "the workspace can
// still be administered" is not a property a client can be trusted to check.

export interface MemberView {
  readonly memberId: string;
  readonly sub: string;
  readonly displayName: string | null;
  readonly roles: readonly string[];
}

export interface MemberRolesProps {
  readonly members: readonly MemberView[];
  readonly canManage: boolean;
  readonly onGrant: (
    sub: string,
    role: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  readonly onRevoke: (
    sub: string,
    role: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

const isAdminRole = (role: string): boolean =>
  role in ROLE_PERMISSIONS &&
  ROLE_PERMISSIONS[role as RoleCode].includes("admin.manage");

export function MemberRoles({
  members,
  canManage,
  onGrant,
  onRevoke,
}: MemberRolesProps) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});

  // Counted over the whole table so the guard reads the same fact the service
  // does: "is anyone else able to administer this workspace".
  const adminCount = members.filter((m) => m.roles.some(isAdminRole)).length;

  function run(
    key: string,
    op: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setBusy(key);
    setError(null);
    startTransition(() => {
      void op()
        .then((r) => {
          if (!r.ok)
            setError(MEMBER_ERROR[r.error ?? "denied"] ?? r.error ?? "denied");
        })
        .finally(() => setBusy(null));
    });
  }

  const columns: readonly DataTableColumn<MemberView>[] = [
    {
      id: "member",
      header: MEMBER_TEXT.columnMember,
      cell: (row) => (
        <div>
          <div>{row.displayName ?? row.sub}</div>
          <div>{row.sub}</div>
        </div>
      ),
    },
    {
      id: "roles",
      header: MEMBER_TEXT.columnRoles,
      cell: (row) => {
        if (row.roles.length === 0) {
          // The case the screen exists for. This person currently opens the
          // product and finds nothing.
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <StatusBadge tone="warning" dot>
                    {MEMBER_TEXT.noRoles}
                  </StatusBadge>
                </span>
              </TooltipTrigger>
              <TooltipContent>{MEMBER_TEXT.noRolesHint}</TooltipContent>
            </Tooltip>
          );
        }
        return (
          <>
            {row.roles.map((role) => {
              const last = isAdminRole(role) && adminCount === 1;
              const key = `${row.sub}:${role}`;
              return (
                <span key={role}>
                  <StatusBadge tone={isAdminRole(role) ? "info" : "neutral"}>
                    {ROLE_LABEL[role] ?? role}
                  </StatusBadge>
                  {canManage ? (
                    last ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button variant="ghost" size="sm" disabled>
                              {MEMBER_TEXT.revoke}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {MEMBER_TEXT.lastAdminHint}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending && busy === key}
                        onClick={() => run(key, () => onRevoke(row.sub, role))}
                      >
                        {MEMBER_TEXT.revoke}
                      </Button>
                    )
                  ) : null}
                </span>
              );
            })}
          </>
        );
      },
    },
    {
      id: "assign",
      header: MEMBER_TEXT.columnActions,
      align: "right",
      cell: (row) => {
        if (!canManage) return null;
        // Only roles this member does not already hold. Offering a grant that
        // would be a no-op is offering a button that does nothing.
        const available = ROLE_CODES.filter((r) => !row.roles.includes(r));
        if (available.length === 0) return null;
        const chosen = picked[row.sub] ?? "";
        const key = `${row.sub}:grant`;
        return (
          <>
            <NativeSelect
              aria-label={MEMBER_TEXT.assignPlaceholder}
              value={chosen}
              onChange={(e) =>
                setPicked({ ...picked, [row.sub]: e.target.value })
              }
              disabled={pending && busy === key}
            >
              <option value="">{MEMBER_TEXT.assignPlaceholder}</option>
              {available.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r] ?? r}
                </option>
              ))}
            </NativeSelect>
            <Button
              size="sm"
              disabled={chosen === "" || (pending && busy === key)}
              onClick={() =>
                run(key, () =>
                  onGrant(row.sub, chosen).then((r) => {
                    if (r.ok) setPicked({ ...picked, [row.sub]: "" });
                    return r;
                  }),
                )
              }
            >
              {MEMBER_TEXT.assign}
            </Button>
          </>
        );
      },
    },
  ];

  return (
    <Section title={MEMBER_TEXT.title} description={MEMBER_TEXT.description}>
      {!canManage ? (
        <StatusBadge tone="neutral">{MEMBER_TEXT.readOnly}</StatusBadge>
      ) : null}
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      {members.length === 0 ? (
        <EmptyState
          title={MEMBER_TEXT.emptyTitle}
          description={MEMBER_TEXT.emptyDescription}
        />
      ) : (
        <DataTable
          leadingSpacer
          indexStart={1}
          columns={columns}
          rows={members}
          rowKey={(row) => row.memberId}
        />
      )}
    </Section>
  );
}
