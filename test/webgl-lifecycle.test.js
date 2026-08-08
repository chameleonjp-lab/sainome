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
