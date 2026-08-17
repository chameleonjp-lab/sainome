import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GameFlow, SCREEN_PHASES } from '../js/ui-flow.js';
import { GAME_MODE_IDS } from '../js/game-modes.js';
import { GameSession } from '../js/game-session.js';

test('プレイ中を一時停止して再開できる', () => {
  const flow = new GameFlow({ countdownFrom: 1 });
  flow.beginCountdown();
  flow.advanceCountdown();

  const paused = flow.pausePlaying();

  assert.equal(paused.screen, SCREEN_PHASES.PAUSED);
  assert.equal(paused.canMove, false);
  assert.equal(flow.resumePaused().screen, SCREEN_PHASES.PLAYING);
  assert.equal(flow.canMove(), true);
});

test('一時停止中でもリタイア結果を結果画面へ渡せる', () => {
  const flow = new GameFlow({ countdownFrom: 1 });
  flow.beginCountdown();
  flow.advanceCountdown();
  flow.pausePlaying();

  const result = flow.finish({
    modeId: GAME_MODE_IDS.THREE_HUNDRED_SECONDS,
    score: 1_200,
    clearedDice: 3,
    maxChain: 1,
    endedReason: 'retired'
  });

  assert.equal(result.screen, SCREEN_PHASES.RESULT);
  assert.equal(result.result.score, 1_200);
  assert.equal(result.result.endedReason, 'retired');
});

test('リタイア時は一時停止中の時間を進めず現在のスコアを残す', () => {
  const session = new GameSession({
    modeId: GAME_MODE_IDS.THREE_HUNDRED_SECONDS
  });

  session.start(1_000);
  session.tick(4_000);
  session.recordClear({ value: 2, count: 2, chain: 1 });

  const result = session.retire(5_000);

  assert.equal(result.phase, 'finished');
  assert.equal(result.endedReason, 'retired');
  assert.equal(result.score, 400);
  assert.equal(result.elapsedMs, 4_000);
  assert.equal(result.remainingMs, 296_000);
});

test('一時停止UIとリタイア処理が画面・3D実装へ接続されている', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const webgl = readFileSync(new URL('../js/webgl-game.js', import.meta.url), 'utf8');

  assert.match(index, /id="pause-button"/);
  assert.match(index, /id="pause-screen"/);
  assert.match(index, /id="resume-button"/);
  assert.match(index, /id="retire-button"/);
  assert.match(css, /\.hud-stats/);
  assert.match(css, /\.pause-screen/);
  assert.match(main, /function pauseRound\(\)/);
  assert.match(main, /function resumeRound\(\)/);
  assert.match(main, /function retireRound\(\)/);
  assert.match(main, /endedReason === 'retired'/);
  assert.match(webgl, /manualPaused/);
  assert.match(webgl, /retire\(\)/);
});
