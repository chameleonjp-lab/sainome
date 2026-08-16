import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getClearTriggeredSpawnCount,
  getSixtySecondSpawnBatchCount,
  SIXTY_SECOND_SPAWN_AT_MS
} from '../archive/60-second/spawn-rules.js';
import { GAME_MODE_IDS } from '../archive/60-second/game-modes.js';

test('60秒版アーカイブは現行の生成ルールへ依存せず読み込める', () => {
  assert.equal(
    getSixtySecondSpawnBatchCount(SIXTY_SECOND_SPAWN_AT_MS),
    2
  );
  assert.equal(
    getClearTriggeredSpawnCount(GAME_MODE_IDS.ONE_EIGHTY_SECONDS, 6),
    4
  );
  assert.equal(
    getClearTriggeredSpawnCount(GAME_MODE_IDS.SIXTY_SECONDS, 6),
    0
  );
});
