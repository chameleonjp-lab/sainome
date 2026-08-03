import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', rootUrl), 'utf8');
const css = readFileSync(new URL('css/style.css', rootUrl), 'utf8');
const main = readFileSync(new URL('js/main.js', rootUrl), 'utf8');

test('結果画面に押しやすい共有ボタンと状態表示がある', () => {
  assert.match(html, /id="result-share-button"[^>]*type="button"/);
  assert.match(
    html,
    /id="result-share-status"[^>]*role="status"[^>]*aria-live="polite"/
  );
  assert.match(css, /\.share-button\s*\{[^}]*min-height:\s*52px/s);
});

test('表示中の結果とURLだけを共有処理へ渡す', () => {
  assert.match(main, /snapshot\.screen !== SCREEN_PHASES\.RESULT/);
  assert.match(main, /createResultShareContent\(\{/);
  assert.match(main, /result: snapshot\.result/);
  assert.match(main, /pageUrl: window\.location\.href/);
  assert.match(main, /shareResult\(content\)/);
});

test('共有中の連打を止め、すべての結果を画面へ通知する', () => {
  assert.match(main, /resultSharePending/);
  assert.match(main, /resultShareButton\.disabled = pending/);
  assert.match(main, /ゲーム結果を共有しました/);
  assert.match(main, /シェア文をコピーしました/);
  assert.match(main, /共有をキャンセルしました/);
  assert.match(main, /コピーできませんでした/);
});
