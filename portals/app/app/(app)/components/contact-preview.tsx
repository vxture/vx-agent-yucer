"use client";
import { useEffect, useState } from "react";
import { Button, Drawer, HoverCard, HoverCardContent, HoverCardTrigger, Icon } from "@vxture/design-ui";
import type { ContactRosterSummary, ContactSummary } from "../../domains/account/contact-read";
import { loadContactRoster, loadContactView } from "../contact/read-actions";
import { useMessages } from "../lib/i18n/provider";
import { MemberName } from "../lib/member-names";
import { ContactDetails, ContactFullLink } from "./contact-details";
import { collectionDrawerWidth } from "./collection-layout";

type RosterReply = Awaited<ReturnType<typeof loadContactRoster>>;
type DetailReply = Awaited<ReturnType<typeof loadContactView>>;

export function ContactPreview({ accountId, summary }: Readonly<{ accountId: string; summary: ContactRosterSummary }>) {
  const { CONTACT_VIEW_TEXT: T, ACCOUNT_TEXT: A } = useMessages();
  const [hover, setHover] = useState(false), [selected, setSelected] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterReply | null>(null), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!hover) return;
    let active = true; setRoster(null);
    void loadContactRoster(accountId).then(result => { if (active) setRoster(result); }).catch(() => { if (active) setRoster({ ok: false }); });
    return () => { active = false; };
  }, [accountId, hover, attempt]);
  if (summary.state !== "ready") return <span className="text-muted-foreground">{T.summaryUnavailable}</span>;
  if (!summary.first) return <span className="text-warning-text">{T.none}</span>;
  const first = summary.first;
  const open = (id: string) => { setHover(false); setSelected(id); };
  return <>
    <HoverCard open={hover} onOpenChange={setHover} openDelay={200} closeDelay={180}>
      <HoverCardTrigger asChild><Button variant="ghost" size="sm" className="max-w-full min-w-0" onFocus={() => setHover(true)} onClick={() => open(first.id)} aria-label={T.openSummary(first.name, summary.total)}><MemberName name={first.name}/>{first.status !== "active" ? <span className="shrink-0 text-body-small text-muted-foreground">{A.contactStatusLabel[first.status] ?? T.unknownStatus}</span> : null}<span className="shrink-0 text-body-small text-muted-foreground">{T.total(summary.total)}</span></Button></HoverCardTrigger>
      <HoverCardContent align="start" side="bottom" className="w-panel-xs max-w-[calc(100vw-2rem)]">
        <ContactRosterPanel reply={roster} total={summary.total} onOpen={open} onRetry={() => setAttempt(value => value + 1)}/>
      </HoverCardContent>
    </HoverCard>
    {selected ? <ContactPreviewDrawer key={`${accountId}:${selected}`} accountId={accountId} contactId={selected} onClose={() => setSelected(null)}/> : null}
  </>;
}

function ContactRosterPanel({ reply, total, onOpen, onRetry }: Readonly<{ reply: RosterReply | null; total: number; onOpen: (id: string) => void; onRetry: () => void }>) {
  const { CONTACT_VIEW_TEXT: T, ACCOUNT_TEXT: A } = useMessages();
  return <div className="flex flex-col gap-sm text-body"><span className="text-muted-foreground">{A.contactsTitle} / {T.total(reply?.ok ? reply.data.contacts.length : total)}</span>
    {!reply ? <span role="status">{T.loading}</span> : null}
    {reply?.ok ? <div className="flex max-h-panel-xs flex-col gap-xs overflow-y-auto">{reply.data.contacts.length ? reply.data.contacts.map(c => <ContactRosterItem key={c.id} contact={c} onOpen={onOpen}/>) : <span>{T.none}</span>}</div> : null}
    {reply && !reply.ok ? <><span role="status" className="text-muted-foreground">{T.unavailable}</span><Button variant="secondary" size="sm" onClick={onRetry}>{T.retry}</Button></> : null}
  </div>;
}

function ContactRosterItem({ contact: c, onOpen }: Readonly<{ contact: ContactSummary; onOpen: (id: string) => void }>) {
  const { ACCOUNT_TEXT: A, CONTACT_VIEW_TEXT: T } = useMessages();
  return <Button variant="ghost" size="sm" className="h-auto min-w-0 justify-start py-sm" onClick={() => onOpen(c.id)}><span className="flex min-w-0 flex-col gap-xs text-left"><span className="flex min-w-0 items-center gap-sm"><MemberName name={c.name}/>{c.status !== "active" ? <span className="text-body-small text-muted-foreground">{A.contactStatusLabel[c.status] ?? T.unknownStatus}</span> : null}</span>{c.title || c.department ? <span className="line-clamp-1 text-body-small text-muted-foreground">{[c.department, c.title].filter(Boolean).join(" / ")}</span> : null}</span></Button>;
}

function ContactPreviewDrawer({ accountId, contactId, onClose }: Readonly<{ accountId: string; contactId: string; onClose: () => void }>) {
  const { CONTACT_VIEW_TEXT: T } = useMessages();
  const [reply, setReply] = useState<DetailReply | null>(null), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setReply(null);
    void loadContactView(accountId, contactId).then(result => { if (active) setReply(result); }).catch(() => { if (active) setReply({ ok: false }); });
    return () => { active = false; };
  }, [accountId, contactId, attempt]);
  return <Drawer open width={collectionDrawerWidth.standard} title={T.detail} closeLabel={T.close} onClose={onClose}>
    <div className="flex min-w-0 flex-col gap-lg">
      {!reply ? <p role="status" className="text-body text-muted-foreground">{T.loading}</p> : null}
      {reply?.ok ? <><ContactDetails accountId={accountId} {...reply.data}/><div className="flex justify-end"><ContactFullLink accountId={accountId} contactId={contactId}/></div></> : null}
      {reply && !reply.ok ? <><p role="status" className="text-body text-muted-foreground">{T.unavailable}</p><Button variant="secondary" onClick={() => setAttempt(value => value + 1)}><Icon name="refresh" size="sm"/>{T.retry}</Button></> : null}
    </div>
  </Drawer>;
}
