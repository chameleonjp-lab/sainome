import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatRemainingSeconds,
  GameFlow,
  SCREEN_PHASES
} from '../js/ui-flow.js';
import { GAME_MODE_IDS } from '../js/game-modes.js';

const MODE_ID = GAME_MODE_IDS.THREE_HUNDRED_SECONDS;

test('初期画面ではゲーム操作を受け付けない', () => {
  const flow = new GameFlow();

  assert.equal(flow.getSnapshot().screen, SCREEN_PHASES.HOME);
  assert.equal(flow.canMove(), false);
});

test('ホームから説明を開き、説明中はゲーム操作を受け付けない', () => {
  const flow = new GameFlow();

  const tutorial = flow.openTutorial();

  assert.equal(tutorial.screen, SCREEN_PHASES.TUTORIAL);
  assert.equal(tutorial.canMove, false);
  assert.equal(flow.canMove(), false);
  assert.equal(flow.openTutorial(), null);
});

test('説明から3カウントへ進める', () => {
  const flow = new GameFlow();
  flow.openTutorial();

  const countdown = flow.beginCountdown();

  assert.equal(countdown.screen, SCREEN_PHASES.COUNTDOWN);
  assert.equal(countdown.countdown, 3);
});

test('3カウントの完了後だけゲーム操作を受け付ける', () => {
  const flow = new GameFlow();

  assert.equal(flow.beginCountdown().countdown, 3);
  assert.equal(flow.advanceCountdown().snapshot.countdown, 2);
  assert.equal(flow.advanceCountdown().snapshot.countdown, 1);

  const started = flow.advanceCountdown();

  assert.equal(started.started, true);
  assert.equal(started.snapshot.screen, SCREEN_PHASES.PLAYING);
  assert.equal(flow.canMove(), true);
});

test('カウント中の開始し直しと余分な進行を無視する', () => {
  const flow = new GameFlow();
  flow.beginCountdown();

  assert.equal(flow.beginCountdown(), null);
  flow.advanceCountdown();
  flow.advanceCountdown();
  flow.advanceCountdown();

  const extra = flow.advanceCountdown();
  assert.equal(extra.started, false);
  assert.equal(extra.snapshot.screen, SCREEN_PHASES.PLAYING);
});

test('プレイ終了時に300秒結果を固定して結果画面へ移る', () => {
  const flow = new GameFlow({ countdownFrom: 1 });
  flow.beginCountdown();
  flow.advanceCountdown();

  const finished = flow.finish({
    modeId: MODE_ID,
    score: 3200,
    clearedDice: 12,
    maxChain: 4,
    endedReason: 'time-up'
  });

  assert.equal(finished.screen, SCREEN_PHASES.RESULT);
  assert.deepEqual(finished.result, {
    modeId: MODE_ID,
    score: 3200,
    clearedDice: 12,
    maxChain: 0,
    endedReason: 'time-up'
  });
  assert.equal(Object.isFrozen(finished.result), true);
  assert.equal(flow.canMove(), false);
});

test('プレイ中以外の終了通知は画面を変えない', () => {
  const flow = new GameFlow();

  assert.equal(flow.finish({ modeId: MODE_ID, score: 100 }), null);
  assert.equal(flow.getSnapshot().screen, SCREEN_PHASES.HOME);
});

test('結果にモードがない場合は300秒へ自動分類しない', () => {
  const flow = new GameFlow({ countdownFrom: 1 });
  flow.beginCountdown();
  flow.advanceCountdown();

  assert.throws(
    () => flow.finish({ score: 100, clearedDice: 1, maxChain: 1 }),
    /game mode/
  );
  assert.equal(flow.getSnapshot().screen, SCREEN_PHASES.PLAYING);
});

test('結果画面から再挑戦すると結果を消して3カウントへ戻る', () => {
  const flow = new GameFlow({ countdownFrom: 1 });
  flow.beginCountdown();
  flow.advanceCountdown();
  flow.finish({
    modeId: MODE_ID,
    score: 900,
    clearedDice: 2,
    maxChain: 1,
    endedReason: 'time-up'
  });

  const replay = flow.beginCountdown();

  assert.equal(replay.screen, SCREEN_PHASES.COUNTDOWN);
  assert.equal(replay.result, null);
  assert.equal(replay.countdown, 1);
});

test('保存済みのプレイ状態は3カウントをやり直さず再開できる', () => {
  const flow = new GameFlow();

  const resumed = flow.resumePlaying();

  assert.equal(resumed.screen, SCREEN_PHASES.PLAYING);
  assert.equal(resumed.countdown, 0);
  assert.equal(resumed.result, null);
  assert.equal(flow.canMove(), true);
  assert.equal(flow.resumePlaying(), null);
});

test('ホームへ戻ると途中の状態と結果を初期化する', () => {
  const flow = new GameFlow();
  flow.beginCountdown();

  const home = flow.goHome();

  assert.equal(home.screen, SCREEN_PHASES.HOME);
  assert.equal(home.countdown, 0);
  assert.equal(home.result, null);
  assert.equal(home.canMove, false);
});

test('残り時間は端数を切り上げ、0未満と不正値を0にする', () => {
  assert.equal(formatRemainingSeconds(300_000), 300);
  assert.equal(formatRemainingSeconds(1), 1);
  assert.equal(formatRemainingSeconds(0), 0);
  assert.equal(formatRemainingSeconds(-100), 0);
  assert.equal(formatRemainingSeconds(Number.NaN), 0);
});
