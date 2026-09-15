"use client";

import { Button, Card, Icon, LabeledValue, Separator, Stack, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { GateFrame } from "./gate-frame";

// A member with no role, in a workspace that HAS subscribed.
//
// THE ONE GATE SCREEN ITS READER CANNOT ACT ON. The other three all end in
// something the reader does: sign in, subscribe, sign in again. Here the fix
// belongs to somebody else, and the only useful thing the page can do is make
// it easy for that somebody to act:
//
//   1. NAME THEM BY POSITION, not as "an administrator". Opening the
//      subscription makes you this product's super administrator - the
//      platform's workspace:owner claim is the first-login super-admin
//      (auth/lib/claims.ts), and the bootstrap in authz/context.ts grants them
//      the role that carries all 25 permissions. So there is always exactly
//      one person this screen is talking about, and the reader can go and find
//      them.
//   2. SHOW THE IDENTITY THAT ADMINISTRATOR HAS TO SEARCH FOR. They will be
//      looking at a member roster; the reader is a name on it.
//   3. SAY THE OTHER THING THAT PRODUCES THIS SCREEN. Being in the wrong
//      workspace looks identical from here, and the workspace name is on the
//      page, so the reader can rule it out in one glance.
//
// A subscribe button would be wrong here and used to be nearly written: a
// workspace that has already paid cannot fix a missing role by paying again.
// That distinction is why the layout separates no_roles from no_entitlement at
// all - see lockoutReason().

export function NoRoles({
  userName,
  workspaceLabel,
}: {
  readonly userName: string;
  readonly workspaceLabel: string;
}) {
  const { SHELL_TEXT, NO_ROLES_TEXT } = useMessages();

  return (
    <GateFrame ariaLabel={NO_ROLES_TEXT.ariaLabel} width="narrow">
      <Stack gap="lg" className="items-center text-center">
        {/* A queued state, not a fault: circle-dashed is the dictionary's own
            pending mark, and the reader did nothing wrong. */}
        <StatusBadge tone="info" icon="circle-dashed">
          {NO_ROLES_TEXT.badge}
        </StatusBadge>

        <h1 className="text-heading-2 text-balance">{SHELL_TEXT.noRolesTitle}</h1>

        <p className="text-body-md text-muted-foreground">
          {SHELL_TEXT.noRolesDescription}
        </p>

        <Card surface="soft" className="gap-md p-lg flex w-full flex-col text-left">
          <div className="gap-md grid grid-cols-2">
            <LabeledValue label={NO_ROLES_TEXT.identityLabel} value={userName} />
            <LabeledValue label={NO_ROLES_TEXT.workspaceLabel} value={workspaceLabel} />
          </div>

          <Separator />

          <div className="gap-xs flex flex-col">
            <span className="text-overline text-muted-foreground">
              {NO_ROLES_TEXT.whoLabel}
            </span>
            <p className="text-body-sm">{NO_ROLES_TEXT.whoBody}</p>
          </div>
        </Card>

        <Stack gap="sm" className="w-full items-center">
          {/* A plain reload. The role arrives from somewhere else entirely - an
              administrator in another session - so there is nothing to poll
              and nothing this page could subscribe to; asking again is the
              whole mechanism, and the authz cache is 45s. */}
          <Button asChild size="xl" className="w-full">
            <a href="/">{NO_ROLES_TEXT.recheck}</a>
          </Button>
          <p className="text-body-sm text-muted-foreground">
            {NO_ROLES_TEXT.wrongWorkspaceHint}
          </p>
        </Stack>

        {/* The same real form the other gate screens use, so it works on a page
            whose whole content is one refusal. */}
        <form method="post" action="/auth/logout">
          <Button type="submit" variant="ghost" size="sm">
            <Icon name="sign-out" size={14} aria-hidden />
            {NO_ROLES_TEXT.signOut}
          </Button>
        </form>
      </Stack>
    </GateFrame>
  );
}
