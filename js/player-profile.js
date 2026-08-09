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
  PLAYER_NAME_SPACE_RANGES,
  PLAYER_NAME_UNICODE_VERSION,
  PLAYER_NAME_VARIATION_SELECTOR_RANGES,
  PLAYER_NAME_VIRAMA_RANGES,
  PLAYER_NAME_VOWEL_DEPENDENT_RANGES,
  codePointInRanges,
  playerNameScriptFor
} from './player-name-unicode-15-1.js';

export const PLAYER_PROFILE_STORAGE_KEY = 'sainome.player-profile.v1';
export const PLAYER_NAME_CONTRACT_VERSION = 'player-name-v1';
export const PLAYER_NAME_MAX_LENGTH = 20;
export const PLAYER_NAME_MAX_RAW_CODE_POINTS = 80;
export const PLAYER_NAME_MAX_CONSECUTIVE_MARKS = 4;
export { PLAYER_NAME_UNICODE_VERSION };

const PLAYER_PROFILE_VERSION = 1;
const ZERO_WIDTH_NON_JOINER = 0x200c;
const ZERO_WIDTH_JOINER = 0x200d;

function freezeResult(result) {
  return Object.freeze(result);
}

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function invalidResult(code, message) {
  return freezeResult({ ok: false, code, message });
}

function readCodePoints(value, maximum = Number.POSITIVE_INFINITY) {
  const codePoints = [];
  for (const symbol of value) {
    if (codePoints.length >= maximum) {
      return { codePoints, overflow: true };
    }
    codePoints.push(Object.freeze({
      symbol,
      value: symbol.codePointAt(0)
    }));
  }
  return { codePoints, overflow: false };
}

function containsForbiddenCodePoint(codePoints) {
  return codePoints.some(({ value }) => (
    codePointInRanges(value, PLAYER_NAME_FORBIDDEN_RANGES)
  ));
}

function isSpace(codePoint) {
  return codePointInRanges(codePoint, PLAYER_NAME_SPACE_RANGES);
}

function isMark(codePoint) {
  return codePointInRanges(codePoint, PLAYER_NAME_MARK_RANGES);
}

function isVariationSelector(codePoint) {
  return codePointInRanges(codePoint, PLAYER_NAME_VARIATION_SELECTOR_RANGES);
}

function isJoinControl(codePoint) {
  return codePointInRanges(codePoint, PLAYER_NAME_JOIN_CONTROL_RANGES);
}

function isLetter(codePoint) {
  return codePointInRanges(codePoint, PLAYER_NAME_LETTER_RANGES);
}

function isNonspacingMark(codePoint) {
  return codePointInRanges(codePoint, PLAYER_NAME_NONSPACING_MARK_RANGES);
}

function isNonzeroCccMark(codePoint) {
  return codePointInRanges(codePoint, PLAYER_NAME_NONZERO_CCC_MARK_RANGES);
}

function isVirama(codePoint) {
  return codePointInRanges(codePoint, PLAYER_NAME_VIRAMA_RANGES);
}

function isVowelDependent(codePoint) {
  return codePointInRanges(codePoint, PLAYER_NAME_VOWEL_DEPENDENT_RANGES);
}

function isJoiningLeft(codePoint) {
  return codePointInRanges(codePoint, PLAYER_NAME_JOINING_LEFT_OR_DUAL_RANGES);
}

function isJoiningRight(codePoint) {
  return codePointInRanges(codePoint, PLAYER_NAME_JOINING_RIGHT_OR_DUAL_RANGES);
}

function isJoiningTransparent(codePoint) {
  return codePointInRanges(codePoint, PLAYER_NAME_JOINING_TRANSPARENT_RANGES);
}

function isVisibleBase({ value }) {
  return Number.isInteger(value)
    && !isSpace(value)
    && !isMark(value)
    && !isVariationSelector(value)
    && !isJoinControl(value);
}

function collapseSpaces(codePoints) {
  const collapsed = [];
  let pendingSpace = false;

  for (const codePoint of codePoints) {
    if (isSpace(codePoint.value)) {
      pendingSpace = collapsed.length > 0;
      continue;
    }
    if (pendingSpace) {
      collapsed.push(Object.freeze({ symbol: ' ', value: 0x20 }));
      pendingSpace = false;
    }
    collapsed.push(codePoint);
  }
  return collapsed;
}

function buildSequenceIndex(sequences, predicate) {
  const index = new Map();
  for (const sequence of sequences) {
    for (let offset = 0; offset < sequence.length; offset += 1) {
      const value = sequence[offset];
      if (!predicate(value)) continue;
      const candidates = index.get(value) ?? [];
      candidates.push(Object.freeze({ sequence, offset }));
      index.set(value, candidates);
    }
  }
  for (const [value, candidates] of index) {
    index.set(value, Object.freeze(candidates));
  }
  return index;
}

const RGI_ZWJ_JOIN_INDEX = buildSequenceIndex(
  PLAYER_NAME_RGI_EMOJI_ZWJ_SEQUENCES,
  (value) => value === ZERO_WIDTH_JOINER
);
const RGI_ZWJ_VARIATION_INDEX = buildSequenceIndex(
  PLAYER_NAME_RGI_EMOJI_ZWJ_SEQUENCES,
  isVariationSelector
);
const RGI_VARIATION_INDEX = buildSequenceIndex(
  PLAYER_NAME_RGI_EMOJI_VS_SEQUENCES,
  isVariationSelector
);

function sequenceMatches(codePoints, index, { sequence, offset }) {
  const start = index - offset;
  if (start < 0 || start + sequence.length > codePoints.length) return null;
  for (let sequenceIndex = 0; sequenceIndex < sequence.length; sequenceIndex += 1) {
    if (codePoints[start + sequenceIndex].value !== sequence[sequenceIndex]) return null;
  }
  return Object.freeze({ start, end: start + sequence.length });
}

function isRegisteredEmojiZwjContext(codePoints, index, candidateIndex) {
  const candidates = candidateIndex.get(codePoints[index]?.value) ?? [];
  for (const candidate of candidates) {
    const match = sequenceMatches(codePoints, index, candidate);
    if (!match) continue;
    if (codePoints[match.start - 1]?.value === ZERO_WIDTH_JOINER) continue;
    if (codePoints[match.end]?.value === ZERO_WIDTH_JOINER) continue;
    return true;
  }
  return false;
}

function isRegisteredVariationContext(codePoints, index) {
  const value = codePoints[index]?.value;
  const candidates = RGI_VARIATION_INDEX.get(value) ?? [];
  if (candidates.some((candidate) => sequenceMatches(codePoints, index, candidate))) {
    return true;
  }
  return isRegisteredEmojiZwjContext(codePoints, index, RGI_ZWJ_VARIATION_INDEX);
}

function hasSingleScript(codePoints, start, end) {
  let expectedScript = -1;
  for (let index = start; index <= end; index += 1) {
    const script = playerNameScriptFor(codePoints[index]?.value);
    if (script < 0) continue;
    if (expectedScript < 0) expectedScript = script;
    else if (script !== expectedScript) return false;
  }
  return true;
}

function hasCursiveZwnjContext(codePoints, index) {
  let left = index - 1;
  while (left >= 0 && isJoiningTransparent(codePoints[left].value)) left -= 1;
  let right = index + 1;
  while (
    right < codePoints.length
    && isJoiningTransparent(codePoints[right].value)
  ) {
    right += 1;
  }
  return isJoiningLeft(codePoints[left]?.value)
    && isJoiningRight(codePoints[right]?.value)
    && hasSingleScript(codePoints, left, right);
}

function findConjunctPrefixStarts(codePoints, joinIndex) {
  const starts = [];
  for (
    let virama = joinIndex - 1;
    virama >= 0 && isNonzeroCccMark(codePoints[virama].value);
    virama -= 1
  ) {
    if (!isVirama(codePoints[virama].value)) continue;
    let letter = virama - 1;
    while (letter >= 0 && isNonspacingMark(codePoints[letter].value)) letter -= 1;
    if (isLetter(codePoints[letter]?.value)) starts.push(letter);
  }
  return starts;
}

function hasConjunctZwnjContext(codePoints, index) {
  let letter = index + 1;
  while (
    letter < codePoints.length
    && isNonzeroCccMark(codePoints[letter].value)
  ) {
    letter += 1;
  }
  if (!isLetter(codePoints[letter]?.value)) return false;
  return findConjunctPrefixStarts(codePoints, index).some((start) => (
    hasSingleScript(codePoints, start, letter)
  ));
}

function hasConjunctZwjContext(codePoints, index) {
  if (isVowelDependent(codePoints[index + 1]?.value)) return false;
  return findConjunctPrefixStarts(codePoints, index).some((start) => (
    hasSingleScript(codePoints, start, index)
  ));
}

function hasValidJoinAndVariationContexts(codePoints) {

  for (let index = 0; index < codePoints.length; index += 1) {
    const value = codePoints[index].value;
    if (isVariationSelector(value)) {
      if (!isRegisteredVariationContext(codePoints, index)) return false;
      continue;
    }
    if (value === ZERO_WIDTH_JOINER) {
      if (
        !isRegisteredEmojiZwjContext(codePoints, index, RGI_ZWJ_JOIN_INDEX)
        && !hasConjunctZwjContext(codePoints, index)
      ) {
        return false;
      }
      continue;
    }
    if (value !== ZERO_WIDTH_NON_JOINER) continue;
    if (
      !hasCursiveZwnjContext(codePoints, index)
      && !hasConjunctZwnjContext(codePoints, index)
    ) {
      return false;
    }
  }

  return true;
}

function hasValidMarkContexts(value) {
  const codePoints = readCodePoints(value.normalize('NFD')).codePoints;
  let clusterHasBase = false;
  let markCount = 0;
  const marks = new Set();

  for (const current of codePoints) {
    if (isSpace(current.value)) {
      clusterHasBase = false;
      markCount = 0;
      marks.clear();
      continue;
    }

    if (isVariationSelector(current.value) || isJoinControl(current.value)) continue;

    if (isMark(current.value)) {
      if (
        !clusterHasBase
        || markCount >= PLAYER_NAME_MAX_CONSECUTIVE_MARKS
        || marks.has(current.value)
      ) {
        return false;
      }
      markCount += 1;
      marks.add(current.value);
      continue;
    }

    clusterHasBase = true;
    markCount = 0;
    marks.clear();
  }

  return true;
}

export function validatePlayerName(value) {
  if (typeof value !== 'string') {
    return invalidResult('empty', 'ランキング名を入力してください');
  }

  const raw = readCodePoints(value, PLAYER_NAME_MAX_RAW_CODE_POINTS);
  if (raw.overflow) {
    return invalidResult(
      'too-long',
      `ランキング名は${PLAYER_NAME_MAX_LENGTH}文字以内にしてください`
    );
  }
  if (containsForbiddenCodePoint(raw.codePoints)) {
    return invalidResult(
      'invalid-characters',
      '改行、制御文字、見えない文字は使えません'
    );
  }

  let normalizedValue;
  try {
    normalizedValue = value.normalize('NFKC');
  } catch {
    return invalidResult('invalid-characters', 'この文字はランキング名に使えません');
  }

  const normalized = readCodePoints(normalizedValue);
  if (containsForbiddenCodePoint(normalized.codePoints)) {
    return invalidResult(
      'invalid-characters',
      '改行、制御文字、見えない文字は使えません'
    );
  }

  const collapsed = collapseSpaces(normalized.codePoints);
  if (collapsed.length === 0) {
    return invalidResult('empty', 'ランキング名を入力してください');
  }
  if (!collapsed.some(isVisibleBase)) {
    return invalidResult(
      'invisible-only',
      '文字として表示されるランキング名を入力してください'
    );
  }
  const name = collapsed.map(({ symbol }) => symbol).join('');
  if (
    !hasValidJoinAndVariationContexts(collapsed)
    || !hasValidMarkContexts(name)
  ) {
    return invalidResult(
      'invalid-characters',
      '見えない文字や結合記号の並びが不正です'
    );
  }

  const length = collapsed.length;
  if (length > PLAYER_NAME_MAX_LENGTH) {
    return invalidResult(
      'too-long',
      `ランキング名は${PLAYER_NAME_MAX_LENGTH}文字以内にしてください`
    );
  }

  return freezeResult({ ok: true, name, length });
}

export class PlayerProfile {
  constructor({ storage = safeStorage() } = {}) {
    this.storage = storage;
    this.name = '';
    this.restore();
  }

  restore() {
    if (!this.storage) return '';

    try {
      const raw = this.storage.getItem(PLAYER_PROFILE_STORAGE_KEY);
      if (!raw) return '';
      const saved = JSON.parse(raw);
      if (saved?.version !== PLAYER_PROFILE_VERSION) return '';
      const validated = validatePlayerName(saved.name);
      if (!validated.ok || validated.name !== saved.name) return '';
      this.name = validated.name;
      return this.name;
    } catch {
      return '';
    }
  }

  getName() {
    return this.name;
  }

  saveName(value) {
    const validated = validatePlayerName(value);
    if (!validated.ok) return validated;

    this.name = validated.name;
    let persisted = false;

    try {
      if (this.storage) {
        this.storage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({
          version: PLAYER_PROFILE_VERSION,
          name: this.name
        }));
        persisted = true;
      }
    } catch {
      persisted = false;
    }

    return freezeResult({
      ok: true,
      name: this.name,
      length: validated.length,
      persisted
    });
  }
}
