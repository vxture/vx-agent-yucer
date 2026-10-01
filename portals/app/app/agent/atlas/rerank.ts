// Rerank - ordering a pile of text by how well it answers a question.
//
// Atlas's /v1/rerank (A3) takes a query and up to 100 candidates, each
// { id, text }, and returns { modelCode, scores: [{ id, score }] }. The shape
// was read off a live call (2026-09-30), not a published schema: the scores of
// a relevant and an irrelevant text came back 1 and 0.997.
//
// THAT COMPRESSION IS THE DESIGN CONSTRAINT. Atlas's own guidance is that the
// ORDER is reliable and the absolute value is not, so nothing here compares a
// score with a threshold - candidates are only ever ranked against each other.
//
// What it is for in yucer: choosing which follow-up notes go into a prompt
// when a customer has more than fit (agent/orchestrator/turn.ts). It is an
// improvement with a floor: when it cannot answer - disabled, slow, refused,
// or an answer in a shape this does not read - callers use the order they had
// before, newest first.

export const RERANK_MAX_CANDIDATES = 100;

/** A candidate's text is cut to this many characters before it is sent: the
 *  start of a note says what it is about, and Atlas bills per candidate. */
export const RERANK_TEXT_MAX_CHARS = 1500;

/** The query is cut the same way. */
export const RERANK_QUERY_MAX_CHARS = 1000;

export interface RerankCandidate {
  readonly id: string;
  readonly text: string;
}

/** id -> score, or null when the answer is not the shape this reads. A score
 *  only has a meaning relative to the others in the same answer. */
export function parseRerankScores(json: unknown): ReadonlyMap<string, number> | null {
  const scores = (json as { scores?: unknown } | null)?.scores;
  if (!Array.isArray(scores) || scores.length === 0) return null;
  const out = new Map<string, number>();
  for (const s of scores) {
    const row = s as { id?: unknown; score?: unknown };
    if (typeof row.id !== "string" || typeof row.score !== "number" || !Number.isFinite(row.score)) return null;
    out.set(row.id, row.score);
  }
  return out;
}

/** What is actually sent for a candidate. */
export function toRerankCandidate(id: string, text: string): RerankCandidate {
  return { id, text: text.length > RERANK_TEXT_MAX_CHARS ? text.slice(0, RERANK_TEXT_MAX_CHARS) : text };
}

/**
 * Choose `keep` of `newestFirst`, and give them back newest first.
 *
 * THE NEWEST `anchor` ARE ALWAYS KEPT. A question about a customer is very
 * often "where do we stand", and the answer is in the latest notes whether or
 * not their words resemble the question; relevance must not push them out. The
 * remaining places go to the best-ranked of the rest, ties to the more recent.
 *
 * With no scores (rerank unavailable or unreadable), or nothing to choose
 * between, this is exactly the old rule: the newest `keep`.
 */
export function selectEvidence<T extends { readonly id: string }>(
  newestFirst: readonly T[],
  scores: ReadonlyMap<string, number> | null,
  keep: number,
  anchor: number,
): { readonly chosen: T[]; readonly byRelevance: boolean } {
  if (!scores || newestFirst.length <= keep) {
    return { chosen: newestFirst.slice(0, keep), byRelevance: false };
  }
  const fixed = Math.min(anchor, keep);
  const rest = newestFirst
    .slice(fixed)
    .map((n, i) => ({ n, i, score: scores.get(n.id) ?? Number.NEGATIVE_INFINITY }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, keep - fixed);
  const picked = new Set(rest.map((r) => r.n.id));
  const chosen = newestFirst.filter((n, i) => i < fixed || picked.has(n.id));
  return { chosen, byRelevance: true };
}
