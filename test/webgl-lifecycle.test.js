import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../js/webgl-game.js', import.meta.url),
  'utf8'
);

test('WebGLの描画停止中はゲーム時間と操作を止め、復帰後に再開する', () => {
  assert.match(source, /SimulationPause/);
  assert.match(source, /webglcontextlost/);
  assert.match(source, /webglcontextrestored/);
  assert.match(source, /this\.simulationPause\.sync\(!this\.isVisible \|\| this\.contextLost/);
  assert.match(source, /if \(this\.contextLost\) \{[\s\S]*?return;/);
  assert.match(source, /if \(this\.isVisible && !this\.contextLost\) \{[\s\S]*?this\.session\.tick\(now\)/);
  assert.match(source, /this\.simulationPause\.getPausedDuration\(now\)/);
});

test('WebGL開始前に利用可能性を確認し、読み込み失敗時はホーム画面へ案内する', () => {
  const main = readFileSync(
    new URL('../js/main.js', import.meta.url),
    'utf8'
  );

  assert.match(main, /checkWebGL2Support/);
  assert.match(main, /function canStartWebGLGame\(\) \{[\s\S]*?if \(game\) return true;/);
  assert.match(main, /if \(!canStartWebGLGame\(\)\) return;/);
  assert.match(main, /loading\.classList\.add\('hidden'\)/);
  assert.match(main, /WebGL 2/);
  assert.match(main, /flow\.goHome\(\)/);
});
