import test from 'node:test';
import assert from 'node:assert/strict';

import { Dice, BASE_ORIENTATION } from '../js/dice.js';
import { boardKey, findTriggeredGroups } from '../js/board-rules.js';

function die(id, row, column, top, state = 'normal') {
  return {
    id,
    row,
    column,
    top,
    state
  };
}

function diceMap(...dice) {
  return new Map(dice.map((item) => [boardKey(item.row, item.column), item]));
}

test('サイコロを右へ転がすと左面が上になる', () => {
  const item = new Dice('die-1', 0, 0, { ...BASE_ORIENTATION });

  item.roll('right', 0, 1);

  assert.equal(item.top, 3);
  assert.equal(item.bottom, 4);
  assert.equal(item.left, 6);
  assert.equal(item.right, 1);
  assert.deepEqual({ row: item.row, column: item.column }, { row: 0, column: 1 });
});

test('反対方向へ戻すと6面と座標が元に戻る', () => {
  const item = new Dice('die-1', 3, 3, { ...BASE_ORIENTATION });

  item.roll('up', 2, 3);
  item.roll('down', 3, 3);
  item.roll('left', 3, 2);
  item.roll('right', 3, 3);

  assert.deepEqual(
    {
      top: item.top,
      bottom: item.bottom,
      front: item.front,
      back: item.back,
      left: item.left,
      right: item.right,
      row: item.row,
      column: item.column
    },
    { ...BASE_ORIENTATION, row: 3, column: 3 }
  );
});

test('上面2が縦横に2個つながると消去対象になる', () => {
  const map = diceMap(
    die('a', 2, 2, 2),
    die('b', 2, 3, 2),
    die('c', 3, 3, 5)
  );

  const groups = findTriggeredGroups(map, 7);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].value, 2);
  assert.deepEqual(groups[0].additions.map((item) => item.id).sort(), ['a', 'b']);
  assert.equal(groups[0].isChain, false);
});

test('斜めだけで接するサイコロはつながらない', () => {
  const map = diceMap(
    die('a', 2, 2, 2),
    die('b', 3, 3, 2)
  );

  assert.deepEqual(findTriggeredGroups(map, 7), []);
});

test('必要数より少ない同じ目は消去対象にならない', () => {
  const map = diceMap(
    die('a', 1, 1, 4),
    die('b', 1, 2, 4),
    die('c', 1, 3, 4)
  );

  assert.deepEqual(findTriggeredGroups(map, 7), []);
});

test('沈下中のまとまりへ同じ目を足すと追加分だけが連鎖対象になる', () => {
  const map = diceMap(
    die('a', 3, 1, 3, 'sinking'),
    die('b', 3, 2, 3, 'sinking'),
    die('c', 3, 3, 3, 'sinking'),
    die('d', 2, 3, 3),
    die('e', 1, 3, 4)
  );

  const groups = findTriggeredGroups(map, 7);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].isChain, true);
  assert.deepEqual(groups[0].additions.map((item) => item.id), ['d']);
});

test('沈下中を含めても必要数へ届かない場合は連鎖しない', () => {
  const map = diceMap(
    die('a', 3, 2, 4, 'sinking'),
    die('b', 3, 3, 4)
  );

  assert.deepEqual(findTriggeredGroups(map, 7), []);
});

test('1の目は通常の接続消去に含めない', () => {
  const map = diceMap(die('one', 0, 0, 1));

  assert.deepEqual(findTriggeredGroups(map, 7), []);
});
