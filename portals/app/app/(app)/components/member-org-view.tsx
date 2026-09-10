"use client";

import { PanelCard } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import type { OrgView, OrgViewNode, OrgViewPerson } from "../lib/member-org-view";
import { Tag } from "./tag";

/* 组织视图 (owner, 2026-09-10): the organisation's shape with the people in
 * it, NAMES ONLY - no codes, kinds, leaders or scopes; those are the roster's
 * and the org page's. The layout follows the tree: the root spans the width,
 * its units sit side by side, and everything under them stacks inside its
 * parent's card. A person opens the same 成员详情 drawer the roster opens.
 *
 * TYPE PER THE DS SCALE: a unit's name is the card's title (the DS sets it),
 * a person's name is body-md - the control default, 14px - never body-sm,
 * which is the table's secondary line and reads as fine print here (owner:
 * 文字大小要符合规范；当前组织视图和权限视图文字小了).
 */

export function MemberOrgView({ view, onOpen }: {
  readonly view: OrgView;
  readonly onOpen: (sub: string) => void;
}) {
  const { MEMBER_TEXT } = useMessages();
  return (
    <div className="gap-md flex flex-col">
      {view.roots.map((node) => (
        <UnitCard key={node.id} node={node} depth={0} onOpen={onOpen} />
      ))}
      {view.unplaced.length > 0 ? (
        <PanelCard tone="neutral" title={MEMBER_TEXT.orgUnplaced} titleSuffix={<Tag>{MEMBER_TEXT.orgHeadcount(view.unplaced.length)}</Tag>} description={MEMBER_TEXT.orgUnplacedWhy}>
          <People people={view.unplaced} onOpen={onOpen} />
        </PanelCard>
      ) : null}
    </div>
  );
}

function UnitCard({ node, depth, onOpen }: {
  readonly node: OrgViewNode;
  readonly depth: number;
  readonly onOpen: (sub: string) => void;
}) {
  const { MEMBER_TEXT } = useMessages();
  return (
    <PanelCard tone="neutral" title={node.name} titleSuffix={<Tag>{MEMBER_TEXT.orgHeadcount(node.people.length)}</Tag>}>
      <div className="gap-md flex flex-col">
        {node.people.length === 0 ? (
          <p className="text-muted-foreground text-body-md">{MEMBER_TEXT.orgNoMembers}</p>
        ) : (
          <People people={node.people} onOpen={onOpen} />
        )}
        {node.children.length > 0 ? (
          /* The first level under the root reads side by side - that is the
             organisation chart's shape; deeper levels stack, since a card
             narrower than a third of the page cannot split again. */
          <div className={depth === 0 ? "gap-sm md:grid-cols-2 xl:grid-cols-3 grid" : "gap-sm flex flex-col"}>
            {node.children.map((c) => (
              <UnitCard key={c.id} node={c} depth={depth + 1} onOpen={onOpen} />
            ))}
          </div>
        ) : null}
      </div>
    </PanelCard>
  );
}

function People({ people, onOpen }: {
  readonly people: readonly OrgViewPerson[];
  readonly onOpen: (sub: string) => void;
}) {
  const { MEMBER_TEXT } = useMessages();
  return (
    <ul className="gap-x-md gap-y-xs flex flex-wrap">
      {people.map((p) => (
        <li key={p.sub} className="gap-2xs flex items-center">
          <button
            type="button"
            className="text-body-md cursor-pointer text-left hover:underline"
            aria-label={MEMBER_TEXT.detailsTitle(p.name)}
            onClick={() => onOpen(p.sub)}
          >
            {p.name}
          </button>
          {p.status === "inactive" ? <Tag>{MEMBER_TEXT.inactive}</Tag> : null}
        </li>
      ))}
    </ul>
  );
}
