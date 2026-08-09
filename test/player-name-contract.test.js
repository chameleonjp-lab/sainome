import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  PLAYER_NAME_CONTRACT_VERSION,
  PLAYER_NAME_MAX_CONSECUTIVE_MARKS,
  PLAYER_NAME_MAX_LENGTH,
  PLAYER_NAME_MAX_RAW_CODE_POINTS,
  PLAYER_NAME_UNICODE_VERSION,
  validatePlayerName
} from '../js/player-profile.js';
import {
  PLAYER_NAME_FORBIDDEN_RANGES,
  PLAYER_NAME_JOIN_CONTROL_RANGES,
  PLAYER_NAME_JOINING_LEFT_OR_DUAL_RANGES,
  PLAYER_NAME_JOINING_RIGHT_OR_DUAL_RANGES,
  PLAYER_NAME_JOINING_TRANSPARENT_RANGES,
  PLAYER_NAME_LETTER_RANGES,
  PLAYER_NAME_MARK_RANGES,
  PLAYER_NAME_NONSPACING_MARK_RANGES,
  PLAYER_NAME_NONZERO_CCC_MARK_RANGES,
  PLAYER_NAME_RGI_EMOJI_VS_SEQUENCES,
  PLAYER_NAME_RGI_EMOJI_ZWJ_SEQUENCES,
  PLAYER_NAME_SCRIPT_NAMES,
  PLAYER_NAME_SCRIPT_RANGES,
  PLAYER_NAME_SPACE_RANGES,
  PLAYER_NAME_VARIATION_SELECTOR_RANGES,
  PLAYER_NAME_VIRAMA_RANGES,
  PLAYER_NAME_VOWEL_DEPENDENT_RANGES,
  codePointInRanges,
  playerNameScriptFor
} from '../js/player-name-unicode-15-1.js';

const contract = JSON.parse(await readFile(
  new URL('../contracts/player-name-v1.json', import.meta.url),
  'utf8'
));

function inputFor(testCase) {
  if (testCase.inputUtf16Units) {
    return String.fromCharCode(...testCase.inputUtf16Units.map((value) => (
      Number.parseInt(value, 16)
    )));
  }
  return String.fromCodePoint(...testCase.inputCodePoints.map((value) => (
    Number.parseInt(value, 16)
  )));
}

function codePointsFor(value) {
  return Array.from(value, (symbol) => (
    symbol.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')
  ));
}

function valueFor(codePoints) {
  return String.fromCodePoint(...codePoints.map((value) => (
    Number.parseInt(value, 16)
  )));
}

test('名前契約の版・Unicode版・上限が実装と一致する', () => {
  assert.equal(contract.contractVersion, PLAYER_NAME_CONTRACT_VERSION);
  assert.equal(contract.unicodeVersion, PLAYER_NAME_UNICODE_VERSION);
  assert.equal(contract.normalization, 'NFKC');
  assert.equal(contract.maxCodePoints, PLAYER_NAME_MAX_LENGTH);
  assert.equal(contract.maxRawCodePoints, PLAYER_NAME_MAX_RAW_CODE_POINTS);
  assert.equal(contract.maxConsecutiveMarks, PLAYER_NAME_MAX_CONSECUTIVE_MARKS);
});

test('固定Unicode範囲は昇順で重ならず、文脈付き許可範囲を禁止しない', () => {
  const rangeSets = [
    PLAYER_NAME_FORBIDDEN_RANGES,
    PLAYER_NAME_MARK_RANGES,
    PLAYER_NAME_SPACE_RANGES,
    PLAYER_NAME_VARIATION_SELECTOR_RANGES,
    PLAYER_NAME_JOIN_CONTROL_RANGES,
    PLAYER_NAME_JOINING_LEFT_OR_DUAL_RANGES,
    PLAYER_NAME_JOINING_RIGHT_OR_DUAL_RANGES,
    PLAYER_NAME_JOINING_TRANSPARENT_RANGES,
    PLAYER_NAME_LETTER_RANGES,
    PLAYER_NAME_NONSPACING_MARK_RANGES,
    PLAYER_NAME_NONZERO_CCC_MARK_RANGES,
    PLAYER_NAME_VIRAMA_RANGES,
    PLAYER_NAME_VOWEL_DEPENDENT_RANGES
  ];
  for (const ranges of rangeSets) {
    let previousEnd = -1;
    for (const [start, end] of ranges) {
      assert.equal(Number.isInteger(start), true);
      assert.equal(Number.isInteger(end), true);
      assert.equal(start <= end, true);
      assert.equal(start > previousEnd, true);
      previousEnd = end;
    }
  }

  for (const ranges of [
    PLAYER_NAME_VARIATION_SELECTOR_RANGES,
    PLAYER_NAME_JOIN_CONTROL_RANGES
  ]) {
    for (const [start, end] of ranges) {
      for (let codePoint = start; codePoint <= end; codePoint += 1) {
        assert.equal(
          codePointInRanges(codePoint, PLAYER_NAME_FORBIDDEN_RANGES),
          false
        );
      }
    }
  }
});

test('固定Script表は昇順・非重複で、CommonとInheritedを値なしとして扱う', () => {
  assert.equal(PLAYER_NAME_SCRIPT_NAMES.length, 161);
  assert.equal(PLAYER_NAME_SCRIPT_RANGES.length, 751);

  let previousEnd = -1;
  for (const [start, end, script] of PLAYER_NAME_SCRIPT_RANGES) {
    assert.equal(Number.isInteger(start), true);
    assert.equal(Number.isInteger(end), true);
    assert.equal(Number.isInteger(script), true);
    assert.equal(start <= end, true);
    assert.equal(start > previousEnd, true);
    assert.equal(script >= 0 && script < PLAYER_NAME_SCRIPT_NAMES.length, true);
    previousEnd = end;
  }

  assert.equal(PLAYER_NAME_SCRIPT_NAMES[playerNameScriptFor(0x0645)], 'Arabic');
  assert.equal(PLAYER_NAME_SCRIPT_NAMES[playerNameScriptFor(0x0712)], 'Syriac');
  assert.equal(PLAYER_NAME_SCRIPT_NAMES[playerNameScriptFor(0x0915)], 'Devanagari');
  assert.equal(playerNameScriptFor(0x200d), -1);
  assert.equal(playerNameScriptFor(0x0301), -1);
});

test('Unicode Emoji 15.1のRGI列挙は固定件数で重複しない', () => {
  const serialize = (sequence) => sequence.map((value) => (
    value.toString(16).toUpperCase()
  )).join('-');
  const zwjKeys = PLAYER_NAME_RGI_EMOJI_ZWJ_SEQUENCES.map(serialize);
  const variationKeys = PLAYER_NAME_RGI_EMOJI_VS_SEQUENCES.map(serialize);

  assert.equal(PLAYER_NAME_RGI_EMOJI_ZWJ_SEQUENCES.length, 1468);
  assert.equal(new Set(zwjKeys).size, zwjKeys.length);
  assert.equal(
    PLAYER_NAME_RGI_EMOJI_ZWJ_SEQUENCES.every((sequence) => (
      sequence.includes(0x200d)
    )),
    true
  );

  assert.equal(PLAYER_NAME_RGI_EMOJI_VS_SEQUENCES.length, 219);
  assert.equal(new Set(variationKeys).size, variationKeys.length);
  assert.equal(
    PLAYER_NAME_RGI_EMOJI_VS_SEQUENCES.every((sequence) => (
      sequence.includes(0xfe0f) && !sequence.includes(0x200d)
    )),
    true
  );
});

test('共通の正常・異常例を名前契約どおり判定する', async (context) => {
  for (const testCase of contract.cases) {
    await context.test(testCase.id, () => {
      const result = validatePlayerName(inputFor(testCase));
      assert.equal(result.ok, testCase.accepted);
      if (!testCase.accepted) {
        assert.equal(result.code, testCase.errorCode);
        return;
      }
      assert.deepEqual(codePointsFor(result.name), testCase.normalizedCodePoints);
      assert.equal(result.length, testCase.normalizedCodePoints.length);
    });
  }
});

test('正常例の正規形だけを永続化境界で受け付ける', () => {
  for (const testCase of contract.cases.filter(({ accepted }) => accepted)) {
    const canonical = valueFor(testCase.normalizedCodePoints);
    const canonicalResult = validatePlayerName(canonical);
    assert.equal(canonicalResult.ok, true, testCase.id);
    assert.equal(canonicalResult.name, canonical, testCase.id);

    const raw = inputFor(testCase);
    const rawResult = validatePlayerName(raw);
    assert.equal(rawResult.ok, true, testCase.id);
    if (raw !== canonical) {
      assert.notEqual(rawResult.name, raw, testCase.id);
    }
  }
});
