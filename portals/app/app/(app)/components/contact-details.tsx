"use client";
import Link from "next/link";
import { Button, Card, CardContent, Icon, type IconName } from "@vxture/design-ui";
import type { ContactView } from "../../domains/account/contact-read";
import { useMessages } from "../lib/i18n/provider";
import { MemberName } from "../lib/member-names";
import { Tag } from "./tag";

export function contactHref(accountId: string, contactId: string) {
  return `/contact/${encodeURIComponent(contactId)}?account=${encodeURIComponent(accountId)}`;
}

/** Read-only data shared by the contextual drawer and full detail page. */
export function ContactDetails({ accountId, accountName, contact: c }: Readonly<{ accountId: string; accountName: string; contact: ContactView }>) {
  const { ACCOUNT_TEXT: A, CONTACT_VIEW_TEXT: T } = useMessages();
  const items: { label: string; icon: IconName; content: string | null }[] = [
    { label: A.contactDepartment, icon: "building", content: c.department },
    { label: A.contactTitle, icon: "user", content: c.title },
    { label: A.contactMobile, icon: "phone", content: c.mobile },
    { label: A.contactEmail, icon: "mail", content: c.email },
    { label: A.contactWechat, icon: "wechat", content: c.wechat },
  ];
  return <Card><CardContent className="flex min-w-0 flex-col gap-lg">
    <div className="flex flex-wrap items-center gap-sm text-body"><MemberName name={c.name}/><Tag>{A.contactStatusLabel[c.status] ?? T.unknownStatus}</Tag></div>
    <dl className="flex flex-col gap-md text-body"><div className="flex items-start gap-sm"><dt className="inline-flex shrink-0 items-center gap-xs text-muted-foreground"><Icon name="building" size="sm"/>{T.account}:</dt><dd className="min-w-0 break-words"><Link href={`/account/${encodeURIComponent(accountId)}`} className="hover:text-primary-text">{accountName}</Link></dd></div>
      {items.map(item => <div key={item.label} className="flex items-start gap-sm"><dt className="inline-flex shrink-0 items-center gap-xs text-muted-foreground"><Icon name={item.icon} size="sm"/>{item.label}:</dt><dd className="min-w-0 break-words">{item.content || <span className="text-muted-foreground">{T.notRecorded}</span>}</dd></div>)}
    </dl>
  </CardContent></Card>;
}

export function ContactFullLink({ accountId, contactId }: Readonly<{ accountId: string; contactId: string }>) {
  const { CONTACT_VIEW_TEXT: T } = useMessages();
  return <Button data-control-kind="drawer-action" size="xl" asChild variant="secondary"><Link href={contactHref(accountId, contactId)} target="_blank" rel="noopener noreferrer">{T.fullDetail}<Icon name="external-link" size="sm"/></Link></Button>;
}
