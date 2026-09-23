"use client";

import { useState, useTransition } from "react";
import { Button, Checkbox, Drawer, StatusBadge } from "@vxture/design-ui";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";
import { Tag } from "./tag";
import type { MeetingBriefResult, SerializedBrief } from "../account/meeting-brief-action";

// 会前准备 (L6 batch five) - a copilot quick command, not a card.
//
// Generated on demand and thrown away: it is "I am seeing them in half an
// hour", not a standing state, so it lives in the deck (design T4 - no new
// card on the page) and opens in a Drawer.
//
// THE ATTENDEES ARE PICKED, AND THE SCREEN SAYS SO. There is no calendar
// integration (对标与取舍 P2: 暂不). A brief that looked like it knew who is
// coming would be believed; this one asks, and its first line says it asked.

export interface MeetingBriefButtonProps {
  readonly accountId: string;
  readonly contacts: ReadonlyArray<{ id: string; name: string; title: string | null }>;
  readonly onBuild: (input: { accountId: string; attendeeContactIds: string[] }) => Promise<MeetingBriefResult>;
}

export function MeetingBriefButton({ accountId, contacts, onBuild }: MeetingBriefButtonProps) {
  const { MEETING_TEXT, MEETING_ERROR, DS_LABELS } = useMessages();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [brief, setBrief] = useState<SerializedBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const build = () =>
    start(async () => {
      setError(null);
      const r = await onBuild({ accountId, attendeeContactIds: [...chosen] });
      if (!r.ok) {
        setError(MEETING_ERROR[r.error] ?? MEETING_ERROR.denied);
        return;
      }
      setBrief(r.brief);
    });

  const close = () => {
    setOpen(false);
    setBrief(null);
    setError(null);
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {MEETING_TEXT.open}
      </Button>
      <Drawer
        open={open}
        onClose={close}
        width="md"
        title={MEETING_TEXT.title}
        description={brief ? MEETING_TEXT.pickedNote : MEETING_TEXT.pickHint}
        closeLabel={DS_LABELS.confirmCancel}
        footer={
          <div className="gap-sm flex items-center justify-end">
            {brief ? (
              <Button variant="secondary" onClick={() => setBrief(null)}>
                {MEETING_TEXT.repick}
              </Button>
            ) : (
              <Button disabled={pending || chosen.size === 0} onClick={build}>
                {MEETING_TEXT.build}
              </Button>
            )}
          </div>
        }
      >
        {error ? <p className="text-destructive-text text-body-sm mb-sm">{error}</p> : null}
        {brief ? (
          <BriefBody brief={brief} />
        ) : contacts.length === 0 ? (
          <p className="text-muted-foreground text-body-sm">{MEETING_TEXT.noContacts}</p>
        ) : (
          <div className="flex flex-col gap-2xs">
            {contacts.map((c) => (
              <label
                key={c.id}
                htmlFor={`attendee-${c.id}`}
                className="gap-sm hover:bg-muted flex items-center rounded-sm px-2xs py-2xs"
              >
                <Checkbox
                  id={`attendee-${c.id}`}
                  checked={chosen.has(c.id)}
                  onCheckedChange={() => toggle(c.id)}
                  disabled={pending}
                />
                <span className="text-body-sm grow font-medium">{c.name}</span>
                {c.title ? <span className="text-muted-foreground text-body-sm">{c.title}</span> : null}
              </label>
            ))}
          </div>
        )}
      </Drawer>
    </>
  );
}

function BriefBody({ brief }: { readonly brief: SerializedBrief }) {
  const {
    MEETING_TEXT,
    DECISION_ROLE_LABEL,
    STANCE_LABEL,
    DIRECTION_LABEL,
    AGENT_ACTION_LABEL,
    healthReasonText,
  } = useMessages();
  const locale = useLocale();

  // Refused and failed are two different sentences, and neither is "none".
  const unavailable = (state: "refused" | "failed") => (
    <p className={state === "failed" ? "text-destructive-text text-body-sm" : "text-muted-foreground text-body-sm"}>
      {state === "failed" ? MEETING_TEXT.partFailed : MEETING_TEXT.partRefused}
    </p>
  );

  return (
    <div className="flex flex-col gap-lg">
      <section className="flex flex-col gap-2xs">
        <h3 className="text-body-md font-bold">{MEETING_TEXT.attendees}</h3>
        {brief.attendees.map((a) => (
          <div key={a.contactId} className="text-body-sm">
            <span className="font-medium">{a.name}</span>
            {a.title ? <span className="text-muted-foreground"> · {a.title}</span> : null}
            {a.roles.length === 0 ? (
              <span className="text-muted-foreground"> · {MEETING_TEXT.noRole}</span>
            ) : (
              a.roles.map((r, i) => (
                <span key={i} className="ml-xs inline-flex items-center gap-3xs">
                  <Tag>{`${r.dealName}: ${DECISION_ROLE_LABEL[r.role] ?? r.role}`}</Tag>
                  {r.stance ? <Tag>{STANCE_LABEL[r.stance] ?? r.stance}</Tag> : null}
                </span>
              ))
            )}
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2xs">
        <h3 className="text-body-md font-bold">{MEETING_TEXT.commitments}</h3>
        {brief.commitments.state !== "ok" ? (
          unavailable(brief.commitments.state)
        ) : brief.commitments.items.length === 0 ? (
          <p className="text-muted-foreground text-body-sm">{MEETING_TEXT.commitmentsNone}</p>
        ) : (
          brief.commitments.items.map((c) => (
            <p key={c.id} className="text-body-sm">
              <StatusBadge tone={c.urgency === "soon" ? "warning" : "danger"}>
                {c.urgency === "missed"
                  ? MEETING_TEXT.missed
                  : c.urgency === "overdue"
                    ? MEETING_TEXT.overdue(-c.daysToDue)
                    : MEETING_TEXT.dueIn(c.daysToDue)}
              </StatusBadge>{" "}
              <span className="text-muted-foreground">{DIRECTION_LABEL[c.direction] ?? c.direction}</span> {c.statement}
            </p>
          ))
        )}
      </section>

      <section className="flex flex-col gap-2xs">
        <h3 className="text-body-md font-bold">{MEETING_TEXT.money}</h3>
        {brief.money.state !== "ok" ? (
          unavailable(brief.money.state)
        ) : brief.money.items.length === 0 ? (
          <p className="text-muted-foreground text-body-sm">{MEETING_TEXT.moneyNone}</p>
        ) : (
          brief.money.items.map((i) => (
            <p key={i.id} className="text-body-sm flex items-center gap-xs">
              <StatusBadge tone={i.overdue ? "danger" : "warning"}>
                {i.overdue ? MEETING_TEXT.moneyOverdue : MEETING_TEXT.dueIn(i.daysToDue ?? 0)}
              </StatusBadge>
              <span className="grow">{i.label}</span>
              <span className="tabular-nums">{formatMoney(i.amount, i.currency, locale)}</span>
            </p>
          ))
        )}
      </section>

      <section className="flex flex-col gap-2xs">
        <h3 className="text-body-md font-bold">{MEETING_TEXT.conclusion}</h3>
        {brief.conclusion.state !== "ok" ? (
          unavailable(brief.conclusion.state)
        ) : (
          <>
            {brief.conclusion.health ? (
              <p className="text-body-sm">
                {MEETING_TEXT.health(brief.conclusion.health.score)}
                {brief.conclusion.health.concernCode
                  ? ` · ${healthReasonText({
                      code: brief.conclusion.health.concernCode,
                      days: brief.conclusion.health.concernDays,
                      count: brief.conclusion.health.concernCount,
                    })}`
                  : ""}
              </p>
            ) : (
              <p className="text-muted-foreground text-body-sm">{MEETING_TEXT.healthUnavailable}</p>
            )}
            {brief.conclusion.items.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">{MEETING_TEXT.proposalsNone}</p>
            ) : (
              brief.conclusion.items.map((p) => (
                <p key={p.id} className="text-body-sm">
                  <span className="font-medium">{AGENT_ACTION_LABEL[p.title] ?? p.title}</span>
                  {p.rationale ? <span className="text-muted-foreground"> · {p.rationale}</span> : null}
                </p>
              ))
            )}
          </>
        )}
      </section>
    </div>
  );
}
