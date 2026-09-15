"use client";

import { Card, LabeledValue, Stack, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { GateActions, GatePrimary, GateSignOut } from "./gate-actions";
import { GateFrame } from "./gate-frame";

// A member who is signed in, in a workspace that has not subscribed.
//
// A DIFFERENT PAGE FROM THE FRONT DOOR, because the reader is different: they
// are past authentication and the product knows who they are. So it states the
// two facts nobody else can supply - who is signed in and which workspace is
// being refused, which is what an administrator needs in order to act, and what
// tells a member in the wrong workspace that they are - then the way to
// subscribe and the way out. The previous screen had a subscribe button and
// nothing else, so a member in the wrong workspace was stranded on it.
//
// WHAT IT NO LONGER SAYS (owner, 2026-09-15): a feature list under the title, a
// paragraph under the button explaining that subscribing needs administrator
// rights, and a three-item list of what a subscription opens. Somebody looking
// at a refusal can read a button.
//
// The gate itself is unchanged and stays in the layout: this component decides
// nothing, it only renders the refusal it is handed.

export function NoSubscription({
  subscribeHref,
  userName,
  workspaceLabel,
}: {
  /** Built by the layout from entitlement/deeplink - subscribe for a workspace
   *  that never subscribed, renew for one that lapsed. Never derived here. */
  readonly subscribeHref: string;
  readonly userName: string;
  readonly workspaceLabel: string;
}) {
  const { SHELL_TEXT, NO_SUBSCRIPTION_TEXT } = useMessages();

  return (
    <GateFrame ariaLabel={NO_SUBSCRIPTION_TEXT.ariaLabel} width="narrow">
      <Stack gap="lg" className="items-center text-center">
        <StatusBadge tone="info" icon="credit-card">
          {NO_SUBSCRIPTION_TEXT.badge}
        </StatusBadge>

        <h1 className="text-heading-2 text-balance">{SHELL_TEXT.noAccessTitle}</h1>

        <Card surface="soft" className="gap-md p-lg grid w-full grid-cols-2 text-left">
          <LabeledValue label={NO_SUBSCRIPTION_TEXT.identityLabel} value={userName} />
          <LabeledValue label={NO_SUBSCRIPTION_TEXT.workspaceLabel} value={workspaceLabel} />
        </Card>

        <GateActions
          primary={<GatePrimary href={subscribeHref}>{SHELL_TEXT.subscribeCta}</GatePrimary>}
          secondary={<GateSignOut>{NO_SUBSCRIPTION_TEXT.signOut}</GateSignOut>}
        />
      </Stack>
    </GateFrame>
  );
}
