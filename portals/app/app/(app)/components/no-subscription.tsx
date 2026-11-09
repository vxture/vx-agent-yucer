"use client";


import { useMessages } from "../lib/i18n/provider";
import { GateActions, GatePrimary, GateSignOut } from "./gate-actions";
import { GateFrame } from "./gate-frame";
import styles from "./public-page.module.css";
import { GateHeading } from "./gate-heading";
import { GateIdentity } from "./gate-identity";

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
// THE TITLE NAMES THE WORKSPACE, NOT THE PRODUCT (owner, 2026-09-15). It read
// "this workspace has no yucer subscription"; the reader did not choose the
// product code and may not recognise it, and the sentence is about the
// workspace either way.
//
// The gate itself is unchanged and stays in the layout: this component decides
// nothing, it only renders the refusal it is handed.

export function NoSubscription({
  subscribeHref,
  userName,
  userPhone,
  userPicture,
  orgLabel,
  workspaceLabel,
}: {
  /** Built by the layout from entitlement/deeplink - the website's pricing
   *  page, product only. Never derived here. */
  readonly subscribeHref: string;
  readonly userName: string;
  readonly userPhone: string | null;
  readonly userPicture: string | null;
  readonly orgLabel: string | null;
  readonly workspaceLabel: string;
}) {
  const { SHELL_TEXT, NO_SUBSCRIPTION_TEXT, HEADER_TEXT } = useMessages();

  return (
    <GateFrame ariaLabel={NO_SUBSCRIPTION_TEXT.ariaLabel} width="narrow">
      <div className={styles.gateBody}>
        <GateHeading
          badge={NO_SUBSCRIPTION_TEXT.badge}
          badgeIcon="credit-card"
          title={SHELL_TEXT.noAccessTitle}
          description={NO_SUBSCRIPTION_TEXT.description}
        />

        <GateIdentity
          personLabel={NO_SUBSCRIPTION_TEXT.identityLabel}
          tenantLabel={NO_SUBSCRIPTION_TEXT.workspaceLabel}
          name={userName} phone={userPhone} picture={userPicture}
          orgLabel={orgLabel} orgFallback={HEADER_TEXT.tenantUnknown}
          workspaceLabel={workspaceLabel}
        />

        <GateActions
          primary={<GatePrimary href={subscribeHref}>{SHELL_TEXT.subscribeCta}</GatePrimary>}
          secondary={<GateSignOut>{NO_SUBSCRIPTION_TEXT.signOut}</GateSignOut>}
        />
      </div>
    </GateFrame>
  );
}
