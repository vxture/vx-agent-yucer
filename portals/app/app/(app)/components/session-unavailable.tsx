"use client";

import { Button } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { GateFrame } from "./gate-frame";
import { GateHeading } from "./gate-heading";
import styles from "./public-page.module.css";

export function SessionUnavailable({ retry }: { readonly retry: () => void }) {
  const { SHELL_TEXT } = useMessages();
  return (
    <GateFrame ariaLabel={SHELL_TEXT.sessionUnavailable}>
      <div className={styles.gateBody} role="alert">
        <GateHeading title={SHELL_TEXT.sessionUnavailable} description={SHELL_TEXT.sessionRetryDescription} />
        <Button onClick={retry}>{SHELL_TEXT.sessionRetry}</Button>
      </div>
    </GateFrame>
  );
}

export function SessionUnavailableReload() {
  return <SessionUnavailable retry={() => window.location.reload()} />;
}

export function SessionUpdating() {
  const { SHELL_TEXT } = useMessages();
  return <GateFrame ariaLabel={SHELL_TEXT.sessionUpdating}><GateHeading title={SHELL_TEXT.sessionUpdating} /></GateFrame>;
}
