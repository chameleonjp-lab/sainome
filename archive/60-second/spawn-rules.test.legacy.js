import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getClearTriggeredSpawnCount,
  getOneEightySecondClearSpawnCount,
  getSixtySecondSpawnBatchCount,
  getSixtySecondSpawnRemaining,
  ONE_EIGHTY_SECOND_MAX_SPAWN_COUNT,
  SIXTY_SECOND_SPAWN_AT_MS,
  SIXTY_SECOND_SPAWN_COUNT
} from './spawn-rules.js';
import { GAME_MODE_IDS } from './game-modes.js';

test('60秒モードは開始30秒未満では追加生成しない', () => {
  assert.equal(
    getSixtySecondSpawnBatchCount(SIXTY_SECOND_SPAWN_AT_MS - 1),
    0
  );
});

test('開始30秒到達時に2個の追加生成を要求する', () => {
  assert.equal(
    getSixtySecondSpawnBatchCount(SIXTY_SECOND_SPAWN_AT_MS),
    SIXTY_SECOND_SPAWN_COUNT
  );
});

test('30秒の追加生成を終えた後は再び要求しない', () => {
  assert.equal(getSixtySecondSpawnBatchCount(59_999, true), 0);
});

test('60秒到達後は未生成でも追加生成しない', () => {
  assert.equal(getSixtySecondSpawnBatchCount(60_000, false), 0);
});

test('60秒モードは空きマス不足時も残りの生成数を保持する', () => {
  assert.equal(
    getSixtySecondSpawnRemaining(SIXTY_SECOND_SPAWN_AT_MS, 0),
    SIXTY_SECOND_SPAWN_COUNT
  );
  assert.equal(
    getSixtySecondSpawnRemaining(45_000, 1),
    1
  );
  assert.equal(
    getSixtySecondSpawnRemaining(59_999, SIXTY_SECOND_SPAWN_COUNT),
    0
  );
});

test('60秒モードの不正な生成済み数は追加生成しない', () => {
  assert.equal(getSixtySecondSpawnRemaining(30_000, -1), 0);
  assert.equal(getSixtySecondSpawnRemaining(30_000, 1.5), 0);
  assert.equal(getSixtySecondSpawnRemaining(30_000, Number.NaN), 0);
});

test('180秒モードは2個以下の消去では生成しない', () => {
  assert.equal(getOneEightySecondClearSpawnCount(1), 0);
  assert.equal(getOneEightySecondClearSpawnCount(2), 0);
});

test('180秒モードは3個から6個の消去数に応じて1個から4個を生成する', () => {
  assert.deepEqual(
    [3, 4, 5, 6].map(getOneEightySecondClearSpawnCount),
    [1, 2, 3, 4]
  );
});

test('180秒モードは7個以上を同時に消しても生成を4個までにする', () => {
  assert.equal(
    getOneEightySecondClearSpawnCount(12),
    ONE_EIGHTY_SECOND_MAX_SPAWN_COUNT
  );
});

test('180秒モードは不正な消去数では生成しない', () => {
  assert.equal(getOneEightySecondClearSpawnCount(3.5), 0);
  assert.equal(getOneEightySecondClearSpawnCount(Number.NaN), 0);
});

test('消去による生成は180秒モードだけで有効になる', () => {
  assert.equal(
    getClearTriggeredSpawnCount(GAME_MODE_IDS.SIXTY_SECONDS, 6),
    0
  );
  assert.equal(
    getClearTriggeredSpawnCount(GAME_MODE_IDS.ONE_EIGHTY_SECONDS, 6),
    4
  );
});
