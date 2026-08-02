import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_GAME_MODE_ID,
  GAME_MODE_IDS,
  getGameMode
} from '../js/game-modes.js';

test('既定モードは60秒として取得できる', () => {
  const mode = getGameMode();

  assert.equal(mode.id, DEFAULT_GAME_MODE_ID);
  assert.equal(mode.durationMs, 60_000);
});

test('180秒モードは3分の制限時間を持つ', () => {
  const mode = getGameMode(GAME_MODE_IDS.ONE_EIGHTY_SECONDS);

  assert.equal(mode.durationMs, 180_000);
  assert.equal(mode.label, '180秒');
});

test('存在しないモードは開始できない', () => {
  assert.throws(() => getGameMode('unknown'), /Unknown game mode/);
});
