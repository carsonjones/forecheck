export type RankedId = { id: string; score: number };

/** Merge ordered result lists using reciprocal rank fusion. */
export function reciprocalRankFusion(
  rankings: ReadonlyArray<ReadonlyArray<string>>,
  k = 60,
): RankedId[] {
  if (!Number.isFinite(k) || k < 0) throw new Error('k must be a non-negative number');

  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    const seen = new Set<string>();
    ranking.forEach((id, index) => {
      if (seen.has(id)) return;
      seen.add(id);
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
