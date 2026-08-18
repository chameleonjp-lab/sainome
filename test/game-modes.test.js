import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_GAME_MODE_ID,
  GAME_MODE_IDS,
  GAME_MODES,
  getGameMode
} from '../js/game-modes.js';

test('新しいプレイは300秒モードだけを使う', () => {
  const mode = getGameMode();

  assert.deepEqual(Object.keys(GAME_MODE_IDS), ['THREE_HUNDRED_SECONDS']);
  assert.deepEqual(Object.keys(GAME_MODES), ['300-seconds']);
  assert.equal(mode.id, DEFAULT_GAME_MODE_ID);
  assert.equal(mode.id, GAME_MODE_IDS.THREE_HUNDRED_SECONDS);
  assert.equal(mode.durationMs, 300_000);
  assert.equal(mode.label, '300秒');
});

test('廃止した60秒・180秒モードは読み取れない', () => {
  assert.throws(() => getGameMode('60-seconds'), /Unknown game mode/);
  assert.throws(() => getGameMode('180-seconds'), /Unknown game mode/);
});

test('存在しないモードは開始できない', () => {
  assert.throws(() => getGameMode('unknown'), /Unknown game mode/);
});
