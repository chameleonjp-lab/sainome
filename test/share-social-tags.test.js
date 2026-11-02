import test from 'node:test';
import assert from 'node:assert/strict';
import { describeBestOutcome, BEST_OUTCOMES } from '../js/best-records.js';
import { SUPPORTED_LANGUAGES } from '../js/language-options.js';
import { createHomeShareContent, createResultShareContent, shareOnX } from '../js/result-share.js';

const pageUrl = 'https://chameleonjp-lab.github.io/sainome/';
// Conservative weighted bound: URL counts as 23; non-Latin/Cyrillic symbols count double.
// This may over-count some punctuation but never relies on JS UTF-16 string length.
const bound = content => [...content.text.replace(pageUrl, 'x'.repeat(23))]
  .reduce((n, character) => n + (character.codePointAt(0) <= 0x10ff ? 1 : 2), 0);
for (const {id:language, locale} of SUPPORTED_LANGUAGES) {
  test(`${language}: home and result X composer preserve official game/development tags within 280`, async () => {
    const home = createHomeShareContent({pageUrl,language});
    const formatNumber = value => new Intl.NumberFormat(locale).format(value);
    const results = Object.values(BEST_OUTCOMES).map(status => createResultShareContent({
      pageUrl, language, formatNumber,
      recordMessage: describeBestOutcome({status,difference:100000000}, formatNumber, language),
      result:{modeId:'300-seconds',score:100000000,clearedDice:100000000}
    }));
    for (const content of [home,...results]) {
      assert.match(content.text, /(?:^|\s)#サイノメ(?:\s|$)/u);
      assert.match(content.text, /(?:^|\s)#ゲーム制作(?:\s|$)/u);
      assert.equal((content.text.match(/#サイノメ/gu)||[]).length, 1);
      assert.equal((content.text.match(/#ゲーム制作/gu)||[]).length, 1);
      assert.ok(bound(content)<=280, `${language}: ${bound(content)} weighted upper bound`);
      let actual;
      await shareOnX(content,{open:url=>{actual=new URL(url);return {opener:null};}});
      assert.equal(actual.searchParams.get('text'), content.text);
      assert.equal(content.copyText, content.text);
      assert.equal(content.url, pageUrl);
    }
  });
}
