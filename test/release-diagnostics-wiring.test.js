import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', rootUrl), 'utf8');
const css = readFileSync(new URL('css/style.css', rootUrl), 'utf8');
const main = readFileSync(new URL('js/main.js', rootUrl), 'utf8');
const webglGame = readFileSync(new URL('js/webgl-game.js', rootUrl), 'utf8');

test('診断パネルは通常表示せず、実機試験用の操作を持つ', () => {
  assert.match(html, /id="release-diagnostics-panel"[^>]*hidden/);
  assert.match(html, /id="release-diagnostics-lose-button"/);
  assert.match(html, /id="release-diagnostics-restore-button"/);
  assert.match(html, /id="release-diagnostics-output"/);
  assert.match(css, /\.release-diagnostics\s*\{/);
  assert.match(css, /\.release-diagnostics\[hidden\]/);
});

test('診断パネルはURL指定時だけ有効になり、状態を画面へ表示する', () => {
  assert.match(main, /isReleaseDiagnosticsEnabled/);
  assert.match(main, /releaseDiagnosticsPanel\.hidden\s*=\s*!releaseDiagnosticsEnabled/);
  assert.match(main, /getDiagnosticsSnapshot/);
  assert.match(main, /forceContextLossForDiagnostics/);
  assert.match(main, /restoreContextForDiagnostics/);
});

test('WebGL強制消失は標準の復旧処理を通り、描画資源の診断値を取得できる', () => {
  assert.match(webglGame, /WEBGL_lose_context/);
  assert.match(webglGame, /forceContextLossForDiagnostics/);
  assert.match(webglGame, /restoreContextForDiagnostics/);
  assert.match(webglGame, /getDiagnosticsSnapshot/);
  assert.match(webglGame, /renderer\?\.info/);
});
