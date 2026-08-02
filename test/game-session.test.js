import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateClearScore,
  DEFAULT_GAME_DURATION_MS,
  GameSession
} from '../js/game-session.js';
import { GAME_MODE_IDS } from '../js/game-modes.js';

test('60秒モードは開始直後に入力を受け付ける', () => {
  const session = new GameSession();

  const state = session.start(1_000);

  assert.equal(state.phase, 'running');
  assert.equal(state.modeId, GAME_MODE_IDS.SIXTY_SECONDS);
  assert.equal(state.remainingMs, DEFAULT_GAME_DURATION_MS);
  assert.equal(state.score, 0);
  assert.equal(session.isAcceptingInput(), true);
});

test('180秒モードは180秒到達時まで入力を受け付ける', () => {
  const session = new GameSession({
    modeId: GAME_MODE_IDS.ONE_EIGHTY_SECONDS
  });
  session.start(1_000);

  const beforeEnd = session.tick(180_999);
  assert.equal(beforeEnd.phase, 'running');
  assert.equal(beforeEnd.remainingMs, 1);

  const timeUp = session.tick(181_000);
  assert.equal(timeUp.phase, 'finishing');
  assert.equal(timeUp.remainingMs, 0);
});

test('60秒未満では進行中のまま残り時間を減らす', () => {
  const session = new GameSession();
  session.start(5_000);

  const state = session.tick(64_999);

  assert.equal(state.phase, 'running');
  assert.equal(state.elapsedMs, 59_999);
  assert.equal(state.remainingMs, 1);
});

test('60秒到達時に新しい入力を止めて終了待ちへ移る', () => {
  const session = new GameSession();
  session.start(5_000);

  const state = session.tick(65_000);

  assert.equal(state.phase, 'finishing');
  assert.equal(state.remainingMs, 0);
  assert.equal(session.isAcceptingInput(), false);
});

test('時刻が逆戻りしても残り時間は増えない', () => {
  const session = new GameSession();
  session.start(10_000);
  session.tick(20_000);

  const state = session.tick(15_000);

  assert.equal(state.elapsedMs, 10_000);
  assert.equal(state.remainingMs, 50_000);
});

test('通常消去は目と追加個数と連鎖数を掛けて得点にする', () => {
  assert.equal(
    calculateClearScore({ value: 4, count: 3, chain: 2 }),
    2_400
  );
});

test('1の特殊消去も個数と連鎖数に応じて得点にする', () => {
  assert.equal(
    calculateClearScore({ value: 1, count: 5, chain: 3, type: 'special-one' }),
    1_500
  );
});

test('複数の消去得点と結果用の集計値を保持する', () => {
  const session = new GameSession();
  session.start(0);

  const first = session.recordClear({ value: 3, count: 3, chain: 1 });
  const second = session.recordClear({
    value: 1,
    count: 4,
    chain: 2,
    type: 'special-one'
  });
  const state = session.getSnapshot();

  assert.equal(first.points, 900);
  assert.equal(second.points, 800);
  assert.equal(second.totalScore, 1_700);
  assert.equal(state.score, 1_700);
  assert.equal(state.clearedDice, 7);
  assert.equal(state.maxChain, 2);
  assert.equal(state.clearEvents, 2);
  assert.equal(state.specialOneEvents, 1);
});

test('時間切れ前から処理中だった消去は終了待ち中も得点に含める', () => {
  const session = new GameSession();
  session.start(0);
  session.tick(DEFAULT_GAME_DURATION_MS);

  const score = session.recordClear({ value: 2, count: 2, chain: 1 });

  assert.equal(score.points, 400);
  assert.equal(session.getSnapshot().score, 400);
});

test('消去処理が残る間は結果を確定しない', () => {
  const session = new GameSession();
  session.start(0);
  session.tick(DEFAULT_GAME_DURATION_MS);

  assert.equal(session.finishWhenSettled(true), null);
  assert.equal(session.getSnapshot().phase, 'finishing');
});

test('消去処理完了後に結果を一度だけ確定する', () => {
  const session = new GameSession();
  session.start(0);
  session.recordClear({ value: 2, count: 2, chain: 1 });
  session.tick(DEFAULT_GAME_DURATION_MS);

  const result = session.finishWhenSettled(false);

  assert.equal(result.phase, 'finished');
  assert.equal(result.endedReason, 'time-up');
  assert.equal(result.remainingMs, 0);
  assert.equal(result.score, 400);
  assert.equal(session.finishWhenSettled(false), null);
  assert.strictEqual(session.getResult(), result);
});

test('結果確定後の消去は得点へ追加しない', () => {
  const session = new GameSession();
  session.start(0);
  session.tick(DEFAULT_GAME_DURATION_MS);
  session.finishWhenSettled(false);

  assert.equal(session.recordClear({ value: 6, count: 6, chain: 9 }), null);
  assert.equal(session.getResult().score, 0);
});

test('再開始すると時間と得点と結果を初期化する', () => {
  const session = new GameSession();
  session.start(0);
  session.recordClear({ value: 5, count: 5, chain: 2 });
  session.tick(DEFAULT_GAME_DURATION_MS);
  session.finishWhenSettled(false);

  const restarted = session.start(200_000);

  assert.equal(restarted.phase, 'running');
  assert.equal(restarted.remainingMs, DEFAULT_GAME_DURATION_MS);
  assert.equal(restarted.score, 0);
  assert.equal(restarted.clearedDice, 0);
  assert.equal(session.getResult(), null);
});

test('不正な得点条件と時間は拒否する', () => {
  assert.throws(
    () => calculateClearScore({ value: 1, count: 1, chain: 1 }),
    /normal clears/
  );
  assert.throws(
    () => calculateClearScore({ value: 2, count: 0, chain: 1 }),
    /positive integer/
  );
  assert.throws(() => new GameSession({ durationMs: 0 }), /positive integer/);
});
