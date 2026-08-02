import {
  GAME_MODE_IDS,
  getGameMode
} from './game-modes.js';

export const SIXTY_SECOND_SPAWN_AT_MS = 30_000;
export const SIXTY_SECOND_SPAWN_COUNT = 2;
export const SIXTY_SECOND_DURATION_MS = 60_000;
export const ONE_EIGHTY_SECOND_MAX_SPAWN_COUNT = 4;

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

export function getOneEightySecondClearSpawnCount(clearedCount) {
  if (!Number.isInteger(clearedCount) || clearedCount < 3) return 0;
  return Math.min(
    ONE_EIGHTY_SECOND_MAX_SPAWN_COUNT,
    clearedCount - 2
  );
}

export function getClearTriggeredSpawnCount(modeId, clearedCount) {
  const mode = getGameMode(modeId);
  if (mode.id !== GAME_MODE_IDS.ONE_EIGHTY_SECONDS) return 0;
  return getOneEightySecondClearSpawnCount(clearedCount);
}
