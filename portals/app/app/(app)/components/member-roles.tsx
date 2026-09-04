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

import { useMessages } from "../lib/i18n/provider";
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
  /** "active" | "inactive". A departed member keeps their row forever. */
  readonly status: string;
  /** Which rows they may see, as configured. "workspace" narrows nothing. */
  readonly scope: string;
  /** Assigned territories, unexpanded - children come from the hierarchy. */
  readonly territoryIds: readonly string[];
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
  readonly onDeactivate: (
    sub: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  readonly onReactivate: (
    sub: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Move a departing member's live book to somebody else.
   *
   * Offered only on an INACTIVE row: handing over the book of somebody who is
   * still here is a reassignment, and that is done per record on its own page
   * with its own reasons. This control exists for the case with no other
   * answer - the owner has gone and their work is invisible to everyone.
   */
  readonly onHandover: (
    from: string,
    to: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
    moved?: { accounts: number; opportunities: number; leads: number };
    /** Rows a domain rule refused. Reported, never silently dropped. */
    skipped?: ReadonlyArray<{ kind: string; id: string; reason: string }>;
  }>;
  /**
   * Where to send someone who wants to add a member.
   *
   * A LINK, NOT A FORM. The platform decides who may use the product and how
   * many seats there are; inviting somebody is a platform act, and a form here
   * would be the product pretending to an authority it does not have. Absent
   * when the console URL is not configured - a button that goes nowhere is
   * worse than no button.
   */
  readonly inviteUrl?: string | null;
  /** The territories an administrator may assign. Empty hides the choice. */
  readonly territories?: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly onScope?: (
    sub: string,
    kind: string,
    territoryIds: string[],
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
  onDeactivate,
  onReactivate,
  onHandover,
  inviteUrl,
  territories = [],
  onScope,
}: MemberRolesProps) {
  const { DATA_TABLE_LABELS, MEMBER_ERROR, MEMBER_TEXT, ROLE_LABEL } =
    useMessages();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [heir, setHeir] = useState<Record<string, string>>({});
  const [terr, setTerr] = useState<Record<string, string>>({});

  // Counted over the whole table so the guard reads the same fact the service
  // does: "is anyone else able to administer this workspace".
  const adminCount = members.filter((m) => m.roles.some(isAdminRole)).length;

  function run(
    key: string,
    op: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setNotice(null);
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
          <div className="flex items-center gap-xs">
            <span>{row.displayName ?? row.sub}</span>
            {/* MARKED, NOT HIDDEN. A departed member keeps their row forever -
                it is the only thing that maps this sub to a name, and every
                signature in the audit trail reads through it. Hiding them would
                make the roster tidy and the history unreadable. */}
            {row.status === "inactive" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <StatusBadge tone="neutral">
                      {MEMBER_TEXT.inactive}
                    </StatusBadge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{MEMBER_TEXT.inactiveHint}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
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
    {
      id: "scope",
      header: MEMBER_TEXT.columnScope,
      cell: (row) => {
        // READ-ONLY WITHOUT THE PERMISSION, and still shown. "Everyone sees
        // everything" is a fact worth being on screen rather than assumed -
        // the same reason the autonomy panel shows 尚未设置 instead of quietly
        // reading as configured.
        const label = MEMBER_TEXT.scopeLabels[row.scope] ?? row.scope;
        if (!canManage || !onScope) {
          return <span className="text-muted-foreground text-body-sm">{label}</span>;
        }
        const key = `${row.sub}:scope`;
        const chosenTerr = terr[row.sub] ?? row.territoryIds[0] ?? "";
        return (
          <span className="flex flex-col gap-3xs">
            <NativeSelect
              aria-label={MEMBER_TEXT.columnScope}
              value={row.scope}
              disabled={pending && busy === key}
              onChange={(e) => {
                const next = e.target.value;
                // A territory scope needs a territory. Choosing it with none
                // picked would be refused by the service; sending the first
                // available makes the control do what it looks like it does,
                // and the administrator can change it on the row below.
                const ids =
                  next === "territory"
                    ? [chosenTerr || territories[0]?.id].filter(
                        (x): x is string => Boolean(x),
                      )
                    : [];
                void run(key, () => onScope(row.sub, next, ids));
              }}
            >
              {["workspace", "territory", "own"].map((k) => (
                <option key={k} value={k}>
                  {MEMBER_TEXT.scopeLabels[k] ?? k}
                </option>
              ))}
            </NativeSelect>
            {row.scope === "territory" && territories.length > 0 ? (
              <NativeSelect
                aria-label={MEMBER_TEXT.scopeTerritory}
                value={chosenTerr}
                disabled={pending && busy === key}
                onChange={(e) => {
                  const id = e.target.value;
                  setTerr({ ...terr, [row.sub]: id });
                  void run(key, () =>
                    onScope(row.sub, "territory", id ? [id] : []),
                  );
                }}
              >
                <option value="">{MEMBER_TEXT.scopeTerritory}</option>
                {territories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "lifecycle",
      header: MEMBER_TEXT.columnLifecycle,
      align: "right",
      cell: (row) => {
        if (!canManage) return null;
        const key = `${row.sub}:lifecycle`;
        if (row.status === "inactive") {
          // WHO CAN RECEIVE A BOOK: active members other than this one. A
          // departed member cannot inherit - that would make the work invisible
          // to a second person instead of the first - and the service refuses
          // it again, because a client cannot be trusted with that check.
          const heirs = members.filter(
            (m) => m.status === "active" && m.sub !== row.sub,
          );
          const chosenHeir = heir[row.sub] ?? "";
          const handKey = `${row.sub}:handover`;
          return (
            <span className="flex items-center justify-end gap-xs">
              <Button
                size="sm"
                variant="ghost"
                disabled={pending && busy === key}
                onClick={() => run(key, () => onReactivate(row.sub))}
              >
                {MEMBER_TEXT.reactivate}
              </Button>
              {heirs.length > 0 ? (
                <>
                  <NativeSelect
                    aria-label={MEMBER_TEXT.handoverTo}
                    value={chosenHeir}
                    onChange={(e) =>
                      setHeir({ ...heir, [row.sub]: e.target.value })
                    }
                    disabled={pending && busy === handKey}
                  >
                    <option value="">{MEMBER_TEXT.handoverTo}</option>
                    {heirs.map((m) => (
                      <option key={m.sub} value={m.sub}>
                        {m.displayName ?? m.sub}
                      </option>
                    ))}
                  </NativeSelect>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={
                            chosenHeir === "" || (pending && busy === handKey)
                          }
                          onClick={() =>
                            run(handKey, () =>
                              onHandover(row.sub, chosenHeir).then((r) => {
                                if (!r.ok) return r;
                                setHeir({ ...heir, [row.sub]: "" });
                                // WHAT ACTUALLY MOVED, said out loud. A
                                // handover that reported nothing would leave
                                // the administrator to go and count - and the
                                // refused rows would be invisible, which is the
                                // half that matters: a lead the rule would not
                                // move is still owned by somebody who has left.
                                const m = r.moved;
                                const parts = m
                                  ? [
                                      MEMBER_TEXT.handoverDone(
                                        m.accounts,
                                        m.opportunities,
                                        m.leads,
                                      ),
                                    ]
                                  : [];
                                if (r.skipped && r.skipped.length > 0) {
                                  parts.push(
                                    MEMBER_TEXT.handoverPartial(
                                      r.skipped.length,
                                    ),
                                  );
                                }
                                setNotice(parts.join(" "));
                                return r;
                              }),
                            )
                          }
                        >
                          {MEMBER_TEXT.handover}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{MEMBER_TEXT.handoverHint}</TooltipContent>
                  </Tooltip>
                </>
              ) : null}
            </span>
          );
        }
        // THE LAST ADMINISTRATOR, disabled here and refused again in the
        // service. Deactivating them leaves a workspace nobody can administer,
        // and there is no path back - not through a later login, not through
        // the platform.
        const isLastAdmin = row.roles.some(isAdminRole) && adminCount <= 1;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isLastAdmin || (pending && busy === key)}
                  onClick={() => run(key, () => onDeactivate(row.sub))}
                >
                  {MEMBER_TEXT.deactivate}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {isLastAdmin
                ? MEMBER_TEXT.lastAdminHint
                : MEMBER_TEXT.deactivateHint}
            </TooltipContent>
          </Tooltip>
        );
      },
    },
  ];

  return (
    <Section
      /* INVITING IS A PLATFORM ACT. Seats and who may sign in are the
         platform's to decide, so this is a link out rather than a form here -
         the product would otherwise be offering an authority it does not
         have. */
      action={
        canManage && inviteUrl ? (
          <Button asChild size="sm" variant="secondary">
            <a href={inviteUrl} target="_blank" rel="noreferrer">
              {MEMBER_TEXT.invite}
            </a>
          </Button>
        ) : null
      }
    >
      {!canManage ? (
        <StatusBadge tone="neutral">{MEMBER_TEXT.readOnly}</StatusBadge>
      ) : null}
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      {notice ? <StatusBadge tone="info">{notice}</StatusBadge> : null}
      {members.length === 0 ? (
        <EmptyState
          title={MEMBER_TEXT.emptyTitle}
          description={MEMBER_TEXT.emptyDescription}
        />
      ) : (
        <DataTable
          /* Every DS copy outlet must be passed - the fallbacks are English
               and exist so a missed prop renders something legible, not so
               anyone can rely on them. This table shipped with an "Actions"
               column header in a Chinese interface. */
          labels={DATA_TABLE_LABELS}
          indexStart={1}
          columns={columns}
          rows={members}
          rowKey={(row) => row.memberId}
        />
      )}
    </Section>
  );
}
