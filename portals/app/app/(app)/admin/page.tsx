import Link from "next/link";
import {
  EmptyState,
  Icon,
  PanelCard,
  Section,
  StatusBadge,
  ViewHeader,
  ViewLayout,
} from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { resolveNavigation, ADMIN_NAV_ENTRIES } from "../lib/navigation";
import { ADMIN_NAV_GROUPS } from "../lib/admin-nav";
import { getAuthzStore } from "../../authz/store";
import { listWorkspaceMembers } from "../../authz/admin";
import { CAPTURE_CRITERION } from "../../domains/account/lib/capture-metric";
import { PERM_CODES, ROLE_CODES } from "../../authz/catalog";
import { frameMembers, listMarketDivisions, marketScope } from "../../domains/account/service";

import { getMessages } from "../lib/i18n/server";
import { frameNoun } from "../lib/frame-copy";
import { Tag } from "../components/tag";
// Administration, as its own domain rather than a sidebar group.
//
// It is neither work nor data: it is setup, visited rarely and usually for one
// specific reason. A permanent group in the sidebar spent height on something
// nobody opens on a Monday, so it moved behind a single header icon and this
// page is what that icon opens.
//
// Entries are filtered by the SAME resolveNavigation the shell uses, so a
// member who cannot administer sees an empty page rather than a set of links
// that will refuse them. Showing a door you cannot open is not access control
// and it is not honesty either.

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const { ADMIN_TEXT, DOMAIN_LABEL, PLANNING_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const nav = resolveNavigation(session.authz, session.entitlement);
  const keys = new Set(ADMIN_NAV_ENTRIES.map((e) => e.key));
  const entries = nav.filter((e) => keys.has(e.key) && e.state === "visible");
  /* The unbuilt half of the map, from the same registry the menu reads. It is
     drawn only when the reader can see the plane at all - a card saying "not
     built yet" is still a statement about a workspace they may not administer. */
  const planned = entries.length === 0
    ? []
    : ADMIN_NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.href === null);

  // A LIVE FACT PER CARD, because the cards used to print their own href as
  // body text - a URL is neither something a reader wants nor something they
  // can act on. The member count is one gated call; adoption's number would
  // cost a whole pipeline scan for a landing card, so that card states the
  // CRITERION instead. Telling someone what a page measures by is honest and
  // cheap; making them wait for a number they came here to go and read is not.
  const members = await listWorkspaceMembers({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getAuthzStore(),
  });
  /* Read through the same gated service the page itself uses. A failed read is
     not an error here - the card simply states what it measures instead. */
  const accountCtx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
  };
  const [divisions, ground, scope] = await Promise.all([
    listMarketDivisions(accountCtx),
    frameMembers(accountCtx),
    marketScope(accountCtx),
  ]);
  // Counted against the FRAME's ground - 34 provinces, or 陕西's ten cities -
  // in the frame's own noun (incr/0045).
  const divisionFact = !divisions.ok || !ground.ok
    ? ADMIN_TEXT.divisionNoRead
    : ADMIN_TEXT.divisionCount(
        divisions.value.length,
        new Set(divisions.value.flatMap((d) => d.members.map((m) => m.key))).size,
        ground.value.length,
        frameNoun(scope.ok ? scope.value : { kind: "china", code: null }, PLANNING_TEXT),
      );

  const memberFact = !members.ok
    ? ADMIN_TEXT.memberNoRead
    : members.value.length === 0
      ? ADMIN_TEXT.memberNone
      : ADMIN_TEXT.memberCount(
          members.value.length,
          new Set(members.value.flatMap((m) => m.roles ?? [])).size,
        );
  const adoptionFact = ADMIN_TEXT.adoptionCriterion(
    CAPTURE_CRITERION.windowWeeks,
    CAPTURE_CRITERION.judgeWeeks,
  );
  /* A LOOKUP, NOT A TERNARY. It read `e.key === "admin" ? memberFact :
     adoptionFact`, which silently gave every future card the adoption
     sentence - and the plane went from three cards to seven the next day.
     A card with no live fact says nothing rather than borrowing another
     card's sentence; its description already says what it is for. */
  const FACTS: Record<string, string> = {
    members: memberFact,
    adoption: adoptionFact,
    division: divisionFact,
    roles: ADMIN_TEXT.rolesFact(ROLE_CODES.length, PERM_CODES.length),
  };

  return (
    <ViewLayout>
      {/* NOT ModuleHeadline, and the attempt is worth recording. This page is
          not a domain MODULE - `admin` lives in ADMIN_NAV_ENTRIES rather than
          the module tables, so moduleIcon() cannot resolve an icon for it and
          throws. That is the registry being right: 成员与角色 is workspace
          settings, not a link in the sales chain, and giving it a module
          header would put it in a set it does not belong to.

          The member count still moved into the title row, because a count is
          not a title wherever it appears. */}
      {/* TITLED 管理, not 成员与角色 (2026-09-08). This page held one card for
          most of its life and wore that card's name; with 市场划分 beside
          members and adoption, the old title said the hub was one of the three
          things it lists. The members PAGE still carries that name - it is
          the one place it belongs. */}
      <ViewHeader
        icon="settings"
        title={ADMIN_TEXT.title}
        description={ADMIN_TEXT.description}
        secondary={
          members.ok ? (
            <StatusBadge tone="success">{ADMIN_TEXT.tagMembers(members.value.length)}</StatusBadge>
          ) : undefined
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          title={ADMIN_TEXT.emptyTitle}
          description={ADMIN_TEXT.emptyDescription}
        />
      ) : (
        <Section>
          {/* gap-md, not gap-3. It was the ONLY naked numeric spacing utility
              left in the app - everything else is on the DS scale - and a lone
              12px that does not come from a token is exactly the kind of drift
              that is invisible until six of them disagree. */}
          {/* THREE ACROSS at width, not two. The plane lists seven items now;
              a two-column grid turned that into four rows of cards and a page
              that scrolls to answer "what is in here". */}
          <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3">
            {entries.map((e) => (
              <Link key={e.key} href={e.href} className="no-underline">
                <PanelCard
                  icon={e.icon}
                  title={DOMAIN_LABEL[e.key] ?? e.key}
                  description={ADMIN_TEXT.entryHint[e.key] ?? ""}
                >
                  <span className="flex items-center justify-between gap-md">
                    <span className="text-muted-foreground text-body-sm">
                      {FACTS[e.key] ?? ""}
                    </span>
                    <Icon name="arrow-right" size="xs" />
                  </span>
                </PanelCard>
              </Link>
            ))}
            {/* 未建的条目，灰显. THE MAP IS MORE USEFUL COMPLETE - the launcher's
                own ruling (functional-domains.ts): a greyed row answers "does
                this product do that" with "yes, not yet", and an absent row
                answers it with "no". They are NOT in the sidebar: a DS nav item
                is a destination, and a disabled row is not one. */}
            {planned.map((item) => (
              <PanelCard
                key={item.key}
                icon={item.icon}
                title={DOMAIN_LABEL[item.key] ?? item.key}
                description={ADMIN_TEXT.entryHint[item.key] ?? ""}
              >
                <Tag>{ADMIN_TEXT.planned}</Tag>
              </PanelCard>
            ))}
          </div>
        </Section>
      )}
    </ViewLayout>
  );
}
