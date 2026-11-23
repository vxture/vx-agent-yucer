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

/** Presentation only. Purchase links are supplied only by verified authority. */
export function EntryPanel({ state, person, retry, loginHref, accountHref, purchaseHref, preserveWork = false }: {
  readonly state: EntryPanelState;
  readonly person?: EntryPerson;
  readonly retry?: () => void | Promise<void>;
  readonly loginHref?: string;
  readonly accountHref?: string | null;
  readonly purchaseHref?: string | null;
  readonly preserveWork?: boolean;
}) {
  const { ENTRY_TEXT: t, SIGNIN_TEXT: signin } = useMessages();
  const lock = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState(false);
  const pending = ["restoring", "checking", "connecting"].includes(state);
  const commerce = (state === "no-subscription" || state === "expired") ? purchaseHref : null;
  const footnote = preserveWork ? t.recoveryFootnote : state === "no-roles" ? t.roleFootnote : state === "unassigned" ? t.assignmentFootnote : state === "no-subscription" ? t.subscriptionFootnote : state === "expired" ? t.expiredFootnote : signin.security;
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
      <div className={styles.entryCore}>
        <div className={styles.entryOperations}>
          {person ? <div className={styles.account} aria-label={t.identity}>
            <Icon name="user" size={24} /><div className={styles.identityCopy}><strong title={person.name}>{person.name}</strong><p title={person.org ?? t.unknownOrg}>{person.org ?? t.unknownOrg}</p></div>
          </div> : <div className={styles.account}><Icon name="user" size={24} /><div><strong>{signin.accountTitle}</strong><p>{signin.accountDescription}</p></div></div>}
          <div className={styles.gateActions}>
            {pending ? <Button disabled data-control-size="preserve" className={styles.gateButton}><Spinner size="sm" />{t[state]}</Button> : <>
              {commerce && <Button asChild data-control-size="preserve" className={styles.gateButton}><a href={commerce} target="_blank" rel="noopener noreferrer">{state === "expired" ? t.renew : t.subscribe}</a></Button>}
              {!preserveWork && loginHref && <Button asChild data-control-size="preserve" className={styles.gateButton} variant={preserveWork ? "outline" : "default"}><a href={loginHref} target={preserveWork ? "_blank" : undefined} rel={preserveWork ? "noopener noreferrer" : undefined}>{state === "signin" ? signin.continueLabel : t.login}{state === "signin" && <Icon name="arrow-right" size={16} />}</a></Button>}
              {retry && <Button onClick={() => void check()} disabled={retrying} aria-busy={retrying} data-control-size="preserve" className={styles.gateButton} variant={commerce ? "outline" : "default"}>{retrying ? t.checkingLabel : t.recheck}</Button>}
              {preserveWork && loginHref && <Button asChild variant="outline" data-control-size="preserve" className={styles.gateButton}><a href={loginHref} target="_blank" rel="noopener noreferrer">{t.login}</a></Button>}
              {state === "signed-out" && accountHref && <Button asChild variant="outline" data-control-size="preserve" className={styles.gateButton}><a href={accountHref} target="_blank" rel="noopener noreferrer">{t.account}</a></Button>}
            </>}
          </div>
        </div>
      </div>
      <footer className={styles.security} role={error ? "alert" : undefined}>{error ? t.retryFailed : footnote}</footer>
    </div>
  </GateFrame>;
}

export function ProductAccessGate({ state, person, expired = false }: { readonly state: ProductEntryState; readonly person?: EntryPerson; readonly expired?: boolean }) {
  if (state === "ready") return null;
  return <EntryPanel state={state === "no-subscription" && expired ? "expired" : state} person={person} retry={() => window.location.reload()} />;
}
