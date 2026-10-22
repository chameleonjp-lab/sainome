import test from 'node:test';
import assert from 'node:assert/strict';
import * as localization from '../js/i18n.js';
import { createHomeShareContent, createResultShareContent } from '../js/result-share.js';
import { describeBestOutcome } from '../js/best-records.js';
import { describeRankingFailure, shouldEnableRankingRetry } from '../js/ranking-status-ui.js';

const languageIds = ['ja', 'en', 'es', 'pt-BR', 'zh-Hans', 'fr', 'de', 'ko', 'ru', 'it', 'zh-Hant', 'id', 'tr', 'vi', 'th'];

test('all requested languages can be selected and remembered', () => {
  assert.deepEqual(localization.SUPPORTED_LANGUAGES?.map(({ id }) => id), languageIds);
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  for (const language of languageIds) {
    const i18n = localization.createI18n({ storage, navigatorObject: { languages: ['en-GB'] } });
    i18n.setLanguage(language);
    assert.equal(localization.createI18n({ storage }).getLanguage(), language);
  }
});

test('browser regional preferences choose the supported language and Chinese script', () => {
  for (const [locale, expected] of [
    ['es-MX', 'es'], ['pt-PT', 'pt-BR'], ['pt-BR', 'pt-BR'], ['zh-CN', 'zh-Hans'],
    ['zh-TW', 'zh-Hant'], ['zh-HK', 'zh-Hant'], ['zh-Hant-CN', 'zh-Hant'],
    ['zh-Hans-TW', 'zh-Hans'], ['fr-CA', 'fr'], ['de-AT', 'de'], ['ko-KR', 'ko'],
    ['ru-RU', 'ru'], ['it-IT', 'it'], ['id-ID', 'id'], ['tr-TR', 'tr'], ['vi-VN', 'vi'], ['th-TH', 'th']
  ]) {
    assert.equal(localization.createI18n({ storage: null, navigatorObject: { languages: [locale] } }).getLanguage(), expected, locale);
  }
});

test('every language localizes game sharing, result sharing, best records and ranking errors', () => {
  for (const language of languageIds) {
    const result = { modeId: '300-seconds', score: 1200, clearedDice: 4 };
    const recordMessage = describeBestOutcome({ status: 'first', difference: 0 }, String, language);
    const home = createHomeShareContent({ pageUrl: 'https://example.com/game/', language });
    const share = createResultShareContent({ result, recordMessage, pageUrl: 'https://example.com/game/', language });
    assert.ok(home.text.length > 30, language);
    assert.match(share.text, /1200/);
    assert.match(share.text, /300/);
    assert.ok(share.text.includes(recordMessage));
    assert.doesNotMatch(share.text, /\{\d+\}/);
    if (language !== 'ja') {
      assert.doesNotMatch(home.text + share.text, /[\p{Script=Hiragana}\p{Script=Katakana}]/u, language);
      assert.notEqual(describeRankingFailure({ code: 'network' }, language).summary,
        describeRankingFailure({ code: 'network' }, 'ja').summary, language);
    }
    const t = (source) => localization.translate(source, {}, language);
    const detail = { code: 'network', retryable: true, rpcName: 'submit_score' };
    assert.equal(shouldEnableRankingRetry({ detail, statusText: t('記録を送信できませんでした。通信状態を確認してください'), buttonText: t('記録を再送する') }), true, language);
    assert.equal(shouldEnableRankingRetry({ detail, statusText: t('記録を送信しています…'), buttonText: t('通信中…') }), false, language);
  }
});
