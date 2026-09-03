import { EmptyState, PanelCard, Section, StatusBadge } from "@vxture/design-ui";

import { getMessages } from "../lib/i18n/server";
// The plays the agent is grounded on.
//
// This panel exists because grounding is otherwise INVISIBLE. Workspace-authored
// text is injected into the system prompt of every turn it matches, and an
// assistant whose instructions nobody can read is one nobody can correct: a rep
// who disagrees with an answer has no way to find the sentence that produced it,
// and no way to tell "the model decided this" from "someone wrote this down last
// quarter".
//
// It is deliberately read-only here. Editing a play changes what the agent tells
// everyone in the workspace, which is an admin action (copilot.playbook.upsert),
// not a reading one.

export interface PlaybookView {
  readonly id: string;
  readonly playbookCode: string;
  readonly name: string;
  readonly scopeDomain: string;
  readonly content: string;
  readonly version: number;
}

export interface PlaybookCatalogProps {
  readonly playbooks: readonly PlaybookView[];
  /** How many plays a single turn may quote. Stated, not implied. */
  readonly maxPerTurn: number;
}

export async function PlaybookCatalog({
  playbooks,
  maxPerTurn,
}: PlaybookCatalogProps) {
  const { PLAYBOOK_SCOPE_LABEL, PLAYBOOK_TEXT } = await getMessages();
  if (playbooks.length === 0) {
    return (
      <Section
        title={PLAYBOOK_TEXT.title}
        description={PLAYBOOK_TEXT.description}
      >
        <EmptyState
          title={PLAYBOOK_TEXT.emptyTitle}
          description={PLAYBOOK_TEXT.emptyDescription}
        />
      </Section>
    );
  }

  return (
    <Section
      title={PLAYBOOK_TEXT.title}
      description={PLAYBOOK_TEXT.description}
      // The bound is part of the contract, not an implementation detail: a
      // reader who sees eight plays listed would otherwise assume all eight
      // shape every answer.
      action={
        <StatusBadge tone="neutral">
          {PLAYBOOK_TEXT.grounding(maxPerTurn)}
        </StatusBadge>
      }
    >
      {playbooks.map((p) => (
        <PanelCard
          key={p.id}
          title={p.name}
          description={
            <>
              <StatusBadge tone="info">
                {PLAYBOOK_SCOPE_LABEL[p.scopeDomain] ?? p.scopeDomain}
              </StatusBadge>
              <StatusBadge tone="neutral">{p.playbookCode}</StatusBadge>
              <StatusBadge tone="neutral">
                {PLAYBOOK_TEXT.version} {p.version}
              </StatusBadge>
            </>
          }
        >
          {/* The play's own words, verbatim. Summarising it here would mean the
              catalog and the prompt no longer show the same thing.

              CLASSED, and it has to be. PanelCard carries its `tone` as a
              `color` on the card root, so any descendant text without a colour
              of its own INHERITS it - and the default tone is `brand`. This
              paragraph had no class, so the one thing this panel exists to make
              readable rendered in link blue (rgb(23,64,212)) against the
              neutral grey every other paragraph on the page uses. Workspace
              prose that looks clickable is worse than prose that is merely
              hard to find. */}
          <p className="text-body-md text-foreground">{p.content}</p>
        </PanelCard>
      ))}
    </Section>
  );
}
