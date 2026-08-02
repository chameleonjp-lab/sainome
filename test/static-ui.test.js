import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TUTORIAL_SLIDE_COUNT } from '../js/tutorial-slides.js';

const rootUrl = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', rootUrl), 'utf8');
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

test('HTMLから読むローカルファイルはすべて存在する', () => {
  const paths = [...html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g)]
    .map((match) => match[1]);

  for (const path of paths) {
    const localPath = fileURLToPath(new URL(path, rootUrl));
    assert.equal(existsSync(localPath), true, `Missing ${path}`);
  }
});
