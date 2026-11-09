"use client";

import { Button, Icon } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { PublicPageFrame } from "./public-page-frame";
import styles from "./public-page.module.css";

/** Authentication stays in the shared login route. */
export function LoginHome({ href, resume }: { readonly href: string; readonly resume: boolean }) {
  const { SIGNIN_TEXT: t } = useMessages();
  return (
    <PublicPageFrame>
      <section className={styles.card} aria-label={t.ariaLabel}>
        <div className={styles.heading}><p>{t.welcome}</p><h1>{t.productTitle}</h1></div>
        <div className={styles.actions}>
          <div className={styles.account}><Icon name="user" size={24} /><div><strong>{t.accountTitle}</strong><p>{t.accountDescription}</p></div></div>
          {resume ? <p role="status" className={styles.resuming}>{t.resuming}</p> : <Button asChild className={styles.cta}><a href={href}>{t.continueLabel}<Icon name="arrow-right" size={16} /></a></Button>}
        </div>
        <p className={styles.security}><Icon name="shield-check" size={16} />{t.security}</p>
      </section>
    </PublicPageFrame>
  );
}
