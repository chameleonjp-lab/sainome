import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TUTORIAL_SLIDE_COUNT } from '../js/tutorial-slides.js';

const rootUrl = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', rootUrl), 'utf8');
const css = readFileSync(new URL('css/style.css', rootUrl), 'utf8');
const main = readFileSync(new URL('js/main.js', rootUrl), 'utf8');

test('HTMLの要素識別子は重複しない', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);

  assert.equal(new Set(ids).size, ids.length);
});

test('main.jsが識別子で参照する要素はHTMLに存在する', () => {
  const selectors = [
    ...main.matchAll(/querySelector(?:All)?\('([^']+)'\)/g)
  ].map((match) => match[1]);
  const referencedIds = selectors
    .map((selector) => selector.match(/^#([\w-]+)/)?.[1])
    .filter(Boolean);

  for (const id of referencedIds) {
    assert.match(html, new RegExp(`\\bid="${id}"`), `Missing #${id}`);
  }
});

test('3枚の説明と3個の位置表示がそろっている', () => {
  const slides = [...html.matchAll(/\bdata-tutorial-slide\b/g)];
  const dotsMarkup = html.match(
    /id="tutorial-dots"[\s\S]*?<\/div>/
  )?.[0] ?? '';
  const dots = [...dotsMarkup.matchAll(/<span(?:\s|>)/g)];

  assert.equal(slides.length, TUTORIAL_SLIDE_COUNT);
  assert.equal(dots.length, TUTORIAL_SLIDE_COUNT);
});

test('ホームと結果画面から実験場へ戻れる', () => {
  const labUrl = 'https://chameleonjp.codeberg.page/chameleonjp_lab/';
  const escapedLabUrl = labUrl.replaceAll('.', '\\.');

  for (const id of ['home-lab-link', 'result-lab-link']) {
    assert.match(
      html,
      new RegExp(`id="${id}"[\\s\\S]*?href="${escapedLabUrl}"`)
    );
  }
  assert.match(html, /id="home-lab-link"[^>]*class="lab-link home-lab-link"/);
  assert.match(html, /id="result-lab-link"[^>]*class="lab-link result-lab-link"/);
  assert.match(css, /\.lab-link\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.result-lab-link\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});

test('再読み込み後に保存状態を確認して続きから再開できる', () => {
  for (const id of ['game-recovery-panel', 'game-recovery-status', 'game-recovery-resume', 'game-recovery-discard']) {
    assert.match(html, new RegExp(`\\bid="${id}"`));
  }
  assert.match(main, /GameStateStorage/);
  assert.match(main, /resumeSavedGame/);
  assert.match(main, /discardSavedGame/);
  assert.match(css, /\.game-recovery-panel\s*\{/);
});

test('HTMLから読むローカルファイルはすべて存在する', () => {
  const paths = [...html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g)]
    .map((match) => match[1]);

  for (const path of paths) {
    const localPath = fileURLToPath(new URL(path, rootUrl));
    assert.equal(existsSync(localPath), true, `Missing ${path}`);
  }
});
