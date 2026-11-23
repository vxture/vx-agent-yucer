"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { NativeSelect } from "@vxture/design-ui";
import { DEFAULT_LOCALE, LOCALE_CONSTANTS, SUPPORTED_LOCALES, type Locale } from "@vxture/shared";
import { MessagesProvider, useMessages } from "../../(app)/lib/i18n/provider";
import { EntryPanel, type EntryPanelState } from "../../(app)/components/entry-panel";

// Display fixtures only: no credentials, authority requests or account writes.
export const dynamic = "force-static";
const SCREENS: readonly EntryPanelState[] = ["signin", "connecting", "restoring", "checking", "no-subscription", "expired", "unassigned", "no-roles", "unavailable", "recovery", "unavailableConnection", "signed-out"];
function Preview() {
  const [state, setState] = useState<EntryPanelState>("signin");
  const { ENTRY_TEXT: t, GATE_PREVIEW_TEXT: fixture } = useMessages();
  const preventAccountActions = (event: MouseEvent) => {
    const anchor = (event.target as Element).closest("a");
    if (anchor && (/\/auth\/login/.test(anchor.getAttribute("href") ?? "") || anchor.host === "accounts.vxture.com")) event.preventDefault();
  };
  return <div onClickCapture={preventAccountActions}>
    <div className="fixed bottom-4 left-1/2 z-50 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border bg-card p-2 shadow-sm">
      <NativeSelect aria-label={fixture.ariaLabel} value={state} onChange={event => setState(event.target.value as EntryPanelState)}>
        {SCREENS.map(value => <option key={value} value={value}>{t[value]}</option>)}
      </NativeSelect>
      <p className="mt-1 text-center text-caption text-muted-foreground">{t.previewNote}</p>
    </div>
    <EntryPanel key={state} state={state}
      person={state === "signin" || state === "signed-out" || state === "connecting" ? undefined : { name: fixture.sampleUser, org: fixture.sampleOrg }}
      loginHref={state === "signin" || state === "signed-out" || state === "recovery" ? "/auth/login" : undefined}
      accountHref="https://accounts.vxture.com/account" preserveWork={state === "recovery"}
      retry={!["signin", "signed-out", "connecting", "restoring", "checking"].includes(state) ? async () => {} : undefined} />
  </div>;
}
export default function GateScreensPreview() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => {
    const found = document.cookie.split("; ").find(c => c.startsWith(`${LOCALE_CONSTANTS.COOKIE_KEY}=`))?.slice(LOCALE_CONSTANTS.COOKIE_KEY.length + 1);
    if (found && (SUPPORTED_LOCALES as readonly string[]).includes(found)) setLocale(found as Locale);
  }, []);
  return <MessagesProvider locale={locale}><Preview /></MessagesProvider>;
}
