import test from 'node:test';
import assert from 'node:assert/strict';
import { TRANSLATIONS } from '../js/translations.js';
import { ENGLISH_MESSAGES } from '../js/translations-en.js';
import { SUPPORTED_LANGUAGES } from '../js/language-options.js';

const placeholders = (value) => [...value.matchAll(/\{\d+\}/gu)].map(([match]) => match).sort();

test('every supported language has a complete catalog with intact values and placeholders', () => {
  const sources = Object.keys(ENGLISH_MESSAGES).sort();
  for (const { id } of SUPPORTED_LANGUAGES) {
    const catalog = TRANSLATIONS[id];
    assert.deepEqual(Object.keys(catalog).sort(), sources, `Missing or extra translations for ${id}`);
    for (const source of sources) {
      assert.equal(typeof catalog[source], 'string', `${id}: ${source}`);
      // Thai separates sentences with spaces rather than a full stop.
      assert.ok((source === '。' ? catalog[source] : catalog[source].trim()).length > 0, `${id}: ${source}`);
      assert.deepEqual(placeholders(catalog[source]), placeholders(source), `${id}: ${source}`);
      if (id !== 'ja') assert.doesNotMatch(catalog[source], /[\p{Script=Hiragana}\p{Script=Katakana}]/u, `${id}: ${source}`);
    }
  }
});
