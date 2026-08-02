export const SIXTY_SECOND_SPAWN_AT_MS = 30_000;
export const SIXTY_SECOND_SPAWN_COUNT = 2;
export const SIXTY_SECOND_DURATION_MS = 60_000;

export function getSixtySecondSpawnBatchCount(
  elapsedMs,
  batchCompleted = false
) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  if (
    batchCompleted
    || elapsedMs < SIXTY_SECOND_SPAWN_AT_MS
    || elapsedMs >= SIXTY_SECOND_DURATION_MS
  ) return 0;
  return SIXTY_SECOND_SPAWN_COUNT;
}
