"use client";

import { Button, Card, Icon, LabeledValue, Separator, Stack, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { GateFrame } from "./gate-frame";

// A member who is signed in, in a workspace that has not subscribed.
//
// A DIFFERENT PAGE FROM THE FRONT DOOR, because the reader is different. They
// are past authentication, the product knows their name and their workspace,
// and the single thing the page asks of them may be something they are not
// allowed to do: subscribing happens in the console and needs an administrator.
//
// So this page states three things the previous EmptyState did not:
//
//   1. WHO is signed in and WHERE. "This workspace" is meaningless to somebody
//      who belongs to several; the one fact that lets an administrator act is
//      which workspace is being refused.
//   2. WHERE the purchase happens, and that it needs administrator rights -
//      before the round trip rather than after it.
//   3. A WAY OUT. The previous screen had a subscribe button and nothing else,
//      so a member in the wrong workspace was stranded on it with no sign-out.
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
  const { SHELL_TEXT, NO_SUBSCRIPTION_TEXT, SIGNIN_TEXT } = useMessages();

  return (
    <GateFrame ariaLabel={NO_SUBSCRIPTION_TEXT.ariaLabel} width="narrow">
      <Stack gap="lg" className="items-center text-center">
        <StatusBadge tone="info" icon="credit-card">
          {NO_SUBSCRIPTION_TEXT.badge}
        </StatusBadge>

        <h1 className="text-heading-2 text-balance">{SHELL_TEXT.noAccessTitle}</h1>

        <p className="text-body-md text-muted-foreground">
          {SHELL_TEXT.noAccessDescription}
        </p>

        {/* ONE BLOCK, left-aligned, rather than three centred paragraphs. The
            facts and the offer belong to each other: who is being refused,
            where, and what the purchase would open. Ragged centring made the
            same content read as an unrelated list. */}
        <Card surface="soft" className="gap-md p-lg flex w-full flex-col text-left">
          {/* WHO AND WHERE. An administrator cannot fix a subscription without
              knowing which workspace is being refused, and a member who is
              simply in the wrong one finds that out here rather than in the
              console. */}
          <div className="gap-md grid grid-cols-2">
            <LabeledValue label={NO_SUBSCRIPTION_TEXT.identityLabel} value={userName} />
            <LabeledValue label={NO_SUBSCRIPTION_TEXT.workspaceLabel} value={workspaceLabel} />
          </div>

          <Separator />

          {/* What a subscription opens, in the product's own three claims - the
              same copy the front door carries, because the reader deciding
              whether to buy should not be shown a second, different pitch. */}
          <div className="gap-sm flex flex-col">
            <span className="text-overline text-muted-foreground">
              {NO_SUBSCRIPTION_TEXT.unlockTitle}
            </span>
            <ul className="gap-xs flex flex-col">
              {SIGNIN_TEXT.pillars.map((pillar) => (
                <li key={pillar.title} className="gap-sm text-body-sm flex items-center">
                  <Icon name="check" size={14} aria-hidden className="text-success shrink-0" />
                  {pillar.title}
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Stack gap="sm" className="w-full items-center">
          <Button asChild size="xl" className="w-full">
            <a href={subscribeHref}>{SHELL_TEXT.subscribeCta}</a>
          </Button>
          <p className="text-body-sm text-muted-foreground">
            {NO_SUBSCRIPTION_TEXT.adminNote}
          </p>
        </Stack>

        {/* THE WAY OUT. A real form rather than a scripted click, so it works
            on a page whose whole content is one refusal - see the shell's user
            menu for the same POST. */}
        <form method="post" action="/auth/logout">
          <Button type="submit" variant="ghost" size="sm">
            {NO_SUBSCRIPTION_TEXT.signOut}
          </Button>
        </form>
      </Stack>
    </GateFrame>
  );
}
