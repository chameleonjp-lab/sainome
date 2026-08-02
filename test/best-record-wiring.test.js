import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', rootUrl), 'utf8');
const css = readFileSync(new URL('css/style.css', rootUrl), 'utf8');
const main = readFileSync(new URL('js/main.js', rootUrl), 'utf8');

test('ホームは選択中モードの自己ベストを表示する', () => {
  assert.match(html, /id="home-best-score"[^>]*aria-live="polite"/);
  assert.match(main, /bestRecords\.getBest\(mode\.id\)/);
  assert.match(main, /homeBestScore\.textContent/);
  assert.match(css, /\.home-best-record\s*\{/);
});

test('結果確定時に一度だけ記録し、比較結果と保存失敗を表示する', () => {
  assert.match(html, /id="result-record-message"/);
  assert.match(html, /id="result-best-score"/);
  assert.match(html, /id="result-record-warning"[^>]*role="status"/);
  assert.match(main, /onFinish:[\s\S]*bestRecords\.recordResult\(next\.result\)/);
  assert.match(main, /describeBestOutcome/);
  assert.match(main, /resultRecordWarning\.hidden = outcome\.persisted/);
});
