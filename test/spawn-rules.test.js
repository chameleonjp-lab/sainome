import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSixtySecondSpawnBatchCount,
  SIXTY_SECOND_SPAWN_AT_MS,
  SIXTY_SECOND_SPAWN_COUNT
} from '../js/spawn-rules.js';

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
