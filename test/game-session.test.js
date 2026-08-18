import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateClearScore,
  DEFAULT_GAME_DURATION_MS,
  GameSession
} from '../js/game-session.js';
import { GAME_MODE_IDS } from '../js/game-modes.js';

test('300秒モードは開始直後に入力を受け付ける', () => {
  const session = new GameSession({ modeId: GAME_MODE_IDS.THREE_HUNDRED_SECONDS });
  const state = session.start(1_000);
  assert.equal(state.phase, 'running');
  assert.equal(state.remainingMs, 300_000);
  assert.equal(state.score, 0);
  assert.equal(session.isAcceptingInput(), true);
});

test('盤面準備中は開始命令まで時間と入力を進めない', () => {
  const session = new GameSession();
  const prepared = session.getSnapshot();
  const stillPrepared = session.tick(60_000);
  assert.equal(prepared.phase, 'idle');
  assert.equal(stillPrepared.elapsedMs, 0);
  assert.equal(session.isAcceptingInput(), false);
});

test('300秒到達時に終了待ちへ移る', () => {
  const session = new GameSession({ modeId: GAME_MODE_IDS.THREE_HUNDRED_SECONDS });
  session.start(1_000);
  const beforeEnd = session.tick(300_999);
  assert.equal(beforeEnd.phase, 'running');
  assert.equal(beforeEnd.remainingMs, 1);
  const timeUp = session.tick(301_000);
  assert.equal(timeUp.phase, 'finishing');
  assert.equal(timeUp.remainingMs, 0);
});

test('通常消去は目と消去個数だけで得点にする', () => {
  assert.equal(calculateClearScore({ value: 4, count: 3 }), 1_200);
  assert.equal(calculateClearScore({ value: 4, count: 3, chain: 99 }), 1_200);
});

test('1の特殊消去もチェイン倍率を使わない', () => {
  assert.equal(calculateClearScore({ value: 1, count: 5, type: 'special-one' }), 500);
  assert.equal(calculateClearScore({ value: 1, count: 5, chain: 99, type: 'special-one' }), 500);
});

test('結果にチェイン成績を持たず互換フィールドは常に0にする', () => {
  const session = new GameSession();
  session.start(0);
  const first = session.recordClear({ value: 3, count: 3, chain: 9 });
  const second = session.recordClear({ value: 1, count: 4, chain: 9, type: 'special-one' });
  const state = session.getSnapshot();
  assert.equal(first.points, 900);
  assert.equal(second.points, 400);
  assert.equal(state.score, 1_300);
  assert.equal(state.clearedDice, 7);
  assert.equal(state.maxChain, 0);
  assert.equal(state.clearEvents, 2);
  assert.equal(state.specialOneEvents, 1);
});

test('時間切れ前から処理中だった消去は終了待ち中も得点に含める', () => {
  const session = new GameSession();
  session.start(0);
  session.tick(DEFAULT_GAME_DURATION_MS);
  const score = session.recordClear({ value: 2, count: 2 });
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
  session.recordClear({ value: 2, count: 2 });
  session.tick(DEFAULT_GAME_DURATION_MS);
  const result = session.finishWhenSettled(false);
  assert.equal(result.phase, 'finished');
  assert.equal(result.score, 400);
  assert.equal(session.finishWhenSettled(false), null);
});

test('結果確定後の消去は得点へ追加しない', () => {
  const session = new GameSession();
  session.start(0);
  session.tick(DEFAULT_GAME_DURATION_MS);
  session.finishWhenSettled(false);
  assert.equal(session.recordClear({ value: 6, count: 6, chain: 9 }), null);
  assert.equal(session.getResult().score, 0);
});

test('旧保存のmaxChainは読めるが復元後は0にする', () => {
  const session = new GameSession({ modeId: GAME_MODE_IDS.THREE_HUNDRED_SECONDS });
  const restored = session.restore({
    phase: 'running',
    modeId: GAME_MODE_IDS.THREE_HUNDRED_SECONDS,
    durationMs: 300_000,
    elapsedMs: 12_345,
    score: 1_200,
    clearedDice: 4,
    maxChain: 8,
    clearEvents: 2,
    specialOneEvents: 0
  }, 50_000);
  assert.equal(restored.maxChain, 0);
  assert.equal(restored.score, 1_200);
});

test('不正な得点条件と時間は拒否する', () => {
  assert.throws(() => calculateClearScore({ value: 1, count: 1 }), /normal clears/);
  assert.throws(() => calculateClearScore({ value: 2, count: 0 }), /positive integer/);
  assert.throws(() => new GameSession({ durationMs: 0 }), /positive integer/);
});
