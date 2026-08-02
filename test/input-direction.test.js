import test from 'node:test';
import assert from 'node:assert/strict';

import { directionFromDiagonalSwipe } from '../js/input-direction.js';

test('画面右上への斜めフリックは盤面の奥方向になる', () => {
  assert.equal(directionFromDiagonalSwipe(60, -60), 'up');
});

test('画面右下への斜めフリックは盤面の右方向になる', () => {
  assert.equal(directionFromDiagonalSwipe(60, 60), 'right');
});

test('画面左下への斜めフリックは盤面の手前方向になる', () => {
  assert.equal(directionFromDiagonalSwipe(-60, 60), 'down');
});

test('画面左上への斜めフリックは盤面の左方向になる', () => {
  assert.equal(directionFromDiagonalSwipe(-60, -60), 'left');
});

test('短すぎる操作と縦横だけの操作は移動にしない', () => {
  assert.equal(directionFromDiagonalSwipe(10, 10), null);
  assert.equal(directionFromDiagonalSwipe(80, 10), null);
  assert.equal(directionFromDiagonalSwipe(10, -80), null);
});
