import { getGameMode } from './game-modes.js';

export const RESULT_SHARE_STATUSES = Object.freeze({
  SHARED: 'shared',
  COPIED: 'copied',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
});

function requireNonNegativeSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

export function normalizeShareUrl(pageUrl) {
  const url = new URL(pageUrl);
  url.search = '';
  url.hash = '';
  return url.href;
}

export function createResultShareContent({
  result,
  recordMessage,
  pageUrl,
  formatNumber = String
}) {
  if (!result || typeof recordMessage !== 'string' || !recordMessage.trim()) {
    throw new TypeError('result and record message are required');
  }

  const mode = getGameMode(result.modeId);
  const score = requireNonNegativeSafeInteger(result.score, 'score');
  const clearedDice = requireNonNegativeSafeInteger(result.clearedDice, 'clearedDice');
  const maxChain = requireNonNegativeSafeInteger(result.maxChain, 'maxChain');
  const url = normalizeShareUrl(pageUrl);
  const text = [
    `サイノメの${mode.label}モードで${formatNumber(score)}点！`,
    `消した数${formatNumber(clearedDice)}個 / 最大連鎖${formatNumber(maxChain)}`,
    recordMessage.trim(),
    '#サイノメ'
  ].join('\n');

  return Object.freeze({
    title: 'サイノメ',
    text,
    url,
    copyText: `${text}\n${url}`
  });
}

function supportsShare(navigatorObject, shareData) {
  if (typeof navigatorObject?.share !== 'function') return false;
  if (typeof navigatorObject.canShare !== 'function') return true;

  try {
    return navigatorObject.canShare(shareData);
  } catch {
    return false;
  }
}

async function copyShareText(navigatorObject, text) {
  if (typeof navigatorObject?.clipboard?.writeText !== 'function') return false;

  try {
    await navigatorObject.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareResult(content, navigatorObject = globalThis.navigator) {
  const shareData = {
    title: content.title,
    text: content.text,
    url: content.url
  };

  if (supportsShare(navigatorObject, shareData)) {
    try {
      await navigatorObject.share(shareData);
      return RESULT_SHARE_STATUSES.SHARED;
    } catch (error) {
      if (error?.name === 'AbortError') {
        return RESULT_SHARE_STATUSES.CANCELLED;
      }
    }
  }

  const copied = await copyShareText(navigatorObject, content.copyText);
  return copied ? RESULT_SHARE_STATUSES.COPIED : RESULT_SHARE_STATUSES.FAILED;
}
