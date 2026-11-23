"use client";

import { useRef, useState } from "react";
import { Button, Icon, Spinner } from "@vxture/design-ui";
import type { ProductEntryState } from "../../auth/product-access";
import { useMessages } from "../lib/i18n/provider";
import { GateFrame } from "./gate-frame";
import { EntryIllustration } from "./entry-illustration";
import styles from "./public-page.module.css";

export type EntryPanelState = Exclude<ProductEntryState, "ready"> | "signin" | "restoring" | "checking" | "recovery" | "signed-out" | "expired" | "connecting" | "unavailableConnection";
export interface EntryPerson { name: string; org: string | null }
interface EntryProps {
  readonly state: EntryPanelState;
  readonly person?: EntryPerson;
  readonly retry?: () => void | Promise<void>;
  readonly loginHref?: string;
  readonly accountHref?: string | null;
  readonly purchaseHref?: string | null;
  readonly preserveWork?: boolean;
}
const FOOTNOTES: Partial<Record<EntryPanelState, "roleFootnote" | "assignmentFootnote" | "subscriptionFootnote" | "expiredFootnote">> = {
  "no-roles": "roleFootnote", unassigned: "assignmentFootnote", "no-subscription": "subscriptionFootnote", expired: "expiredFootnote",
};

/** Presentation only. Purchase links are supplied only by verified authority. */
export function EntryPanel(props: EntryProps) {
  const { state, person, retry, preserveWork = false } = props;
  const { ENTRY_TEXT: t, SIGNIN_TEXT: signin } = useMessages();
  const lock = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState(false);
  const pending = ["restoring", "checking", "connecting"].includes(state);
  const footnoteKey = FOOTNOTES[state];
  let footnote = signin.security;
  if (footnoteKey) footnote = t[footnoteKey];
  if (preserveWork) footnote = t.recoveryFootnote;
  const check = async () => {
    if (lock.current || !retry) return;
    lock.current = true; setRetrying(true); setError(false);
    try { await retry(); } catch { setError(true); }
    finally { lock.current = false; setRetrying(false); }
  };
  return <GateFrame ariaLabel={t[state]}>
    <div className={styles.entryStatus} aria-busy={pending || retrying}>
      <header className={styles.stateHeading}><p className={styles.welcome}>{signin.welcome}</p><h1>{t[state]}</h1></header>
      <div className={styles.entryArt}><EntryIllustration state={state} /></div>
      <div className={styles.entryCore}><div className={styles.entryOperations}>
        <EntryIdentity person={person} />
        <div className={styles.gateActions}><EntryOperations {...props} pending={pending} retrying={retrying} check={retry ? check : undefined} /></div>
      </div></div>
      <footer className={styles.security} role={error ? "alert" : undefined}>{error ? t.retryFailed : footnote}</footer>
    </div>
  </GateFrame>;
}

function EntryIdentity({ person }: { readonly person?: EntryPerson }) {
  const { ENTRY_TEXT: t, SIGNIN_TEXT: signin } = useMessages();
  if (!person) return <div className={styles.account}><Icon name="user" size={24} /><div><strong>{signin.accountTitle}</strong><p>{signin.accountDescription}</p></div></div>;
  const org = person.org ?? t.unknownOrg;
  return <div className={styles.account} aria-label={t.identity}><Icon name="user" size={24} /><div className={styles.identityCopy}><strong title={person.name}>{person.name}</strong><p title={org}>{org}</p></div></div>;
}

function EntryLogin({ href, resume, signin = false }: { readonly href?: string; readonly resume?: boolean; readonly signin?: boolean }) {
  const { ENTRY_TEXT: t, SIGNIN_TEXT: login } = useMessages();
  if (!href) return null;
  return <Button asChild data-control-size="preserve" className={styles.gateButton} variant={resume ? "outline" : "default"}>
    <a href={href} target={resume ? "_blank" : undefined} rel={resume ? "noopener noreferrer" : undefined}>{signin ? login.continueLabel : t.login}{signin && <Icon name="arrow-right" size={16} />}</a>
  </Button>;
}

function EntryOperations({ state, pending, retrying, check, loginHref, accountHref, purchaseHref, preserveWork }: EntryProps & {
  readonly pending: boolean; readonly retrying: boolean; readonly check?: () => Promise<void>;
}) {
  const { ENTRY_TEXT: t } = useMessages();
  if (pending) return <Button disabled data-control-size="preserve" className={styles.gateButton}><Spinner size="sm" />{t[state]}</Button>;
  const commerce = (state === "no-subscription" || state === "expired") && purchaseHref;
  return <>
    {commerce && <Button asChild data-control-size="preserve" className={styles.gateButton}><a href={commerce} target="_blank" rel="noopener noreferrer">{state === "expired" ? t.renew : t.subscribe}</a></Button>}
    {!preserveWork && <EntryLogin href={loginHref} signin={state === "signin"} />}
    {check && <Button onClick={() => void check()} disabled={retrying} aria-busy={retrying} data-control-size="preserve" className={styles.gateButton} variant={commerce ? "outline" : "default"}>{retrying ? t.checkingLabel : t.recheck}</Button>}
    {preserveWork && <EntryLogin href={loginHref} resume />}
    {state === "signed-out" && accountHref && <Button asChild variant="outline" data-control-size="preserve" className={styles.gateButton}><a href={accountHref} target="_blank" rel="noopener noreferrer">{t.account}</a></Button>}
  </>;
}

export function ProductAccessGate({ state, person, expired = false }: { readonly state: ProductEntryState; readonly person?: EntryPerson; readonly expired?: boolean }) {
  if (state === "ready") return null;
  return <EntryPanel state={state === "no-subscription" && expired ? "expired" : state} person={person} retry={() => window.location.reload()} />;
}
