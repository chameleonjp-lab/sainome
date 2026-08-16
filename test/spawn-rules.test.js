import test from 'node:test';
import assert from 'node:assert/strict';

import { getClearTriggeredSpawnCount } from '../js/spawn-rules.js';
import { GAME_MODE_IDS } from '../js/game-modes.js';

test('300秒モードは消したサイコロと同じ数を生成する', () => {
  assert.deepEqual(
    [1, 2, 3, 6, 12].map((count) =>
      getClearTriggeredSpawnCount(GAME_MODE_IDS.THREE_HUNDRED_SECONDS, count)
    ),
    [1, 2, 3, 6, 12]
  );
});

test('300秒モードの不正な消去数は生成しない', () => {
  for (const count of [0, -1, 1.5, Number.NaN, Infinity]) {
    assert.equal(
      getClearTriggeredSpawnCount(GAME_MODE_IDS.THREE_HUNDRED_SECONDS, count),
      0
    );
  }
});

test('旧モードでは新しい生成ルールを有効にしない', () => {
  assert.equal(
    getClearTriggeredSpawnCount(GAME_MODE_IDS.SIXTY_SECONDS, 6),
    0
  );
  assert.equal(
    getClearTriggeredSpawnCount(GAME_MODE_IDS.ONE_EIGHTY_SECONDS, 6),
    0
  );
});
