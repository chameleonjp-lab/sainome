import test from 'node:test';
import assert from 'node:assert/strict';

import { GameRandom } from '../js/game-random.js';

test('同じ乱数状態から同じ列を再現できる', () => {
  const first = new GameRandom(0x12345678);
  const second = new GameRandom(0x12345678);

  assert.deepEqual(
    Array.from({ length: 8 }, () => first.next()),
    Array.from({ length: 8 }, () => second.next())
  );
});

test('保存した乱数状態から続きだけを再現できる', () => {
  const random = new GameRandom(0x87654321);
  random.next();
  random.next();
  const saved = random.getState();
  const expected = [random.next(), random.next(), random.next()];

  const restored = new GameRandom(saved);
  assert.deepEqual(
    [restored.next(), restored.next(), restored.next()],
    expected
  );
});

test('乱数状態は0や範囲外の値を受け付けない', () => {
  assert.throws(() => new GameRandom(0), /non-zero uint32/);
  assert.throws(() => new GameRandom(0x100000000), /non-zero uint32/);
});
