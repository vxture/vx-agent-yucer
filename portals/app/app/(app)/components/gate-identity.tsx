"use client";

import { Card } from "@vxture/design-ui";
import { PersonSummary, TenantSummary } from "./identity-summary";
import styles from "./public-page.module.css";

/** Shared identity presentation for both subscription and role gates. */
export function GateIdentity({ personLabel, tenantLabel, name, phone, picture, orgLabel, orgFallback, workspaceLabel }: {
  readonly personLabel: string;
  readonly tenantLabel: string;
  readonly name: string;
  readonly phone: string | null;
  readonly picture: string | null;
  readonly orgLabel: string | null;
  readonly orgFallback: string;
  readonly workspaceLabel: string;
}) {
  return (
    <Card className={styles.identityCard}>
      <PersonSummary label={personLabel} name={name} phone={phone} picture={picture} />
      <TenantSummary label={tenantLabel} orgLabel={orgLabel} orgFallback={orgFallback} workspaceLabel={workspaceLabel} />
    </Card>
  );
}
