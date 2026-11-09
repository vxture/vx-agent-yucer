"use client";

import { Button, Icon } from "@vxture/design-ui";
import { ShellHeaderTools } from "@vxture/design-system";
import { BRAND_MARK_SRC, PRODUCT_MARK_SRC } from "../lib/brand-assets";
import { useMessages } from "../lib/i18n/provider";
import { useHeaderToolConfig } from "../lib/header-tool-config";
import { TOOLBOX_ON_LADDER } from "./header-ladder";
import styles from "./login-home.module.css";
import { GateAmbience } from "./gate-ambience";

/** Ruyin family public entry; authentication stays in the shared login route. */
export function LoginHome({ href, resume }: { readonly href: string; readonly resume: boolean }) {
  const { SIGNIN_TEXT: t, SHELL_TEXT, HEADER_TEXT } = useMessages();
  const tools = useHeaderToolConfig();
  return (
    <div id="login-home" className={styles.root}>
      <div className={styles.backdrop} aria-hidden="true"><GateAmbience /></div>
      <header className={styles.header}>
        <div className={styles.chrome}>
          <a href="/" className={styles.brand} aria-label={`Ruyin ${SHELL_TEXT.brandMark}`}>
            <span className={styles.brandPart}><img src={BRAND_MARK_SRC} width={24} height={24} alt="" /><span className={styles.wordmark}>Ruyin</span></span>
            <span className={styles.divider} aria-hidden="true" />
            <span className={styles.brandPart}><img src={PRODUCT_MARK_SRC} width={28} height={28} alt="" /><span>{SHELL_TEXT.brandMark}</span></span>
          </a>
          <div className={styles.tools}>
            <ShellHeaderTools className={TOOLBOX_ON_LADDER} label={HEADER_TEXT.prefTitle} theme={tools.theme} locale={tools.locale} fullscreen={{ enterLabel: HEADER_TEXT.fullscreen, exitLabel: HEADER_TEXT.fullscreenExit, targetId: "login-home" }} />
            <Button asChild variant="ghost" size="icon-xl" className={styles.homeButton}>
              <a href="https://ruyin.work" aria-label={SHELL_TEXT.website}><Icon name="home" size={16} /></a>
            </Button>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.inner}>
          <p className={styles.eyebrow}>{t.eyebrow}</p>
          <section className={styles.card} aria-label={t.ariaLabel}>
            <div className={styles.heading}><p>{t.welcome}</p><h1>{t.productTitle}</h1></div>
            <div className={styles.actions}>
              <div className={styles.account}><Icon name="user" size={24} /><div><strong>{t.accountTitle}</strong><p>{t.accountDescription}</p></div></div>
              {resume ? <p role="status" className={styles.resuming}>{t.resuming}</p> : <Button asChild className={styles.cta}><a href={href}>{t.continueLabel}<Icon name="arrow-right" size={16} /></a></Button>}
            </div>
            <p className={styles.security}><Icon name="shield-check" size={16} />{t.security}</p>
          </section>
          <div className={styles.message}><p>{t.tagline}</p><p>{t.taglineEnglish}</p></div>
        </div>
      </main>
      <footer className={styles.footer}><div className={styles.chrome}>
        <p>{"\u00a9 2026 VXTURE \u00b7 RUYIN"}</p>
        <nav aria-label={t.terms}>{([ ["terms", t.terms], ["privacy", t.privacy], ["copyright", t.copyright] ] as const).map(([path, label]) => <a key={path} href={`https://vxture.com/zh-CN/legal/${path}`}>{label}</a>)}</nav>
      </div></footer>
    </div>
  );
}
