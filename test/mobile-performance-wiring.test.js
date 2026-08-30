import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const webglSource = readFileSync(
  new URL('../js/webgl-game.js', import.meta.url),
  'utf8'
);
const mainSource = readFileSync(
  new URL('../js/main.js', import.meta.url),
  'utf8'
);

test('スマホ用の移動時間と描画プロファイルをゲームへ適用する', () => {
  assert.match(webglSource, /getPerformanceProfile/);
  assert.match(webglSource, /this\.actionTimings\.rollMs/);
  assert.match(webglSource, /this\.actionTimings\.hopMs/);
  assert.match(webglSource, /this\.actionTimings\.walkMs/);
  assert.match(webglSource, /this\.actionTimings\.stepDownMs/);
  assert.match(webglSource, /this\.performanceProfile\.pixelRatioCap/);
  assert.match(webglSource, /antialias: this\.performanceProfile\.antialias/);
  assert.match(webglSource, /shadowMap\.enabled = this\.performanceProfile\.shadows/);
});

test('スマホ入力はpointerdownで即時処理し、強制レイアウトを使わない', () => {
  assert.match(mainSource, /button\.addEventListener\('pointerdown'/);
  assert.match(mainSource, /event\.detail !== 0/);
  assert.doesNotMatch(mainSource, /button\.offsetWidth/);
  assert.doesNotMatch(mainSource, /stage\.offsetWidth/);
});

test('予約移動は30ミリ秒待たず、直ちに次の移動を処理する', () => {
  const consumeQueue = webglSource.match(
    /  consumeQueue\(\) \{[\s\S]*?\n  \}/
  )?.[0] ?? '';

  assert.match(consumeQueue, /this\.move\(queued\)/);
  assert.doesNotMatch(consumeQueue, /setTimeout/);
});
