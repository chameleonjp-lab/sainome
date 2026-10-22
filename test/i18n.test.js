import test from 'node:test';
import assert from 'node:assert/strict';
import { createI18n, LANGUAGE_STORAGE_KEY, translate } from '../js/i18n.js';

test('initial language follows supported browser preferences, including English outside the US', () => {
  const cases = [
    [['ja-JP', 'en-GB'], 'ja'],
    [['en-GB', 'ja-JP'], 'en'],
    [['en-AU'], 'en'],
    [['fr-FR', 'ja-JP'], 'ja'],
    [['fr-FR', 'en-CA'], 'en'],
    [['JA-jp'], 'ja'],
    [['fr-FR', 'de-DE'], 'en']
  ];
  for (const [languages, expected] of cases) {
    const i18n = createI18n({ storage: null, navigatorObject: { languages } });
    assert.equal(i18n.getLanguage(), expected, languages.join(', '));
  }
  assert.equal(createI18n({
    storage: null,
    navigatorObject: { language: 'en-NZ' }
  }).getLanguage(), 'en');
  assert.equal(createI18n({
    storage: null,
    navigatorObject: { languages: [], language: 'ja-JP' }
  }).getLanguage(), 'ja');
  assert.equal(createI18n({ storage: null, navigatorObject: null }).getLanguage(), 'ja');
});

test('browser detection is not saved, and explicit choices override later browser preferences', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const englishBrowser = { languages: ['en-GB'] };
  const japaneseBrowser = { languages: ['ja-JP'] };
  const automaticEnglish = createI18n({ storage, navigatorObject: englishBrowser });
  assert.equal(automaticEnglish.getLanguage(), 'en');
  assert.equal(values.has(LANGUAGE_STORAGE_KEY), false);
  assert.equal(createI18n({ storage, navigatorObject: japaneseBrowser }).getLanguage(), 'ja');
  automaticEnglish.setLanguage('ja');
  assert.equal(createI18n({ storage, navigatorObject: englishBrowser }).getLanguage(), 'ja');
  automaticEnglish.setLanguage('en');
  assert.equal(createI18n({ storage, navigatorObject: japaneseBrowser }).getLanguage(), 'en');
});

test('unavailable storage and invalid saved preferences still use the browser language', () => {
  const navigatorObject = { languages: ['en-AU'] };
  const blocked = createI18n({
    navigatorObject,
    storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }
  });
  assert.equal(blocked.getLanguage(), 'en');
  blocked.setLanguage('ja');
  assert.equal(blocked.getLanguage(), 'ja');
  assert.equal(createI18n({
    navigatorObject,
    storage: { getItem: () => 'unknown' }
  }).getLanguage(), 'en');
});

test('language defaults to Japanese and remembers an explicit English choice', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const first = createI18n({ storage });
  assert.equal(first.getLanguage(), 'ja');
  assert.equal(first.t('ゲーム開始'), 'ゲーム開始');
  first.setLanguage('en');
  assert.equal(values.get(LANGUAGE_STORAGE_KEY), 'en');
  const reopened = createI18n({ storage });
  assert.equal(reopened.getLanguage(), 'en');
  assert.equal(reopened.t('ゲーム開始'), 'Start game');
  reopened.setLanguage('ja');
  assert.equal(reopened.t('ゲーム開始'), 'ゲーム開始');
});

test('blocked storage and unknown saved languages do not prevent switching', () => {
  const blocked = createI18n({ storage: {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }
  } });
  blocked.setLanguage('en');
  assert.equal(blocked.t('盤面の端です'), 'Edge of the board');
  const unknown = createI18n({ storage: { getItem: () => 'fr' } });
  assert.equal(unknown.getLanguage(), 'ja');
  unknown.setLanguage('fr');
  assert.equal(unknown.getLanguage(), 'ja');
});

test('live score and clear announcements interpolate values without translating names', () => {
  assert.equal(translate('上面は{0}。同じ目を{1}個以上つなげます', { 0: 3, 1: 3 }, 'en'),
    'Top face: 3. Connect at least 3 dice with the same number.');
  assert.equal(translate('1の特殊消去！ {0}個が消えます', { 0: 4 }, 'en'),
    'Special clear for 1s! Clearing 4 dice.');
  assert.equal(translate('上面は{0}。同じ目を{1}個以上つなげます', { 0: 3, 1: 3 }, 'ja'),
    '上面は3。同じ目を3個以上つなげます');
  assert.equal(translate('カメレオンJP', {}, 'en'), 'カメレオンJP');
});
