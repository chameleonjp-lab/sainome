import { GAME_MODE_IDS } from './game-modes.js';

export function getClearTriggeredSpawnCount(modeId, clearedCount) {
  if (
    modeId !== GAME_MODE_IDS.THREE_HUNDRED_SECONDS
    || !Number.isSafeInteger(clearedCount)
    || clearedCount < 1
  ) {
    return 0;
  }

  // 300秒モードは、消えたサイコロ1個につき新しい1個を補充する。
  return clearedCount;
}
