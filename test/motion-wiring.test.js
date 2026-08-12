import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const css = readFileSync(new URL('css/style.css', rootUrl), 'utf8');
const main = readFileSync(new URL('js/main.js', rootUrl), 'utf8');
const webglGame = readFileSync(new URL('js/webgl-game.js', rootUrl), 'utf8');

test('端末の動きを減らす設定を画面へ反映する', () => {
  assert.match(main, /new MotionPreferences\(\)/);
  assert.match(main, /app\.dataset\.reducedMotion/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation:\s*none\s*!important/);
  assert.match(css, /transition:\s*none\s*!important/);
});

test('動きを減らす設定では振動を実行しない', () => {
  assert.match(main, /!motionPreferences\.reducedMotion\s*&&\s*navigator\.vibrate/);
});

test('3D盤面の装飾的な上下揺れと傾きを設定に応じて止める', () => {
  assert.match(main, /shouldReduceMotion:\s*\(\) => motionPreferences\.reducedMotion/);
  assert.match(webglGame, /this\.shouldReduceMotion\(\)/);
  assert.match(webglGame, /reducedMotion\s*\?\s*baseY/);
  assert.match(webglGame, /if \(reducedMotion\) this\.player\.rotation\.x = 0/);
});
