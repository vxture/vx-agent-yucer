// 同类对标 (YC-021 L5): where this customer's health sits among customers of
// the same industry AND the same size - "给出同规模同行业的分位,样本量不足时
// 明说". Both keys are the workspace's own vocabularies (incr/0040 行业,
// incr/0071 规模); a customer missing either has no peer group, and says which.

/** Below this many scored peers a percentile is noise, and is not given. */
export const PEER_MIN_SAMPLE = 5;

export interface BenchmarkRow {
  readonly id: string;
  readonly industryId: string | null;
  readonly customerSizeId: string | null;
  readonly healthScore: number | null;
}

export type PeerBenchmark =
  | { readonly kind: "ok"; readonly percentile: number; readonly peers: number }
  | { readonly kind: "thin"; readonly peers: number; readonly needed: number }
  | { readonly kind: "unclassified"; readonly missing: readonly ("industry" | "size")[] }
  | { readonly kind: "unscored" };

/**
 * Percentile rank of `score` among the scored peers (self excluded): the share
 * scoring below it, ties counted half - so the middle of a tied group reads 50,
 * not 0 or 100. 0-100, rounded.
 */
export function peerBenchmark(
  self: Omit<BenchmarkRow, "healthScore">,
  score: number | null,
  all: readonly BenchmarkRow[],
  minSample: number = PEER_MIN_SAMPLE,
): PeerBenchmark {
  const missing: ("industry" | "size")[] = [];
  if (!self.industryId) missing.push("industry");
  if (!self.customerSizeId) missing.push("size");
  if (missing.length > 0) return { kind: "unclassified", missing };
  if (score === null) return { kind: "unscored" };
  const peers = all
    .filter(
      (r) =>
        r.id !== self.id &&
        r.industryId === self.industryId &&
        r.customerSizeId === self.customerSizeId &&
        r.healthScore !== null,
    )
    .map((r) => r.healthScore as number);
  if (peers.length < minSample) return { kind: "thin", peers: peers.length, needed: minSample };
  const below = peers.filter((p) => p < score).length;
  const tied = peers.filter((p) => p === score).length;
  return { kind: "ok", percentile: Math.round(((below + tied / 2) / peers.length) * 100), peers: peers.length };
}
