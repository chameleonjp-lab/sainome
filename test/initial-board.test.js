import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../js/webgl-game.js', import.meta.url),
  'utf8'
);

test('300秒モードの初期盤面は1・2・3を各2個だけ配置する', () => {
  const body = source.match(/const INITIAL_DICE = \[([\s\S]*?)\n\];/u)?.[1] ?? '';
  const entries = [...body.matchAll(
    /\{\s*row:\s*(\d+),\s*column:\s*(\d+),\s*top:\s*(\d+)\s*\}/gu
  )].map((match) => ({
    row: Number(match[1]),
    column: Number(match[2]),
    top: Number(match[3])
  }));

  assert.equal(entries.length, 6);
  assert.deepEqual(entries.map(({ top }) => top).sort(), [1, 1, 2, 2, 3, 3]);
  assert.equal(new Set(entries.map(({ row, column }) => `${row},${column}`)).size, 6);
  assert.match(source, /setInitialTop\(die, top\)/);
});
