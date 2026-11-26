export const HOME_HEADLINE_COUNT = 10;

/** An hourly pseudo-random choice, stable on reload and identical at hydration.
 * No model call, personal storage or business data is needed. Repeats are OK. */
export function homeHeadlineIndex(time: number): number {
  const hour = Math.floor(time / 3_600_000);
  let hash = 2166136261;
  for (const char of String(hour)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash ^= hash >>> 16;
  return (hash >>> 0) % HOME_HEADLINE_COUNT;
}
