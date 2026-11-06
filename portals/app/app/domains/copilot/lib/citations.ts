import type { EvidenceNote } from "../../../agent/orchestrator/prompt";

export interface EvidenceCitation {
  id: string;
  href: string;
  label: string;
}

/** Only server-read records explicitly cited by identifier become links. */
export function citationsForAnswer(answer: string, accountId: string, notes: readonly Pick<EvidenceNote, "id" | "occurredAt">[]): EvidenceCitation[] {
  const tokens = new Set(answer.split(/[^a-zA-Z0-9_-]+/));
  return notes.filter((note, index) => tokens.has(note.id) && notes.findIndex((n) => n.id === note.id) === index)
    .map((note) => ({
      id: note.id,
      href: `/account/${encodeURIComponent(accountId)}/evidence/${encodeURIComponent(note.id)}`,
      label: `${note.occurredAt.toISOString().slice(0, 10)} · ${note.id}`,
    }));
}
