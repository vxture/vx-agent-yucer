import { EmptyState, PanelCard, Section, StatusBadge } from "@vxture/design-ui";
import { PLAYBOOK_SCOPE_LABEL, PLAYBOOK_TEXT } from "../lib/messages";

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

export function PlaybookCatalog({ playbooks, maxPerTurn }: PlaybookCatalogProps) {
  if (playbooks.length === 0) {
    return (
      <Section title={PLAYBOOK_TEXT.title} description={PLAYBOOK_TEXT.description}>
        <EmptyState title={PLAYBOOK_TEXT.emptyTitle} description={PLAYBOOK_TEXT.emptyDescription} />
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
      action={<StatusBadge tone="neutral">{PLAYBOOK_TEXT.grounding(maxPerTurn)}</StatusBadge>}
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
              catalog and the prompt no longer show the same thing. */}
          <p>{p.content}</p>
        </PanelCard>
      ))}
    </Section>
  );
}
