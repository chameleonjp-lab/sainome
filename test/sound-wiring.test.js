import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', rootUrl), 'utf8');
const main = readFileSync(new URL('js/main.js', rootUrl), 'utf8');
const webglGame = readFileSync(new URL('js/webgl-game.js', rootUrl), 'utf8');

test('効果音の切り替えは押下状態と読み上げ用表示を持つ', () => {
  assert.match(html, /id="sound-toggle"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /id="sound-status"[^>]*aria-live="polite"/);
  assert.match(main, /renderSoundToggle/);
});

test('ゲームの4種類の出来事を別々の効果音へ接続する', () => {
  for (const callback of ['onMove', 'onRollStart', 'onClearStart', 'onSpawn']) {
    assert.match(webglGame, new RegExp(`callbacks\\.${callback}`));
    assert.match(main, new RegExp(`${callback}:`));
  }

  assert.match(main, /soundEffects\.playFlick/);
  assert.match(main, /soundEffects\.playRoll/);
  assert.match(main, /soundEffects\.playClear/);
  assert.match(main, /soundEffects\.playSpawn/);
});

test('画面が隠れたら効果音を止める', () => {
  assert.match(main, /visibilitychange/);
  assert.match(main, /soundEffects\.handleVisibility\(document\.hidden\)/);
});
